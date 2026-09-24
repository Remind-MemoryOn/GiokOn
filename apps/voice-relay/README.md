# 음성 중계 — 연결 검증 단계

> ## ⚠️ 2026-09-23 기획 변경 — 이 서버가 유일한 음성 경로가 된다
>
> 계획 SoT: [`docs/plans/pilot-development-plan.md`](../../docs/plans/pilot-development-plan.md) §8 C3 · §4 D·G.
> - **중계 단일화**: 앱의 직접 Gemini Live 모드는 폐기한다(M1). 아래 "주소가 없으면 기존 직접 Live 모드" 서술은 파일럿에서
>   "주소가 없으면 세션 시작 차단"으로 바뀐다.
> - ⚠️ **`live-token` 중계 전용화**(C4): 지금 이 서버는 **사용자 JWT 로** `live-token` 을 부른다(`src/main.ts`). 서버가 중계와 앱
>   직접 호출을 구분하지 못해, 구버전 앱·JWT 소지자도 토큰을 받아 출력 검열을 건너뛸 수 있다. 중계만 가진 자격(서버 시크릿)을
>   추가로 보내고 `live-token` 은 그것이 없으면 403 을 준다 — 이 서버에 **새 환경변수 1개**가 생긴다(이름은 구현 때 확정).
> - **`session_tick` RPC**: 2초 권한 폴(`can_process_session`)을 이것으로 바꿔 `{allowed, phase, target_minutes, paused, control_request}`
>   를 한 번에 받는다. 새 타이머·소켓·인증은 없다.
> - **단계 지시 주입**: 단계(도입 → 회상 → 마무리·의견수렴)가 바뀌면 `clientContent{turns, turnComplete:false}` 로 지시를 넣는다 —
>   v3 `resumeContext` 와 같은 경로다. 어르신에게 들리지 않고, 출력은 여전히 검증 → CLOVA 를 거친다.
> - **원격 제어**: `pause` → 입력 전달 차단 + 앱에 `relayControl` 송신, `end` → 연결 종료.
> - ⚠️ **위기 이벤트 즉시 기록**: `assessUtterance` 적중 시 `safety_events` 를 **바로** 쓴다(지금은 세션 종료 때 앱이 일괄 기록 —
>   실시간 푸시가 불가능하다). 위기 시 즉시 종료 동작은 **약화하지 않는다**.
> - 손대지 않는 것: 타이머 · 턴 상한 · 연결 수명 · 재생 영수증 게이팅(v2) · `SESSION_BUSY`(기기 1대 = 세션 1개).
> - 모델: `gemini-3.8-live`. 모델 ID 는 `live-token` 응답을 따른다(`GEMINI_LIVE_MODEL` 시크릿).

앱 → 이 서버 → Gemini Live → 출력 검사 → CLOVA Voice WAV → PCM → 앱 재생을 연결한다. 현재 앱은 중계 모드에서 시작·회수형 자동 루프를 로컬 구현했다. 자동 채택에는 전사 출처 저장 계약 v1 운영 적용이 필요하다. 중계 인증·발급 한도는 기존 `live-token`을 재사용한다.

## 설정

프로세스 환경 또는 배포 서비스의 Secret Manager에 등록한다. 이 서버는 `.env` 파일을 자동으로 읽지 않는다. 값은 채팅·Git·명령 이력에 넣지 않는다.

| 서버 변수 | 내용 |
|---|---|
| `SUPABASE_URL` | `https://ufkbzpdjomtmxjipmwub.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | 해당 프로젝트의 공개 publishable 키. service_role 키를 넣지 않음 |
| `NCP_CLOVA_VOICE_CLIENT_ID` | CLOVA Voice 사용을 허용한 Application의 Client ID |
| `NCP_CLOVA_VOICE_CLIENT_SECRET` | 해당 Application의 Client Secret. 기존 웹 STT 변수와 분리 |
| `VOICE_RELAY_BIND` | 기본 `127.0.0.1`; 컨테이너는 `0.0.0.0` |
| `PORT` | 기본 `8787`; 배포 환경 주입 가능 |

설정 후 저장소 루트에서 `pnpm -F @giokon/voice-relay start`. `/healthz`는 프로세스 생존만 확인하며 외부 인증/API 성공을 뜻하지 않는다. 휴대폰 연결 주소는 TLS가 적용된 `wss://호스트/voice`여야 한다. 평문 WS·쿼리 문자열 인증·브라우저 Origin은 허용하지 않는다.

컨테이너는 저장소 루트에서 `docker build -f apps/voice-relay/Dockerfile -t memoryon-voice-relay .`로 빌드한다. Dockerfile 전용 ignore는 필요한 소스/매니페스트만 허용한다. 런타임에 인증값을 주입하며 이미지에는 넣지 않는다. Docker 이미지 빌드는 별도 확인 대상이다.

## 앱 설정·실기기 시험

1. EAS의 사용할 빌드 환경에 공개 설정 `EXPO_PUBLIC_VOICE_RELAY_URL=wss://호스트/voice`를 등록한다. 다른 앱 Supabase 설정은 기존 값을 유지한다. 이 주소에는 인증값을 넣지 않는다.
2. 마이크 네이티브 모듈이 포함된 Android/iOS 개발 빌드를 설치한다. Expo Go는 이 마이크 모듈을 제공하지 않는다. `EXPO_NO_DOTENV=1`로 실행하고 필요한 공개 값은 환경/EAS에서 제공한다.
3. 현행 동의·담당 권한이 있는 시험용 어르신의 세션을 시작한다. 최초 마이크 권한을 허용한다. 실제 어르신 자료를 사용하기 전 계약·동의 범위를 확인하고 개발자 합성 시험 자료로 먼저 진행한다.
4. 자동 대화 시작 → 오프너 CLOVA 재생 → 마이크 → 자동 입력 저장 → 다음 CLOVA 재생 → 회수·저장을 확인한다. 정상 경로는 매 턴 확인 없이 진행하며 중단된 부분 입력만 담당자 확인/제외를 요청한다. 일시정지 후 자동 재개는 아직 후속이다.
5. 거절/무음·네트워크 단절·합성 실패·권한 철회·합성 중 회수·재생 로드 중 회수를 확인한다. 중계 모드에서 원본 Gemini 음성·기기 TTS로 몰래 전환되면 실패다.

주소가 없으면 기존 직접 Live 모드다. 따라서 새 경로를 실서비스에 강제하는 구버전/직접 토큰 경로 폐쇄는 별도이며 R010은 계속 부분 해결이다. 중계 모드의 실패는 안내 후 중단하며 기록 저장 경로를 남긴다.

## 현재 제한

### 운영 종료 준비 (2026-09-20)

`/readyz`는 신규 연결 수용 상태(200/503), `/healthz`는 생존 상태다. SIGTERM/SIGINT는 신규 연결 차단·합성 취소·공급자 연결 종료·내부 세션 점유 해제 후 서버를 닫는다. 실제 호스팅 신호 전달·이미지 빌드·배포는 미검증이다. 전환 및 롤백 순서는 [운영 런북](../../docs/runbooks/voice-relay-operations.md)을 따른다.

### 재생 완료 확인 프로토콜 v2 (2026-09-14)

2026-09-21 v3 전송 계약 추가: 복구 이력을 보내는 클라이언트는 `relayAuth.protocolVersion:3`과 `resumeContext`를 함께 보내고 v3 응답을 요구한다. 서버는 형식·크기 검증과 인증/현재 권한 확인 후 새 공급자 연결에 user/model 이력을 `clientContent`로 전송한다(`turnComplete:false`). 입력 자체로 응답을 생성하지 않으며 v2의 재생 확인 조건을 유지한다. 기존 v1/v2 연결은 유지한다. 엔진/재개 UI의 연결은 후속이고 실 API 복구는 미검증이다. 복구 내용은 인증된 앱이 제출한 이력이며 서버가 실제 청취를 독립 증명한 데이터가 아니다.

신규 앱의 중계 엔진은 첫 `relayAuth`에 `protocolVersion: 2`를 보낸다. 서버가 `setupComplete.relayProtocolVersion: 2`로 응답해야 연결한다. 서버를 먼저 갱신한 뒤 앱을 갱신한다. 이 버전 협의가 없는 구 서버로 조용히 진행하지 않는다. 기존 v1 앱은 서버에서 계속 수용하지만 자동 대화 완료 조건을 충족한 것으로 취급하지 않는다.

서버는 검증·합성된 응답에 `relayOutput.turnId`를 붙인다. 앱이 끝까지 재생한 경우에만 `{ relayPlayback: { turnId, result: 'completed' } }`를 보내며, 서버는 동일 턴 확인과 현재 권한 재검사 후 다음 입력을 허용한다. 확인 전 입력·다른 턴 확인·중단/빈 음성 보고는 연결을 닫는다. 95초 동안 완료 확인이 없어도 닫는다. 이는 앱이 보고한 재생 결과이며 어르신이 실제로 들었거나 이해했다는 증거는 아니다.

앱의 로드 중 취소·재생 중 취소는 `interrupted`, 빈 PCM은 `empty`, 네이티브 재생 끝 이벤트만 `completed`다. 중계 재생 중단은 연결 종료로 이어지며 같은 모델 맥락으로 자동 재개하지 않는다. 모델 맥락 복구·자동 채택 전사 출처·시작/일시정지/회수 UI는 후속 작업이다. DB에 재생 증빙을 새로 저장한 것은 아니다.

- 단일 프로세스 연결 검증용: 동시 소켓 4개, 같은 세션 1개, 연결 최대 25분, 생성 턴 최대 60개. 이 수치는 시험용 방어 상한이며 상품 포함량·실측 적정치가 아니다. 여러 인스턴스의 중복/요금 한도는 보장하지 않는다.
- 권한 주기 검사 2초, 5초 이상 지난 허용 결과로 입력 전달 금지, 생성/합성 전·후 재검사. 동의 변경과 외부 전송을 하나의 트랜잭션으로 묶는 것은 아니며 철회의 즉시·소급 취소를 주장하지 않는다.
- 서버는 앱의 시스템 프롬프트를 무시하고 사용자 권한으로 프로필/연대기/설계를 조회한다. 최근 연대기 최대 100개를 사용한다.
- 출력은 완결 전사 200자 이하와 기존 core 안전 규칙을 검사한다. 이는 전체 의미·사실 검증의 완성이 아니다. 차단/누락/불일치 형식은 연결 종료하며 자동 대체 발화로 모델 맥락을 어긋나게 하지 않는다.
- Gemini 원음은 전달/저장하지 않는다. CLOVA는 `nara`, 속도 0, 24kHz mono 16bit WAV를 요청한다. 음질·속도·성능은 현장 검증 전이다. 앱은 재생을 위해 임시 WAV를 만들고 종료 시 삭제하며, 세션 내 다시 듣기에 메모리 PCM을 사용한다. 이 처리/재사용의 계약 허용 범위 확인이 실제 사용 선행 조건이다.
- 본문/원음/키는 로그에 출력하지 않는다. 누적 사용량·상세 실패 코드·원가 계측·자동 재접속·자동 대화·다중 인스턴스 운영은 아직 후속이다.
- 클라이언트는 중계 주소가 없으면 기존 경로를 사용하므로 배포 전 설정 확인이 필수다. 중계 모드를 공개 출시 완료로 취급하지 않는다.

## 외부에서 필요한 준비

사용자 확인: CLOVA Voice와 인증 설정은 준비 완료. 현재 서버 서비스는 Supabase만 사용 중이다.

- **중계 호스팅과 WSS 주소**: Supabase Edge Functions는 실행 수명이 Free 150초/Paid 400초로 제한된다. 별도 장시간 실행 환경을 선택한다. [Supabase 제한](https://supabase.com/docs/guides/functions/limits)
- **배포 후보**: Google Cloud Run은 WebSocket을 지원하고 요청 시간을 최대 60분으로 설정할 수 있다. 연결 중 비용이 발생한다. 선택 시 결제 연결·리전·최대 인스턴스·접근/사용 한도를 먼저 확정한다. 운영 승인 전 생성/배포하지 않는다. [Cloud Run WebSocket 안내](https://docs.cloud.google.com/run/docs/triggering/websockets)
- **인증값 등록**: CLOVA Application에서 Voice API가 실제 선택돼 있어야 한다. 콘솔에서 직접 Secret Manager/서버 환경에 입력한다. 이미 STT가 된다는 사실만으로 TTS 권한이 보장되지 않는다. [CLOVA 인증 안내](https://api.ncloud-docs.com/docs/en/ai-naver-clovavoice)
- **실기기 설치·권한**: 개발 빌드 설치·마이크 허용·실제 소리 확인은 사용자 기기에서 수행한다. 코드/가상 소켓 테스트로 이 결과를 대신하지 않는다.

검증 명령: `pnpm -F @giokon/voice-relay test`, `pnpm -F @giokon/voice-relay typecheck`. 테스트는 환경 파일을 읽지 않고 가상 공급자와 실제 로컬 WebSocket을 사용한다. 실제 Gemini/CLOVA 연결 성공과 구분한다.

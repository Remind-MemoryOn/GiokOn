# 음성 중계 — 연결 검증 단계

앱의 기존 마이크/전사 확인 흐름 → 이 서버 → Gemini Live → 출력 검사 → CLOVA Voice WAV → PCM → 앱 재생을 연결한다. 자동 진행 UI는 아직 적용하지 않는다. DB/Edge Function 변경 없이 기존 `live-token`의 자격·발급 한도를 재사용한다.

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
4. 오프너의 CLOVA 재생 → 마이크 → 전사 확인 → 다음 CLOVA 재생 → 다시 듣기 → 종료·저장을 확인한다. 이번에는 매 턴 확인을 유지한다.
5. 거절/무음·네트워크 단절·합성 실패·권한 철회·합성 중 회수·재생 로드 중 회수를 확인한다. 중계 모드에서 원본 Gemini 음성·기기 TTS로 몰래 전환되면 실패다.

주소가 없으면 기존 직접 Live 모드다. 따라서 새 경로를 실서비스에 강제하는 구버전/직접 토큰 경로 폐쇄는 별도이며 R010은 계속 부분 해결이다. 중계 모드의 실패는 안내 후 중단하며 기록 저장 경로를 남긴다.

## 현재 제한

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

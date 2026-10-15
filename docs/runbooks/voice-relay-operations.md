# 음성 중계 운영·전환 절차

2026-09-20 작성 · 2026-10-01 호스팅 확정 반영. 운영 배포 전의 절차다. 실제 운영 완료 기록이 아니다.

> ⚠️ **2026-09-23 기획 변경** — 이 중계가 **유일한 음성 경로**가 된다(앱 직접 모드 폐기, [`pilot-development-plan.md`](../plans/pilot-development-plan.md) M1·C3·C4).
> 배포 순서에 두 단계가 더해진다: ① **`live-token` 중계 전용화** — 중계에 전용 자격(시크릿)을 넣고 → `live-token` 을 배포하고 →
> 요양보호사 JWT 만으로 부르면 403 인지 확인한다(구버전 앱의 직접 연결이 이때 끊긴다). ② **`session_tick` RPC 전환** — DB 마이그레이션(D6)이
> 먼저 적용돼 있어야 한다. RPC 가 없는 DB 에 새 중계를 올리면 권한 폴이 실패해 모든 세션이 닫힌다.
> 아래 롤백 원칙("기존 Gemini 원음/기기 TTS로 자동 전환하지 않는다")은 그대로다 — 직접 모드는 롤백 대상도 아니다.

## 호스팅 (✅ 2026-10-01 사용자 확정)

운영 배포는 **중계 개발(T23.5 · T26.1 · T21.12 · T21.11) 완료 뒤** 사용자가 한다. 그 전에 띄우는 리비전은 합성 계정·`/healthz`·`/readyz` 시험용으로만 쓴다.

| 항목 | 확정 값 | 이유 |
|---|---|---|
| 플랫폼 | **Google Cloud Run** | WebSocket 지원·요청 시간 연장·Docker 이미지 그대로·Secret Manager |
| 리전 | **`asia-northeast3`(서울)** — Artifact Registry 도 같은 리전 | 국내 보관 기준 · 운영 Supabase(서울)와 근접 |
| 주소 | 첫 앱 빌드는 Cloud Run 기본 주소 `wss://<서비스>.run.app/voice` → 서비스 직전 가비아 도메인 구매 후 교체 | 주소는 앱 빌드에 인라인된다(`EXPO_PUBLIC_VOICE_RELAY_URL`) → **교체 시 EAS 재빌드·재설치 1회** |
| 최대 인스턴스 | **1** | 파일럿 동시 세션 1~4 = 프로세스 동시 연결 상한 4(`server.ts` — 당분간 고정, 사용자 결정) |
| 최소 인스턴스 | **평일 업무 시간 1, 그 외 0** — 아래 "업무 시간 가동" | 업무 시간 콜드 스타트 제거. 시간 외에도 **연결은 된다**(첫 연결이 몇 초 느릴 뿐 — 차단하지 않는다, 사용자 결정) |
| 요청 타임아웃 | 15분 | 세션 상한 10분 + 여유 |
| CPU | **항상 할당(인스턴스 기반 과금)** | 연결을 닫은 뒤에도 위기 근거 재시도(T25.17, 최대 약 30초)와 2초 권한 폴이 돌아야 한다. 요청 기반이면 요청 밖 CPU 가 줄어 안전 기록이 멈출 수 있다 |
| 컨테이너 동시 요청 수 | 10 | WebSocket 은 코드가 4개로 막는다. 나머지는 상태 확인 여유 |
| 인증 | Cloud Run IAM 인증 끔(공개 수신) | 앱은 Google IAM 인증을 못 한다. 인증은 중계가 JWT·`session_tick` 으로 한다 |
| 종료 유예 | 플랫폼 기본(약 10초) | 코드는 5초 안에 강제 정리한다 |

⚠️ 플랫폼 수치·기능(서비스 단위 최소 인스턴스, 서울 리전의 도메인 매핑 지원 여부)은 문서 작성 시 공식 문서로 재확인하지 못했다 — 콘솔 설정 때 확인한다.

### 비밀값·환경변수

| 위치 | 이름 | 비고 |
|---|---|---|
| Cloud Run Secret Manager | `GEMINI_API_KEY` | **Supabase Edge 의 `GEMINI_API_KEY` 와 같은 값**(2026-10-04 사용자 결정 — 키 하나 공유. 키는 모델이 아니라 Google 프로젝트에 묶여 Live·TTS 를 모두 부른다). 아래 "Gemini 키 교체" |
| Cloud Run Secret Manager | `VOICE_RELAY_SECRET`(T23.5 — 32자 이상, 예: `openssl rand -hex 32`) | **같은 값**을 Supabase Edge 시크릿 `VOICE_RELAY_SECRET` 에도 넣는다. 값이 다르면 모든 세션 시작이 403 |
| Cloud Run 환경변수 | `SUPABASE_URL` · `SUPABASE_PUBLISHABLE_KEY` | 공개값. service_role 키 금지 |
| (기본값 사용) | `PORT`(Cloud Run 이 8080 주입 · Dockerfile 도 8080) · `VOICE_RELAY_BIND`(이미지에 `0.0.0.0`) | 설정 불필요 |

**TTS 호출은 중계가 한다** — Supabase Edge 함수 중 TTS 를 부르는 것은 없다(합성은 중계 `output.ts` — 초기 CLOVA TTS 도 중계가 직접 불렀다). Edge 로 옮기지 않는다: 매 턴 한 단계 더 거쳐 응답이 늦어지고(콜드 스타트 포함), 출력 검증과 합성이 갈라진다(2026-10-04 검토). 삭제한 CLOVA 키(Edge `stt-transcribe` 용 STT)를 대신할 키는 없다. Cloud Run 연결 전 로컬 시험은 프로세스 환경변수로만 준다(이 서버는 `.env` 를 읽지 않는다).

⚠️ **Supabase Edge 의 `GEMINI_API_KEY` 는 지우지 않는다** — `live-token`(Live 단기 토큰 발급)·`session-report`·`program-journal-draft` 가 읽는다.
지우면 모든 음성 세션 시작과 AI 초안이 실패한다. 로컬 `supabase/.env` 를 고쳐도 이미 배포된 Edge 시크릿은 바뀌지 않는다.

### Gemini 키 교체 (키 하나 공유 — 2026-10-04)

키 하나를 **두 곳**에 같은 값으로 둔다: ① Supabase Edge 시크릿 `GEMINI_API_KEY` ② (중계 배포 뒤) Cloud Run Secret Manager `GEMINI_API_KEY`.
⚠️ 공유의 대가: 키가 새면 두 곳을 **동시에** 바꿔야 하고, 바꾸는 동안 음성 세션·AI 초안이 함께 멈춘다. 한도·결제는 키가 아니라 Google 프로젝트 단위다(키를 나눠도 공유된다).

1. **발급** — Google AI Studio(또는 Cloud Console → API 및 서비스 → 사용자 인증 정보)에서 같은 Google 프로젝트에 새 키. 가능하면 API 제한을 Generative Language API 로만.
2. **키 확인(배포 전, 본인 PC · Windows cmd)** — 모델 목록은 한 번에 50개까지라 `pageSize=1000` 으로 전부 받는다:
   ```bat
   set /p GEMINI_API_KEY=새 Gemini 키 붙여넣기: 
   curl.exe -s -H "x-goog-api-key: %GEMINI_API_KEY%" "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000" -o "%TEMP%\gemini_models.json"
   findstr /c:"\"error\"" /c:"\"message\"" "%TEMP%\gemini_models.json"
   findstr /c:"\"models/" "%TEMP%\gemini_models.json" | findstr /i "live audio tts"
   powershell -NoProfile -Command "(Get-Content $env:TEMP\gemini_models.json -Raw | ConvertFrom-Json).models | Where-Object { $_.supportedGenerationMethods -contains 'bidiGenerateContent' } | ForEach-Object { $_.name }"
   curl.exe -s -X POST -H "x-goog-api-key: %GEMINI_API_KEY%" -H "Content-Type: application/json" -d "{\"uses\":1}" "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
   del "%TEMP%\gemini_models.json" & set GEMINI_API_KEY=
   ```
   → 오류 줄 없음 · Live(bidiGenerateContent) 지원 모델이 1개 이상(그 이름이 `GEMINI_LIVE_MODEL` 값 — `models/` 는 빼고) · 이름에 `tts` 가 든 모델(중계 `GEMINI_TTS_MODEL`) ·
   마지막 요청이 `"name": "auth_tokens/…"` 를 돌려줘야 v1beta 단기 토큰이 된다(404 면 `v1alpha` 로 다시 — 코드의 API 버전을 바꿔야 한다).
   폐기한 옛 키로 첫 요청을 하면 `API_KEY_INVALID` 여야 한다. ✅ 2026-10-07 확인: `gemini-3.8-live`·`gemini-3.8-flash-tts` 존재 · v1beta 단기 토큰 발급 성공. 단기 토큰 요청의 잠금 필드는 REST 이름 `bidiGenerateContentSetup` + `fieldMask` 다 — SDK 이름 `liveConnectConstraints` 를 보내면 400(2026-10-07 확인·수정). 수정 본문으로 `gemini-smoke.ps1` 4단계(TTS·토큰·Live setup·Live 1턴) 모두 통과(2026-10-07).
   ⚠️ 목록에는 `models/` 가 붙어 보이지만 **`GEMINI_LIVE_MODEL` 시크릿에는 `models/` 를 빼고**(`gemini-3.8-live`) 넣는다 — `live-token` 이 앞에 `models/` 를 붙인다(넣으면 `models/models/…` 로 실패).
3. **Supabase** — 대시보드 Edge Functions → Secrets 에서 `GEMINI_API_KEY` 값을 교체(또는 `supabase secrets set GEMINI_API_KEY=… --project-ref ufkbzpdjomtmxjipmwub`).
   함수 재배포는 보통 필요 없다(시크릿은 호출 때 읽힌다) — 반영이 안 보이면 해당 함수만 재배포.
   같은 화면에서 `GEMINI_LIVE_MODEL`(= `gemini-3.8-live`)도 있는지 확인한다(없으면 코드 기본값).
   **실호출 확인(cmd)** — 위 목록 확인 뒤, 중계·`live-token` 과 **같은 요청 형식**으로 TTS 합성 · 단기 토큰 · Live 연결 · Live 응답 1턴을 실제로 부른다(키는 숨김 입력, 저장·출력 안 함):
   `powershell -NoProfile -ExecutionPolicy Bypass -File apps\voice-relay\scripts\gemini-smoke.ps1`
   → `[OK]` 4줄 + `All checks passed.` · TTS 줄의 header 가 `RIFF`(중계는 WAV 를 기대) · Live 줄에 audio chunks ≥ 1. `[FAIL]` 이면 그 줄의 오류 문구가 원인이다.
4. **확인** — 앱에서 시험 세션 시작이 되는지(=`live-token` 이 토큰을 줌) · Edge Functions → `live-token` 로그에 `토큰 발급 실패(4xx)`·`GEMINI_API_KEY 시크릿이 설정되지 않았습니다` 가 없는지.
   AI 초안은 기관 스위치가 꺼져 있어(2026-10-04 기준 0곳) Gemini 를 부르지 않는다 — 스위치를 켤 때 `program-journal-draft` 로그를 함께 본다.
5. **Cloud Run(중계 연결 때)** — Secret Manager 에 **같은 값**으로 `GEMINI_API_KEY` 를 만들고 서비스에 연결(위 표). 확인: 시험 세션에서 AI 음성이 나오는지(TTS) · 중계 로그에 `SYNTHESIS_*` 오류가 없는지.
6. **로컬 `supabase/.env`** — CLI 로 시크릿을 올릴 때만 쓰는 파일이다. 옛 키가 남아 있으면 새 키로 바꾸거나 줄을 지운다(커밋 금지 · 다음 `--env-file` 업로드가 옛 키로 덮어쓰지 않게).

### 이미지 빌드·업로드

아직 올라간 이미지는 없다(CI 는 이미지를 만들지 않는다). 이미지 주소 형식:
`asia-northeast3-docker.pkg.dev/<GCP 프로젝트 ID>/giokon/voice-relay:<git 커밋 해시>`

```bat
:: 최초 1회 (Windows cmd)
gcloud artifacts repositories create giokon --repository-format=docker --location=asia-northeast3
gcloud auth configure-docker asia-northeast3-docker.pkg.dev

:: 저장소 루트에서 (마지막 . = 빌드 컨텍스트 — 루트 .dockerignore 가 .env·키 파일을 뺀다)
for /f %i in ('git rev-parse --short HEAD') do set TAG=%i
set IMAGE=asia-northeast3-docker.pkg.dev/<프로젝트ID>/giokon/voice-relay:%TAG%
docker build --platform linux/amd64 -f apps/voice-relay/Dockerfile -t "%IMAGE%" .
docker push "%IMAGE%"
```
(`for /f` 는 cmd 창에 직접 칠 때 `%i`, `.bat` 파일 안에서는 `%%i`.)

- `--platform linux/amd64` 필수 — Apple Silicon 에서 빌드하면 ARM 이미지가 되어 Cloud Run 에서 시작하지 못한다.
- 태그는 `latest` 대신 **커밋 해시** — 떠 있는 코드 확인·롤백용.
- Dockerfile 이 루트가 아니라 `apps/voice-relay/` 에 있어 `gcloud run deploy --source` 는 그대로 쓸 수 없다.

### 업무 시간 가동 (평일 09:00~18:00 KST)

Cloud Scheduler 작업 2개가 서비스의 **최소 인스턴스 수**만 바꾼다(서비스 단위 설정 — 새 리비전을 만들지 않는다).

| 작업 | 일정(cron, 시간대 `Asia/Seoul`) | 동작 |
|---|---|---|
| 업무 시작 | `45 8 * * 1-5` | 최소 인스턴스 1 |
| 업무 종료 | `15 18 * * 1-5` | 최소 인스턴스 0 |

- 앞뒤 15분은 첫 세션 전에 인스턴스가 떠 있게 하는 여유다(업무 시간 자체는 09~18).
- 스케줄러는 이 서비스 설정만 바꿀 수 있는 전용 서비스 계정으로 Cloud Run Admin API 를 호출한다.
- 공휴일은 따로 처리하지 않는다(그날도 1대가 켜져 비용만 든다 — 동작에는 영향 없음).

### 도메인 (서비스 직전 가비아 구매)

- 구매 전에 **서울 리전에서 Cloud Run 도메인 매핑이 되는지** 콘솔에서 확인한다. 안 되면 외부 부하 분산기를 앞에 둬야 한다(월 고정비 추가).
- 도메인으로 바꾸면 EAS 의 `EXPO_PUBLIC_VOICE_RELAY_URL` 을 `wss://<도메인>/voice` 로 바꾸고 앱을 재빌드한다.
- `naver-auth` 재배포도 같은 도메인 구매를 기다린다(`AGENTS.md` 사용자 작업 대기).

## 상태와 종료

- `/healthz`: 프로세스가 요청에 응답하면 200/running. 외부 공급자·인증 성공을 보증하지 않는다.
- `/readyz`: 새 연결 수용 상태. 정상 200/ready, drain 후 503/draining. 용량·공급자 상태의 종합 점검은 아니다.
- `drain()`은 새 WebSocket을 거절한다. 운영자용 HTTP 변경 엔드포인트는 제공하지 않는다.
- SIGTERM/SIGINT의 `shutdown()`은 drain 후 각 연결의 합성을 취소하고 공급자 소켓을 닫으며 프로세스 내부 세션 점유를 해제한다. 앱에는 연결 종료가 전달되어 회수·기록 확인 경로로 간다. 무중단 대화 인계는 구현되지 않았다.
- close handshake를 끝내지 않는 앱은 연결 내부 1초 제한으로 정리한다. 서버 종료에는 5초 후 소켓/HTTP 강제 정리도 있다. 완료 후 `Voice relay stopped`만 기록한다. 원음·전사·인증값은 로그에 넣지 않는다.
- 이미 처리된 공급자 사용량이나 토큰 발급 한도는 환불/취소하지 않는다. 여러 인스턴스의 같은 세션 점유 방지는 별도다.

## 배포 순서

> ⚠️ DB 선행 마이그레이션: `20260924040000`(session_tick) · **`20261003000000`(T26.1 점유 RPC — 없으면 새 중계가 모든 연결을 `LEASE_FAILED` 로 거절)**. `live-token`(T23.5)은 중계 **뒤**.

1. 호스팅·리전·WSS·Secret Manager를 확정한다(✅ 위 "호스팅" 절). 기존 DB 기능용 출처 계약은 [`database.md`](../database.md) "대화 기록 저장 계약"을 따른다. DB 보안 감사와 구분한다.
2. 동일 커밋에서 중계 시험과 타입 검사를 실행한다. 컨테이너 이미지 빌드·해당 호스팅에서의 시작/종료 신호 검증은 별도 필요하다.
3. 새 중계 리비전을 제한된 시험 경로에 올린다. `/healthz`, `/readyz`, 외부 인증 거절, 합성 시험 계정의 시작→Gemini TTS→입력→저장→회수를 확인한다. 건강 확인 HTTP 성공만으로 실제 공급자 검증을 대체하지 않는다.
4. v3 서버를 먼저 준비한 후 앱의 중계 주소를 새 리비전에 연결한다. 신규 시작은 v2, 맥락 재개는 v3 협의를 요구하므로 재개 기능을 제공하는 앱을 v1/v2 전용 서버로 되돌리지 않는다. 자동 입력은 출처 저장 v1 계약도 필요하다.
5. 전환 전 진행 중 세션을 담당자가 회수하게 안내한다. 트래픽을 새 리비전으로 옮긴 뒤 이전 프로세스에 종료 신호를 보낸다. 현재 구현은 진행 중 대화를 다른 프로세스로 옮기지 않는다.
6. 종료 신호가 실제 Node 프로세스에 전달되는지, 플랫폼 종료 유예가 내부 5초 제한보다 충분한지 확인한다. 로그의 종료 메시지와 이전 프로세스/연결 소멸을 모두 확인한다.

## 점검·원인 확인 로그 (2026-10-15)

**앱 없이 점검** — 저장소 루트에서 `node apps/voice-relay/scripts/relay-smoke.mjs wss://<중계 호스트>/voice`
(`pnpm install` 후). 앱과 같은 Origin(`https://<호스트>`)으로 연결해 ① `/readyz` ② 핸드셰이크 ③ 가짜 인증 거절까지 본다.
로그인·세션·Gemini 는 쓰지 않는다(비용·DB 쓰기 없음). Gemini 키·모델은 `apps/voice-relay/scripts/gemini-smoke.ps1`.

**원인 확인 로그**(Cloud Run 로그 · JSON 한 줄 · 대화 내용·전사·음성·토큰·JWT 없음):

| `voiceRelay` | 뜻 |
|---|---|
| `upgrade_refused` (`reason`: origin·path·capacity·draining) | 연결을 받지 않음. `origin` 이면 Origin 값도 남긴다 |
| `upgrade_accepted` → `authorized` → `provider_open` → `ready` | 정상 진행 순서(로그인·세션 점유·토큰 → Gemini 연결 → 첫 응답 준비) |
| `closed` (`stage`: auth·setup·conversation, `reason`) | 끝난 단계와 이유. 예: `AUTH_FAILED` · `SESSION_NOT_OWNED` · `SESSION_BUSY` · `DENIED` · `TOKEN_FAILED_403`(중계 비밀값 불일치·자격/동의) · `TOKEN_FAILED_500`(Edge 비밀값 누락) · `TOKEN_FAILED_502`(Gemini 토큰 오류) · `PROVIDER_CLOSED` · `SETUP_TIMEOUT` · `APP_CLOSED` |
| `provider_closed` (`code`, `reason`) · `provider_error` · `provider_message` | Gemini Live 가 닫거나 오류를 보냄(키·모델·토큰 문제의 상태 문구) |
| `synthesis_failed` (`code`, `cause`) | TTS 실패. `cause` 예: `GEMINI_TTS_FAILED_400`·`GEMINI_TTS_RATE_LIMIT`·`OUTPUT_REJECTED` |

## 장애·롤백

1. 신규 시작을 중지하고 진행 중 담당자에게 회수를 안내한다. 잘못된 응답을 재생하거나 기존 Gemini 원음/기기 TTS로 자동 전환하지 않는다.
2. 마지막으로 검증한 **앱과 호환되는 v3 중계** 리비전으로 트래픽을 되돌린다. 호환 리비전이 없으면 새 세션을 계속 차단한다.
3. DB 출처 컬럼·교정 기록을 롤백 목적으로 삭제하지 않는다. 기능 저장 계약 호환은 별도 런북을 따른다.
4. 저장 실패·부분 입력은 앱의 확인/재시도 경로로 처리한다. 종료된 공급자 세션을 복구했다고 표시하지 않는다.

## 로컬 증거와 외부 확인

`pnpm --filter @giokon/voice-relay test`는 실제 로컬 WebSocket의 drain/종료/합성 중 취소와 실제 진입점 종료 핸들러를 가상 자격 증명으로 검증한다. Windows에서는 IPC로 자식 프로세스의 등록된 SIGTERM 핸들러를 호출하므로, 운영 OS가 신호를 전달하는 시험은 아니다. 실제 클라우드 배포·실기기·외부 공급자 호출은 미수행이다.

## 로컬 컨테이너 확인

저장소 루트의 `.dockerignore`는 기본 제외 방식으로 중계와 공유 패키지의 manifest/source만 허용한다. `.env`·키 파일·로컬 설정·다른 앱·Git 이력은 빌드 컨텍스트에 포함하지 않는다. Dockerfile은 node 사용자로 Node를 직접 실행하여 SIGTERM이 패키지 실행 래퍼를 거치지 않게 한다.

빌드 명령: `docker build -f apps/voice-relay/Dockerfile -t giokon-voice-relay:local .`

기동 검증은 가상 자격 증명만 사용하고 실제 음성 요청 없이 `/healthz`와 `/readyz`, 컨테이너 사용자 및 PID 1, `docker stop --time 10`의 정상 종료 로그/종료 코드를 확인한다. 운영 자격 증명은 이미지에 넣지 않고 배포 환경 Secret Manager로 주입한다. 이 확인은 실제 공급자 연결·실기기·운영 호스팅의 종료 정책 검증을 대체하지 않는다.

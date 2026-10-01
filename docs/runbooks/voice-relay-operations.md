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
| Cloud Run Secret Manager | `GEMINI_API_KEY` | **중계 전용 키를 새로 발급**(2026-10-01 사용자 동의 — 키 분리). Supabase Edge 의 키와 다른 키 |
| Cloud Run Secret Manager | 중계 전용 자격(T23.5 — 이름은 구현 때 확정) | 같은 값을 Supabase Edge 시크릿에도 넣는다 |
| Cloud Run 환경변수 | `SUPABASE_URL` · `SUPABASE_PUBLISHABLE_KEY` | 공개값. service_role 키 금지 |
| (기본값 사용) | `PORT`(Cloud Run 이 8080 주입 · Dockerfile 도 8080) · `VOICE_RELAY_BIND`(이미지에 `0.0.0.0`) | 설정 불필요 |

⚠️ **Supabase Edge 의 `GEMINI_API_KEY` 는 지우지 않는다** — `live-token`(Live 단기 토큰 발급)·`session-report`·`program-journal-draft` 가 읽는다.
지우면 모든 음성 세션 시작과 AI 초안이 실패한다. 로컬 `supabase/.env` 를 고쳐도 이미 배포된 Edge 시크릿은 바뀌지 않는다.

### 이미지 빌드·업로드

아직 올라간 이미지는 없다(CI 는 이미지를 만들지 않는다). 이미지 주소 형식:
`asia-northeast3-docker.pkg.dev/<GCP 프로젝트 ID>/giokon/voice-relay:<git 커밋 해시>`

```bash
# 최초 1회
gcloud artifacts repositories create giokon --repository-format=docker --location=asia-northeast3
gcloud auth configure-docker asia-northeast3-docker.pkg.dev

# 저장소 루트에서 (마지막 `.` = 빌드 컨텍스트 — 루트 .dockerignore 가 .env·키 파일을 뺀다)
TAG=$(git rev-parse --short HEAD)
IMAGE=asia-northeast3-docker.pkg.dev/<프로젝트ID>/giokon/voice-relay:$TAG
docker build --platform linux/amd64 -f apps/voice-relay/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"
```

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

1. 호스팅·리전·WSS·Secret Manager를 확정한다(✅ 위 "호스팅" 절). 기존 DB 기능용 출처 계약은 [`database.md`](../database.md) "대화 기록 저장 계약"을 따른다. DB 보안 감사와 구분한다.
2. 동일 커밋에서 중계 시험과 타입 검사를 실행한다. 컨테이너 이미지 빌드·해당 호스팅에서의 시작/종료 신호 검증은 별도 필요하다.
3. 새 중계 리비전을 제한된 시험 경로에 올린다. `/healthz`, `/readyz`, 외부 인증 거절, 합성 시험 계정의 시작→Gemini TTS→입력→저장→회수를 확인한다. 건강 확인 HTTP 성공만으로 실제 공급자 검증을 대체하지 않는다.
4. v3 서버를 먼저 준비한 후 앱의 중계 주소를 새 리비전에 연결한다. 신규 시작은 v2, 맥락 재개는 v3 협의를 요구하므로 재개 기능을 제공하는 앱을 v1/v2 전용 서버로 되돌리지 않는다. 자동 입력은 출처 저장 v1 계약도 필요하다.
5. 전환 전 진행 중 세션을 담당자가 회수하게 안내한다. 트래픽을 새 리비전으로 옮긴 뒤 이전 프로세스에 종료 신호를 보낸다. 현재 구현은 진행 중 대화를 다른 프로세스로 옮기지 않는다.
6. 종료 신호가 실제 Node 프로세스에 전달되는지, 플랫폼 종료 유예가 내부 5초 제한보다 충분한지 확인한다. 로그의 종료 메시지와 이전 프로세스/연결 소멸을 모두 확인한다.

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

# PLAN.md — 기억온 제품화 및 앱 퍼블리싱 개발 계획

## 요약

- 공식 방향은 **“AI 기반 인지활동 보조 앱”**으로 통일한다. 스토어/서비스 문구에서 의료·치료 효과를 단정하지 않고, 회상 대화와 기록 보조를 핵심 가치로 설명한다.
- 현재 `frontend`는 **시연용 React/Vite 프로토타입**으로 유지하되, 최종 제품은 **Expo React Native 앱 + Node/Express API + PostgreSQL + Firebase Auth/Storage + AI 서비스**로 개발한다.
- v1 퍼블리싱 범위는 **요양보호사/어르신용 모바일 앱**이다. 보호자 앱, 캐릭터 꾸미기, 음악/미술/인지자극 모듈은 v2 후보로 분리한다.
- 최종 배포는 **TestFlight/Google Play 내부 테스트 → App Store/Google Play 정식 심사 제출**까지 포함한다. Expo 공식 문서 기준으로 EAS Build/Submit을 사용한다: [EAS Build](https://docs.expo.dev/build/setup/), [EAS Submit](https://docs.expo.dev/submit/introduction/).

## 파트별 개발 계획

### 1. 프론트엔드 정리 및 제품 범위 고정

- 현재 `frontend`의 역할을 “웹 시연 프로토타입/관리자 웹 참고 구현”으로 명시하고, 실제 v1 앱 구현은 새 Expo 앱에서 시작한다.
- 먼저 기존 웹앱의 품질 기준을 맞춘다:
  - `npm run build`는 현재 통과 상태 유지.
  - `npm run lint` 실패 원인인 React Hooks 규칙 위반, `any` 사용, 빈 catch block, dialog state 버그를 수정한다.
  - `ChronicleView` 편집/신규 추가 시 이전 state가 남는 문제를 고친다.
- v1에 남길 기능과 분리할 기능을 확정한다:
  - 포함: 로그인, 어르신 목록, 연대기 등록/수정, 세션 시작, 음성 대화, STT 수정, 세션 종료, 로그 조회.
  - 제외: 보호자 앱, 캐릭터 꾸미기, 감정 분석, 음악/미술/인지자극, 수익화, 기관 관리자.
- 기존 UI/문구는 Expo 앱 설계 레퍼런스로 사용하되, 제품 문구는 “회상치료”보다 “회상 대화/인지활동 보조”를 우선한다.

### 2. Expo 모바일 앱

- 새 Expo 앱을 만든다. 기본 구조는 `app/`, `components/`, `services/`, `hooks/`, `store/`, `types/`로 구성한다.
- 화면은 v1 기준으로만 구현한다:
  - 요양보호사 로그인
  - 어르신 목록
  - 연대기 등록/수정
  - 어르신별 세션 이력
  - 세션 로그 상세
  - 어르신 대화 화면
- 어르신 대화 화면 요구사항:
  - 텍스트 최소 18pt 이상, 마이크 버튼 최소 60px 이상.
  - AI 질문 TTS 자동 재생.
  - 재생 완료 후 마이크 활성화.
  - STT 실패 시 “다시 말씀해 주세요” 안내.
  - STT 오인식 수정 입력 UI 제공.
  - 네트워크 불안정 시 세션 복구 안내.
- 음성 구현:
  - Expo AV 또는 현 SDK 권장 오디오 모듈로 녹음/재생 구현.
  - 어르신 발화는 최대 60초, `m4a` 또는 `wav`로 서버 업로드.
  - 서버 응답의 `audio_url`을 재생하고, 실패 시 질문 텍스트를 표시한다.
- 상태 관리는 로컬 UI 상태만 클라이언트가 담당한다. 프로필, 세션, 로그의 source of truth는 서버다.

### 3. 백엔드 API

- Node.js + Express 서버를 신설한다.
- 모든 API는 Firebase ID Token을 `Authorization: Bearer {token}`으로 받아 검증한다.
- 최초 인증된 요청에서 `firebase_uid` 기준으로 `users` row를 자동 upsert한다.
- REST API는 기존 문서와 맞춰 아래 형태로 고정한다:
  - `GET /api/profiles`
  - `POST /api/profile`
  - `GET /api/profile/:id`
  - `PATCH /api/profile/:id`
  - `DELETE /api/profile/:id`
  - `GET /api/profile/:id/chronicles`
  - `POST /api/profile/:id/chronicles`
  - `PATCH /api/profile/:id/chronicles/:chronicleId`
  - `DELETE /api/profile/:id/chronicles/:chronicleId`
  - `POST /api/session/start`
  - `POST /api/session/respond`
  - `PATCH /api/session/respond/correct`
  - `POST /api/session/end`
  - `GET /api/profile/:id/sessions`
  - `GET /api/session/:id/logs`
- Wire format은 문서 기준의 `snake_case`를 사용한다. 클라이언트 내부에서는 API adapter가 `camelCase`로 변환한다.
- 공통 오류 응답은 `{ error, message, detail? }`로 통일한다.
- 세션 중 오디오는 Firebase Storage에 임시 업로드하고, STT 완료 후 원본을 삭제한다.
- TTS 결과 오디오는 Firebase Storage에 저장하고 `audio_url`로 반환한다. 보관 기간은 v1에서 24시간으로 제한한다.

### 4. 데이터베이스

- PostgreSQL을 장기 저장소로 사용한다.
- v1 테이블:
  - `users`: Firebase UID, 이름, 이메일.
  - `profiles`: 어르신 기본 연대기, 보호자 이름/관계 optional.
  - `chronicle_entries`: 요양보호사 입력 및 AI 추출 연대기.
  - `sessions`: 세션 메타, 상태, 시작/종료 시각, 턴 수, 진행 시간.
  - `session_logs`: AI/어르신 발화 전문, topic, timestamp, duration.
- `profiles.user_id`, `sessions.profile_id`, `session_logs.session_id`, `chronicle_entries.profile_id`에 인덱스를 둔다.
- 모든 조회/수정은 `user_id` 기준으로 필터링한다. 다른 요양보호사의 데이터 접근은 403으로 처리한다.
- Firebase Realtime DB는 v1에서 사용하지 않는다. 실시간 모니터링이 필요해지는 v2에서 재검토한다.

### 5. AI/STT/TTS 파이프라인

- 서버에 provider adapter를 둔다:
  - `llm.service`: 연대기 + 대화 이력 → 다음 질문 JSON 생성.
  - `stt.service`: 오디오 → 텍스트.
  - `tts.service`: 질문 텍스트 → 오디오 URL.
- LLM 응답은 반드시 `{ question, topic, switch_topic }` JSON으로 검증한다.
- 프롬프트 원칙:
  - 어르신 실제 연대기 기반 질문.
  - 동일 주제 3회 이상 반복 금지.
  - 짧은 답변/침묵 시 쉬운 질문 또는 주제 전환.
  - 사별, 전쟁, 병원, 아픔 등 고통 키워드 감지 시 부드럽게 주제 전환.
- STT는 OpenAI Audio Transcriptions 계열을 1차 사용하고, 필요 시 Clova Speech를 보완 adapter로 붙인다. OpenAI STT는 공식 문서상 `audio/transcriptions`와 `gpt-4o-mini-transcribe`/`gpt-4o-transcribe` 계열을 검토한다: [Speech to text](https://platform.openai.com/docs/guides/speech-to-text).
- TTS는 Clova Voice를 v1 기본값으로 두되, 대체 provider가 필요하면 OpenAI `audio/speech` adapter를 추가할 수 있게 한다. OpenAI TTS 사용 시 AI 음성 고지를 포함한다: [Text to speech](https://platform.openai.com/docs/guides/text-to-speech).

### 6. 관리자 웹

- 현재 `frontend`는 관리자 웹의 출발점으로 활용한다.
- v1 관리자 웹은 모바일 앱과 같은 API를 사용한다.
- 포함 기능:
  - 요양보호사 로그인.
  - 어르신 목록/등록/수정.
  - 연대기 항목 관리.
  - 세션 이력/로그 조회.
- 제외 기능:
  - 보호자 로그인/홈.
  - 캐릭터 꾸미기.
  - 감정 리포트 중심 화면.
- 웹 배포는 Vercel 또는 Netlify 중 하나로 통일한다. 현재 `netlify.toml`이 있으므로 Netlify를 우선 사용하고, 팀이 Vercel을 원하면 설정 파일을 교체한다.

### 7. 인프라 및 배포

- 백엔드:
  - Render 또는 Railway에 Node.js 서버 배포.
  - 운영 환경변수: OpenAI API key, Clova credentials, Firebase Admin credentials, PostgreSQL URL, Storage bucket.
  - `/health` 엔드포인트 제공.
- DB:
  - Render PostgreSQL 또는 Supabase PostgreSQL 중 하나 사용.
  - 마이그레이션 도구는 Prisma 또는 Drizzle 중 하나로 고정한다. v1 기본값은 Prisma.
- Firebase:
  - Authentication: 이메일/비밀번호 로그인.
  - Storage: STT 임시 오디오 및 TTS 결과 저장.
- CI:
  - PR마다 web/app/server lint, typecheck, unit test 실행.
  - main merge 후 web/server 자동 배포.
  - 모바일은 release branch에서 EAS build 실행.

### 8. 앱 퍼블리싱

- Expo EAS 설정:
  - `ios.bundleIdentifier`: `kr.gieokon.app`
  - `android.package`: `kr.gieokon.app`
  - `development`, `preview`, `production` build profile 분리.
  - `eas build --platform all --profile production`으로 제출용 binary 생성.
  - `eas submit`으로 App Store Connect와 Google Play Console에 업로드.
- 스토어 준비물:
  - 앱 이름: 기억온.
  - 카테고리: 건강/라이프스타일 또는 생산성/케어 보조 중 스토어 정책에 맞춰 선택.
  - 설명 문구: “요양보호사가 입력한 어르신 연대기를 바탕으로 AI가 회상 대화를 돕고 세션 기록을 남기는 인지활동 보조 앱.”
  - 금지 문구: 치매 치료, 의료 효과 보장, 진단, 임상 치료.
  - 개인정보처리방침 URL, 이용약관 URL, 데이터 삭제 요청 안내.
  - AI 음성 사용 고지.
  - 마이크 권한 설명 문구.
  - 스크린샷: 로그인, 어르신 목록, 연대기 입력, 대화 화면, 세션 로그.
- 출시 순서:
  - 내부 QA 빌드.
  - TestFlight 내부 테스트.
  - Google Play 내부 테스트.
  - 파일럿 기관 테스트.
  - 스토어 심사용 메타데이터 보완.
  - App Store/Google Play 정식 심사 제출.

## 테스트 계획

- 프론트 공통:
  - `npm run build` 통과.
  - `npm run lint` 통과.
  - 주요 화면 모바일/태블릿 크기에서 텍스트 겹침 없음.
- 모바일 앱:
  - 실제 iOS/Android 기기에서 로그인, 프로필 CRUD, 세션 시작, 녹음, 재생, 로그 조회 확인.
  - 마이크 권한 거부, 네트워크 끊김, STT 실패, TTS 실패 시 사용자 친화 메시지 확인.
- 백엔드:
  - 인증 토큰 없음/잘못됨/타인 데이터 접근 테스트.
  - 프로필 CRUD API 테스트.
  - 세션 시작 → 응답 → 수정 → 종료 → 로그 조회 통합 테스트.
  - 오디오 원본이 STT 후 삭제되는지 확인.
- AI:
  - 첫 질문에 출신지/직업/가족 중 최소 1개 반영.
  - 동일 주제 3회 이상 반복 없음.
  - 고통 키워드 입력 시 주제 전환.
  - LLM JSON parse 실패 시 1회 재시도 후 오류 반환.
- 성능:
  - STT 결과 3초 내 표시 목표.
  - TTS 첫 재생 2초 내 목표.
  - 전체 STT+LLM+TTS 5초 내 목표.
- 퍼블리싱:
  - EAS production build 성공.
  - TestFlight 설치 성공.
  - Google Play internal testing 설치 성공.
  - 개인정보처리방침/권한 설명/AI 고지 포함 여부 확인.

## PLAN.md 작성 방식

- 루트에 `PLAN.md`를 생성하고 이 계획을 그대로 저장한다.
- `PLAN.md`의 첫 버전은 실행 계획 문서이며, 구현 중 결정 변경이 생기면 반드시 변경 사유와 날짜를 “결정 로그” 섹션에 추가한다.
- 구현 전 첫 커밋은 `PLAN.md` 추가와 현재 상태 기록만 포함한다.
- 이후 파트별로 별도 PR/커밋을 나눈다:
  - frontend hardening
  - backend scaffold
  - database/auth
  - AI/audio pipeline
  - Expo app
  - admin web API migration
  - deployment/publishing

## 가정 및 기본값

- 사용자는 **단계형 MVP**, **Expo 앱 신설**, **스토어 정식 출시**, **인지활동 보조 포지셔닝**을 선택했다.
- Apple Developer Program과 Google Play Console 계정은 퍼블리싱 전까지 준비한다.
- v1은 보호자 앱을 출시하지 않는다. 보호자 관련 현재 데모 기능은 v2 기획 자료로 보존한다.
- v1은 Firebase Realtime DB 없이 PostgreSQL을 source of truth로 둔다.
- `PLAN.md` 파일 생성은 Plan Mode가 종료된 뒤 실행 단계에서 수행한다.

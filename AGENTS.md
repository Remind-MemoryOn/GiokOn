# 기억온 (GiokOn) — 프로젝트 메모리

> 📌 **이 파일이 프로젝트 메모리의 단일 소스(SoT)다(2026-09-11 사용자 확정).**
> 어떤 AI 에이전트로 작업하든(Claude Code·Codex·Cursor 등) **여기를 읽고, 여기에 기록한다.**
> 루트 `CLAUDE.md` 는 이 파일을 가리키는 **포인터 스텁**이다 — 거기에 내용을 쓰지 말 것.
> 예전에는 두 파일이 각각 유지돼 **서로 다른 사실**(운영 DB 리전·AI 스택·마이그레이션 수)을
> 말하고 있었다. 다시 갈라지지 않게, 사실은 한 곳에만 둔다.
>
> **하위 스코프 메모리**: **`apps/web/AGENTS.md`** (웹 파일을 건드리면 함께 읽는다 — 웹 디자인
> SoT·기능 델타·상태 규칙·카피 규약). 루트와 충돌하면 더 구체적인 그 문서를 따른다.
> 같은 자리의 `apps/web/CLAUDE.md` 도 포인터 스텁이다 — 두 계열 모두 규칙에 걸리게 한 구조다.

요양보호사가 어르신 연대기를 입력하면 AI가 1:1 음성 회상 대화를 진행·기록하는
인지활동 보조 플랫폼. 상세 계획은 `PLAN.md`, 스펙은 `docs/`.

## 구조 (pnpm 모노레포)
- `apps/web` (@giokon/web): **요양보호사·보호자 전용** 관리 웹 (React 19 + Vite + Tailwind).
  어르신 음성 대화(TTS/STT)는 웹에 없음 — 앱 담당. (2026-07-11 웹에서 앱 콘텐츠 전부 제거)
- `apps/mobile` (@giokon/mobile): **어르신 대화 앱 (Expo SDK 54 + expo-router 6 + NativeWind 4.2)**.
  Figma 19화면 + 설정·동의 확인 = 전 화면 구현. 요양보호사가 조작하는 세션 실행 도구.
  백엔드는 웹과 공용(core/data 재사용) — 프론트만 신규.
  **현재 구현된 대화 AI = Gemini Live**(음성 입출력+LLM 통합, 2026-08-23) · 미가용 시
  expo-speech+타자 폴백. ⚠️ **출시 목표 구조는 2026-09-11 에 바뀌었다** — `기술 결정` 참조.
- `packages/core`: 도메인 타입·규칙·AIProvider(mock)·SpeechProvider
- `packages/data`: supabase-js + TanStack Query 훅 + Supabase Auth + DB↔도메인 매퍼
- `packages/theme`: 디자인 토큰(단일 소스)
- `supabase/migrations`: DB 스키마·RLS

## 작업 방침 (중요)
- **⚠️ 디자인의 임시값을 코드에 넣지 않는다(실서비스 원칙, 2026-08-12 사용자 확정)**:
  Figma·스크린샷의 **정량 지표(82%·23% 향상·평균 12분 등)·예시 분석문·예시 키워드·
  예시 이름/날짜**는 모두 **자리표시자**다. 향후 **AI 또는 사람이 실제로 입력·산출**할
  값이므로 **하드코딩 금지**. 반드시 실데이터에 바인딩하고, 근거가 없으면 **값을 만들지
  말고** `null`/빈 배열 → 화면은 `—`·"아직 관찰된 기록이 없어요" 같은 **빈 상태**로 표시한다.
  (0 과 null 구분: 0회 관찰 ≠ 측정 불가.) 어르신 개인에 대한 관찰 기록을 임의값으로
  표시하는 것은 비의료·정부심사 기준에서 특히 위험하다. 재추출 시 **레이아웃·치수·색·
  타이포·에셋은 Figma 그대로, 내용(값)은 데이터 바인딩**이 원칙.
  구현 근거: `packages/core/src/observations.ts`(근거 없으면 null),
  `apps/mobile/src/lib/format.ts`(`metric()` → 미측정은 `—`).
- **디자인 — 외부 협력 + Claude Design 비교 트랙(2026-07-03 확정)**: 웹·앱 UI 디자인은 외부
  업체가 진행하되, **Claude Design 트랙에 한해 Claude가 프론트를 최신 트렌드 기반으로 직접
  설계·구현**해 외부 업체본과 비교(→ 서비스 채택). 이 트랙 외 임의 재디자인은 하지 않는다.
- **엔터프라이즈·정부심사 기준(2026-07-03 상향)**: 데이터 국내 보관(서울 리전)·「안전성 확보조치
  기준」·민감정보 별도동의·비의료 포지셔닝 락다운·AI 안전(위기 에스컬레이션·투명성/AI기본법)·KWCAG
  접근성·멀티테넌시(organizations/RBAC)·부하/백업/DR을 상시 준수. 상세는 PLAN §2′·§3 +
  `docs/{compliance,security,infrastructure,ai-safety,accessibility}.md`.
- **커밋은 `main` 브랜치에 직접** (사용자 승인). ※ 원격 세션이 작업 브랜치를 지정해 주면 그쪽을 따른다.
- **Supabase 배포 기본 방식(2026-09-09 사용자 확정)**: 특별한 호환성·운영 문제가 없으면 Supabase
  CLI를 우선 사용한다. 대상 프로젝트와 함수명을 명시하고, 기존 JWT 검증 등 운영 설정을 확인·유지하며,
  배포 후 상태와 소스를 검증한다. SQL Editor로 이미 적용한 DB 변경은 이력·실제 스키마를 대조한 뒤
  처리하고 무조건 재실행하지 않는다. `.env` 등 민감한 파일 접근 금지는 유지한다.
- 비밀키는 **커밋 금지**(`.env`는 gitignore). 원격 세션은 환경 설정 env + 세션 시작 훅이
  `.env` 자동 생성(`.claude/hooks/session-start.sh` · `.codex/hooks/session-start.sh` — 두 벌이
  같은 일을 한다. 한쪽만 고치면 다른 에이전트에서 env 가 안 생긴다). 로컬 dev는 `apps/web/.env`
  수동 작성(`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).
  **앱은 `EXPO_PUBLIC_` 접두사 필수** — Expo(Metro)는 그 접두사가 붙은 변수만 번들에
  인라인한다. 접두사를 빼면 값이 있어도 `process.env` 로 안 보인다(앱이 목업으로
  돌던 원인). **앱에 목업 모드는 없다(2026-09-04 제거)** — 키가 없으면 부팅이 막힌다.
- 검증: `pnpm -r typecheck` · `lint` · `test` · `build` + 전용 게이트
  `check:copy`(비의료 카피) · `check:bom`(BOM·mojibake) · `check:font`(Pretendard) ·
  `check:figma`(앱 실측) · `check:design`(웹 실측) · `check:audit`(SCA).
  ⚠️ **CI(`.github/workflows/ci.yml`)가 도는 것은 `check:copy`·`check:design` 둘뿐이다** —
  나머지(특히 앱 게이트 `check:figma`·`check:font`·`check:bom`, 그리고 `check:a11y`·
  `check:figma-web`)는 **수동**이다. 앱을 만졌으면 손으로 돌린다.

## 기술 결정
- 서버상태 = **TanStack Query**, UI상태 = **Zustand**.
- AI 스택 — **계획과 구현을 구분해서 읽을 것**:
  - **지금 코드에 있는 것(앱 대화)** = **Gemini Live API**(`gemini-3.1-flash-live-preview`,
    음성 입력·출력·LLM 한 세션). 키는 앱에 두지 않고 Edge Function **`live-token`** 이
    Supabase JWT 를 검증해 ephemeral token 을 발급한다(모델 잠금 + 자격·동의·사용량 검사,
    R005/R010). 구현 위치는 `apps/mobile/src/lib/live/`.
  - **출시 목표 구조(2026-09-11 사용자 확정, 아직 미구현)** = `docs/plans/voice-ai-personalization.md`
    가 최신 기준이다. 턴 단위 오디오 → Gemini **일반 오디오 이해 API** → 서버 검증 →
    **검증된 텍스트만 Clova Voice TTS 로 재생**. 일반 오디오 API 와 Live 를 구분하며
    **Live 3.1 은 Structured Outputs 미지원**이다. 장기적으로 Whisper 특화 + 외부에서 학습한
    공개 가중치 LLM 의 Ollama 추론을 평가 후 독립 전환. 인지능력 자동 진단 금지,
    서비스/학습 동의 분리, **Gemini 출력의 재학습은 계약 확인 전 제외**.
    ⚠️ **문서 계획이며 신규 기능 구현 완료가 아니다.** Live 경로는 비교 실험용으로 보존한다.
  - 분석·프롬프트는 계속 core. 서버 키 보호·모델 버전 검증은 어느 구조에서도 유지한다.
  - 웹 요양일지 STT 는 별개 기능이다 — Edge Function `stt-transcribe`(NCP CLOVA), 배포됨.
- 인증 = Supabase Auth, 정체성 = `auth.uid()`, 전 테이블 RLS(`user_id = auth.uid()`).
  **로그인 = 소셜 3종(구글·카카오·네이버) + 이메일(아이디)·비밀번호 병행(2026-07-23 재도입 — 이전 "이메일 제거" 결정 사용자 요청으로 철회), 아이디/비밀번호 찾기·회원가입 포함, 회원가입 = 이메일 또는 OAuth 후 온보딩(기본정보 입력). 소셜은 provider 본인인증(이름·전화) 정보를 온보딩에 프리필**
  (구글·카카오=네이티브, 네이버=커스텀 Edge Function `naver-auth`). 계획: PLAN §2′ M17.4~17.7·Phase W1.
  **앱 소셜 3종 실연동 완료(2026-08-23)** — 구글·카카오는 Supabase PKCE OAuth
  (client `flowType:'pkce'` + `openAuthSessionAsync`, redirect `giokon://auth/callback`),
  네이버는 `naver-auth` 함수(code→프로필→magiclink verify, `--no-verify-jwt` 배포).
- 배포: 웹 = Vercel, 모바일 = EAS.

## Supabase
- **운영 프로젝트 = `MemoryOn`(ref `ufkbzpdjomtmxjipmwub`, 서울 ap-northeast-2)** — 앱·웹이 함께
  쓰는 실 DB다. 데이터 국내 보관 요건 충족. (구 도쿄 `GiokOn`/`xilmtqnotomuyjifenmo` 는 이전 완료로 사용하지 않는다.)
- 마이그레이션 **52종**(`supabase/migrations/*.sql` 파일 수 기준 — 세는 법을 바꾸지 말 것.
  16+ 테이블·RLS·가입 트리거 `handle_new_user`→`public.users`·org RBAC·감사 로그 +
  2026-09 보안 하드닝 R002·R005·R007·R010~R012). 이력은 `supabase_migrations.schema_migrations` 에
  저장소 파일명 기준으로 정리돼 있어 `db push` 가 가능하다.
  ⚠️ 라이브 적용 상태는 마이그레이션마다 다르다 — 개별 반영 근거는
  `docs/runbooks/p1-remediation-progress.md`·`p0-fixes-2026-09-09.md` 의 "운영" 문단에 있다.
  **컨테이너에서는 라이브 DB 를 볼 수 없으니(egress 차단) 적용 여부를 추측해 단정하지 않는다.**
  ⚠️ MCP `apply_migration` 은 **적용 시각**으로 기록하므로, 쓴 뒤 저장소 파일명 버전으로 맞춰 준다.
- MCP 연결이 세션 내 **간헐적**(대략 턴당 1콜 성공 후 끊김) — 실패 시 재시도보다
  대시보드 SQL Editor 등 대안 사용.
- 컨테이너 아웃바운드는 egress 정책상 `*.supabase.co` 차단(브라우저/로컬은 정상).

## 현재 위치 (2026-09-11)

> 📋 배포까지 남은 일 = `docs/plans/app-release-remaining.md`(실행 목록) ·
> 감사 대조 근거 = `docs/plans/app-release-plan.md`(앱)·`docs/plans/web-launch.md`(웹) ·
> **보안 수정 판정 = `docs/runbooks/p1-remediation-progress.md`**(R005~R012 의 현재 상태).

### 이 기간의 성격 — 기능 개발이 아니라 적대적 감사 대응
2026-09-06 이후 작업은 웹 출시 정비(W-1~W-7)와 **순차 보안 수정(R005~R012)** 이다.
각 항목은 *코드 수정 → 격리 검증 → 운영 반영 → 커밋/푸시* 를 하나씩 끝내고 다음으로 넘어갔다.

| ID | 내용 | 커밋 |
|---|---|---|
| R005 | Live 토큰 발급을 세션 단위로 인가·계량(DB RPC `reserve_live_token`, 분/일·기관·프로젝트 4중 한도) | `1c7171a` |
| R006 | 모바일 Google/Kakao PKCE — 콜백 URL 전체를 넘기던 것을 `code` 추출로, 공급자별 직렬화 | `0809f0c` |
| R007 | 네이버 모바일 로그인을 **일회성 서버 핸드오프**로(challenge·nonce 쿠키·원자적 1회 소비) | `d5f9974` |
| R008 | 앱 17개 라우트 보호 + **실행 중 권한 변경 감지**(역할·기관·배정 소실 시 Live 연결까지 취소) | `aa1eede` |
| R009 | 로그아웃·계정 전환 데이터 격리(인증 경계마다 새 QueryClient, 늦은 응답 폐기) | `081a4d4` |
| R010 | **동의 검증을 세션 처리의 서버 조건으로** — 조건 상실 시 같은 트랜잭션에서 진행 중 세션 종료 | `73abd27`·`9957466` |
| R011 | 동의 증빙의 버전·불변성(SECURITY INVOKER 트리거가 증거 수정·철회 취소 거절) + 온보딩 필수 수집 | `da1fee7` |
| R012 | 15개 테이블 **62개 식별/소속 컬럼**의 사후 재배치 차단(작성자·부모 키 고정) | `4d8e373` |

### ⚠️ R010 은 "부분 해결"이다 — 종결로 표시하지 말 것
앱이 발급받은 ephemeral token 으로 **Gemini 에 직접 연결**하므로, 변조된 앱이 동의 재검사를
무시하면 **이미 열린 공급자 연결을 DB 변경만으로는 끊을 수 없다.** 서버가 매 전송과 연결 수명을
통제하는 **음성 중계 구조**가 필요하고, Supabase Edge Functions 의 실행 제한(Free 150s / Paid 400s,
WebSocket 동일)이 그 자리를 막고 있다. **기존 토큰을 취소했다고 주장하지 않는다.**

### AI 방향 전환 (2026-09-11) — 문서만 바뀌었다
`docs/plans/voice-ai-personalization.md` 신설(커밋 `cdd23fd`, 문서 전용). 7월 MVP 문서의
"키만 넣으면 무변경 전환"과 9월 감사 문서의 "Live 전용 출시" 가정을 **이 계획이 대체**한다.
자세한 내용은 `기술 결정` §AI 스택. **코드는 아직 Live 경로 그대로다.**

### 검증 (2026-09-11 이 세션에서 실제 실행)
`typecheck` 5패키지 통과 · `test` **390**(core 207 + data 99 + mobile 84) ·
`check:copy` · `check:bom` 389파일 · `check:font` 38파일 · `check:figma` **177** ·
`check:design` **186**(이관 70파일) — 전부 통과. 마이그레이션 파일 **52종**.
※ `apps/web` 에는 단위 테스트가 없다(브라우저 기반 `test:auth`·`smoke`·`a11y`·`figma:audit` 만).

### 남은 것 (요약 — 상세는 `app-release-remaining.md`)
- **P0(코드 밖)**: Gemini Paid tier + DPA · 도메인/DNS · 법률 문구(법인·보호책임자·국외이전) ·
  Apple 로그인 · 앱 내 계정 삭제 · 스토어 콘솔 · 실기기 QA
- **P0(코드)**: 새 음성 AI A0(기준선·계약 확인) → A1(턴 API + 검증 TTS)
- **P1**: ① **오류가 빈 상태로 보인다** — `apps/mobile/src/data/reads.ts` 에 `error` 참조 **0건**
  (RLS 거부가 "기록이 없어요"로 보인다. 어르신 기록 시스템에서 이건 사실 왜곡) ·
  ② `cancelSession`(`appStore.ts`)이 로컬 상태만 지워 **DB 에 `active` 좀비 세션이 남는다** ·
  ③ Storage 크기/MIME/EXIF · ④ Realtime 나머지 6종 · ⑤ **앱에 대비 검사 게이트 없음** ·
  ⑥ 크래시 수집
- **배포 직전 재확인 2건(사용자 요청 — 잊지 말 것)**: 주황 `#e9822b` 대비 **2.73:1**(AA·큰 글씨
  둘 다 미달) · `supportsTablet: false` 유지 여부

### 문서 정합성 정리 (2026-09-11)
- **이 파일을 SoT 로 승격**했다(사용자 확정). `CLAUDE.md` 는 포인터 스텁이 됐다.
  그 전까지 `CLAUDE.md` 와 `AGENTS.md` 가 따로 유지돼 **운영 DB 리전(서울↔도쿄)·AI 스택·
  마이그레이션 수**를 서로 다르게 말하고 있었다. 도쿄 프로젝트는 **폐기된 것이 맞다.**
- 구 `AGENTS.md` 는 `CLAUDE.md` 의 기계적 "Claude→Codex" 치환본이라 **역사적 사실이 틀려
  있었다**: 존재하지 않는 `Codex/…` 브랜치(실제는 `claude/web-development-session-6mb8mk`,
  머지 커밋 `f6fd282` 로 확인) · 실제로는 Claude 가 한 작업의 행위자 표기 등. 이 파일은 원본
  기준으로 되돌렸다. 참고로 **최근 72커밋 범위**의 작성자는 Claude 46 · SH-L1 23 · Seonghun 3
  이다(얕은 클론이라 그 이전은 확인하지 못했다).
- `INSTRUCTIONS.md` 는 타 프로젝트(FLOW) 기준 문서였다 → 기억온 기준으로 재작성했다.
  원문 출처인 `skills/`(MIT, forrestchang)는 외부 자료라 **그대로 둔다**.
- 하위 스코프 메모리도 같은 방식으로 통일했다(사용자 확정): 내용은 `apps/web/AGENTS.md`,
  `apps/web/CLAUDE.md` 는 포인터 스텁. 그 전까지는 웹 지침이 `CLAUDE.md` 한 벌뿐이라
  **다른 에이전트가 "임의 재디자인 금지"·"자리표시자 금지" 를 모른 채 웹을 고칠 수 있었다.**
- 📐 **앞으로 스코프 메모리를 추가할 때의 규약**: 내용은 `<경로>/AGENTS.md` 에 쓰고,
  `<경로>/CLAUDE.md` 는 그것을 가리키는 포인터 스텁으로 함께 만든다. 내용을 두 벌 두지 않는다.

## 이전 위치 (2026-09-04)

> 이 세션은 **앱(apps/mobile) 개발용**이다. 웹 작업은 **앱과의 연동 지점만** 기록한다.
> 📋 **배포까지 남은 일 = `docs/plans/app-release-remaining.md`**(실행 목록) ·
> 감사 대조 근거 = `docs/plans/app-release-plan.md`.

### 사용자 결정 반영 (2026-09-04)
- **번들 ID = `kr.giokon.app`** (구 `kr.gieokon.app` → 브랜드 통일). **출시 후 변경 불가**.
  ⚠️ EAS 프로젝트·구글/카카오/네이버 OAuth 콘솔에 등록된 패키지명·키해시·URL 스킴을
  **새 ID 로 갱신해야 한다**(사용자 작업).
- **Expo SDK 53 → 54** (RN 0.81.5 · React 19.1.0 · Reanimated **4** · NativeWind 4.2.6).
  `expo@54.0.37` 의 `bundledNativeModules.json` 을 그대로 따랐다(추정 금지).
  · `react-native-worklets` 는 pnpm 이 0.12.1(RN 0.83~0.87 전용)을 골라 **0.5.1 로 고정**했다.
  · **Android API 36 을 `expo-build-properties` 로 명시 고정**한다 — SDK 기본값은 판올림마다
    달라지는데 Play 요건(2026-08-31~ API 36)은 못 어긴다. 기본값에 기대지 않는다.
  · `expo-file-system` 새 API 전환 때문에 `live/player.ts` 는 **`expo-file-system/legacy`** 를 쓴다.
  · **검증 = Metro 번들 Android·iOS 양쪽 성공**(각 5.8MB hbc). RN 상향은 typecheck 로는
    증명되지 않는다 — 번들이 되는지가 실질 시험이다.
- **`supportsTablet: false`** (태블릿 UI 검증 근거 없음).
- **주황 `#e9822b` 대비 2.73:1 = 현행 유지** — ⚠️ **배포 직전에 사용자에게 다시 언급할 것**.
- **녹음 저장(`session_logs.audio_url` 3컬럼) = v2 유지**, 사업 확장 후 추가.

### ⏳ 배포 직전 재확인 (사용자 요청 — 잊지 말 것)
1. 주황 `#e9822b` 대비(AA·큰 글씨 기준 둘 다 미달) 최종 판단
2. `supportsTablet: false` 유지 여부

### 남은 코드 후속(P1)
- `expo-av` → `expo-audio`(SDK 55에서 제거) · `expo-file-system` 새 API(WAV base64 왕복 제거)
- ⚠️ **`react-native-live-audio-stream@1.1.1` New Architecture 호환 미검증** — config plugin 없는
  bare 모듈이라 **네이티브 빌드(EAS)로만 확인된다**. JS 번들 성공이 이를 보증하지 않는다.

### 그 이전(같은 날) 작업

> 이 세션은 **앱(apps/mobile) 개발용**이다. 웹 작업은 **앱과의 연동 지점만** 기록한다.

- 📋 **배포 전 감사 → 계획 문서 신설: `docs/plans/app-release-plan.md`**. 사용자 제출 감사
  보고서(2026-09-03)의 **모든 주장을 코드로 재검증**했다. 확인 12건 · **반증/과장 3건** ·
  **신규 발견 7건**. 반증된 것을 그대로 따르면 안 된다:
  ① Live 요청의 `snake_case` 는 **규격 위반이 아니다**(protobuf JSON 은 양쪽 다 받는다.
  응답은 camelCase 이고 코드도 그렇게 읽는다) — 진짜 위험은 **엔드포인트 경로**뿐이다.
  ② Realtime 에 `journal_photos` 는 **이미 있다**(실제 누락은 `care_journals`·
  `profile_guardians`·`profile_caregivers`·`consents`·`elder_codes`·`inquiries`).
  ③ `check:a11y` 는 **웹 전용** 스크립트라 앱과 무관 — 문제는 앱에 대비 검사가 **없다**는 것.
- 🔴 **P0 안전 — 검열 안 된 AI 원본 음성이 재생됐다(`829a242`)**: 출력 가드
  (`screenAiUtterance`)가 모델 원문을 막으면 스토어는 화면 질문을 안전 대체문으로 바꾸는데,
  오디오는 **원문 키**로 캐시돼 있어 그대로 재생됐다 → **화면과 스피커가 다른 말을 했다**.
  오프너(`overrideQuestion`)는 검열을 아예 건너뛰었다.
  → `src/lib/live/playback.ts`(채택≠원문이면 빈 배열 + 캐시 파기 → 자동 재생 이펙트가 안전
  대체문을 기기 TTS 로 읽는다) · `overrideQuestion` 에 가드 적용 · 회귀 테스트 4건.
  ("다시 듣기"는 원래 화면 텍스트 키로 조회해 우연히 안전했다.)
- 🔴 **P0 — 어르신이 하지 않은 말이 실제 기록으로 저장됐다(`72ce705`)**: Live 미가용 시
  마이크를 누르면 `pickElderUtterance()`(`src/lib/mockStt.ts`)가 미리 써 둔 발화
  ("전주 남부시장 근처에서 오래 살았지" 등)를 입력칸에 채웠고, 요양보호사가 그대로 저장하면
  `session_logs` 에 남았다. **목업 모드보다 위험했다.** → mockStt 삭제, 폴백 입력은 **빈 칸**,
  빈 발화는 저장 차단.
- ✅ **목업 모드 제거 완료(`72ce705`, 사용자 지시)** — `CFG` 분기 35곳(reads 29 · writes 6)·
  `MOCK_*`·`mockData.ts`·`DemoModeNotice`·AuthProvider 목업 브리지·`SessionSaveResult.'mock'`
  전부 삭제. `appStore` 는 **진행 중 대화 한 건만 들고 있는 런타임**으로 축소(539→393줄).
  **키가 없을 때 = 부팅 차단**(`ConfigError` 화면 + `supabaseConfigProblem` 사유 진단).
  예시 데이터로 조용히 도는 것보다 멈추는 편이 안전하다 — 요양보호사가 "저장됐다"고 믿는
  오해는 감당할 수 없다.
- ✅ **앱 진입 자격 가드(`72ce705`)** — 그전엔 로그인만 되면 메인으로 갔다(보호자 계정도
  들어왔고, 기관 없는 계정은 어르신 등록 때 `org_id` not-null 위반을 날것으로 봤다).
  `src/auth/appAccess.ts` 순수 판정 + 테스트 8건 → 스플래쉬·로그인(이메일·소셜) 양쪽 집행.
  미달이면 사유 안내 후 **로그아웃**(세션이 남으면 곧바로 다시 들어온다).
  ⚠️ **로그인됐는데 users 행을 못 읽으면 통과시키지 않는다** — 빈 화면을 "기록 없음"으로
  오해하게 두지 않기 위해서다.
- ✅ **빌드 차단 3건(`829a242`)**: `expo-linear-gradient` `^57.0.1`→`~14.1.5`(SDK 53 과
  버전 체계가 달라 **prebuild 실패 확정**, 스플래쉬가 실제로 쓴다) · `NSPhotoLibraryUsageDescription`
  추가(`ProfileForm` 이 사진 권한을 부르는데 키가 없어 **iOS 크래시 + 심사 거부**) ·
  `package.json` `description` **한글 깨짐** 복구(CP949 왕복 — BOM 이 없어 `check:bom` 통과).
- ✅ **비밀번호 재설정 링크 404 수정(`829a242`)** — `https://giokon.app/reset` 하드코딩 ↔
  실제 웹 라우트 `/reset-password`. `src/lib/webUrl.ts` 로 경로를 모으고 도메인은
  `EXPO_PUBLIC_WEB_URL` 에서만 받는다.
- 🛡 **게이트 강화**: `check-figma-spec` 러너에 **`{ absent: /…/ }` 패턴** 지원 추가
  (제거한 것이 되살아나지 않는지 검사) → 스펙 **177**. `check-bom` 에 **mojibake 검사**
  추가(한 줄 2개 이상 — 정규식 문자클래스 오탐 방지). 둘 다 일부러 되살려 실패를 확인했다.
- ⏳ **남은 P0 는 코드가 아니라 결정·외부 계약이다**(상세: `docs/plans/app-release-plan.md`):
  ① **Expo SDK 상향**(Play API 36 / Apple iOS 26 SDK — SDK 53 으로는 신규 등록 불가.
  `expo-av`→`expo-audio`, `react-native-live-audio-stream` New Arch 호환 확인이 뒤따름)
  ② **번들 ID 확정**(`kr.gieokon.app` ↔ 브랜드 `giokon` — 출시 후 변경 불가)
  ③ **도메인·법률 문서·앱 내 계정 삭제·Apple 로그인**(전부 심사 차단 사유)
  ④ **Gemini Paid tier + DPA**(무료 tier 는 약관상 어르신 음성에 쓸 수 없다).
  P1 코드 작업: 오류 상태 노출(`reads.ts` 에 error 참조 **0건** — RLS 거부가 "기록 없음"으로
  보인다) · 세션 소유권/복구(`cancelSession` 이 원격 세션을 안 닫아 좀비가 남고,
  `adoptPlannedSession` 이 갱신 행 수를 안 봐 두 기기가 같은 세션을 잡을 수 있다) ·
  Storage 크기/MIME 제한 · 주황 `#e9822b` 대비 **2.73:1**(AA 미달, 브랜드 색이라 사용자 결정 필요).
- ✅ 검증(2026-09-04): typecheck 5패키지 · lint 0 · test **249**(core 196 + data 37 +
  mobile 16) · `check:figma` 177 · `check:font` 37 · `check:copy` · `check:bom` 337 ·
  웹 빌드 통과. 마이그레이션 36종.

## 이전 위치 (2026-09-03)

> 이 세션은 **앱(apps/mobile) 개발용**이다. 웹 작업은 **앱과의 연동 지점만** 기록한다
> (신규 웹 디자인 이관·보호자 화면 등은 웹 세션 메모리 `apps/web/AGENTS.md` 참조).

- 🎙 **Gemini Live 음성 대화 연동(2026-08-23, `30d7f58`·`68f5ff3`)** — 앱의 대화가
  드디어 실제 음성이다. `src/lib/live/`(client·engine·mic·player·pcm).
  ⚠️ **모델 제약을 코드가 전제한다**(`gemini-3.1-flash-live-preview`):
  `proactivity`/`affective` 필드는 **보내면 연결이 깨진다**(아예 미포함) · 자동 VAD 를 끄고
  `NO_INTERRUPTION`(barge-in 차단, 턴 경계는 앱이 소유 — 요양보호사 확인·교정 흐름과 정합) ·
  초기 맥락은 `system_instruction` 주입(캐싱 미지원 대비).
  **모델에 넘기는 것은 확정·교정된 텍스트뿐**이다(마이크 오디오는 전사 용도로만 스트리밍) →
  DB 에 남은 텍스트와 모델이 본 텍스트가 항상 같다(감사 정합). **위기 발화는 모델을 우회**해
  로컬 안전 응답을 유지한다. 키는 앱에 없다 — Edge Function `live-token` 이 JWT 검증 후
  ephemeral token 발급(90s/30min). 미가용·실패 시 **기존 파이프라인(expo-speech+타자 입력)으로
  무중단 폴백**한다. 견고성 4건 보강: sessionResumption 핸들로 1회 자동 재접속 ·
  타임아웃 `'timeout'` 명시 반환 + 세션당 1회 안내(조용한 폴백 제거) · "다시 듣기"는 엔진 생존과
  무관하게 플레이어 직접 호출 · loading 인터스티셜은 고정 1.2s 대신 **다음 질문 교체 감지**로
  복귀(0.5~8s, 모델 대기를 화면이 덮는다) · 세션 종료 시 오디오 캐시 clear.
  주제 태깅은 core `detectTurnTopic`(Live 질문 텍스트에서 표준 주제를 결정론 판별, 근거 없으면
  직전 주제 유지) — Live 모드에서도 `switch_topic`·주제 반응 지표가 근거를 갖는다.
- 🔗 **웹↔앱 세션 설계(planned) 파이프라인(`fd4896b`·`30d7f58`)** — 이 세션의 핵심 동기화 지점.
  웹이 "회상 세션 설계"를 `sessions(status='planned')` + 설계 7컬럼
  (`title·goal·content·avoid_topics·keywords·duration_minutes·planned_date`, 마이그레이션
  #26~27)으로 저장하면, 앱이 **그 행을 받아 진행**한다.
  앱: `useDuePlannedRow`(기록일 도래분) → 대화 시작 화면이 그 설계로 열고 →
  `adoptPlannedSession` 이 **같은 행을 active 로 전환**한다(새로 만들면 설계가 유령으로 남고
  웹 목록에 행이 하나 더 생긴다. 다른 기기가 먼저 가져갔으면 새로 만든다).
  `useElderSessions`·`useElderLogs` 는 **planned 를 제외**한다(아직 일어나지 않은 일이라
  턴 0짜리 빈 기록으로 보였다). core: `SessionPlan`/`SessionDesign` ·
  `buildSystemPrompt` v1.1(설계 주입) · `generateOpener` 가 **설계 키워드로 첫 주제를 정한다** ·
  `filterAvoidedBanks`.
  ⚠️ **"피해갈 내용" 의 의미**: AI 가 그 주제로 **열지 않을 뿐**, 어르신이 그 이야기를 꺼내는
  것은 막지 않는다(회피는 애도 원칙에 반한다). 후보가 전부 빠지면 설계를 무시하고 원래
  후보로 되돌린다(대화가 멈추는 게 더 나쁘다). 설계가 없으면 예전과 완전히 동일하게 동작한다.
- 🔑 **소셜 로그인 3종 실연동 + 게시 준비(`68f5ff3`)** — "준비 중" Alert 제거.
  마이크 권한(app.json `NSMicrophoneUsageDescription`·`RECORD_AUDIO` + 청취 전
  `ensureMicPermission()`), 앱 아이콘·adaptive-icon·스플래시 연결, `version 1.0.0`,
  EAS env 4종 등록(사용자), 법적 페이지 배포(https://giokon-legal.vercel.app → `EXPO_PUBLIC_WEB_URL`).
  ⚠️ `package.json` 의 **BOM** 이 `eas init` JSON 파싱을 깨뜨렸다 → 제거 + `scripts/check-bom.mjs` 게이트.
- 🧪 **모바일 테스트 도입** — mobile vitest(pcm base64↔bytes·WAV 헤더 4건). 그전까지 core/data 만 있었다.
- 📄 상태 문서는 `docs/app-readiness-report.md`(화면별 완성도·Live 결함·게시 체크리스트 4차 갱신까지).
- ⚠️ **앱이 아직 쓰지 않는 신규 DB 기능(전부 웹 전용, 마이그레이션 #28~36)**:
  `notifications`·`messages`·`inquiries`·`journal_photos`·`share_view_receipt`·
  `profiles.note`(어르신 특이사항)·`chronicle_entries.title`. Realtime publication 에
  `journal_photos`·`messages`·`notifications` 가 추가됐지만 **앱은 구독하지 않는다**.
  앱에서 필요해지면(예: 보호자 메시지 알림) 여기부터 본다.
- ⏳ **남은 것**: ① **목업 모드 제거**(사용자 지시 — 아직 미착수. `reads.ts` 29곳·`writes.ts` 6곳의
  `CFG` 분기와 `MOCK_*`·데모 알림이 남아 있다. 키가 없을 때 앱이 어떻게 동작할지 결정 필요:
  부팅 차단 vs 로그인 화면까지 진입) ② 녹음 저장(`session_logs.audio_url` 3컬럼, v2 합의)
  ③ `consents_guardian_check` 완화 결정(완화하면 보호자 화면의 성함 필드 제거)
  ④ 1x 아이콘 @3x/@4x 재추출 ⑤ 스토어 제출(`eas build --profile production` + 리스팅).
- ✅ 검증(2026-09-03 실행): typecheck 5패키지 · test **237**(core 196 + data 37 + mobile 4) ·
  `check:figma` 172 · `check:font` 36파일 · `check:copy` 전부 통과. 마이그레이션 **36종**.

## 이전 위치 (2026-08-18)
- 🔍 **앱 ↔ Supabase 동기화 전수 감사(2026-08-18, `main` `195bb59`)**: 라이브 서울
  `MemoryOn`(`ufkbzpdjomtmxjipmwub`) 스키마를 MCP 로 덤프해 저장소 마이그레이션 24종 +
  앱/웹 코드와 3자 대조했다.
  - ✅ **스키마는 완전 일치**: 16테이블·컬럼 전량(`database.types.ts` 와 1:1)·enum 14종
    (라벨까지)·public 함수 8종·트리거 41종·RLS 정책 52종·Storage 2버킷(elder-photos·
    journal-photos, 둘 다 private)+정책 6종·Realtime publication 4테이블
    (sessions·session_analyses·guardian_shares·safety_events). 라이브에만 있거나
    마이그레이션에만 있는 객체는 **0건**. (⚠️ `list_migrations` 는 3건만 보인다 — 초기
    21종을 SQL Editor 로 적용해 `supabase_migrations.schema_migrations` 에 기록이 없다.
    스키마는 일치하므로 무해하지만, 앞으로 `db push` 를 쓰려면 baseline 기록이 필요하다.)
  - 🐞 **어긋난 곳은 전부 "앱이 DB 를 쓰는 방식"** → 6종 수정:
    ① **화면 간 값 소실** — 앱 폼엔 성별이 있고 보호자가 없다(웹은 반대)인데
    `toProfileUpdate` 가 두 컬럼을 항상 덮어써서 서로의 입력을 null 로 지웠다 →
    **부분 갱신 규약**(undefined=미변경 · null=지움), 웹은 빈 보호자를 명시적 null 로 전송.
    ② **라이브 종료 분석이 목업 연대기로 계산** — `finishSession` 이 `chroniclesByElder()`
    (목업)를 다시 읽어 라이브 uuid 로는 항상 `[]` → 저장되는 `recommendedTopics` 가 근거
    없이 산출. 시작 시 받은 연대기를 `ActiveSession.chronicles` 에 보관해 사용.
    ③ **STT 보정 원문 유실** — `session_logs.original_content` 가 항상 null 이었다 →
    고친 경우만 보정 전 원문 기록(코어 `ConversationTurn.originalText`, DB 제약상 어르신 턴 한정).
    ④ **안전 이벤트 '확인' 미기록** — `acknowledged_at/by` 가 항상 null 이라 앱에서 확인한
    알림이 웹 대시보드에 미확인으로 보였다 → 확인 시각을 이벤트에 붙여 종료 저장 시 기록.
    ⑤ **웹→앱 반영 경로 없음** — publication 에 `profiles`·`chronicle_entries` 가 없고
    RN 에서는 `refetchOnWindowFocus` 가 무동작 → `AppState`→`focusManager` 연결
    (`src/lib/queryFocus.ts`, 앱 복귀 시 stale 재조회).
    ⑥ **온보딩 미완료 계정이 날 DB 오류** — 기관 없는 계정의 등록은 org_id 스탬프가 채울 값이
    없어 not-null 위반이 그대로 Alert 에 떴다 → `requireWriteIdentity` 로 안내 후 차단.
  - ✅ **후속 처리 완료(2026-08-18, 마이그레이션 25번째 `20260818000000_app_db_sync`)**:
    **진행 중 세션 DB 저장**(시작 시 `sessions` insert(active) → 턴마다 `session_logs`
    upsert((session_id,turn_index) 유니크 신설로 멱등) + `turn_count`/`current_topic`
    갱신 → 위기 발생 시 `safety_events` 즉시 insert·확인 시 `acknowledged_at` update →
    종료 시 ended 갱신 + 분석 upsert. 시작 시 생성 실패하면 remoteId=null 로 두고 예전
    일괄 저장으로 폴백하며, 재시도를 포기하면 세션을 'active' 로 방치하지 않고 ended 로
    닫는다) · **사진 파기**(교체 시 이전 파일 삭제, 어르신 삭제 시 `purgeElderFiles` 로
    두 버킷 전량 파기 — ⚠️ Storage 정책이 경로의 profile_id 로 `profiles` 를 조회하므로
    **행보다 파일을 먼저** 지워야 한다. `journal-photos` 에 update/delete 정책 신설) ·
    **Realtime 확장**(publication 에 `profiles`·`chronicle_entries`·`session_logs` 추가 →
    웹 수정이 앱에 즉시 반영, 진행 중 대화를 웹에서 관전 가능) · **`profiles.memories`
    제거**(값 있는 행 0건 확인 후 드롭) · **동의 중복 방지**(이미 유효한 동의는 재기록
    안 함) · **어르신 턴 `topic` 기록**·**`switch_topic` 산출**(`toSessionLogInsert` 매퍼로
    이관·테스트) · **목업 모드 1회 안내**(미설정이면 예시 데이터임을 Alert 로 고지) ·
    **마이그레이션 이력 baseline**(`schema_migrations` 를 저장소 파일명 기준 25건으로
    정리 → `db push` 사용 가능. 앞으로 MCP `apply_migration` 을 쓰면 적용 시각으로
    기록되므로 파일명 버전으로 맞춰 준다).
  - ✅ **설정(환경설정) 화면 신설(2026-08-18, Figma `584:470`·`584:559`)**: 메인 톱니바퀴가
    곧바로 로그아웃이었는데 **설정 화면으로 이동**하도록 바꾸고 두 화면을 실측 구현했다.
    `app/settings/index.tsx`(393×1072 스크롤 — 프로필 카드 336×260 r10 border `#e3e3e3` ·
    담당 어르신 미리보기 2장 + 전체보기 · 정보 카드 336×204) · `app/settings/elders.tsx`
    (담당 어르신 관리, 카드 336×113 pitch 134) · 프리미티브 `src/components/settings.tsx`
    (어르신 카드 배경 `#fdf6f0` · 휴지통 21 · 로그아웃 13 · chevron 8.75×13.25 / 6×7 —
    ⚠️ egress 가 figma.com 을 막아 글리프는 @4x 픽셀맵 실측대로 react-native-svg 구현).
    **어르신 삭제**를 여기서 한다(확인 후 `useDeleteElder` → Storage 파기 + 행 삭제 → cascade).
    자리표시자 금지 원칙대로 **아이디=로그인 이메일 · 기관=organizations.name ·
    버전=app.json · 간편 로그인=실제 연결된 provider 만 진하게**(미연결은 흐리게) 바인딩했다.
    검증: 폰트 메트릭으로 잉크 위치를 예측해 @4x 내보내기와 대조 — 21항목 최대 편차
    **≤1.13px**(로그아웃 라벨만 Figma 박스와 잉크가 4px 어긋나 있어 박스를 4 내려 Δ0).
    `check:figma` 에 21항목 추가(총 161). 어르신 코드 인계·기관 합류 승인·동의 철회는
    **웹 전용**(사용자 확정) — 앱에는 만들지 않는다.
  - ✅ **사용자 내보내기 에셋으로 코드 드로잉 교체(2026-08-18)**: 그간 egress 차단으로
    react-native-svg 로 그렸던 글리프를 실제 에셋으로 바꿨다 — **휴지통**(`Group2` → 21) ·
    **로그아웃**(`Group 160` 좌측 13열 → 13) · **동의 체크박스**(`Vector2` → 17 2상태).
    ⚠️ 체크박스 **선택 상태가 실제 디자인과 달랐다**(임시 구현은 검정 채움+흰 체크,
    실제는 **흰 바탕+검정 테두리+검정 체크**) — 에셋 교체로 함께 바로잡았다.
    **마이크**는 `Frame 5` 의 2상태(123×123)로 교체하고 의미를 사용자 확정대로 붙였다:
    **회색=TTS 재생 중**("듣고 있어요…" — 어르신이 안내 음성을 듣는 중)·인식 정리 중,
    **주황=말할 차례**("말씀해 주세요."). 마이크를 누르면 예전처럼 타자 입력이다.
    **"다시 듣기"** 는 `Frame 3` 실측 3상태(기본 `#cccdce` / 누르는 중
    `rgba(233,130,43,0.10)`+주황 테두리 / 재생 중 `#e9822b` 채움, 라벨 흰색)로 구현했다 —
    라벨은 이미지로 굽지 않고 텍스트로 뒀다(글자 확대·스크린리더 유지).
    `Vector`(연필)·`Group 67`(원형 chevron)은 같은 아이콘이 이미 @4x 로 있어 교체하지 않았다.
    ⚠️ 사용자 내보내기가 **1x** 이고 `Vector`·`Group 67`·`Frame *` 에는 Figma 선택
    테두리(보라 점선)가 찍혀 있어 제거 후 잘라 썼다 — **@3x/@4x 재추출 예정**(같은 파일명
    `assets/brand/{icon-trash,icon-logout,checkbox-off,checkbox-on,btn-mic-wait,btn-mic-ready}.png`
    를 덮어쓰면 된다).
  - ✅ **대리동의(동의 주체) 화면 신설(2026-08-21, Figma `동의 확인1`·`동의 확인2`)**:
    앱 동의 기록이 `subject_type`/`capacity` 를 항상 DB 기본값(`self`/`unknown`)으로 남기던
    문제를 해결했다. 동의 흐름이 **2단계**가 된다 — `app/consent/[id]/index.tsx`(동의 주체:
    어르신 본인 / 법정 대리인 / 보호자, 카드 335×181 r10 3행 pitch 60, 체크박스는 **주황**
    `Vector3`) → `app/consent/[id]/terms.tsx`(필수 동의 3종, 체크박스는 **검정** `Vector2`).
    **의사능력은 주체에서 파생**(사용자 확정): 본인=capable · 법정대리인=incapable ·
    보호자=unknown(후견 미개시라 판정 근거 없음 — `limited` 로 낮춰 잡지 않는다).
    보호자 선택 시 `Frame 12` 법적 한계 안내 카드(335×97 bg `#fef8f4` border `#e9822b`)가
    붙고 같은 문구가 `consents.basis` 로도 기록된다. 규칙·문구는 core `consent.ts` 가 SoT
    (`CONSENT_SUBJECT_OPTIONS`·`capacityForSubject`·`GUARDIAN_RELATION_OPTIONS`·
    `GUARDIAN_RISK_NOTICE`·`consentBasis`, 테스트 3건).
    ⚠️ **디자인과 다른 점 1가지**: 사용자는 `Frame 13`(대리 동의자 성함·관계)을 **법정
    대리인**에만 붙이라고 했지만, DB 제약 `consents_guardian_check` 가 본인이 아닌 모든
    동의에 `guardian_name` 을 요구해 **보호자에도 같은 필드를 띄운다**(없으면 저장이 실패).
    제약을 완화할지 결정 필요.
    검증: 폰트 메트릭 잉크 예측 ↔ @4x 대조 11항목 **최대 편차 ≤1.38px**, `check:figma` 172.
  - 당시 남겨 둔 결정 사항의 **현재 상태**(2026-09-03 기준):
    (a) `profiles.memories` → **제거됨**(#25). (c) `switch_topic` → **기록됨**(#25 매퍼),
    `audio_url`·`audio_expires_at`·`duration_ms` → 여전히 미사용(녹음 저장 v2).
    (d) 진행 중 세션 DB 저장 → **구현됨**(#25). (e) 앱에 UI 가 없는 DB 기능:
    `care_journals`·`guardian_shares`·`guardian_invites`·`profile_guardians`·`elder_codes`·
    `profile_caregivers`(합류 승인)·`organizations`·`audit_log` — **여전히 웹 담당**(설계대로).
    ※ 어르신 삭제는 이후 설정 화면으로 앱에 들어왔다.

## 이전 위치 (2026-08-16)
- 🖥️ **웹 개발 세션 정비 + 완성 디자인 고정(2026-08-16, 브랜치 `claude/web-development-session-6mb8mk`)**:
  이 저장소의 **웹 디자인은 이미 완성**(외주 핸드오프 스펙 `docs/require/기억온_웹_디자인.md`,
  20화면·1,150줄)이라 앞으로의 웹 작업이 그 디자인에서 **드리프트하지 않게** 만드는 것이 핵심.
  ⚠️ **그 스펙 문서는 이후 폐기됐다**(`c720ad6` "구 웹 디자인 폐기, 신규 Figma 기준으로 이동").
  현재 웹 디자인 SoT 는 `docs/design.md` + `apps/web/AGENTS.md` 다 — 위 경로를 찾지 말 것
  (필요하면 main 히스토리에서 꺼낼 수 있다).
  - **웹 디렉터리 스코프 메모리 신설**(당시 파일명 `apps/web/CLAUDE.md` → 2026-09-11
    `apps/web/AGENTS.md` 로 이동): 웹 파일을 건드리면 자동 로드된다.
    앱 경계(어르신 대화 없음)·**디자인 SoT 와 재디자인 금지 + 변경 절차**·토큰표·프리미티브
    계약·화면맵/가드·상태 규칙(Query=서버, Zustand=UI, `isConfigured` 목업 폴백)·컴플라이언스
    카피·KWCAG·검증 명령·환경 주의점·미배선 지점을 한 장에 고정.
  - **`pnpm check:design`(scripts/check-web-design.mjs) 신설 — 71항목**: 모바일의 `check:figma`
    대응물. ① `@giokon/theme` ↔ 웹 `tailwind.config` 토큰 **동일성**(미러 드리프트 차단) +
    스펙 HEX 사다리 일치 ② **팔레트에 없는 shade 사용 차단** ③ Button(5×4)·Badge(6)·Avatar·
    Card·Dialog·Input/Field·Toast(3.2s) 치수·색 ④ 라우트·가드·사이드바 8항목·페이지 헤더 카피
    ⑤ 비의료/AI 생성물/안전장치 고지 상시 노출. 회귀 검증도 확인(토큰 1줄 제거 → 즉시 실패).
  - **디자인 문서가 스스로 표시했던 불일치 2건 해소**: (1) `text-warm-800` 이 **팔레트에 없어
    색이 적용되지 않던 버그**(랜딩 히어로 배지·동의 다이얼로그 의사능력 pill) → 스펙이 지정한
    "warm-700 보다 한 단계 진한 톤"을 `#854621`로 확정해 theme·tailwind 에 정의(빌드 CSS 에
    `rgb(133 70 33)` 실제 출력 확인, 대비 6.6:1 AA). (2) 설정 화면의 "로그인은 소셜 계정으로만"
    안내가 **이메일 로그인 병행 재도입(2026-07-23) 이후 사실과 달랐다**(문서가 '갱신 대상'으로
    표기) → 이메일+소셜 병행·재설정 메일 경로 안내로 교체. 탭 제목 로마자도 스펙의 `GiokOn`
    으로 통일(`GiEok-On` → `GiokOn`). 문서·코드 양쪽 동기화.
  - **검증 루프**: `pnpm -F @giokon/web smoke` 가 **preview 를 스스로 띄우고 끄도록** 개선(별도
    셸 불필요, 21/21 통과) · `apps/web` 에 `typecheck` 스크립트 추가(**그전까지 `pnpm -r
    typecheck` 가 웹을 건너뛰고 있었다**) · 단일 게이트 `pnpm check:web`(typecheck→lint→copy→
    design→build→smoke) 신설.
  - ⚠️ 컨테이너 egress 가 Pretendard CDN(jsdelivr)을 막아 스모크 콘솔에 `ERR_TUNNEL_CONNECTION_FAILED`
    가 21건 뜬다 — 폰트 CDN 차단이며 앱 결함이 아니다(여기 렌더는 폰트 폴백이라 타이포 눈대중 금지).

## 이전 위치 (2026-08-13)
- 🗓 **생년월일 입력 = 캘린더로 교체(Figma `568:286`, 2026-08-17 사용자 변경)**: 스크롤
  3열 시트 → **달력 아이콘 + 캘린더 카드**. 필드는 Figma 그대로(박스 336×46, 값
  `1945 / 5 / 13` = core `birthSlashLabel`, 달력 아이콘 19×19 @ 박스 우측 20).
  캘린더는 shadcn Simple Design System 기반 사용자 배치 컴포넌트를 실측 이식
  (`src/components/Calendar.tsx`): 카드 318 pad16 r16 border `#d9d9d9` · 헤더 36 gap16
  (‹ · 연도∨ 182/2 · 월∨ · ›) · 테이블 pt16 · Thead 20(요일 12/20 `#757575`) ·
  칸 40×40 r8 gap1 · 상태 기본 `#1e1e1e` / 선택 `#e9822b`+`#f5f5f5` /
  다음달 `#b3b3b3`(선택 불가) / 1일 이전 빈 칸.
  높이·폭 검산 일치(5행 308 · 318 · 헤더 내부 286 · 행 286).
  ⚠️ **Figma 컴포넌트는 5행이지만 6행 필요한 달이 있어 필요한 행 수만큼 그린다**(날짜를
  버리면 못 고르는 날이 생긴다 — 카드가 41 커질 뿐 디자인은 동일).
  ⚠️ 화살표·∨·달력 글리프는 Figma 벡터지만 컨테이너 egress 가 `www.figma.com` 을 막아
  **react-native-svg 로 실측 치수 그대로 구현**(∨ 16박스/글리프 8×4, ‹› 20박스/글리프 5×10,
  달력 19×19 `#c8c8c8`). 폰트는 디자인의 Inter/Geist 대신 앱 전역 Pretendard.
- 📅 **출생연도 → 생년월일 전환(마이그레이션 `20260813000000`, 22번째)**: 사용자 요청으로
  어르신 등록 폼이 **년·월·일**을 받는다. `profiles.birth_date date` 추가 + `birth_year` 유지
  (기존 행 보존·프롬프트·집계 호환) + **DB 가 연도 일치를 강제**
  (`profiles_birth_date_year_check`) → 두 컬럼 드리프트 불가. **기존 행에 1월 1일을 채우지
  않는다**(월·일 근거 없음 → null, 화면은 "1943년"처럼 아는 만큼만).
  core 신설 `profile.ts`(`elderAge`·`birthLabel`·`isBirthDate`·`daysInMonth`·
  `birthYearFromDate`, 테스트 8건) — 만 나이는 **생일 경과 여부까지 반영**하고 연도만 알면
  연도 차이로 폴백. 앱·웹이 같은 함수를 쓴다(웹의 중복 나이 계산식 제거).
  폼은 **Figma 드롭다운 필드 한 칸을 그대로 쓰고 시트만 년/월/일 3열**로 바꿨다
  (`form.tsx` `DateField` — 필드를 3개로 쪼개면 행 pitch 107/108 이 깨진다. 월 길이에 맞춰
  일을 자동 절삭). 상세 정보카드 첫 행 라벨도 `생년월일`. 웹 폼도 `type="date"` 로 전환
  (DB 제약 때문에 연도만 쓰면 갱신이 실패한다).
  ✅ **라이브 적용 완료(2026-08-17, Claude MCP)**: 서울 `MemoryOn`(`ufkbzpdjomtmxjipmwub`)에
  `birth_date` 컬럼 + 제약 2종 생성 확인, 기존 2행은 `birth_date` null(설계대로 백필 없음),
  PostgREST 스키마 캐시 리로드(`notify pgrst`)까지 수행. DB 기록 version `20260817132019`
  (저장소 파일명 `20260813000000_...` 과 타임스탬프가 다르지만 **마이그레이션이 멱등**해서
  `db push` 재적용도 무해).
- 🎨 **동의 확인 화면 = 사용자 신규 Figma 디자인으로 교체(`463:62`, 393×852)**: 그전에는
  Figma 에 없어 임시 구현이었다. 헤더 114(공용 ScreenHeader) · 제목 SemiBold 19/30 @144 ·
  부제 Regular 14/25 @208 · 동의 카드 335×97 r10 `#d9d9d9` @(29, 273/389/505, pitch 116,
  체크박스 17 @+23 · 제목 SemiBold 13/16 · 설명 Regular 12/16 w252) · 비의료 고지 14/25
  w316 @39 · CTA 336×57 @727. 취소 버튼은 원본에 없어 제거(뒤로가기로 이탈).
  **문구는 계속 `@giokon/core` 동의 카탈로그가 SoT** — Figma 의 `[필수,별도]` 배지는 라벨의
  "(필수, 별도)" 접미사에서 파생(`cardTitle()`)해 법무 문구 변경이 화면에 자동 반영된다.
  ⚠️ 체크박스는 Figma 컴포넌트(`463:57`)지만 컨테이너 egress 가 `www.figma.com` 을 막아
  에셋을 못 받아 **react-native-svg 로 동형 구현**(17×17 r3, 미선택 회색 외곽선 1.6 /
  선택 검정 채움 + 흰 체크). 에셋을 `assets/figma` 에 넣어 주면 이미지로 교체.
- 🐞 **실기기 육안 대조 → 오류 3종·UI 9건 수정(2026-08-13, `main`)**: 사용자가 안드로이드
  스튜디오로 전 화면을 확인하며 잡은 항목들.
  - **크래시 (1) `Maximum update depth exceeded`**(인지효과분석·주제별 분석 진입 즉시):
    `reads.ts`의 `use*AnalysesDated`가 **Zustand 셀렉터 안에서 `{...a, at}` 새 객체**를
    만들어, `useShallow`(원소 참조 비교)로도 스냅샷이 매 렌더 달라져 무한 리렌더.
    → 셀렉터는 원본 참조만 고르고 합성은 `useMemo`로(`datedFromMock`/`datedFromRows`).
    라이브 map 결과들도 `useMemo` 로 안정화.
  - **크래시 (2) `Failed to construct 'Response': status 0`**: 사진 업로드가
    `fetch('file://…')`를 썼는데 RN 폴리필(whatwg-fetch)이 file 응답 status 0 으로
    `new Response` 를 만들다 **setTimeout 안에서 RangeError** → 잡히지 않고 업로드
    프라미스도 안 풀림. → picker `base64: true` + 자체 `base64ToBytes()` 로 교체.
  - **뒤로가기 버튼 미동작**: `ScreenHeader` 제목이 `left:0/right:0` 로 헤더를 덮고
    뒤로 버튼보다 **뒤에** 선언돼 터치를 가로챘다 → 제목 `pointerEvents="none"`.
  - **대화 없는 어르신에게 관심 주제·AI 의견 표시**: `computeTopicShares` 가 연대기
    주제에 가중치를 줬다(입력값 ≠ 관찰값) → **분석이 0건이면 빈 배열**, 연대기는 이미
    관찰된 주제의 동점 보조로만 사용. 실서비스 원칙 위반 수정.
  - 그 외: 등록 직후 상세가 "찾을 수 없어요"(→ `useElderView` 로딩 구분 +
    `useCreateProfile` 이 상세 캐시 시딩) · TOP5 라벨 잘림(→ `topicBarLayout` 로 라벨 칸/
    트랙 자동 조정) · 메인 인사 이름 정렬(밑줄을 절대 배치) · 대화 시작 전 밑줄 위치 ·
    TTS 질문 카드 높이 고정 → `minHeight`(질문 길이에 따라 확장) ·
    **성별 입력 필드 신설**(Figma 폼엔 없지만 카드·상세가 "81세 l 여성"을 표시해야 함) ·
    로그인 "간편 계정 연결" 라벨 복원(Figma 미존재 — 사용자 요청).
  - **2차 확인 후 재수정(같은 날)**: ① 뒤로가기 — `pointerEvents` 를 `<Text>` 에 직접 준 게
    안드로이드에서 무시됐다(증상: 아이콘보다 **위**를 눌러야 동작 = 제목 줄 바깥만 통과) →
    **제목을 버튼보다 먼저 선언**(안드로이드는 나중 선언 뷰가 터치 우선) + `pointerEvents`
    **View 로 감싸기** + hitSlop 대신 **padding 기반 tapBox**(부모 경계 클리핑·형제 겹침에
    영향 없음, 좌표는 padding 만큼 되빼 아이콘 위치 유지). ② 이름 밑줄이 글자를 덮음 →
    Figma 는 **글자가 밑줄 위**(밑줄 밴드 안에 검정 잉크 존재) → 밑줄을 Text 보다 먼저 선언.
    ③ 기간 pill 이 표시 전용이었다 → 옵션 바텀시트 + `withinPeriod` 기간 필터
    (`src/lib/period.ts`), 전체분석(전체/12/6/3/1개월)·인지효과(3/6/12)·주제별(3/6/12).
- 🎨 **Figma 디자인 v2 전면 재적용 완료(2026-08-13, `main`)** — 안드로이드 스튜디오 확인 결과
  기존 구현이 Figma 와 전혀 달라 **16프레임 → 14화면**을 실측 기반으로 재구현했다.
  절차·결정 기록은 `docs/runbooks/figma-app-extraction.md` §v2.
  - **공용 규칙**: 실기기 상태바를 쓰므로 헤더는 `높이 = (114|155) - safeAreaTop`,
    자식은 `top = Figma y - inset` → 화면 절대좌표가 Figma 와 일치(iOS·Android 공통).
    Android `elevation` 은 그림자가 과대해 **전부 `boxShadow`** 로 통일.
    RN 은 CSS 폰트 상속이 없어 모든 `<Text>` 에 Pretendard 굵기 클래스 필수(`check:font`).
    Figma 가 lineHeight 를 자동보다 작게 준 텍스트는 중앙정렬이 아니어서 그대로 쓰면 3px
    떠오른다 → lineHeight 30 + top 보정으로 잉크 위치를 맞춘다.
  - **신설 컴포넌트**: `ScreenHeader`(114/155·탭) · `form.tsx`(프로필 폼 프리미티브) ·
    `ProfileForm`(등록·연대기 수정 공용) · `detail.tsx`(정보카드·칩·세션카드·타일·막대·AI의견·
    기간 pill) · `charts.tsx`(레이더·꺾은선, react-native-svg). 에셋 21종 추가(@4x 크롭·알파 복원).
  - **검증 — 14화면 픽셀 대조 전수 완료(2026-08-13)**: `pnpm check:figma`
    (scripts/check-figma-spec.mjs, **120항목**)로 실측 수치를 고정 + 구현 상수로 Pretendard
    잉크 위치를 계산해 `assets/figma/*.png`(@4x)의 잉크·테두리·색 밴드와 Δ 비교 →
    **전 화면 최대 편차 ≤1.8px**. 이때 잡은 실오류: 단일분석 히어로 110→108·날짜/제목 7~9px,
    인지효과 **추이 그래프 전체 10px**·레이더 3.5px·▲ 11→8×7, 변화율 카드 값 **주황**(검정 아님)·
    1번 아이콘 추세화살표(`stat-trend.png` 신규), 주제별 칩 **SemiBold 14 주황**(Regular 13 검정 아님),
    전체분석 pill 배경 `#fbfbfb` 누락·하단 버튼 11.25px, 막대 트랙 241→242.
  - **Figma 자체 불일치는 코드에서 통일**(프레임마다 1~3px 다름 → 중간값 또는 콘텐츠 열 29):
    타일 3열 29/145.5/262(space-between)·타일 내부 라벨/값 중간값·AI 블록 아바타 28·본문열 80.75·
    구분선·버튼 x 전부 29(28/27 아님)·꺾은선 X축선 71·칩 패딩 14. 상세 표는 런북 §v2.
  - **자리표시자 처리(사용자 확정)**: 인지효과 5축은 실측 관찰지표로 재정의(core
    `computeAxisObservations`), 월별 추이는 `computeMonthlyAxisTrend`/`computeMonthlyTopicTrend`
    신설, 대화 기록 재생바는 '녹음 없음'(세션 음성 저장 미구현), 감정 분석 %는 관찰된 응답
    분포로 대체. 비의료 카피("인지 효과 분석"·"향상")는 **보류** 결정에 따라 Figma 그대로.
  - **스키마 추가**: `profiles.photo_path`(private 버킷 elder-photos + signed URL)·
    `profiles.gender`(enum) — 라이브 적용 완료. 사진 입력은 `expo-image-picker`.
  - ⏳ **잔여(사용자)**: 안드로이드 스튜디오 재실행 후 화면별 육안 대조.
- 🐞 **기기 첫 실행 크래시 3종 진단·수정(2026-08-02, `main`)**: 앱을 Expo Go 실기기에서
  **처음 실행**(그간 Metro 번들만 검증)하며 표면화된 문제들. **(A) 의존성 중복(사용자 커밋
  `a936160`)**: pnpm 심링크로 `@giokon/data`의 react/react-query 피어가 웹 트리와 공유돼
  react@19.2.7로, 모바일은 19.0.0 → 앱 번들에 React 2벌 → 디스패처 null("Invalid hook call /
  useMemo·useContext of null") 크래시. 수정=`pnpm.overrides`(pnpm10서 무시됨)를
  `pnpm-workspace.yaml overrides`로 이동(reanimated 3.17.4 핀) + `apps/mobile/metro.config.js`
  의 `resolveRequest` origin 고정으로 react·@tanstack/react-query를 앱 단일본으로 강제 +
  RN 0.79.5→0.79.6 정렬. **검증(Claude)**: 웹 빌드 성공·Metro 번들 성공·활성 그래프 RN 0.79.6
  단일(0.79.5는 스토어 잔재). ⚠️ **물리 중복(19.0.0/19.2.7)은 잔존**하고 metro 훅이 런타임서만
  단일화하는 workaround(웹은 19.2.7 단일이라 무관). ⏳ **사용자 확인**: `npx expo install --check`
  로 Expo SDK53이 RN 0.79.6을 권장하는지(egress 차단으로 Claude 확인 불가). **(B) Zustand v5
  불안정 셀렉터(Claude 커밋 `879f5ad`)**: dep fix가 안 건드린 코드 루프. Zustand 5는
  useSyncExternalStore라 셀렉터가 매 렌더 새 배열/객체를 반환하면("getSnapshot should be
  cached" 경고+"Maximum update depth" 크래시) 무한 리렌더. `src/data/reads.ts`의 파생 배열
  셀렉터 7개(eldersSorted·chroniclesByElder·sessionsByElder·logsByElder·elderConsents·
  useElderAnalyses·Object.values(analyses))를 **useShallow로 안정화**(.find·함수·원시 슬라이스는
  안정 참조라 제외). 검증: 전 게이트+Metro 번들. **잔여(사용자)**: 기기에서 재실행해 3종
  크래시 소멸 최종 확인 + RN 버전 권장치 확인.
- ▶ **1차 MVP 마무리 진행(2026-07-31, `main` 브랜치 직접) — 계획 `docs/plans/mvp-roadmap.md`**:
  개발을 태스크(T0~T9) 단위로 진행. **AI 정책=웹과 동일하게 대화 AI는 mock/규칙기반 유지
  (실 AI=T3~T5·T7은 MVP 이후 무변경 전환, API 비용 0)**. MVP 필수셋=T0·T1·T2·T9.
  **코드 완료**: ✅ T1 관찰지표 라이브화(core 순수함수+어댑터, `4957ad2`) · ✅ T2 세션 견고화
  (자동 종료 10턴+저장 재시도, `9be984d`) · ✅ T9 코드측(eas.json·vercel.json, `d565d1e`).
  **T0 완료·라이브 검증 완료(2026-08-01, MCP 채널)**: 사용자가 서울 프로젝트 `MemoryOn`
  (ref `ufkbzpdjomtmxjipmwub`, ap-northeast-2 — 구 메모리 문서의 도쿄 `xilmtqnotomuyjifenmo`
  아님)에 마이그레이션 적용·env 입력. Claude가 MCP로 스키마(16테이블 RLS)·RPC·트리거(org_id 스탬프·bootstrap)·
  Realtime·보안 advisor 검증 + **인증 롤백 트랜잭션 E2E**(register→session→logs→analysis→
  safety + chronicle+consent, RLS 하 쓰기/조회) 통과. **라이브 버그 2건 수정**: (1)
  `safety_events` Realtime publication 누락(`63fab18`+라이브 적용), (2) **session_logs
  turn_index 0-기반→1-기반**(DB check `>=1` 위반으로 실서비스 세션저장 전부 실패했을 크래시,
  `cb054ae`). **잔여(사용자)**: ⏳ 앱 UI E2E(기기)·⏳ T9 배포(Vercel/EAS — 코드측 완료).
  추가 견고화: 자동종료 정책 core 이관+테스트(`fdd95b5`)·에러 바운더리(`4bb29ab`).
- ✅ **모바일 앱 실데이터 배선(2026-07-31, 브랜치 `claude/app-development-session-4cvhm5`)**:
  그간 앱은 목업 Zustand로만 동작(@giokon/data 미호출)이라 "키 채우면 라이브" 약속이
  실제로는 거짓이었다. 이를 실제로 만들어 **앱↔웹 공유 DB 양방향 흐름**을 라이브화.
  스코프=사용자 확정 **"핵심 양방향만"**(관찰지표 집계 화면은 analytics.ts 목업 결합 →
  후속). 디자인 불변(화면 JSX 그대로, 데이터 소스만 목업→라이브 전환, **미설정 시 목업
  폴백 보존**). **1** 인증=웹 AuthProvider 미러(모바일 `src/auth/AuthProvider`,
  signInWithEmail·미설정 시 목업 브리지) → **2** 읽기 어댑터 `src/data/reads.ts`
  (어르신·연대기·세션·로그·분석, live=훅+mappers/mock 전환, 라이브 유휴 게이트) +
  `toSession` 매퍼·`useProfiles({enabled})` 추가 → **3** 세션 영속화
  `src/data/session-persistence.ts`(종료 시 sessions·session_logs·session_analyses·
  safety_events 배치 insert=앱→웹, DB 생성 id 사용, `beginSession(elder,chronicles,input)`
  로 런타임을 목업서 분리) + `useGiokonRealtime` 브리지 → **4** 쓰기 어댑터
  `src/data/writes.ts`(등록·연대기·동의, async+실패 안내). 검증: 전 게이트(typecheck·
  lint·test 149·build·check:copy) + Metro iOS 번들. **잔여(후속)**: 관찰지표 집계 화면
  라이브화(analytics.ts 순수함수 리팩터), 세션 예약(web→app `planned`), 소셜 OAuth·실 STT.
- ✅ **어르신 영속 코드 + 요양보호사 배정 재설계(2026-07-22, 마이그레이션 `20260722100000`)**:
  담당 요양보호사가 바뀌거나 늘어도 기존 기록을 그대로 인계받도록, 어르신 단일 소유
  (`profiles.user_id`)를 "최초 생성 actor"로 낮추고(nullable·SET NULL) **배정 모델**로 전환.
  `elder_codes`(영속·비소진 코드, 보호자 미열람)·`profile_caregivers`(배정) 신설, 자식 복합
  FK 완화(쓰기 연속성), 코어+파생 **9테이블 RLS 배정 기반 재작성**(같은 기관 격리 유지),
  `claim_elder_by_code`(요양보호사 인계)·`link_guardian_by_elder_code`(보호자 연결, 구
  redeem 1회성 대체)·`complete_onboarding` 개정. **QR/`/join`·qrcode.react 제거**(코드 텍스트
  전달). 사용자 확정: 배정 모델 A·같은 기관 한정·읽기+쓰기 완전 연속·QR 제거. 검증: 전
  게이트 + 로컬 PG16 RLS 회귀(§5.7 재작성·§5.7b 연속성 신설) + 라우트 스모크 16/16.
  **후속(적대적 리뷰·기관 합류, 마이그레이션 `20260722110000`·`20260722120000`)**: 서버측
  `rotate_elder_code`(코드 회전 결정성 버그 수정)·잔여 QR 카피 정리 →
  **요양보호사 기관 합류 승인형** 완성: 온보딩에서 어르신 코드로 기존 기관 합류 요청
  (`profile_caregivers.status='pending'`)·`approve_caregiver_assignment`(활성 담당/admin 승인,
  자가승인 3중 차단)·claim 가드(활성 멤버만)·pending 배너/승인 UI. §5.7b 를 실제 온보딩→승인
  경로로 재작성(슈퍼유저 우회 제거)·§5.7c(회전) 신설. 전 게이트 재통과.
- ✅ **웹 1차 MVP 구현 완료(2026-07-19, Phase W1~W6 — 브랜치 `claude/amazing-davinci-tjy3r5`)**:
  **W1** 소셜 로그인 3종(구글·카카오 네이티브+네이버 커스텀 함수 스캐폴드)·온보딩 회원가입
  (`complete_onboarding` RPC)·보호자 초대(QR·72h·1회성)+승인·역할 라우팅·safety_events guardian
  배제 → **W2** 세션 기록 DB 배선+Realtime(`useGiokonRealtime`) → **W3** `session_analyses`+분석
  페이지(SCR-W07) → **W4** `care_journals`+요양일지 3경로(SCR-W06)+AI 초안 mock → **W5**
  `guardian_shares`+공개 체크리스트(SCR-W08)+보호자 타임라인(SCR-W09) → **W6** AI 에이전트 패널
  (SCR-W11, mock·사람 확인 게이트). 마이그레이션 6종(20260718*) 신설, RLS 회귀 §5.6~5.10 확장.
  검증: 전 게이트 + 로컬 PG16 RLS 회귀 + 라우트 스모크 17/17(`apps/web/scripts/route-smoke.mjs`).
  **잔여=사용자 외부 작업**: 서울 리전 적용(M10.1)·소셜 OAuth 콘솔 등록·naver-auth 배포·실 AI 키.
- Phase A 완료 · Phase B(DB/Auth) 라이브 검증 완료 · M5.2(웹 Auth) 완료 · T2.4(A) 완료.
- **모바일 앱 1차 구현 완료(2026-07-13)** — 아래 참조. 웹 대시보드 완료. 백엔드(core/data) 앱·웹 공용.
- 🗣️ **현직자 인터뷰 → 웹 1차 MVP 계획 반영 완료(2026-07-13)**: 요구 5건을 계획화 —
  **M19 요양일지 신설**(사진/음성/타이핑+AI 초안), M17 확장(M17.0 safety_events guardian 배제
  RLS·M17.4 초대 코드 가입/역할 라우팅/랜딩 개편 — 보호자 무인증·광역 접근 제거), M16 개정
  (분석 페이지+Realtime), M18 개정(보호자 설명 에이전트·사람 확인 게이트). 실행=**Phase W1~W6**
  (PLAN §2′ "웹 1차 MVP 재정의"·§3 Phase W·tasks §3-3). 위임 결정 4건 확정(이메일+승인 게이트·
  초대 코드+QR·LLM 비전·작업 지향 에이전트). 입력: `docs/interview-findings.md`(반영 완료 표기).
  **다음 개발 = Phase W1(인증·접근통제)**.
- 🔐 **인증 개편 계획 반영(2026-07-16, 코드 미변경)**: 로그인=소셜 3종(구글·카카오·네이버)·**이메일 로그인 제거**·
  **온보딩 회원가입(기본정보 입력)**·**보호자 어르신 연결(가입+로그인 후, 승인 게이트)**.
  M17.4 개정·M17.5~17.7 신설(PLAN §2′)·SCR-W05/W12(design)·F-32~34·NF-W2(requirements)·T17.5~7(tasks). 구현은 Phase W1.
  (※ 연결 코드 방식은 2026-07-22 재설계로 **어르신 영속 코드**(QR·1회성 초대 폐기)로 확정 — 위 재설계 항목 참조.)
- **2026-07-03 목표 상향** → 엔터프라이즈·정부심사 기준 전면 재계획(PLAN §2′ M9–M15 · §3 Phase G–L).
- **Phase G/H DB 기반 완료(로컬 PG16 검증)**: 마이그레이션 7종(organizations/RBAC·audit_log·
  consents·consent_retention·safety_events) + RLS 회귀 테스트 + CI(quality·rls-regression·SCA·
  비의료 카피 린트). **M12 노인 특화 대화 안전 설계 전면 완성**(8상황 분류·3중 방어·프롬프트·
  세션 시뮬레이션 — `docs/ai-safety.md`).
- **웹 대시보드 개발 완료(2026-07-11)**: 동의 수집·게이팅(대리동의·의사능력), 안전 알림
  대시보드·확인 처리, 기관 관리, 설정(비밀번호·데이터 다운로드·삭제 안내), 처리방침·약관 초안,
  비밀번호 재설정, AI 투명성 표시. **Supabase 서버·API는 미연동** — 연동은 사용자가 외부에서
  진행(`docs/runbooks/seoul-region-migration.md`), 연동 시 코드 변경 없이 동작.
- ⏳ **차단(사용자)**: M10.1 서울 리전 프로젝트 생성 + 마이그레이션 적용 + env 재배선.
- **아키텍처 확정(2026-07-12, 사용자 상세 확정)**: 환자는 앱을 조작하지 않는다.
  - **앱(Expo)** = 요양보호사 조작 세션 실행 도구: 환자 선택 → 세션 생성(주제 직접 설정 or **AI 자동 추천**) → 기기 전달 → **환자 음성 대화(TTS/STT)** → 종료 시 **AI 자동 요약·분석**(좋았던/저조했던 주제 등) → 저장.
  - **웹** = 관리·분석 허브: 담당 환자 전체 기록·요약·분석 **Realtime 조회**, 세션 설계(직접/AI 추천), 환자 관리, **보호자 공유 커밋**(선별·승인된 것만 보호자에 노출), **AI 에이전트**(세팅·관리·커밋 보조).
  - **보호자 웹** = 커밋(승인)된 데이터만 열람.
  - 백엔드(`core` 안전엔진·프롬프트 / `data` Supabase 훅 / 마이그레이션)는 앱·웹 공용 → 앱은 프론트만 신규.
  - 비의료 락다운: 분석은 "효능/향상" 주장 금지, **관찰 지표**(참여도·응답률·발화량·주제 반응·관심 변화)로. 내부 명칭 "인지치료" 무방, 노출 카피는 "인지활동"(CI 린트 강제).
  - Figma 앱 디자인 확보: 파일 `nLfWkg2H7dFfDH1pehcH5I`(19화면). 상세 트랙: PLAN §2′ M16–M18.
  - (2026-07-11) 웹에 있던 어르신 대화/꾸미기·아바타·브라우저 음성 프로토타입은 **제거 완료**.
- **모바일 앱(중요)**: **Figma 19화면 추출→Expo 앱 1차 구현 완료(2026-07-13)**. 파일
  `nLfWkg2H7dFfDH1pehcH5I`에서 토큰·구조·스크린샷 추출 → `apps/mobile`(Expo SDK 53·expo-router·
  NativeWind 4)로 19화면 + 컴플라이언스 화면(동의·AI고지·위기배너) 구현. 백엔드는 웹과 공용
  (core/data 재사용). 절차·상세: `docs/runbooks/figma-app-extraction.md`, `apps/mobile/README.md`.
  검증: typecheck·lint·test·web build·check:copy + Metro iOS 번들(1146모듈) 통과. 실기 확인·실
  STT/TTS/LLM·Supabase 연동은 사용자 몫(미설정 시 목업 동작). 추가 화면·재작업은 이 앱 위에서 진행.
- 참고: 프로토타입 도메인 ↔ v1 스키마 불일치(아바타 꾸미기·치료세션 템플릿은 v1 스키마 없음 → 매퍼 기본값).
  세션·대화 이력은 아직 Zustand 스토어(Phase E에서 DB 배선).

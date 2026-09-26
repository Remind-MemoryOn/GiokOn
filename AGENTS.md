# 기억온 (GiokOn) — 프로젝트 메모리

> ## ⚠️ 2026-09-23 기획 변경 — 제품 정의가 바뀌었다
>
> **변경 전**: 요양보호사 업무를 전반적으로 돕는 도구(회상 대화 + 요양일지 + 보호자 소통)
> **변경 후**: **인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로
> 자동으로 남는 도구.** 요양보호사는 계획하고 감독하며 확인한다.
>
> **📋 "무엇을 만들지"의 SoT = [`docs/plans/pilot-development-plan.md`](docs/plans/pilot-development-plan.md)**
> (DB·앱·웹·연동 4파트, 파일럿 범위). 이전 실행 목록 **N01~N35**·**D1~D11** 은 이 문서로 대체돼
> 2026-09-24 삭제했다(git 이력). 출시 점검은 [`docs/plans/launch-checklist.md`](docs/plans/launch-checklist.md),
> 새로 합류한 사람의 입문 문서는 [`docs/new-hire/`](docs/new-hire/README.md).
>
> **판단 기준 셋**: ① 기존 ERP(케어포·엔젤시스템·이지케어)가 하는 기능은 만들지 않는다
> ② **AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는 경로는 없어야 한다**(테스트로 검증)
> ③ "제공 횟수·기록 품질·시간 절감"을 측정 가능하게 하는 이벤트 로그를 1주차부터 남긴다.
>
> 팀은 임성훈(기획·개발), 박진우(개발·영업), 고서연(UI/UX·프론트엔드 디자인) 3인이다.
> 시설 3곳 접점·현장 테스트 미실시. 아래 날짜별 완료 이력은 당시 사실로 보존한다.

> 📌 **이 파일이 프로젝트 메모리의 단일 소스(SoT)다(2026-09-11 사용자 확정).**
> 어떤 AI 에이전트로 작업하든(Claude Code·Codex·Cursor 등) **여기를 읽고, 여기에 기록한다.**
> 루트 `CLAUDE.md` 는 이 파일을 가리키는 **포인터 스텁**이다 — 거기에 내용을 쓰지 말 것.
> 예전에는 두 파일이 각각 유지돼 **서로 다른 사실**(운영 DB 리전·AI 스택·마이그레이션 수)을
> 말하고 있었다. 다시 갈라지지 않게, 사실은 한 곳에만 둔다.
>
> **하위 스코프 메모리**: **`apps/web/AGENTS.md`** (웹 파일을 건드리면 함께 읽는다 — 웹 디자인
> SoT·기능 델타·상태 규칙·카피 규약). 루트와 충돌하면 더 구체적인 그 문서를 따른다.
> 같은 자리의 `apps/web/CLAUDE.md` 도 포인터 스텁이다 — 두 계열 모두 규칙에 걸리게 한 구조다.

요양보호사가 어르신 연대기를 입력하면 AI가 1:1 음성 회상 대화를 진행하고, 그 결과가
**공단 형식 프로그램 일지 초안**으로 남는 인지활동 프로그램 도구.
실행 계획은 `docs/plans/pilot-development-plan.md`, 스펙은 `docs/`.

## 구조 (pnpm 모노레포)
- `apps/web` (@giokon/web): **요양보호사·보호자 전용** 관리 웹 (React 19 + Vite + Tailwind).
  어르신 음성 대화(TTS/STT)는 웹에 없음 — 앱 담당. (2026-07-11 웹에서 앱 콘텐츠 전부 제거)
- `apps/mobile` (@giokon/mobile): **어르신 대화 앱 (Expo SDK 54 + expo-router 6 + NativeWind 4.2)**.
  Figma 19화면 + 설정·동의 확인 = 전 화면 구현. 요양보호사가 조작하는 세션 실행 도구.
  백엔드는 웹과 공용(core/data 재사용) — 프론트만 신규.
  음성 경로는 **중계 단일**이다(2026-09-23 확정, 2026-09-26 TTS 교체): 앱→voice-relay→Gemini Live→서버 검증→Gemini TTS→앱.
  **직접 Gemini Live 모드는 폐기한다** — 검열되지 않은 원본 오디오 경로가 코드에 살아 있으면
  "AI 산출물이 사람 확인 없이 나가지 않는다"가 코드 레벨에서 거짓이 되고, 단계·원격 제어·
  안전 일시정지가 전부 서버 권위인데 직접 모드에는 서버가 없다.
  ✅ (2026-09-24) 앱에서 직접 모드 코드를 삭제했다. `EXPO_PUBLIC_VOICE_RELAY_URL` 은 **필수**(없거나 형식이 틀리면 시작 화면에서 차단),
  `apps/mobile/.env.example` 필수 3/3. ⏳ 서버 쪽 `live-token` 중계 전용화(T23.5)는 남았다.
- `apps/voice-relay` (@giokon/voice-relay): **음성 중계 서버**(Node + ws, Docker).
  `src/{main,server,relay,output}.ts` — 세션 권한·연결 통제·턴 식별·안전 규칙 검증을 거친
  응답만 Gemini 3.8 Flash TTS 로 내보낸다. 검증 안 된 원문 재생·늦은 이전 응답 혼입을 서버가 막는다.
  ⚠️ `pnpm install --prefer-offline` 이 이 프로젝트의 node_modules 를 만들지 않는다 —
  새 세션에서 `pnpm install --filter @giokon/voice-relay` 를 먼저 실행할 것.
  안 하면 `pnpm -r typecheck` 가 TS2688 로, `pnpm -r test` 가 여기서 끊겨 모바일 테스트까지 안 돈다.
- `packages/core`: 도메인 타입·**안전 규칙**·프롬프트·분석.
  ✅ (2026-09-24) **규칙 기반 대화 로직(`ai.ts` 779줄)·`voice-flow.ts` 는 삭제했다**(C1). 대화 생성은 중계만 한다.
  `conversation.ts` 는 안전 평가 `evaluateUserTurn` 만 남았다. **안전 계층**(`assessUtterance`·`screenAiUtterance`·
  `buildCaregiverAlert`·`buildSafetyEventDraft`)은 **절대 유지**한다.
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
  `docs/{compliance,security,ai-safety,accessibility}.md`(인프라는 `security.md` 에 합쳤다).
- **커밋은 `main` 브랜치에 직접** (사용자 승인). ※ 원격 세션이 작업 브랜치를 지정해 주면 그쪽을 따른다.
- **테스크별 커밋(2026-09-19 사용자 확정)**: 각 테스크의 개발·검증·진행 기록을 마친 뒤 반드시 커밋하고 다음 테스크로 넘어간다.
- **계획 문서 완료 표시 필수(2026-09-24 사용자 지시)**: 테스크를 끝내면 커밋 전에 **팀원이 보는 계획 문서 전부**에 완료(✅ 날짜)·남음(⏳ 선행 조건)을
  표시한다 — 이 파일만이 아니라 `docs/plans/pilot-development-plan.md`(SoT, §5~§8 상태 열) · `docs/tasks.md` · `docs/plans/launch-checklist.md` ·
  해당 앱의 `README.md` · `docs/structure.md` §4 · `docs/new-hire/02-status.md`·`03-remaining.md` · 관련 요구 ID(`docs/requirements.md`) · `PLAN.md`.
  계획과 다르게 구현했으면 그 차이도 같은 자리에 적는다.
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
- AI 스택 — **중계 단일 경로**(2026-09-23 확정):
  ```
  앱 ──▶ voice-relay ──▶ Gemini Live ──▶ 서버 검증 ──▶ Gemini 3.8 Flash TTS ──▶ 앱
  ```
  - **모델 = `gemini-3.8-live`**(2026-09-22 사용자 확정). 키는 앱에 두지 않는다 —
    Edge Function **`live-token`** 이 Supabase JWT 를 검증해 ephemeral token 을 발급하고
    (자격·동의·사용량 검사 포함) **모델 ID 를 응답에 담아 돌려준다.** 앱·중계는 그 값을 따른다.
    ⚠️ **모델 교체는 `GEMINI_LIVE_MODEL` 시크릿으로만 한다** — `.env.example` 은 템플릿이라
    런타임에 읽히지 않는다. `supabase secrets set` 을 해야 실제로 바뀐다.
    ✅ 코드의 `DEFAULT_MODEL` 폴백도 2026-09-26 `gemini-3.8-live`로 맞췄다. 운영 시크릿은 별도 변경·검증이 필요하다.
    자동 VAD off와 NO_INTERRUPTION 설정은 **중계 `relay.ts`의 setup**에만 있다.
  - **서버가 출력을 검증한다**: Gemini 의 `inlineData` 오디오는 **앱에 전달되지 않는다.**
    `screenAiUtterance` 를 통과한 텍스트만 `gemini-3.8-flash-tts`로 합성해 내보낸다(`voice-relay/output.ts`).
    턴 식별·재생 영수증 게이팅(v2)·복구 맥락(v3)도 중계가 소유한다.
  - **직접 Gemini Live 모드는 폐기**(2026-09-23). 구조 절 참조.
  - 분석·프롬프트·**안전 규칙**은 계속 core. 서버 키 보호·모델 버전 검증은 유지한다.
  - **생성문 검증은 이미 강하다 — 재사용 자산.** `packages/core/src/generated-session.ts` 가
    모든 문장에 어르신 발화의 `turnId`+원문 인용을 강제하고(`GroundedClaim`) 진단·효능 표현을
    정규식으로 막는다. 프로그램 일지도 **이 계약을 확장해서** 쓴다(새로 만들지 말 것).
  - 장기에는 독립 수집·사람 전사·검수 자료로 Whisper·**Qwen3.5-9B** 특화를 평가한다.
    Gemini 참여 세션의 출력·파생 자료는 계약 확인 전 학습 제외.
  - ⚠️ 웹 요양일지 STT(`stt-transcribe`, NCP CLOVA)는 **요양일지 폐기와 함께 용도를 재검토**한다.
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
- 마이그레이션 **63종 전부 운영 적용**(2026-09-24 D5 `20260924070000` + 법률 동의 `20260924080000`·`090000` 포함 — 뒤 2건은 `jinwoo` 브랜치(PR #17)에 있고 main 병합 대기)(`supabase/migrations/*.sql` 파일 수 기준 — 세는 법을 바꾸지 말 것). ✅ **2026-09-24 사용자 지시로 미적용 8건 적용**: 전사 출처(`20260919175923`) + 파일럿 `20260924000000`~`060000`(060000 은 적용 직후 보안 advisor 가 잡은 `app.default_capability_roles` search_path 고정). MCP 적용 후 이력 버전을 **파일명으로 정정** — 저장소에만 있는 버전 0건. 라이브에만 있는 이력 2건: `20260903002002`(아래 ℹ️) · `20260921000000_backfill_orphan_auth_users`(누군가 SQL 로 직접 넣은 데이터 보정 — 저장소 파일 없음, 그대로 둔다). 적용 전 점검: `chronicle_entries` 기관 불일치 0 · 활성 세션 0 · ALTER POLICY 대상 29개 존재. advisor 잔여 경고는 기존 유형(authenticated 가 부르는 definer RPC = 설계, `find_login_email` = 의도, `list_inquiries`·`rls_auto_enable` anon 실행 = 적용 전부터 — 후자는 저장소에 없는 대시보드 생성 함수).
  16+ 테이블·RLS·가입 트리거 `handle_new_user`→`public.users`·org RBAC·감사 로그 +
  2026-09 보안 하드닝 R002·R005·R007·R010~R012).
- ✅ **마이그레이션 이력 정합 완료(2026-09-13, 사용자 승인 후 적용)**. 그전까지는 이력이
  스키마와 어긋나 `supabase db push` 가 **이미 적용된 DDL 을 재실행**하려 드는 상태였다
  (`add constraint` 는 멱등하지 않다). 두 종류였다:
  ① **이력 누락 3건** — 스키마에는 있는데 기록이 없었다(SQL Editor 직접 적용의 흔적):
     `20260908000000_users_privilege_hardening` · `20260908010000_users_privilege_guard_fix` ·
     `20260909000000_session_ownership_integrity`. → **DDL 을 실행하지 않고 이력 행만** 넣었다.
     넣기 전에 세 마이그레이션의 객체(트리거·함수·정책·제약 7종·restrictive 정책 4종·
     `users` 의 authenticated UPDATE 가 `name` 한 컬럼인 것)가 실제로 있는지 **원자적 블록에서
     검사**하고, 하나라도 어긋나면 아무것도 쓰지 않게 했다.
  ② **버전 드리프트 3건** — MCP `apply_migration` 이 적용 시각으로 기록해 저장소 파일명과
     달랐다: `20260822000519`→`20260822000000`(chronicle_title) ·
     `20260903001714`→`20260902000000`(inquiries) ·
     `20260907153319`→`20260907000000`(drop_guardian_invites). → 파일명 버전으로 정정.
  검증: 저장소 52파일 ↔ 라이브 53행, **"저장소에만 있는 버전" 0건**(= push 가 재실행할 것이 없다).
  ⚠️ MCP `apply_migration` 은 여전히 **적용 시각**으로 기록한다 — 쓴 뒤 저장소 파일명 버전으로
  맞춰 주지 않으면 같은 드리프트가 다시 생긴다.
- ℹ️ 라이브에만 있는 이력 1건은 **일부러 남겼다**: `20260903002002`
  (`20260902000100_inquiries_revoke_anon`). 저장소에 같은 이름의 파일은 없지만 그 내용
  (`revoke all on public.inquiries/inquiry_replies from anon`)은 `20260902000000_inquiries.sql`
  에 흡수돼 있다. 지우면 **실제로 적용했던 기록**이 사라지므로 지우지 않는다. 저장소에만 없는
  것은 push 를 막지 않는다.
- 운영 DB 에 DDL 을 적용할 때는 CLI `db query --linked --file` 로 **한 건씩** 적용하고 같은
  트랜잭션에 이력을 기록한다(R005~R012 가 쓴 방식). `db push` 는 이제 쓸 수 있지만, 여러 건이
  한꺼번에 나가므로 **운영에서는 여전히 한 건씩을 기본으로** 한다.
- 개별 마이그레이션의 라이브 반영 근거는 `docs/runbooks/security-fixes.md` 에 모았다(원래 p0·p1 런북의 "운영" 문단 —
  원문은 git 이력). 적용 여부를 추측해 단정하지 않는다 —
  **확인할 수단이 있다**(바로 아래).
- ✅ **라이브 DB 는 Supabase MCP 로 직접 조회할 수 있다**(2026-09-13 확인). 컨테이너 egress 가
  `*.supabase.co` 를 막는 것은 **HTTP 직결**이고, MCP 는 그 경로를 타지 않는다.
  `list_projects`·`list_migrations`·`execute_sql` 로 카탈로그를 읽어 **추측 대신 실측**한다.
  연결이 간헐적일 수 있으니 **한 번의 쿼리에 검사를 모아 담는다**(union all 로 객체 존재 여부를
  한꺼번에). 실패하면 재시도보다 대시보드 SQL Editor 등 대안 사용.
  ⚠️ 조회는 읽기만 한다. 운영 DB 쓰기는 사용자 승인 없이 하지 않는다.

## 현재 로컬 변경 (2026-09-26 — Gemini 3.8 모델·TTS 전환, 미배포)

- 사용자 요청으로 원격 `main`을 건드리지 않도록 로컬 브랜치 `codex/gemini-38-local`에서만 작업한다. 커밋·푸시·배포·DB 변경 없음.
- `live-token`의 코드 기본값을 `gemini-3.8-live`로 맞췄다. 실제 운영 모델은 계속 `GEMINI_LIVE_MODEL` 시크릿이 우선하므로 배포 시 별도 변경·확인이 필요하다.
- 음성 중계의 Clova Voice 호출을 `gemini-3.8-flash-tts` GenerateContent 호출로 교체했다. 기본 음성은 `Kore`, 한국어, 24kHz WAV이며 서버가 RIFF/PCM 형식을 검증한 뒤 기존 PCM 계약으로 앱에 전달한다. 앱·DB 스키마 변경 없음.
- 공식 Google 문서에서 두 모델 ID와 3.8 TTS의 기본 WAV/GenerateContent 형식을 확인했다. 실 API 호출·비용·지연·한국어 고령자 음질·운영 Secret 등록은 미검증이다.
- 자동 검증은 저장소 `node_modules` 손상(TypeScript 실행 파일 EPERM, `@vitest/utils` 누락)으로 시작되지 못했다. 소스 문제로 통과했다고 기록하지 않는다.

## 현재 위치 — 웹 (2026-09-24 — 웹 파트 착수 준비 · `jinwoo` 브랜치 검토)

> 이 세션은 **웹 파트만** 맡는다(사용자 지시). 작업 브랜치 `claude/web-development-session-6mb8mk` 를 **main `6e8c1b9` 에서 다시 시작**했다
> (예전 브랜치 끝 `aaf6b3d` 의 09-23 웹 점검 기록은 main 에 없어서 이번 갱신에 옮겨 적었다 — 원본은 로컬 `backup/web-session-aaf6b3d`).
> 웹 규칙 SoT 는 `apps/web/AGENTS.md`, 무엇을 만들지는 `docs/plans/pilot-development-plan.md` §7(W1~W9).

**기준선(2026-09-24, main `6e8c1b9` 에서 실제 실행)**: typecheck 6패키지 · 테스트 **678**(core 212 + data 155 + mobile 261 + relay 50) ·
`check:design` 186 · `check:figma-web` 1511 / 잉크 810 / 이미지 564 / 사이드바 137 · `route-smoke` 65/65 · `check:a11y` 57화면 차단 0.

### `jinwoo` 브랜치 검토 (2026-09-24, `a3d1de0` — 4커밋, 작성자 jinrain_03)

분기점 `8233b16`(9-22). main 과 **텍스트 충돌은 없다**. 병합본에서 typecheck·lint·테스트 680(모바일 +2)·`check:design`·`check:copy`·
`check:bom`·`check:figma`·`check:font`·스모크 65/65·a11y 차단 0 은 통과했다. **그러나 main 병합 불가로 판정했다**:

1. 🔴 **`check:figma-web` 회귀 — 편차 192건**(main 0건, 34화면). 사이드바에 `모니터링` 을 끼우고 라벨을 두 줄로 바꿔 아래 항목이 **+79px** 밀렸고,
   랜딩 히어로 +35px, 요양일지 작성 화면은 Figma 좌표계를 버리고 자유 배치로 다시 썼다. 웹 디자인 SoT(Figma 단독·임의 재디자인 금지) 위반.
2. 🔴 **게이트를 코드에 맞춰 고쳤다** — `scripts/check-web-design.mjs` 에서 작성 화면의 Figma 실측 정규식(카드 1057×928·방식 탭·저장 버튼)·
   사이드바 `mb-[86px]` 등을 지우고 새 코드를 단언하게 바꿨다. 그래서 `check:design` 통과는 의미가 없다.
3. 🔴 **계획 §7 과 반대 방향**: 요양보호사 `분석` → `대화관찰리포트`(W3: 요양보호사는 `분석` 유지, 보호자만 변경) ·
   보호자 화면에 `프로그램일지` 노출(W3·W4: 보호자 필터는 `오늘의 이야기`, 공단 서식은 보호자에게 직접 노출 금지) ·
   작성 화면은 `care_journals`+`buildJournalDraft` 위에서 고쳤다(W1 은 `program_journals` 로 대체하고 둘 다 삭제).
4. 🟠 **모니터링 화면 ≠ W2 감독 화면** — 저장된 발화만 5초 폴링, 단계·일시정지/재개/종료 없음, "최대 5명"(확정은 1명당 4대).
5. 🟠 이용안내(`GuidePage`) 앱 단계에서 **AI 투명성 문구와 "키워드 기반 … 의학적 판단이 아닙니다" 고지가 빠졌다**(웹 §4).
6. 🟡 `docs/progress-summary-2026-09-22.md` 는 삭제된 문서(`non-db-development-backlog.md`)를 가리키고, SoT 밖에 현황을 따로 적는다.

커밋 메시지 스스로 "비교 검토용 시안 · 최신 main 구조에 맞춘 재작업 필요"라고 적었다. **수정 요청(2026-09-24 작성·전달)**: ① Figma 편차 192건 제거
(사이드바 메뉴 추가·sticky 전환·작성 화면 재작성·공용 `Badge` 변경·명칭 치환·랜딩 문구) ② `check-web-design.mjs` 원상복구 ③ 계획 §7 과 겹치는 변경
(명칭·작성 화면·모니터링·동의 화면)은 빼기 — 웹 파트가 W1~W4·W7 로 한다 ④ 이용안내 AI 투명성·안전장치 고지 복구 ⑤ 진행 요약 문서 삭제
⑥ 모바일 배너·기본 정보 전체 보기는 따로 떼서 재제출(배너는 어르신 표시 모드에서 숨김). 검토 기준 = main 수치 이상 · 게이트 삭제 0. 원래 판단한 **쓸 만한 것**: ① 모바일 `8fb2392`
조회 실패 배너(출시 점검표 "앱 읽기 오류가 기록 없음으로 보이는 문제" 해당, 테스트 2건) — 앱 파트 소관이고 **어르신 표시 모드(M2)에도
뜨는지** 확인이 필요하다 · ② `ElderConsentsPage`(철회 전용) — W7 의 출발점 · ③ `useActiveConversations` 훅 — W2 참고.

### `jinwoo` 3차 — 병합 차단 해소(2026-09-24, 사용자 지시 · `172acbc` · PR #17)

사용자 지시: "마이그레이션 번호 중복·신규 가입 실패·기존 어르신 세션 차단 해결 + 동의 관련 추가분을 뺀 권장하지 않는 변경 제거 → jinwoo 에 푸시".
- 마이그레이션을 `20260924080000`(enum 단독)·`20260924090000` 으로 이동. main 최신 정의(`p_invite_code`·`is_care_team`) 위에 `terms_required` 만 추가.
  **DB 는 `terms_required` 를 받되 아직 필수 아님**(배포 전환기 가입 보호 — 웹 배포 뒤 필수화 후속). 기존 어르신은 `app.elder_privacy_grandfathered`
  (적용 시점 등록분)로 **새 동의 1종만 면제** — 증거를 지어내지 않는다. 테스트 `supabase/tests/legal_consents.sql` 신설, 러너·CI 에 버전 중복 검사와
  `pilot_access`·`legal_consents` 추가(CI 는 그전까지 `pilot_access` 를 돌리지 않았다). 변형 4종 실패 확인.
- 뺀 것: `.tmp/` · 비의료 검사 파일 전체 면제(→ 줄 단위) · 어르신 상세 `전체 보기`·실제 삭제·동의 아이콘 재디자인. 남긴 동의 변경: 4행 피치 74 · 유효 동의 판정.
  법률 문서 HWP 잔여 문자 정리 · 모바일 배너는 `/session/talk` 에서 숨김.
- ✅ **사용자 결정(2026-09-24, 4차)**: ① 동의 2종(`terms_required` 이용약관 · `elder_privacy_required` 어르신 개인정보) **추가 진행** ·
  ② **웹에서도 동의 부여**(등록 시 4종 기록 + 동의 관리 화면의 동의하기·다시 동의하기·철회 — 앞의 "부여는 앱" 결정을 대체) ·
  ③ ⛔ **법률 문서(`apps/web/src/content/legalDocuments.ts`)는 절대 수정하지 않는다** — 변호사 검토본이다. 원본(`a490721`)과 바이트 동일로 복원했고,
  원본이 기대는 `check-nonmedical-copy.mjs` 의 파일 첫머리 `nonmedical-ok-file` 면제도 원본대로 둔다(HWP 추출 잔여 문자도 원문이므로 손대지 않는다) ·
  ④ 마이그레이션 2건 **운영 적용 완료**(MCP, 한 건씩, 이력 버전 파일명으로 정정). 적용 전: 최신 `070000` · 두 버전 부재 · 옛 `privacy_required` 어르신 행 0 ·
  활성 세션 0 · 가입 함수·정책이 main 정의와 동일. 적용 후: enum 7종 · 예외 목록 3/3(어르신 전원) · 가입 함수 1개(초대 코드 유지, anon 실행 불가) ·
  정책 2개 `terms_required` 포함 · **이번 적용으로 막힌 어르신 0명**(처리 불가 2명은 적용 전부터 — 동의 기록 없음 1 · AI 처리 동의 철회 1) · 보안 advisor 신규 경고 없음.
  가입 함수 본문은 저장소 파일에서 주석 3줄만 빠진 채 적용됐다(로직 동일 — 재적용하지 않았다).
- ⚠️ **main 병합 전 운영 공백**: 운영 DB 는 이제 **새로 등록하는 어르신**에게 `elder_privacy_required` 를 요구하는데, 배포된 웹·앱(main)에는 그 동의를 받는
  화면이 없다 → **PR #17 병합·웹 배포 전까지 새 어르신은 세션을 시작할 수 없다**(기존 어르신은 영향 없음). 앱은 EAS 재빌드 전까지 3종만 받으므로
  앱으로 등록한 어르신은 웹 동의 관리 화면에서 4번째 동의를 기록하면 된다.
- 동의 관리 화면의 표시 판정을 DB 판정과 같게 했다(예전 `privacy_required` 어르신 행을 인정하던 호환 제거 — 운영 0건).

### `jinwoo` 2차 검토 (2026-09-24, `a490721` — main `08082fa` 병합분)

1차 요청의 **UI 회귀는 해결**됐다(Figma 1511·잉크 810·사이드바 137 · 스모크 65/65 · 게이트 스크립트 원상복구 · 모니터링·명칭·작성 화면·이용안내 고지 복구).
그러나 **새로 들어온 동의·법률 문서 작업 때문에 병합 불가**:
🔴 마이그레이션 `20260924000000_legal_consent_types` 가 main 의 `20260924000000_org_role_add_values` 와 **버전 중복** ·
파일럿 마이그레이션보다 **앞 순서**라 뒤의 `020000`·`030000` 이 `complete_onboarding`·`consents_update_scope` 를 덮어써 **`terms_required` 가 거부 → 웹 신규 가입 전부 실패** ·
`has_processing_consent` 에 `elder_privacy_required` 필수 추가 → **기존 어르신 전원 세션 차단, `rls-regression` 실패** ·
웹 등록에 동의 **부여** 단계(사용자 결정 "부여는 앱"과 충돌) · 어르신 상세 동의 카드 재디자인(이미지 564→561) · 실제 삭제 버튼(사진 먼저 삭제되는 순서 문제) ·
`.tmp/`(olefile 사본·pyc) 커밋 · 비의료 검사 **파일 전체 면제** 추가 · 공개 법률 문서에 **개인 휴대전화·개인 메일**(보호책임자 미확정 규칙 위반) ·
모바일 배너는 여전히 어르신 표시 모드에서도 뜸. 상세 = 세션 산출물 `jinwoo-review-2.md`(사용자 전달용). 동의 종류 추가·재동의·보호책임자 공개는 **사용자 결정 대기**.

### 웹 테스크 분해 (2026-09-24 사용자 확정 — 진행 순서 = 표 순서)

- **사용자 결정(2026-09-24)**: ① ~~WT1 동의 화면 = 철회 + 이력만~~ → **웹에서도 부여**(같은 날 4차 결정으로 변경) ·
  ② DB 선행 테스크는 **브랜치에서 로컬 PG16 로 검증하며 개발하고, 운영 마이그레이션 적용 전에는 머지하지 않는다**(운영 DB 는 건드리지 않는다) ·
  ③ **웹 파트만** — WT7·WT8 은 DB 파트 D5·C4 가 준비되면 착수한다. ④ **`jinwoo` = 병합도 참고도 하지 않는다**(사용자 결정 2026-09-24) — 수정 요청 목록을 박진우 님께 전달하고, **고친 결과를 검토한 뒤 웹 개발(WT1~)을 시작한다.**
  WT1(동의 화면)·WT5(감독 화면)도 jinwoo 코드를 출발점으로 삼지 않는다.


#### 2026-09-25 main 병합(PR #17 내용, `65f3a4a`) 뒤 재정렬 — 우선순위 순

**병합으로 바뀐 계획**: ① W7(동의 화면) 완료 — 웹도 동의를 **부여**(철회 전용 결정 폐기), 필수 동의 4종 + 계정 이용약관 ·
② ⛔ 법률 문서 수정 금지(변호사 검토본) → 계획 §7 "카피 동반 개정"(처리방침 1항 요양일지→프로그램 일지·Expo Push 국외이전 고지)은
**코드로 하지 않는다** — 법무 검토 문서 갱신 요청으로 전환(사용자) · ③ 후속 신설: `terms_required` DB 필수화(웹 배포 확인 뒤) ·
④ D5 운영 적용으로 W8 선행 해소 · ⑤ main 에는 문서 커밋 `769c47f` 가 빠져 이 브랜치로 함께 들어간다 · PR #17 은 열린 채(닫기는 사용자).

| 순위 | # | 계획·tasks | 내용 | 상태 |
|---|---|---|---|---|
| 1 | WT2 | W9 · T22.8 전반 | 온보딩 "새 기관 / 초대 코드 합류" + 승인 대기 화면 · **파일럿 블로커** | ✅ 2026-09-25 웹(`claude/web-development-session-6mb8mk`) — 온보딩 '초대 코드로 합류하기' 전환(Figma 좌표 불변) · `/join-pending` 승인 대기(상태·재요청·취소·15초 재확인) · `routeForUser`·`CaregiverGuard` 가 기관 없는 가입 계정을 대기 화면으로. 요청자는 기관 이름을 못 읽으므로(RLS) 표시하지 않는다 |
| 2 | WT3a | W6 · T22.8 후반 · T22.4 | 기관 관리의 **초대 코드 발급·회수 · 합류 승인/거절**("승인하면 기관 전체 기록 열람" 명시) + 관리 역할 인식(`isAdmin` 이 센터장 제외 · `ROLE_LABEL` · TopBar 호칭) · **블로커(W9 짝)** | ✅ 2026-09-25 — 기관 관리 카드3 에 직원 합류 요청(승인 전 '기관의 모든 어르신 기록을 볼 수 있습니다' 확인창·거절) · 카드4 '직원 초대 코드'(관리 역할만: 합류 후 역할·유효 기간·복사·회수) · 관리 역할 = 관리자+센터장(`isOrgManagerRole`) · 역할 이름 `ORG_ROLE_LABEL`(사회복지사·센터장) · TopBar 호칭 `roleHonorific` · 기존 '기관 합류' 라벨(어르신 코드 담당 요청)은 '담당 요청'으로. 기관 이름 수정은 DB 정책대로 기관 관리자 한정 유지 |
| 3 | WT5 | W2 · T21.5 | 감독 화면(반응형) + 원격 일시정지·재개·종료 + data `supervision.ts` + realtime `session_interventions` | ✅ 2026-09-25 웹(PR #18) — `/caregiver/supervision`(1440 셸 밖 반응형 단독 화면, 사이드바 맨 끝 '감독') · 기관의 진행 중 세션 카드(어르신·시작한 사람·단계·경과/목표·상태) · 원격 일시정지(선택 사유)·재개·종료(확인창 — 저장은 기기에서) · 위기 카드(서버 `caregiver_alert` 그대로 + 확인) · 개입 기록 3건 · Realtime `session_interventions` 등록. 계획과 다른 점: 세션에 기기 정보가 없어 '기기' 대신 '시작한 사람'. ⚠️ 위기 카드는 T21.4(중계 즉시 기록) 전에는 세션 종료 뒤에야 뜬다 |
| 4 | WT7 | W1·W3 · T20.8 | 프로그램 일지 목록·상세(12칸)·확정·이력·재시도 + 요양보호사 네비 이름 · `buildJournalDraft`·`SessionJournalDialog` **삭제**(흡수 아님) | ✅ 2026-09-26 웹(`claude/web-development-session-6mb8mk`) — 아래 "W1 완료" |
| 5 | WT3b | W6 · T22.5 | 구성원 역할 지정 · 권한 매트릭스 · 기관 설정 | ✅ 2026-09-26 웹 — 아래 "W6 후반 완료" |
| 6 | WT4 ← 다음 | W5 · T21.7 | 세션 설계 목표 시간 **10분 상한**(지금 선택지 10~40분이 확정 상한과 어긋남) · 기관 기본 피할 주제 · 단계 미리보기 | ⏳ |
| 7 | WT6 | W3·W4 일부 · T20.9 | 보호자 `분석`→`대화 관찰 리포트` · 고정 문구 · `session_summary` 미렌더 버그 · 죽은 `'report'` | ⏳ |
| 8 | WT8 | W8 · T24.3 | 어르신 `care_grade` | ⏳ |
| — | WT1 | W7 · T24.1 | 어르신 동의 화면 | ✅ main 병합(2026-09-25) |
| 후속 | — | D11 후속 | `terms_required` DB 필수화 — 운영 웹 배포 확인 뒤(DB 파트) | ⏳ |

#### ✅ 2026-09-26 W6 후반(WT3b) 완료 — 구성원 역할 지정 · 권한 위임 · 기관 설정 (사용자 지시 "남은 테스크 중 다음 테스크 진행해")
main 새 커밋(`894359b` 음성 Gemini 3.8 Live·TTS 전환 · `5b208a7` gitignore — 웹 무관)을 먼저 반영(fast-forward)했다.
사용자 결정: ① 역할 지정 = 구성원 행 **오른쪽 드롭다운**(시안 역할 배지 그대로) · ② 권한표·기관 설정은 관리 역할이 아니어도
**읽기 전용으로 보인다** · ③ 권한표는 체크를 모아 **저장 버튼**으로 한 번에.
- **역할 지정**: 관리 역할(관리자·센터장)에게만, 본인·보호자 행 제외 · 공용 드롭다운 모양(r5·h37.02·글자 16, 초대 코드 카드와 같음)을
  행 오른쪽 818 에 · 고르면 확인창(관리 역할이 되거나 잃으면 무엇이 바뀌는지 명시) → `set_member_role`. 오류 `MEMBER_ROLE_*` 문구는 `lib/orgJoinErrors.ts`.
- **카드5 권한 위임**(`components/org-admin.tsx`): 위임 3종(일지 확정·공개 철회·보호자 연결 승인) × 돌봄팀 4역할 체크 표 · 바뀐 권한만 upsert.
- **카드6 기관 설정**: 시설 유형(정하지 않음/요양원/주간보호) · 목표 시간 5~10분(서버 상한) · 기본 프로그램 유형 · 기본 장소 ·
  기본 피할 주제(쉼표 구분 → 배열, 중복 제거, 최대 30) · **AI 일지 초안 켜짐/꺼짐은 읽기만**(운영자 전용 스위치 — 쓰는 코드가 생기면 `check:design` 실패).
- **data**: `hooks/orgAdmin.ts` — `useOrgCapabilities`(행 없으면 서버 기본 집합) · `useUpdateOrgCapabilities` · `useUpdateOrgSettings` ·
  `useSetMemberRole` · `parseTopicList`(테스트 4). `database.types` 의 `org_settings.Row` 에 `ai_drafts_enabled` 추가(쓰기 타입엔 없음).
- **검증**: 새 흐름 스모크 **`pnpm -F @giokon/web test:org`**(`scripts/org-admin-flow-smoke.mjs` — 비관리 읽기 전용 · 본인 역할 변경 없음 ·
  확인 후 RPC · 바뀐 권한만 한 번 저장 · 설정 저장에 AI 스위치 없음) · 테스트 data 188 · `check:design` 195 · `web:smoke` 67/67 ·
  `test:journal` · `check:figma-web` 1404 / 잉크 761 / 이미지 519 / 사이드바 150 · `check:a11y` 62화면 차단 0(대비 미달 26종·292곳 — 증가 없음).

#### ✅ 2026-09-26 W1 프로그램 일지 화면 완료 (사용자 지시 "프로그램 일지 화면 진행해")
사용자 결정: ① 목록 구조 = **기존 2단계 유지**(어르신 고르기 205:1039 → 어르신별 목록 207:1147, 각 화면 최상단에 "확인 대기 N건") ·
② 상세 = **기존 작성 카드 재사용**(221:283 체계 · 12칸 2열 · 내용/이력 탭) · ③ 이름 변경 = **요양보호사 전체**(사이드바·일지 화면·공개 관리 탭·배지·이력 —
보호자 화면 '오늘의 이야기'는 WT6).
- **목록**: '요양일지' 분류 배지 자리에 상태 칩(생성 중·확인 대기·확정·생성 실패 — 글자 본문색 + 색 점, 대비) · "확인 대기 N건" 버튼(날짜 선택 왼쪽, 누르면 확인 대기만) ·
  실패 행 "다시 생성"(`retry_journal_generation`) · 삭제는 확정 전 수기 일지만(그대로). 어르신 고르기는 검색 줄 오른쪽 "확인 대기 N건"(누르면 대기 있는 어르신만) +
  카드 오른쪽 아래 "대기 n건". 수는 새 훅 **`usePendingJournalCounts`**(data — 상태로 직접 센다, `countByProfile` 테스트).
- **상세**(`ProgramJournalDetailPage` — 수기 작성 `/new` 겸용): 공단 12칸 + 제공 여부·미제공 사유 · 사진 4칸 · 보호자 문장 + 승인 체크(시각은 서버) ·
  확정(권한 없으면 잠금 + 안내) · 확정 후 공단 칸 수정은 사유 필수 · 이력 탭(만든 시각·AI 초안·확정 + 확정 뒤 수정 사유·바뀐 칸) ·
  상태 안내(생성 중/실패+다시 생성/확정/AI 건너뜀 사유). **바꾼 칸만 보낸다** · 생성 중 저장은 상태 불변 · 실패 일지를 사람이 이어 쓰면 확인 대기.
  수기 시작값은 기관 설정(기본 프로그램 유형·장소)과 진행자=본인만(시각·내용은 비움). 'AI 초안' 표시는 워커 4칸에만(DB 에 칸별 출처 없음 — `draft_generated_at` 근거).
- **삭제**: `JournalWritePage`(사진·타이핑·음성 3경로) · `SessionJournalDialog` · core `journal.ts`(`buildJournalDraft`+테스트) · 웹 `lib/stt.ts`(음성 입력 — 기획 삭제 대상) ·
  `report-flow-smoke.mjs` → **`journal-flow-smoke.mjs`**(`pnpm -F @giokon/web test:journal`, 합성 API) 로 대체. `session-report` 함수·data 훅은 앱이 써서 남김.
- **게이트**: `check:design` 193(일지 항목 교체 — 초안 생성·수동 초안·음성 코드가 되살아나면 실패) · Figma 감사에서 작성 화면 3종(221:283·1060·1196) 제거(화면 대체) ·
  공개 관리 배지 폭 107→140 등 7곳 `accept`(이름 변경) · a11y 새 화면 5종 추가(상세 3상태·이력·수기 작성).
- **검증(2026-09-26 실제 실행)**: typecheck·lint · 테스트 core 220 · data 184 · mobile 316 · relay 50 · `check:design` 193 · `check:copy`·`check:bom` ·
  `check:figma-web` 1404 프로브 / 잉크 761 / 이미지 517 / 사이드바 150 통과 · `web:smoke` 67/67 · `check:a11y` 62화면 차단 0(대비 미달 26종·292곳 — 새 화면 추가 없음) ·
  `test:journal` 통과(손댄 뒤 워커가 칸을 채워도 **바꾼 칸만** 보내는지 포함).
- 남은 것: 상세 화면 **Figma 시안이 오면 그 화면만 교체** · 보호자 쪽 이름('오늘의 이야기')·`guardian_text` 전용 렌더 점검은 WT6 · `test:journal` CI 연결은 미정.

#### 2026-09-25 웹 전반 디자인 검토 → D1~D11 수정 (리팩토링 전 선행 · 사용자 지시)
사용자 결정: **기능·디자인 수정과 리팩토링은 같은 PR·작업 단위에 섞지 않는다.** 순서 = D1~D11 수정(이 PR #18) → 깨끗한 상태에서 리팩토링(별도 작업).
리팩토링 방침(사용자 확정): 게이트(`check:design`)가 소스 문자열로 고정한 코드는 **제자리에 두고 같은 파일 안에서만** 정리(A안) ·
범위는 추천안(미사용 제거 · 순수 헬퍼 · 공용 훅 · 동의 로직 한 곳 · `OrgForm`/`AppShell`/`SupervisionPage` 책임 분리) ·
웹에 테스트 러너를 붙이는 것도 **의존성 추가로 본다**(하지 않는다) · W1 이 대체할 일지 화면은 제외.

| # | 문제 | 수정 |
|---|---|---|
| D1 | 동의 관리 버튼이 공용 `Button` 밖 | `Button size="sm"`(동의하기=primary · 동의 철회=danger, 다른 되돌릴 수 없는 동작과 같게) |
| D2 | `SessionJournalDialog` 가 체계 밖(r4·맨 버튼·맨 오류문) | `Button`·r10 입력칸·오류 문구 스타일(W1 에서 대체 예정이지만 그 전까지) |
| D3 | 단독 화면 배경 제각각 | 문의·법률·감독·승인 대기 = `#f8f8f8`(사용자 확정). 배경 위 보조 글자는 대비 위해 `ink-700` |
| D4 | '미동의' 표시가 라디오 모양(누를 수 없는데 컨트롤처럼 보임) | 원형 컨트롤 제거 → 상태 알약만 |
| D5 | 사이드바 '감독' 아이콘 = '세션 기록' 아이콘 | 로그인 화면 눈 글리프를 사이드바 색으로 다시 칠한 `nav-supervision(-on)`(크롭 스크립트 `RECOLOR` — 새로 그리지 않음) |
| D6 | 감독 화면 대비 미달 9종 | **감독 화면만** 보정(사용자 확정): 색 글자 → `ink-900`/`ink-700`, 상태는 색 점, 주황·빨강 버튼 글자 `!text-ink-900`, 초과는 밑줄+스크린리더 문구. 공용 `Button`·시안 화면은 그대로 |
| D7 | 로그인 상태 승인 대기에 공개 헤더 '로그인/회원가입' · 휴대폰에서 잘림 | 승인 대기만 단독 화면 헤더(워드마크→역할별 메인 · 로그아웃). 공개 헤더(시안)는 그대로 |
| D8 | '담당 요청' 승인 알림이 "기관 합류를 승인했어요" | "담당 요청을 승인/거절했어요" |
| D9 | 알림 말투 혼재 | **코드가 띄우는 알림(toast)만** 해요체 + '해 주세요'(사용자 확정). Figma 문구(placeholder 등)·화면 본문·서버 원문은 그대로 |
| D10 | 동의서 링크 표 두 벌(값 불일치) | `lib/consentDocuments.ts` `CONSENT_DOCUMENT_PATH` 하나 |
| D11 | 휴대폰 폭 위기 카드 줄바꿈 | '키워드 기반 안전장치' 를 한 덩어리로 |

검증: typecheck·lint·`check:design` 194·copy·bom·`check:figma-web` 1511 + 잉크 810 + 이미지 565 + 사이드바 150 · 스모크 67/67 ·
`check:a11y` 60화면 차단 0, 대비 미달 **32종·311곳 → 26종·295곳**(감독 화면 0건, 새로 생긴 쌍 없음).

✅ **2026-09-24 해소**: WT2~WT5 가 쓰는 RPC·테이블(`20260924*`)이 **운영에 적용됐다**(위 Supabase 절). 웹은 이제 운영 DB 기준으로 붙여도 된다.

#### 2026-09-25 기관은 운영자만 만든다(A안) + 운영 '선문대학교' 중복 병합
- **원인**: 온보딩이 기관명을 입력할 때마다 기관을 새로 만들었다 → 임성훈(07-27)·박진우(09-21)가 각자 '선문대학교'를 만들어 기관이 둘,
  기관 단위 열람이라 서로의 어르신 기록이 안 보였다(이름 변경 때문이 아니다).
- ✅ **운영 병합(사용자 승인)**: `9516…c6`(박진우) → `9b5f…5d5f`(임성훈) 로 org_id 가 붙은 모든 행을 한 트랜잭션으로 옮기고 빈 기관 삭제.
  복합 FK `(profile_id, org_id)` 가 지연 불가·NO ACTION 이라 부모·자식을 **한 문장(데이터 변경 CTE)** 으로 옮겼다. 결과: 기관 1 ·
  관리자 2(임성훈·박진우 둘 다 org_admin) · 어르신 3 · 세션 3 · 동의 8 · 연대기 3 · 어르신 코드 3 · 담당 3 · 설정·권한표 1벌(둘 다 기본값이었다).
  감사 로그 50행은 이력이라 옛 기관 id 그대로(FK 없음). 저장소 사진 없음. 병합 전부터 `한덕수`(동의 없음)·`ㅁㄴㅇㄻ`(AI 동의 철회)는 세션 불가 상태.
- **A안(사용자 확정)**: 요양보호사는 **초대 코드로만** 가입. 기관은 운영자가 만든다 — `select * from app.provision_org('기관 이름');` →
  `admin_code` 를 기관 담당자에게 전달 → 그 코드로 가입하면 **승인 없이 즉시 org_admin**(1회용). 추가 관리자·만료 재발급은
  `select app.issue_admin_code('<org_id>');`. 두 함수는 anon·authenticated 에 닫혀 있다(SQL 편집기 = postgres). 직원은 지금처럼 기관의
  초대 코드 + 관리자·센터장 승인. 코드 없이·기관명으로 가입하면 `ORG_INVITE_REQUIRED`. 마이그레이션 `20260925100000_org_invite_only`.
  검색해서 고르기(B안)는 **기관 목록 공개 + 코드 없는 합류 경로**가 필요해 보류(기관이 많아지면 재검토).
- ✅ **2026-09-26 운영 적용(사용자 지시)**: `20260925100000_org_invite_only` — MCP 적용 뒤 이력 버전을 파일명으로 정정. 검증: `auto_approve` 컬럼 ·
  `app.provision_org`/`app.issue_admin_code` 는 anon·authenticated 실행 불가 · `complete_onboarding` 에 기관 생성 경로 없음 ·
  `provision_org` 를 트랜잭션 안에서 호출해 기관 + 관리자 코드(10자·org_admin·auto_approve·14일) + 설정 1·권한표 3 시드를 확인한 뒤 **롤백**(운영 기관 1개 그대로).
  **저장소 66 ↔ 운영 67 대조: 저장소에만 있는 버전 0건**, 운영에만 있는 2건은 기존 기록대로(`20260903002002` · `20260921000000_backfill_orphan_auth_users`).
  보안 advisor 새 경고 0(남은 것은 기존 유형 + 앱 세션의 `journal_generation_jobs` 정책 없음 INFO — 워커 전용 테이블).
- ✅ 수정(같은 날): 온보딩 동의 박스 — 시안(15:444)은 동의 **2줄** 기준인데 이용약관 줄(법무)이 더해져 첫 줄이 박스 위 테두리에 붙고,
  소셜 확인 줄의 '처리방침 보기' 링크가 문장 첫 줄에 겹쳤다. 줄을 시안 피치(36.03)로 늘어놓고 **박스 높이·가입 버튼 위치를 줄 수에서 계산**
  (소셜 3줄: 박스 +36.03 · 버튼 1142.03 / 이메일 가입 2줄: 시안 여백 그대로), 링크는 둘째 줄 문장 끝으로(사용자 확정 — 시안과 다름).
  `check:figma-web` 의 해당 7개 프로브는 시안 값을 그대로 두고 `accept`(사유 기록), `check:design` 은 시안 간격 상수를 고정.

#### 2026-09-25 웹 리팩토링(추천안 1~5단계 · D1~D11 병합 뒤 별도 PR)
외부 동작·공개 이름·반환 형식·오류 문구 불변, 의존성 추가 없음, 게이트 고정 코드는 제자리(A안), W1 교체 대상(일지 목록·작성) 제외.
① 미사용 제거(`lib/consents` 구판·`CardHeader/Title/Description`·`react.svg`·역할 라벨 별칭) ② `Y`·`dayKey`·`secondsParts` 한 곳
③ `useElderProfile`(13화면)·`useMarkShareViewedOnce`·`serverErrorMessage`·`useMyNameForm` ④ 동의 판정·저장 입력 `lib/consents`
⑤ `AppShell` 훅 3개 · `SupervisionPage` `SessionCard` · `OrgForm` 승인 대기 훅 2개.
검증(단계마다): 게이트 수치 불변 + **렌더 DOM 66화면이 리팩토링 전과 동일** + 클릭 시나리오 30상태를 리팩토링 전 빌드와 비교해 동일.
하지 않은 것: `stamp()` 두 벌(출력이 서로 다름) · 랜딩 원본 PNG 2장(크롭 스크립트 산출물) · 기관 관리 카드 컴포넌트화(좌표가 카드 사이에 이어짐).
✅ ~~발견한 버그~~ **2026-09-25 수정**: 기관 관리 초대 코드 '복사'가 `navigator.clipboard` 없는 환경에서 알림 없이 예외만 나던 것 →
async + try/catch 로 실패 알림(어르신 코드 복사와 같은 방식). 같은 PR 에서 **직원 초대 코드의 역할·기간 드롭다운을 공용 드롭다운 모양**
(일지 날짜 칸·분석 기간 칸: r5 · 1px line · h37.02 · 라벨 16/23 ink-500 · 화살표 12×7.81 오른쪽 26 · 투명 네이티브 select)으로 맞췄다(사용자 요청).

### 09-23 웹 전수 점검에서 넘어온 열린 항목
① `apps/web/supabase/config.toml`(`project_id="web"`) 삭제 여부 — 사용자 결정 · ② ~~LLM 일지 흐름 자동 회귀 없음~~ ✅ 2026-09-26 W1 이
`journal-flow-smoke.mjs`(`test:journal`, chromium 경로 지원)로 대체 · ③ `test:auth` 원격 실행 불가(`executablePath` 미지정) ·
④ 사용자 판단 대기: 휴지통 @3x/@4x 재추출 · `TimeField` 5분 단위 · 대비 미달 26종·295곳(2026-09-25, 60화면) · `naver-auth` 재배포(도메인 구매 후).

## 현재 위치 — 앱·DB (2026-09-24 — 운영 마이그레이션 적용)

> 사용자 지시: "적용되지 않은 마이그레이션 확인 → 적용해야 하는 것 전부 적용 → 나머지 개발". 운영 DB 쓰기 **사용자 승인 하에** 진행.

- ✅ 운영(`ufkbzpdjomtmxjipmwub`)에 **8건 적용**: `20260919175923_transcript_provenance` → `20260924000000`(enum 단독) → `010000` → `020000` → `030000` → `040000` → `050000` → `060000`(신규 — advisor 가 잡은 search_path).
  CLI·DB 비밀번호가 컨테이너에 없어 MCP `apply_migration` 으로 한 건씩 적용하고(`begin;`/`commit;` 은 빼고 — MCP 가 트랜잭션으로 감싼다) **매번 이력 버전을 파일명으로 정정**했다.
- 검증: 이력 ↔ 저장소 "저장소에만 있는 버전" 0건 · RPC 9종·`complete_onboarding` 오버로드 1개(새 시그니처) · FK validated · realtime 에 `session_interventions` · `push_tokens` 직접 INSERT 권한 없음 · anon 이 `session_tick` 불가 · 기관 2곳 설정·권한표 시드(2·6행).
- ⚠️ **이제 운영 순서의 다음은 중계 배포**다(DB 가 먼저 들어갔으므로 새 중계를 올려도 된다). 구 중계는 `can_process_session` 을 계속 쓰므로 그대로 둬도 동작한다 — 단계·원격 제어만 없다.
- 전사 출처 v1 이 운영에 들어가 **앱 자동 대화의 저장 계약 전제(`getTranscriptStorageVersion() === 1`)가 운영에서 참**이 됐다.

### 이어서 — D5 프로그램 일지(사용자 지시 "나머지 개발", 결정: **계획대로 DROP + 웹이 깨지지 않게 웹 파일까지 수정 + 검증 통과 시 바로 운영 적용**)

- ✅ `20260924070000_program_journals.sql` **운영 적용**(운영 일지·사진·공개·파일 0건 확인 후). T20.1·T20.2 + T20.3·T20.4(core).
  · 확정 가드: 사람(auth.uid) + `journal_finalize` 위임 + 진행자(같은 기관 돌봄팀) + 활동 내용 · 확정 불가역 · 확정자 서버 스탬프.
  · 확정 후 공단 칸 수정 = 위임 + **사유(edit_reason) 필수** → `program_journal_revisions`(누가·왜·무엇 from/to). 사유는 행에 남지 않는다.
  · 워커 칸(generating/failed·시도·오류)은 클라이언트 불가 · 보호자 문장 승인자·시각 서버 스탬프, 문장이 바뀌면 승인 해제.
  · 세션 ended → `generating` 일지 + `journal_generation_jobs`(진행자 = 세션 시작자, tool_used "AI 대화 프로그램 보조"). 세션 일지는 삭제 불가.
  · 공개 게이트: 일지 = 확정 + 보호자 문장 승인 · 사진 = 확정 일지. 보호자는 표를 못 읽고 **RPC 로 보호자 문장만**(계획 W4 를 DB 로 집행).
  · 회귀: `pilot_access.sql` D5 블록 + `rls_regression.sql` 5.9·5.10 이관(보호자 문장 승인 해제 시 보호자에게서 사라짐 포함). 가드 제거 변형 **13종 모두 실패** 확인.
- 웹(앱 세션이 사용자 지시로 수정): 기존 요양일지 화면을 **같은 시안 그대로** 새 표에 연결(상세는 `apps/web/AGENTS.md` §3). Figma 게이트 전부 기준선 유지.
  `check-web-design.mjs` 는 **칸 이름 정규식 3개만** 새 이름으로(Figma 실측 규칙은 그대로). ⚠️ **운영 웹은 이 PR 머지·재배포 전까지 일지 화면이 실패한다**(옛 표를 부른다).
- core: `generated-session` 선택 섹션(participantResponse·opinion·guardianText — 배포된 `session-report` 캐시와 호환) + 금지어(인지 저하·우울·정서 불안·진료 권유). `program-journal.ts`(매핑·칸 단위 차단·보호자 문장).
- ~~⏳ 남은 것(서버 파트): C4 워커 · T20.5~~ → ✅ 아래 "C4 일지 초안 자동 생성".

### 이어서 — C4 일지 초안 자동 생성(2026-09-25, T20.5·T20.6 · 사용자 결정 1-C · 2-A · 기관 스위치는 **아직 켜지 않음**)

> 사용자 확정: **"초안 생성" 버튼은 필요 없다 — 대화가 끝나자마자 AI 가 초안을 만든다.** 계획의 흐름(세션 종료 트리거 → 워커)과 같다.
> 사람이 누르는 것은 **failed 일지의 "다시 생성"**(복구) 하나 — 웹 WT7 이 지킬 규칙은 `apps/web/AGENTS.md` §3 "일지 초안은 자동".

- ✅ 운영 적용 `20260925000000_journal_draft_worker.sql`(pg_cron 1.6.4·pg_net 0.20.4 설치 포함 · 이력 버전 정정):
  · `org_settings.ai_drafts_enabled` — 기관별 AI 초안 스위치(기본 꺼짐). **플랫폼 운영자만** 켠다 — 클라이언트는 기관 관리자라도 못 바꾼다(트리거).
    켜기: `update public.org_settings set ai_drafts_enabled = true where org_id = '<기관>';` — ⚠️ **운영 2곳 모두 꺼짐**(사용자 지시 "켜지 마").
  · 세션 종료 트리거 분기: 꺼진 기관 → 작업 없이 바로 `pending_review`(빈 초안 = 직접 작성).
  · 워커 RPC `claim/finish/fail_journal_generation*` — service_role 전용 + DB 가 만든 워커 비밀값(`app.worker_config`, API 비노출). 백오프 30s·1m·2m·4m·5m ·
    6회째 failed · 5분 멈춘 작업 회수 · 잡을 때 재확인(사람이 이미 확인 / AI 꺼짐 / **처리 동의 없음 → AI 로 안 보냄**) · 사람이 먼저 쓴 칸 보존 · 확정은 여전히 사람만.
  · `app.kick_journal_worker()` + cron `program-journal-draft` 30초 — 할 일이 있을 때만 pg_net 호출. 운영 `worker_config.endpoint` 설정 완료.
- ✅ Edge: `_shared/report-generation.ts`(생성 공용) · `session-report` v6(허용목록 폐기 → 기관 스위치, 기록 읽기 전 403) ·
  `program-journal-draft` v1(verify_jwt=false — 비밀값 인증, 202 + `EdgeRuntime.waitUntil`). 운영에서 pg_net 으로 호출해 **틀린/없는 비밀값 401 · DB 비밀값 202** 확인.
  Deno 가 확장자 없는 import 를 못 읽어 core `program-journal.ts` 의 import 에 `.ts` + core·mobile·relay tsconfig `allowImportingTsExtensions`(모두 noEmit).
- 검증: `supabase/tests/journal_worker.sql`(CI·`run-rls-regression.sh` 에 추가) — 변형 **14종 모두 검출** · 워커/진입점 단위 테스트 · 전체 게이트.
  테스트 core 224 · data 183 · mobile 316 · relay 50. 보안 advisor 새 지적 없음.
- ⏳ 남은 것: ① **기관 스위치 켜기**(사용자 결정 후) → 실제 Gemini 종단(대화 종료 → 초안) 확인 · ② 운영 Edge 시크릿 `REPORT_ALLOWED_USER_IDS` 는 더 읽지 않는다(지워도 됨, 사용자 대시보드) ·
  ③ 웹 WT7 — 수동 초안 버튼 2개 삭제 · 상태별 화면 · "다시 생성"=failed 전용 · ④ C4 나머지: `live-token` 중계 전용화(T23.5) · `push-dispatch`(T21.9).

### 이어서 — 앱 리팩토링(2026-09-25 사용자 지시, **외부 동작·공개 이름·반환 형식·오류 메시지 불변 · 의존성 추가 없음**)

- 결정: 범위 = `apps/mobile` 만 · 아무도 안 쓰는 export/파일은 제거 · Figma 게이트가 파일 경로로 고정한 문구는 **제자리 유지**(규칙 경로 안 바꿈) ·
  **비동기 핵심(`src/lib/live/*` — 연결·엔진·자동 대화·재생)은 대상에서 제외**(사용자 명시).
- 단계: 1 죽은 코드 제거 → 2 중복 통합(시간 포맷 `hhmm`/`hhmmLabel`, `social.ts` 내부 헬퍼) → 3 `Talk` 책임 분리(같은 파일 안) → 4 나머지 화면.
- ✅ 1단계: `components/ui.tsx`·`AppHeader.tsx`·`decor.tsx`(import 0) 삭제, 사용처 0 인 `RADIUS`·`hasWebUrl`·`ToneBar` 삭제,
  파일 안에서만 쓰는 값 export 9개에서 `export` 만 제거. 타입 export 는 공개 함수 시그니처를 설명하므로 유지. 게이트에 이름이 박힌
  `MAX`·`FORM`·`HEADER_TABS_H` 는 손대지 않음. 검증: typecheck·lint·test 264·check:figma 174·copy·font·bom·design·Android export.
- ✅ 2단계: 같은 시각 포맷 두 벌(`log/[id]` 의 `hhmm` · `analysis/[logId]` 의 `hhmmLabel`) → `src/lib/format.ts` `clockLabel` 하나 + 경계 테스트.
  `social.ts` 는 로그인 동시 실행 가드(`singleFlight`)·브라우저 열기와 콜백 주소 검증(`openAuthCallback`)·토큰 세션 설정(`setSessionFromTokens`)을
  내부 헬퍼로 모음. 공개 함수 2개·`SocialResult`·오류 문구·검사 순서 그대로. 네이버 콜백 주소·성공 URL 없음 특성 테스트 추가(원본 코드에서도 통과 확인,
  헬퍼 변형 시 실패 확인). test 270.
- ✅ 3단계: `session/talk.tsx` `Talk`(309줄·분기 30 → 209줄·분기 18). 같은 파일 안에서 뒤로가기 차단(`useBlockBackInElderMode`)·부분 전사 초안
  (`useRecoveredDraft`)·저장 결과 알림(`createSaveResultPresenter`)·부분 전사 패널(`RecoveredInputPanel`)로 분리 — Figma 고정 문구는 talk.tsx 에 그대로.
  두 번 쓰던 멈추기 버튼 비활성 조건과 인라인 상태 문구표는 `src/features/session/caregiverStatus.ts`(`elderStatus.ts` 와 같은 자리)로 옮기고 테스트
  (원격 일시정지는 현장 재개 불가 포함). 문구 8개 원본과 동일 확인. test 277.
- ✅ 4단계(화면 파생 계산 → `src/features/*` 순수 함수 + 테스트, Figma 고정 문구는 화면에 그대로):
  · `profile/profileSubmit` — register·chronicle 의 폼→저장 필드 변환 공유, 연대기 삭제/수정/추가를 계획(`planChronicleSync`)·실행으로 분리(chronicle onSubmit 분기 21 → 4).
  · `observations/summary`(축 정렬·평균 변화·등급·문장) · `analysis/traits`(시간·집중도·표현·길이·요약 불릿) · `analysis/topicStats`(언급·활발 응답률·평균 시간·키워드)
    — `analysis/[logId]` 에 게이트가 고정한 `assessEngagement` 분포는 같은 파일 `engagementShares` 로.
  · `settings/useManagedElders` — settings/index·elders 에 두 벌 있던 목록·기관·삭제 확인 공유. Settings 는 같은 파일 섹션 컴포넌트 4개로(JSX 원본과 공백 제외 동일 확인).
  · `consent/subject` — 대리 동의 성함·관계 필수 규칙(DB `consents_guardian_check`).
  · 결과: Observations 분기 27→15 · SingleAnalysis 15→8 · Topics 13→10 · ConsentSubject 13→9. test 316. **`src/lib/live/*` 는 한 줄도 바꾸지 않았다**(타입 import 만).

## 이전 위치 (2026-09-24 — M6 푸시 토큰: D7 → M6)

> PR #14(A1~A5·B1~B9) 머지 뒤, 사용자 지시 "다음 테스크" = 남은 유일한 앱 테스크 **M6**. 선행 D7 을 같은 방식(로컬 검증만)으로 함께 했다.
> 브랜치는 머지된 이력 위에서 main 으로 다시 시작했다(같은 이름).

| # | 계획·tasks | 내용 | 상태 |
|---|---|---|---|
| C1 | D7 · T21.8 | `20260924050000_push_tokens.sql` — `push_tokens` + `register_push_token`·`revoke_push_token` + `notifications.pushed_at` | ✅ 로컬 — 쓰기는 RPC 전용: 교대 근무로 **기기를 이어 쓰면 토큰 주인이 옮겨 가야** 앞사람 알림이 뒷사람 기기로 가지 않는데, 본인 전용 RLS 로는 남의 행을 옮길 수 없다. 돌봄팀만 등록(보호자 거부). `pushed_at` 은 R012 신원 가드에 추가(사용자가 재발송·억제 불가, 읽음 처리는 유지). 회귀 변형 4종 실패 확인 |
| C2 | M6 · T21.10 | 앱 `src/lib/push.ts` — 돌봄팀 로그인 시 권한→Expo 토큰→등록, 로그아웃 **전** 회수(최대 3초, 실패해도 로그아웃) | ✅ — 등록·회수를 한 줄로 직렬화(회수가 진행 중 등록을 앞지르지 않게). 거부·시뮬레이터·실패는 앱 사용을 막지 않는다. ⚠️ `expo-notifications` 네이티브 모듈 → **EAS 재빌드 필요**. 알림 탭 딥링크는 발송 문구(C4) 확정 후 |

- ⚠️ `pnpm add expo-notifications` 가 lockfile 의 eslint·vite peer(jiti 1.x/2.x) 배정을 앱↔웹 사이에서 맞바꿨다. `--frozen-lockfile`·웹 빌드·린트·`expo export` 통과로 확인하고 그대로 둔다.
- 범위 밖(서버 파트): C4 `push-dispatch`(Expo Push 발송 — `pushed_at is null` 소비, 본문에 어르신 성함·발화 금지, 발송 시 수신자 역할·기관 재확인) · D2 `notification_kind` 확장 · T21.4.

## 이전 위치 (2026-09-24 — M5 선행 경로: 권한 재설계 → 대화 단계 → 중계 → 앱)

> 앱 테스크 A1~A5 완료 후, 남은 앱 테스크(M5·M6)가 전부 DB·중계 선행을 요구해 **사용자가 범위를 넓혔다**(2026-09-24):
> **"M5 까지 가는 길"** — 웹 화면은 건드리지 않는다. 마이그레이션은 **로컬 PG16 회귀로만 검증하고 운영 DB 에 적용하지 않는다**(적용은 한 건씩 별도 요청).
>
> ✅ **B1~B9 전부 완료(2026-09-24)** — M5 까지 닿았다. ✅ **마이그레이션은 같은 날 운영 적용**(Supabase 절). 남은 운영 반영 = 중계 배포 → 앱 빌드.
> 운영 순서 = 마이그레이션(한 건씩, 사용자 요청 시) → `database.types` 대조 → **중계 배포**(역순이면 `session_tick` 부재로 전 세션 차단) → 앱 빌드.
> 남은 앱 테스크: M6(푸시 토큰 — D7·C4 대기). 남은 선행 후보(범위 밖, 요청 시): T21.4 위기 이벤트 즉시 기록 · T21.11 · T21.12 · 웹 W2 감독 화면.

- **사용자 결정(2026-09-24)**: ① **INSERT 권한** — 대화 기록(sessions·session_logs·session_analyses·safety_events)·연대기(chronicle_entries) INSERT 와
  대화 처리 권한(`can_process_profile`·`reserve_live_token`)을 **같은 기관 돌봄팀 전원**으로 연다(교대 근무자도 대화 진행).
  **동의(consents)·보호자 공개(guardian_shares) INSERT 는 배정·관리자 기준 유지**(민감). DELETE 는 계획대로 배정·관리자 유지.
  계획 D4 는 SELECT/UPDATE 만 적었고 INSERT 는 비어 있었다 — "배정은 접근 게이트가 아니다"(계획 D3) 와 맞춘 결정이다.
  ② **사회복지사·센터장도 세션을 진행**할 수 있다(돌봄팀 전원).

| # | 계획·tasks | 내용 | 상태 |
|---|---|---|---|
| B1 | D1 · T22.1 | `org_role` += `social_worker`·`center_director`(단독 파일) | ✅ 로컬 |
| B2 | D3 · T22.2 | `org_settings`·`org_capabilities`·시드·`app.has_capability`·`set_member_role` | ✅ 로컬 — `is_care_team`·`is_org_manager` 헬퍼도 여기서(새 정책이 씀). 회귀는 변형 2종(자기 자신·마지막 관리자 가드 제거)이 실패하는 것 확인 |
| B3 | D3 · T22.7 | 직원 합류: `org_invites`·`org_join_requests`·온보딩 합류 경로·`approve_org_join`(UI 는 웹 W9·W6 — 범위 밖) | ✅ 로컬 — 합류 대기자 = `onboarded_at` 있음·`org_id` NULL. 웹 라우팅 인계는 계획 §7 W9 상태 열 |
| B4 | D4 · T22.3·T22.6 | `app.is_care_team` + RLS 기관 단위 전환(위 결정 ① 포함) + 회귀 단언 | ✅ 로컬 — ⚠️ `chronicle_entries` 복합 FK 부재로 타 기관 기록이 가능했던 구멍을 회귀가 잡아 FK 추가. 기존 `rls_regression.sql` 은 단언 2건만 새 모델로 바꿨다(요양보호사 = 같은 기관 전체 열람 · 미배정도 live-token 허용) |
| B5 | §11-8 · T22.4 | `= 'caregiver'` 비교 전수 치환(SQL·앱·data·중계. 웹 발견분은 목록만 남김) | ✅ — SQL 에 남은 `'caregiver'`·배정 술어는 의도(역할 목록·DELETE·동의·공개·어르신 코드·메시지). 앱 접근 감시(R008)가 **배정 소실을 권한 상실로 보고 대화를 끊던 것**을 제거(DB 판정은 유지). data `completeOnboarding({ inviteCode })`. 웹 발견분은 계획 §7 W6·W9 |
| B6 | D6 · T21.1·T21.13 | `session_phase`·`sessions` 7컬럼·`session_interventions`·`session_tick`·`advance_session_phase`·`request_session_control` + 감독자당 동시 4대 | ✅ 로컬 — 새 컬럼 RPC 전용(트리거) · 4대 제한은 **최근 30분 시작분만** 셈(좀비 방지) · 앱은 `SESSION_SUPERVISOR_LIMIT` 이면 이유 안내(재시도 안 함). 회귀가 `end_requested` 가 NULL 로 나가던 것을 잡음 |
| B7 | C2 · T21.2 | core `session-phase.ts` + `PROMPT_VERSION` 저장 | ✅ — `PROMPT_VERSION` v2.0(단계·내부 지시 규칙). `buildSystemPrompt` 의 phase 인자는 두지 않음(지시문 주입과 중복) |
| B8 | C3 · T21.3 | 중계: 2초 폴 → `session_tick` · 단계 지시 주입 · 원격 제어 처리 | ✅ — 지시는 모델 생성·재생 대기·발화 중이면 미루고 **턴 사이에만** 넣는다. 단계 턴 수는 음성이 실제 전달된 발화만 셈. 원격 제어 알림 뒤 입력·출력 전달 중단 → 2초 유예 뒤 닫기. 앱 오프너 지시문은 단계 중립으로(도입 지시와 충돌하던 것). ⚠️ **배포 순서: DB 마이그레이션(`20260924040000`) → 중계** — 역순이면 `session_tick` 부재로 전 세션 차단. 범위 밖(별도): T21.4 안전 이벤트 즉시 기록 · T21.11 휴식 요청 → 마무리 전환 · T21.12 중계 수명 25→10분 |
| B9 | M5 · T21.6 | 앱 원격 일시정지 수신("잠시 쉬어요" + 마이크 중단) | ✅ — `relayControl` 을 오류가 아닌 원격 제어로 받는다(인증 시점에 이미 정지된 세션 포함, 뒤따르는 끊김은 오류 안내 없음). 마이크·연결은 **동기로** 닫힌다. 멈춘 동안(원격·현장 공통) 2초마다 `session_tick`(data `getSessionControl`) — 원격 정지만 서버 재개 시 **자동으로 이어가고**(재개 경로 = 새 중계 연결 + 복구 맥락), 현장 정지는 저절로 풀지 않는다. **사용자 결정: 원격 정지는 현장에서 풀 수 없다**(재개 버튼 비활성 "감독 화면 재개 대기"). 원격 종료 → 멈춤(요양보호사가 저장 — 앱이 자동 저장하지 않는다). 한계: 정지 순간 말씀 중이던 부분 전사는 기존 규칙대로 확인 대기가 되어 자동 재개되지 않는다(요양보호사 확인 필요) |

- ⚠️ **회귀 작성 함정(2026-09-24 발견)**: RPC 인자 안에서 `(select id from <RLS 테이블> ...)` 로 조회하면 그 시점 `test.uid` 가 비어 있어
  **NULL 이 들어가고, 구현과 무관하게 "없음" 오류로 단언이 통과한다.** 대상 id 는 슈퍼유저로 임시 테이블에 먼저 뽑아 쓴다.
  새 단언은 **가드를 지운 변형이 실패하는지** 확인한다(B2·B3 에서 변형 4종 확인 — 1건은 이 함정 때문에 처음엔 통과했다).
- 로컬 검증 도구: `bash supabase/tests/run-rls-regression.sh`(PG16 실기동, 전 마이그레이션 적용 → `rls_regression.sql`) — 이 컨테이너에서 4초.

## 이전 위치 (2026-09-24 — 앱 파트 착수)

> 이 세션은 **앱 파트만** 맡는다(사용자 지시). 작업 브랜치 `claude/app-development-session-4cvhm5`, 테스크별 커밋.
> 기준선(착수 전 실행): typecheck 6패키지 · test **631**(core 253 + data 141 + voice-relay 43 + mobile 194).

**앱 테스크 분해(사용자 확정 2026-09-24)** — 계획 §6 기준. 진행 순서 = 표 순서.

| # | 계획·tasks | 내용 | 상태 |
|---|---|---|---|
| A1 | M7 · T20.7 | 폴백 저장 `persistWholeSession` 순서: `active` 생성 → 턴 → 분석 → 이벤트 → `ended` | ✅ |
| A2 | M1 · T23.2 | 직접 Gemini Live 모드 제거(`RELAY_MODE` 분기·`fetchLiveToken`·직접 재접속·기기 TTS 폴백·`/session/loading`) + `EXPO_PUBLIC_VOICE_RELAY_URL` 필수화·`.env.example` | ✅ |
| A3 | C1 · T23.1 | core 정리 — `ai.ts`·`voice-flow.ts`·`RESPONSE_JSON_SCHEMA` 삭제, `respondToUserTurn`→`evaluateUserTurn`. 안전 계층 유지 | ✅ |
| A4 | M2+M3 · T23.3 | 어르신 표시 모드 `elder.tsx` 분리 + 어르신 화면에서 요양보호사 UI 제거(위기 안내는 요양보호사 화면으로 이동) | ✅ |
| A5 | M4 · T23.4 | 복귀 게이트 = **PIN**(`expo-secure-store`) | ✅ |

- **사용자 결정(2026-09-24)**: ① `buildJournalDraft` 는 **남긴다** — 웹 `JournalWritePage.tsx` 가 아직 쓴다. 웹 W1 이 그 화면을 대체할 때 지운다(✅ 2026-09-26 W1 에서 삭제).
  앱 파트는 웹 파일을 건드리지 않는다 · ② **M5(원격 제어 수신)·M6(푸시 토큰)은 보류** — D6/C3·D7 이 끝난 뒤 착수한다(가정 계약으로 먼저 만들지 않는다. → M5 는 B1~B9 로 완료, M6 은 여전히 D7 대기) ·
  ③ 복귀 게이트 = **PIN** · ④ **T23.5 `live-token` 중계 전용화는 서버 파트**에 둔다(앱은 직접 호출 코드 삭제까지만).
- ✅ **A1 완료**: 폴백 저장이 `active` 로 만들고 턴·분석·안전 이벤트를 쓴 뒤 종료 필드(status·ended_at·duration_seconds)만
  update 한다 — 동의 가드의 종료 예외와 같은 모양이라 철회 직후에도 닫힌다. ⚠️ `safety_events.session_id` 는 `on delete set null` 이라
  롤백으로 지워지지 않는다 → 이벤트는 쓰기 단계 **맨 뒤**(재시도 시 중복 방지). 회귀 2건 추가(옛 코드에서 순서 단언 실패 확인) ·
  mobile 196 · typecheck/lint · bom/copy/font/figma 통과. 운영 DB·실기기 검증 없음.
- ✅ **A2 완료**(직접 모드 제거): `engine.ts`·`client.ts` 중계 전용(토큰 발급·`DEFAULT_MODEL`·직접 재접속·1.6초 무음 타이머 삭제) ·
  `talk.tsx` 직접 경로·마이크 버튼·다시 듣기·`/session/loading` 삭제 · store `captureUtterance`·`confirmUtterance` 삭제 ·
  **`expo-speech` 의존성 삭제**(lockfile 은 해당 12줄만 수작업 제거 — `pnpm remove` 가 mobile↔web 의 jiti/typescript peer 해석을
  뒤섞어서 되돌렸다. `--frozen-lockfile` 통과) · 시작 화면에서 중계 주소 없으면 DB 세션 생성 전 차단 · `.env.example` 필수 3/3.
  `check:figma` 에서 삭제한 화면의 규칙 제거(170항목). mobile 212 · 전 패키지 typecheck/lint/test · bom/copy/font/figma/design 통과.
  - ⚠️ **발견·수정: RN 내장 `URL` 은 `wss://` 의 `pathname` 을 못 읽는다**(`Libraries/Blob/URL.js` 가 `https?://` 만 파싱 → 항상 `'/'`,
    생성자가 끝에 `/` 추가). 기존 `client.ts` 의 `pathname !== '/voice'` 검사는 **실기기에서 모든 중계 주소를 거절**했을 것이다
    (Node 테스트는 WHATWG URL 이라 통과). → `relay-config.ts` 정규식 판정으로 교체 + RN 형 URL 을 흉내 낸 회귀 테스트.
    실기기 확인은 하지 않았다.
  - 앱이 보내는 `setup` 은 이제 **빈 객체**다 — 중계가 모델·지시문을 서버 값으로 대체하고(`relay.ts:181`) 존재만 확인한다.
    어르신 연대기로 만든 시스템 프롬프트를 앱이 네트워크로 보내던 것이 없어졌다.
  - T24.5 의 앱 쪽(`engine.ts` `DEFAULT_MODEL`·`client.ts` 3.1 설계 주석)은 함께 사라졌다. 남은 것은 `live-token/index.ts` 폴백(서버 파트).
  - ℹ️ `EXPO_PUBLIC_LIVE_TOKEN_URL` 은 이름과 달리 **네이버 로그인 함수 주소 파생**에만 쓰인다(`social.ts:105`). 앱 파트 범위 밖이라 그대로 두고
    `.env.example` 설명만 실제 동작으로 고쳤다.
- ✅ **A3 완료**(core 정리): `ai.ts`(779줄)·`voice-flow.ts`·테스트·`RESPONSE_JSON_SCHEMA` 삭제. `conversation.ts` 는 안전 평가 전용
  `evaluateUserTurn(history, text)` 만 남겼다(평가·세션 권고·알림·이벤트 — `openConversation`·`respondToUserTurn` 삭제).
  `safety.ts`·`buildJournalDraft`·`buildSystemPrompt`(시그니처 포함, 중계가 씀) 무변경. 웹 `lib/ai.ts` 는 `export *` 라 손대지 않아도 된다.
  - **세션은 빈 기록으로 시작한다** — 예전에는 로컬 규칙 오프너(`generateOpener`)가 첫 AI 턴으로 저장되고 중계 인사가 오면 덮어썼다.
    이제 중계 인사가 출력 가드를 통과하면 `acceptOpener` 가 첫 AI 턴으로 추가한다. 그전 카드에는 회색 안내 문구(기록 아님)·`currentTopic=null`.
  - 회귀 방지: 인사 도착 전 "잠시 멈추기" → 재개 시 턴이 0개라 거절되던 경로를 **인사 재요청**으로 처리(테스트: 수정 전 실패 확인).
  - 직접 모드 잔재 `playback.ts`(원음 캐시) 삭제 — 같은 불변식(막힌 출력은 채택·재생 안 함)을 `check:figma` 가 중계 컨트롤러에서 검사하도록 규칙 이동(171항목).
  - core test 253→201(삭제된 생성기·voice-flow 테스트분). 세션 시뮬레이션은 **안전 불변식**(위기·중단·학대·혼란·오탐 없음)만 남겼다.
    전 패키지 typecheck/lint/test · 웹 build · bom/copy/font/figma/design 통과. mobile 212.

- ✅ **A5·A4 완료**(순서를 바꿔 PIN 부품을 먼저 커밋 — 커밋 사이에 "PIN 없이 나갈 수 있는 어르신 화면"이 생기지 않게).
  - **사용자 결정(2026-09-24)**: 시작과 동시에 어르신 화면으로 전환 · 복귀는 구석의 작은 '선생님' 버튼 → PIN ·
    PIN 은 처음 넘길 때 정하고 설정 메뉴에서 바꾼다 · 첫 사용 튜토리얼은 이번 범위 밖.
  - PIN(`src/features/session/caregiverPin.ts`): 4자리, `expo-secure-store` 에 **요양보호사(user id)별**, 서버 미전송,
    저장소를 못 읽으면 불통과, 5회 연속 실패 시 30초 잠금(프로세스 메모리). 설정 화면 맨 아래 "어르신 화면 > 요양보호사 PIN" 행.
  - 어르신 표시 모드는 **별도 라우트가 아니라 `talk.tsx` 안의 모드 전환**이다(계획은 `elder.tsx` 라우트였다) — 자동 대화 컨트롤러를
    한 화면이 계속 소유해야 연결·마이크 수명이 갈라지지 않는다. 화면은 `src/features/session/ElderView.tsx`,
    질문 카드는 공용 `QuestionCard.tsx`, 어르신 문구는 `elderStatus.ts`(단계별 고정 — 컨트롤러 사유 문구·전화번호 금지, 테스트).
  - 어르신 화면에 없는 것(계획 M3): 위기 배너·전화번호·부분 전사 패널·중계 제어·X. `check:figma` 에 **부재 규칙** 추가(174항목).
    마이크는 누를 수 없는 표시(`MicIndicator`)로 바꾸고 안 쓰게 된 `MicButton` 삭제.
  - 어르신 모드에서 안드로이드 뒤로가기(`BackHandler`)·iOS 스와이프(`gestureEnabled:false`) 차단. 마이크 권한은 넘기기 **전**에 확인한다
    (OS 권한 창이 어르신 화면 위에 뜨지 않게). 진행 중 요양보호사 화면 좌상단 "어르신 화면으로"로 다시 넘길 수 있다.
  - 검증: mobile 223 · typecheck/lint · bom/copy/font/figma · **Android·iOS JS 번들(expo export) 성공**. 실기기 확인은 하지 않았다.
  - ⚠️ 남은 한계: ① 어르신 모드 중 권한·동의 상실로 세션이 끊기면 기존대로 `/main` 으로 이동해 **PIN 없이 요양보호사 화면이 보인다**
    ② PIN 을 잊으면 앱을 완전히 종료(세션이 멈춘다) 후 설정에서 새로 정해야 한다 ③ 어르신 화면이 멈춰도 멀리 있는 요양보호사에게
    알릴 길은 푸시(M6, 보류)·감독 화면(W2)이 생겨야 생긴다.
## 이전 위치 (2026-09-24 — 결정 4건 반영 · docs 정리)

- ✅ **사용자 결정(2026-09-24)**: ① 신규 화면은 **기존 디자인과 최대한 같게** 최소 구현, 시안이 오면 교체 ·
  ② 종료 정책 **권장안** — 휴식 요청·거부는 마무리 전환, 위기·급성 고통은 즉시 종료 유지 ·
  ③ **세션 1회 최대 10분**(어르신 1명 기준, 서버 고정) · **요양보호사 1명당 동시 최대 4대** ·
  ④ **태블릿 지원** — `apps/mobile/app.json` `ios.supportsTablet: true` 로 변경(세로 고정 유지). 배포 직전 재확인 D 는 닫혔고 **C(주황 대비)만 남는다**.
  구현 항목은 tasks T21.11~T21.14 · 계획 §2·§6·§9.
- 📚 **docs 정리**: 합친 것 — `tech.md`→`structure.md` §5 · `infrastructure.md`→`security.md` "인프라" ·
  `web-launch`·`app-release-remaining`·`app-release-plan`·`go-live-external-setup`→**`plans/launch-checklist.md`** ·
  `p0-fixes`·`p1-remediation-progress`·`seoul-region-migration`→**`runbooks/security-fixes.md`** ·
  `transcript-storage-rollout`·`playback-storage-contract`→`database.md` "대화 기록 저장 계약" · `interview-findings`→`product.md` §9.
  삭제 — `business-plan-development-delta` · `non-db-development-backlog` · `mvp-roadmap` · `app-readiness-report` ·
  `demo-recording-readiness` · `demo-llm-implementation` · `mobile-live-data-wiring` · `automatic-conversation-execution` ·
  `voice-development-tasks`. `requirements`·`design`·`product`·`structure`·`tasks` 는 2026-06 MVP 본문을 걷어 내고 현재 기준만 남겼다.
  ⚠️ **아래 "이전 위치" 기록에 나오는 문서 이름은 위 대응표로 찾는다**(원문은 git 이력).
- 🆕 `docs/new-hire/` — 새로 합류한 사람용 쉬운 설명(프로젝트 소개 · 지금 진행 상황 · 파트별 남은 일).

## 현재 위치 (2026-09-23 — 기획 변경 반영, 문서 재작성)

- 📋 **기획 변경 설명서를 받아 전체 계획을 다시 세웠다** → `docs/plans/pilot-development-plan.md`.
  DB·앱·웹·연동 4파트 + 파일럿 범위. 이 문서가 "무엇을 만들지"의 SoT 다.
- **파일럿 범위 확정**: 프로그램 일지 자동생성 · 분석→일지 매핑 · 감독 화면 · 안전 이벤트 푸시 ·
  대화 정책 체계화 · 권한 재설계 · 고령자 UI. 시설은 **요양원 + 주간보호** 둘 다, 1기관 동시 2~4대.
- **탐색에서 드러난 결정적 사실 넷**(계획 §3 상세):
  ① **권한 모델이 기획서와 정반대다** — 기획서는 기관 단위를 요구하는데 현재는 9테이블이
  요양보호사별 배정 격리다(`20260722100000`). 사회복지사·센터장 역할도 없다. **모든 것의 선행.**
  ② **규칙 기반 대화(`ai.ts` 779줄)는 이미 죽어 있다** — 중계 모드에서 `generateReply` 결과가
  계산되고 버려진다. 중계 단일화로 폴백 용도까지 없어져 파일 전체 삭제 가능.
  ③ **어르신이 든 화면에 요양보호사 UI 가 그대로 있다** — 위기 배너 전화번호·STT 수정 패널·
  확인 없이 종료하는 X 버튼. 표시 모드 분리는 신규 기능이기 전에 **현 상태 결함 수정**이다.
  ④ **생성문 검증은 이미 강하다** — `generated-session.ts` 의 근거 강제·진단표현 차단을
  **확장**해서 쓴다. 못 막는 것만 추가: `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장`.
- ⚠️ **파일럿 블로커 6건**(계획 §11): `alter type ... add value` 트랜잭션 제약 ·
  `REPORT_ALLOWED_USER_IDS` 데모 허용목록(교체 없으면 전원 403) ·
  **`safety_events` 가 세션 종료 시 일괄 기록돼 실시간 안전 푸시가 구조적으로 불가능** ·
  **어르신 동의 철회 UI 부재**(`ElderDetailPage.tsx:434` 가 없는 라우트를 가리킨다) ·
  **직원이 같은 기관에 합류할 경로 부재** · **`live-token` 이 중계가 아닌 호출자에게도 토큰을 준다**(아래).
- 🔎 **문서 재작성 중 코드 대조로 드러나 계획에 반영한 것**(2026-09-24):
  ① **직원 합류 경로가 없다** — 2026-07-25 이후 `complete_onboarding` 은 요양보호사마다 **새 기관 + `org_admin`** 을 만든다.
  1기관·여러 직원 파일럿이 성립하지 않는다 → 기관 초대 코드 + `org_admin`·`center_director` 승인, **승인 전 `users.org_id` NULL**
  ("org_id 없으면 0건" 불변식 재사용)(D3·W9). 기관 단위 열람에서는 **합류 승인 = 기관 전체 열람**이라 승인자를 좁혔다.
  ② **새 역할을 부여할 경로가 없다** — `users.role` 은 3중 잠금(`20260908000000`), 온보딩은 요양보호사·보호자만.
  → `set_member_role` RPC(자기 자신·보호자↔돌봄팀·마지막 관리자 강등 불가) + 역할 지정 UI. 매트릭스 편집권은 위임 불가.
  ③ **`live-token` 이 중계와 앱 직접 호출을 구분하지 못한다** — 중계도 사용자 JWT 로 부른다(`voice-relay/src/main.ts:41`).
  앱 직접 모드를 지워도 구버전 앱·JWT 소지자는 출력 검열을 건너뛴다 → **중계 전용 자격 추가, 없으면 403**(C4).
  ④ 목표 시간은 **기존 `sessions.duration_minutes`**(5~120, `20260822020000`)를 쓴다 — 계획 초안의 `target_minutes` 컬럼은 중복이었다.
  ⑤ 어르신 화면의 위기 안내(전화번호)는 **삭제가 아니라 이동**(요양보호사 모드·감독 화면 위기 카드).
  ⑥ D4 는 SELECT/UPDATE 만 기관 단위로 바꾸고 **DELETE 는 배정·관리자 기준 유지**.
  ⑦ 이름 변경 "분석 → 대화 관찰 리포트"는 **보호자 메뉴만**(기획 6-5). 요양보호사 `분석` 은 유지.
  ⑧ (✅ 2026-09-24 해결 — 태블릿 지원 `true` 로 변경) 기획서는 "태블릿 N대"를 전제하는데 앱은 `ios.supportsTablet:false`·`portrait` — 값은 그대로, **파일럿 기기 확정 때 재확인**.
  ⑨ 파일럿 계획의 `D1~D10` 은 DB 파트 번호다. 대체된 사업 기획 델타의 `D1~D11` 과 **이름만 같다** — 인용 시 출처를 붙인다.
  ⑩ **중계는 위기뿐 아니라 급성 고통·휴식 요청("그만할래")·거부에도 즉시 연결을 끊는다**(`relay.ts:123-127`, `INPUT_REVIEW_REQUIRED`).
  기획의 종료 정책("그만할래" → 마무리 단계로 짧게)과 부딪힌다 → 권장: 휴식 요청·거부만 마무리 전환, **위기·급성 고통은 즉시 종료 유지**.
  급성 고통을 바꾸는 것은 안전 완화라 기획·안전 책임자 확인 사항(계획 §9-5·§13, tasks T21.11).
  ⑪ **파일럿 신규 화면은 Figma 시안이 없다** — 웹 W1·W2·W6·W7·W9, 앱 M2(어르신 표시 모드). 웹 규칙은 "Figma 단독·임의 재디자인 금지"다.
  시안 선행 vs "시안에 없는 화면" 선례(기존 디자인 언어로 최소 구현 → 시안 오면 교체) 중 **결정 대기**(계획 §7 머리말·§13). 결정 전엔 DB·연동이 먼저.
  ⑫ `live-token` 한도는 **사용자 기준**(분당 3·일 20). 요양보호사 1명이 기기 여러 대를 자기 계정으로 시작하면 먼저 닿는다 —
  기기·계정 운영 방식이 곧 일지 진행자 기록이 되므로 기획 결정(계획 §13).
  ⑬ `apps/web/src/lib/supabase.ts` 주석·콘솔의 "목업 데이터로 동작"은 낡은 문구다(웹 목업 스토어는 이미 없다 — 코드 미수정).
- 📝 문서 진행: Tier 1(PLAN·tasks·백로그 2종·웹 AGENTS·루트 AGENTS) ✅ · Tier 2(requirements `PF-01~47`·`PN-01~09` ·
  design `SCR-08·09`·`SCR-W12·W15~W21` · product · database · structure · web-launch §5 · app-release-remaining §7 ·
  음성 계획 2종) ✅ · Tier 3(README 5종·tech §0·security 역할→범위 표·compliance 처리목록·ai-safety §0-1·accessibility·
  infrastructure §10·런북 4종·데모 촬영 기록) ✅.
  기존 요구 ID·화면 ID 는 코드 주석·마이그레이션이 인용하므로 **재번호·재사용하지 않고** 폐기·대체 표시만 했다.
- ⚠️ **안전 아키텍처를 약화시키지 말 것**(계획 §11): 공단 일지 진행자 칸에 AI 를 쓸 수 없다
  (`facilitator_user_id` NOT NULL + `tool_used` 별도) · **위기 시 즉시 `close` 를 `paused` 로
  낮추지 말 것**(기록만 확장) · 위임 대상은 3개뿐(일지확정·공개철회·보호자연결승인)이며
  위기 대응·출력 검열·진단표현 금지를 `org_capabilities` 에 넣으면 설정 한 줄로 무력화된다.
- ✅ 이번 세션 검증(설치 보정 후 실행): typecheck 6패키지 · lint 0 · test **631**
  (core 253 + data 141 + voice-relay 43 + mobile 194) · `check:figma` 177 · `check:font` 39 ·
  `check:bom` · `check:copy` 통과. 마이그레이션 53종.

## 이전 위치 (2026-09-23 — 앱 현황 점검·모델 교체 미완)

> 이번 세션은 **코드 변경 없이 앱 현황을 전수 점검**하고 메모리를 맞춘 것이다.
> 기록 범위: `83ba6af`(메모리 마지막 반영) 이후 유일한 커밋 `8233b16` + 검증 결과.

- **Gemini 모델 교체는 아직 적용되지 않았다.** `8233b16`("gemini model 변경")의 코드 변경은
  `supabase/.env.example` **한 줄**뿐이고(`gemini-3.1-flash-live-preview` → `gemini-3.8-live`),
  나머지는 사업계획 초안 텍스트 2개다. `.env.example` 은 **템플릿이라 런타임에 읽히지 않는다** —
  실제 모델은 `live-token` 이 `GEMINI_LIVE_MODEL` **시크릿**으로 정해 앱에 돌려주고
  (`json({ token, model })`), 앱은 그대로 따른다(`model: json.model ?? DEFAULT_MODEL`).
  → **`supabase secrets set` 을 해야 바뀐다.** 하지 않으면 앱은 조용히 3.1 로 돈다.
  ⚠️ 코드에 3.1 이 남은 곳: `live-token/index.ts:50`·`engine.ts:18` 의 `DEFAULT_MODEL`(폴백),
  `.env.example:32` 주석(같은 파일 41행과 **모순**), `client.ts:3` 설계 근거 주석.
  `gemini-3.8-live` 의 실재·Live 지원 여부는 **확인하지 못했다**(컨테이너 egress 가 Google 차단).
  모델 제약(proactivity/affective 미지원 등)을 3.1 기준으로 전제한 코드가 그대로라 재검증 필요.

- **`EXPO_PUBLIC_VOICE_RELAY_URL` 이 문서화돼 있지 않다.** 이 변수 하나가 음성 구조 전체를
  가른다(`engine.ts:114·119·137`, `talk.tsx:45` `RELAY_MODE`) — 설정하면 중계 경로,
  비우면 **직접 Gemini Live 경로**다. 그런데 `apps/mobile/.env.example` 에 없다.
  `env.d.ts` 는 `[key: string]` 인덱스 시그니처라 **오타도 타입 검사가 못 잡는다**.
  배포 시 이 변수를 빠뜨리면 중계·검증·Clova 경로가 통째로 우회된다.

- ⚠️ **`pnpm install --prefer-offline`(session-start 훅)이 `apps/voice-relay/node_modules` 를
  만들지 않는다.** 그 상태로는 `pnpm -r typecheck` 가 `TS2688 Cannot find type definition
  file for 'node'` 로, `pnpm -r test` 가 voice-relay 에서 끊겨 **모바일 테스트까지 안 돈다**.
  저장소 결함이 아니다(package.json·락파일 정상) — **새 세션에서 먼저
  `pnpm install --filter @giokon/voice-relay` 를 실행**하면 해소된다.

- ✅ **검증(2026-09-23, 위 설치 보정 후 실제 실행)**: typecheck 6패키지 · lint 0 ·
  **test 631**(core 253 + data 141 + voice-relay 43 + mobile 194) · `check:figma` 177 ·
  `check:font` 39 · `check:bom` 447 · `check:copy` 전부 통과. 마이그레이션 **53종**.

- 앱 설정 현황(변동 없음 확인): Expo `~54.0.37` · RN `0.81.5` · `version 1.0.0` ·
  번들 ID `kr.giokon.app`(iOS·Android 동일) · `supportsTablet: false` ·
  plugins 에 `expo-build-properties`(API 36 고정) · infoPlist 마이크·사진 2종.

- 🧹 저장소 루트에 `answer_draft.txt` · `tts_script_draft.txt`(사업계획 초안)가 있다.
  `submissions/` 가 이미 있으므로 그쪽으로 옮기는 편이 맞다. 코드에는 영향 없다.

- ⏳ **배포 직전 재확인(사용자 요청, 유지)**: ① 주황 `#e9822b` 대비 2.73:1(현행 유지 결정)
  ② `supportsTablet: false` 유지 여부.

## 이전 위치 (2026-09-21 — Clova 취소·응답 실패 경계)

- N09 매 청취 시작 전에 기기 마이크 권한을 재조회한다. 자동 턴 중 권한 요청 창은 띄우지 않으며 거절/조회 실패/5초 초과는 연결 종료, 회수 후 늦은 허용은 무시한다. 신규6건 포함 모바일194건·타입/lint·앱 게이트 통과. 청취 중 OS 권한 변경 감지나 실제 기기 검증을 완료한 것은 아니다.

- N09 네이티브 재생 중 비버퍼링 정지를 interrupted로 처리하고 늦은 완료 콜백이 판정을 덮어쓰지 못하게 했다. 시작 전/버퍼링 상태는 제외한다. 신규 회귀 2건 포함 모바일188건·타입/lint·copy/BOM/font/figma 통과. 실제 전화·Bluetooth 전환 검증과 운영 배포는 수행하지 않았다.

- 중계의 담당자 확인 신호를 앱 안전 배너/종료 이벤트에 연결했다. 발화 원문·위기 유형은 임의 생성하지 않고 기존 판단을 보존한다. 스토어/훅/저장 회귀4건 추가, 모바일185건·품질 게이트 후 저장1건 추가 통과(모바일186). 운영 DB 저장·프로세스 종료 복구는 미검증/미완료.

- N08/N07 늦은 전사의 안전 검사를 합성 대기 큐 앞으로 옮겼다. 분할 위험 발화/중단 요청은 기존 규칙으로 감지하여 합성 취소·담당자 안내·연결 종료한다. 신규 4건 포함 전체619건·타입·copy/BOM 통과. 정확한 턴 배정/전사 보존/안전 이벤트 저장 및 의미 검증은 아직 후속이며 실제 기기·운영 변경 없음.

- N10 재생 관측 저장/조회 데이터 어댑터 14건을 추가해 data141건·타입·BOM 통과. RPC/SQL·앱 활성화는 아직 없으며 docs/plans/playback-storage-contract.md의 후속 계약이다. Docker는 사용자가 보고한 dockerInference 문제로 보류하고 운영/DB 변경 없음.

- N10 재생 관측을 종료 저장 묶음에 검증된 사본으로 보존했다. 공통 검증은 턴/문장 연결·재생 상태·기기 ISO 시각을 확인하고 없는 관측은 추정하지 않는다. 신규 8건 포함 전체 601건·타입·앱 게이트 통과. DB 저장/재시작 복구는 아직 후속이며 운영/DB 변경 없음.

- N05/N07 서버 모델 응답 대기에 45초 고정 제한을 추가했다. 부분 출력으로 연장하지 않으며 정상 완료 시 타이머 해제, 시간 초과는 앱 안내/연결 정리로 이어진다. 신규 2건 포함 중계 39건·전체 타입·copy/BOM 통과. 운영/DB 변경 없음.

- N05 컨테이너의 빌드 컨텍스트를 기본 제외로 제한하고 Node 직접 실행으로 변경했다. v3 배포/롤백 런북 갱신, 중계 37건·BOM 통과. Docker Desktop 엔진 응답 대기로 이미지 빌드/컨테이너 기동 확인은 미완료이며 운영 배포 없음.

- N07 합성 실패 코드 5종을 서버→앱→자동 컨트롤러 안내에 연결했다. 공급자 본문 대신 로컬 문구를 사용하고 자동 재시도 없이 회수·저장을 안내한다. 전체 590건·타입·앱 게이트 통과 후 훅 회귀 1건 추가 통과(합계591). 운영 배포·실제 공급자 장애 시험은 미수행.

- N09 오디오 준비(파일 쓰기·모드 설정·Sound 생성)에 15초 제한/취소를 연결했다. 늦은 네이티브 완료는 정리하며 실제 작업이 끝나기 전 다음 재생은 차단한다. 신규 6건 포함 모바일 176건·타입/lint·앱 게이트 통과. 기기 작업의 강제 취소 보장은 아니며 전화/Bluetooth/echo 실기기 확인은 후속. 운영/DB 변경 없음.

- N10 앱 일시정지·재개를 연결했다. 완료 질문은 청취 재개, 미완료 출력/응답 대기는 선별 맥락으로 이어가기 요청하며 이전 기록을 덮어쓰지 않는다. 부분 입력 확인/제외·저장 성공·안전 권고 검사를 거친다. 신규 6건 포함 모바일 170건·타입/lint·앱 게이트 통과. 실제 기기/API·프로세스 재시작 복구·재생 이력 영속화는 남으며 운영/DB 변경 없음.

- N10 자동 컨트롤러의 일시정지/재개와 실행 세대 경계를 구현했다. 정리 전 재개·이전 연결의 늦은 입력/오류/응답을 차단하며 종료 회수는 재개하지 않는다. 신규 5건 포함 모바일 164건·타입/lint·앱 게이트 통과. 실제 복구 선택·훅·버튼은 아직 후속이며 운영/DB 변경 없음.

- N10 앱 엔진에 복구 이력 인자를 연결했다. 같은 세션도 새 중계 연결을 사용하고 비동기 작업 전 이력을 복제한다. 직접 경로/잘못된 이력은 거절한다. 신규 3건 포함 모바일 159건·타입/lint·앱 게이트 통과. 훅·재개 UI 및 재개 첫 동작은 후속이며 운영/DB 변경은 없다.

- N10 v3 전송 계약: 복구 이력이 있는 클라이언트만 v3를 협의하며 v2 응답을 거절한다. 중계는 형식 검사·인증·현재 권한 확인 후 새 공급자 연결에 clientContent(turnComplete=false)로 전달한다. 시스템 프롬프트는 서버 값 유지, v2 재생 확인 조건은 v3에도 적용한다. 전체 561건 통과. 앱 엔진/재개 UI에는 아직 미연결이며 전달 이력은 앱 주장이지 서버의 실제 청취 증명이 아니다. 운영/DB 변경 없음.

- N10 복구 이력 계약: core voice-context에서 채택 사용자 문장과 정확히 일치하는 재생 완료 AI 문장만 선별한다. 교정 전 입력/미재생·중단/다른 텍스트 재생 증거는 제외하며 미확인 사용자 입력·중복 ID·형식/크기 초과는 거절한다. 공통 wire parser와 모바일 재생 관측 타입을 통일했다. 전체 556건·typecheck 통과. 아직 중계 메시지/재개 UI에 연결되지 않았고 운영/DB 변경 없음.

- N10 재생 결과 런타임 계약: 자동 루프가 completed/interrupted/empty를 턴 ID+정확한 질문 텍스트에 연결한다. 회수 뒤 도착한 재생 중단 결과도 같은 현재 세션에 한해 기록한다. 사용자 발화/다른 텍스트/없는 턴은 거절하며 미기록은 unknown이다. 전체 544건·타입·모바일 lint/앱 게이트 통과. 이 상태는 앱 메모리 전용이고 DB 영속화/재접속 맥락 주입/일시정지 재개는 후속이다.

- N07: fetch/본문 read가 끝나지 않아도 취소·15초 제한에 응답하도록 보강했다. 정리용 cancel의 무한 대기는 호출자를 막지 않는다. 429/5xx/기타 오류를 본문 노출 없이 분류하고 자동 재시도하지 않는다. RIFF 뒤의 불완전 청크도 거절한다. 중계 시험 29건·타입·BOM 통과. 실제 합성 품질·개인 사실 검증·실기기·운영 적용은 후속이며 N06/N07 전체 완료가 아니다.

## 이전 위치 (2026-09-20 — 전사 출처 런타임 경계)

- N05 운영 종료 준비: 중계에 readyz/drain, 신규 연결 차단, 합성 취소·공급자 종료·내부 세션 점유 해제와 제한 시간 종료를 연결했다. 실제 진입점 종료 핸들러 및 로컬 소켓 시험 22건·중계 타입 검사·BOM 통과. `docs/runbooks/voice-relay-operations.md`에 전환/롤백 절차를 추가했다. 호스팅·WSS·이미지 빌드·운영 신호 전달은 미검증이고 운영 배포/DB 변경 없음.

- N09 일반 청취 중지 실패: 마이크 어댑터의 stop 실패를 콜백 통지만 하고 정상 반환하던 처리를 오류 전파로 수정했다. 엔진은 실패 입력을 자동 확정하지 않고 연결 종료·부분 입력 확인으로 보낸다. 중지 실패 어댑터는 프로세스 재시작 전 재사용을 거절한다. 전체 532건 통과. 실기기 중지 확인·전화/라우트 및 N10 맥락 복구는 후속이다.

- N09 재생 해제 대기: unload/임시 파일 정리 대기를 5초로 제한하고 실제 정리 Promise는 유지해 미완료 중 새 재생을 차단한다. unload 명시 실패는 앱 프로세스 재시작 전까지 재생 금지로 처리한다. 전체 531건 통과. 네이티브 create/mode/write 자체의 무한 대기, 기기에서 실제 소리가 멎었는지 확인 및 나머지 N09 작업은 후속이다.

- N09 종료 정리 예외: 마이크 stop 예외가 공급자 연결 종료·부분 입력 전달·재생 정리를 건너뛰던 경로를 분리했다. 중복 close는 같은 Promise를 공유하며 소비자 콜백/재생 정리 오류도 나머지 정리를 막지 않고 안내한다. 전체 529건 통과. 네이티브 정리 무한 대기·일반 청취 stop 예외·전화/Bluetooth 등은 후속으로 남으며 N09 전체 완료가 아니다.

- 중단 입력 복구: 청취 중 회수/오류로 닫힐 때 이미 받은 전사를 부분 입력 콜백으로 한 번 전달한다. 중계 화면의 예외 확인 패널에서 담당자가 수정·확인해야 caregiver_confirmed로 기록하며 가짜 AI 응답은 추가하지 않는다. 미확인 입력이 있으면 종료 저장을 보류하고 명시적으로 제외할 수 있다. 전체 527건·typecheck·모바일 lint 및 앱 게이트 통과. 앱 프로세스 종료 뒤 복구·서버에서 아직 오지 않은 전사·같은 세션 자동 재개는 후속이다. 운영/DB 변경 없음.

- N08 전사 손실 회귀: 입력 전사를 마지막 조각으로 덮어쓰던 엔진을 청취 단위 누적으로 수정했다. 반복/공백을 보존하고 누적 4000자 초과는 중단한다. 중계의 초과 조각 잘라내기도 종료로 바꿨다. 전체 523건·typecheck 통과. 늦은 최종 전사/강제 중단 부분 입력 복구는 후속이다. 운영 배포/DB 변경 없음.

- N08 기본 발화 경계: 중계 모드에 PCM 활동+전사 시각 기반 대기(일반 3.5초/짧은 응답 6초), 무응답 20초/청취 상한 60초를 연결했다. RMS는 음성 분류기가 아니며 현장 조정 전 초기값이다. 전체 520건·typecheck·모바일 lint·copy/BOM/font/figma 통과. 전사 조각 누적·상한 중단 부분 입력 복구·실기기 검증은 후속이며 N08 전체 완료가 아니다. 운영/DB 변경 없음.

- N02/N08 자동 루프를 앱에 연결했다. 중계 모드에서 명시적 시작→자동 입력 채택·저장→응답 저장·재생→다음 청취, 회수·저장으로 진행한다. 자동 채택은 담당자 확인 액션과 분리하며 저장 실패/위기/미재생/늦은 응답은 다음 청취를 차단한다. 저장 v1과 마이크 권한 없이는 시작하지 않는다. 전체 508건·타입·모바일 lint·copy/BOM/font/figma 통과. 기존 1.6초 전사 정지 기준의 발화 종료, 일시정지 후 맥락 재개, 실기기·중계 운영 검증은 후속이다. 상세 `docs/plans/automatic-conversation-execution.md`.

- T03b 기능용 출처 저장을 로컬 구현했다. session_logs JSON 출처/교정 이력, 서버 확인자·저장 시각, 앱 저장 버전 협의 및 매퍼 왕복을 연결했다. 기존 서버는 수동 저장만 유지하며 자동 채택은 차단한다. 53개 마이그레이션+기존 DB 회귀+신규 출처 SQL 시험과 자동 테스트 492건·타입 검사가 통과했다. 운영 적용은 미수행이며 `docs/runbooks/transcript-storage-rollout.md` 절차에 따라 후속 요청한다. DB 보안 감사 재개가 아니며 자동 루프는 다음 작업이다.

- 사용자 요청으로 자동 대화 완성 전체를 진행한다. 실행 기록은 `docs/plans/automatic-conversation-execution.md`. 외부 선행 작업이 필요한 항목은 보류하고, 개발 후 가능한 외부 적용은 로컬 구현·검증 후 요청한다. DB 보안 감사는 제외한다. N09a 오디오 취소 경쟁(늦은 마이크 시작/이전 청취 오디오/중복 확정/native 재생 시작 정체)을 보강했다. 회귀 5건 포함 전체 482건·타입·lint·copy/BOM/font/figma 통과. 나머지 자동 루프·영속화·맥락 복구·오디오 환경·출력 품질·배포는 실행표에 남아 있다.

- T03a: ConversationTurn에 unknown/automatic/caregiver_confirmed 출처 계약을 추가하고 앱의 명시적 확인 동작에 연결했다. 확인 전 표시 입력과 최종 문장을 구분하며 빈 확인은 거절한다. 기존 DB 행은 교정 원문이 있어도 unknown이다. 새 메타데이터는 아직 DB에 저장되지 않으며 자동 채택 기록은 기존 매퍼에서 저장을 거절한다. 자동 진행 활성화·원전사/확인자/확인 시각 영속화는 T03b DB 계약 후속이다. 회귀 6건 포함 자동 테스트 477건 통과. DB 변경·운영 배포·실기기 검증은 수행하지 않았다.

## 이전 위치 (2026-09-19 — 자동 대화 고도화 재개)

- T03/N09 재생 완료 경계 구현을 재검증했다. 자동 테스트 471건(core 234/data 114/mobile 104/relay 19), 전체 typecheck·lint, copy/BOM/font/figma, Android·iOS JS 번들 통과. 중계 응답 대기는 60초(직접 경로 20초)이며 중계에서는 대화 화면을 유지해 연결·재생 상태를 보존한다. 운영 배포·DB 변경·실기기 검증은 수행하지 않았다. 다음은 자동 채택과 사람 확인 출처 분리이며 영속화 필드는 DB 파트와 계약이 필요하다.

## 이전 위치 (2026-09-14 — 실 LLM API 시연 개발 진행)

- 사용자 실제 시연 성공 확인으로 시연 개발 목표 완료. 이후 사용자 요청으로 자동 대화/음성 중계 고도화 재개. 첫 작업은 T03/N09 재생 완료 계약: 완료·중단·빈 오디오 구분, 중계 v2 완료 통지 전 다음 입력 차단, 중단/잘못된 턴/95초 미통지 시 연결 종료. 신규 앱은 v2 서버를 요구하므로 서버 먼저 갱신한다. 매 턴 확인 UI·자동 채택 출처·일시정지 후 맥락 복구는 아직 후속이며 운영 배포/DB 변경/실기기 검증은 수행하지 않았다. 상세는 `docs/plans/voice-development-tasks.md`.

- 로그인 화면 정체 회귀 수정: 원인 도입은 2026-09-10 `aa1eede`(R008). AccessMonitor의 최신 요청만 채택하는 보안 처리와 로그인 화면의 개별 refresh 반환값 판정이 충돌했다. 오래된 로그인 조회는 null로 폐기되고 후속 정상 조회가 반영돼도 화면 전환이 없었다. 로그인 화면은 이제 공통 가드의 확정된 상태를 구독해 Redirect하며 이메일/소셜 완료 콜백의 직접 이동을 제거했다. 권한 검사·이전 계정 응답 폐기는 유지한다. 실제 소스 회귀는 수정 전 실패/수정 후 통과, 모바일 97건·타입·lint·copy/BOM/font/figma 통과. 사용자의 실제 계정 로그인은 미검증이다.

- 사용자 후속 지시: 실 API·기기·보호자 종단 검증은 사용자가 직접 진행하며 현재 개발 변경을 커밋한다. 자동 테스트 452건·전체 타입 검사 통과. 허용 계정 UUID 등록 방법은 `supabase/functions/session-report/README.md`에 기록했다. 실환경 성공 판정은 사용자 검증 전까지 보류한다.

- 사용자 지시로 시연 경로를 우선 구현 중이다. 상태와 인수 조건은 `docs/plans/demo-llm-implementation.md`, 촬영 순서 점검은 `docs/plans/demo-recording-readiness.md`.
- `session-report` 서버 함수는 종료된 담당 세션·현재 동의·시연 허용 계정을 검사하고 Gemini로 근거 발화가 붙은 요약/주제/일지 초안을 생성한다. 기존 `session_analyses.analysis` JSON에 생성 메타데이터를 더하고 수치 지표는 보존한다. DB 마이그레이션은 추가하지 않았다.
- 모바일 분석 진입 시 생성·오류/재시도·주제별 근거 표시, 웹 일지의 세션 선택→미리보기→명시적 적용을 연결했다. 최종 저장·공개는 담당자 동작을 유지한다.
- 최초 운영 `session-report` v1의 JWT 검증·비로그인 401·배포 소스 일치를 확인했다. 이후 사용자 설정 등록 보고에 따라 CLI로 GEMINI_API_KEY·GEMINI_REPORT_MODEL·REPORT_ALLOWED_USER_IDS 세 이름 존재를 확인했다(값 미조회). 현재 함수는 v5 ACTIVE·verify_jwt=true이며 v5 소스는 이번에 대조하지 않았다. 실제 공급자 호출·설치 앱/보호자 종단 리허설은 사용자 진행이며, 촬영 준비 완료로 판정하지 않는다.

## 이전 위치 (2026-09-13 — 개발 방향 및 DB 제외 실행 목록)

- **후속 개발 진행(같은 날)**: `docs/plans/voice-development-tasks.md`로 계약을 세분화하고 T01/N02 상태 규칙과 묶음 2의 로컬 음성 중계 1차 구현을 완료했다. `packages/core/src/voice-flow.ts`에 신규 21개 테스트를 더했고, `apps/voice-relay`는 Supabase JWT·세션 권한 확인→Gemini Live→검증된 전사→Clova Voice PCM 흐름, 권한 재검사, 취소·단절·버퍼·시간 제한을 구현했다. 모바일은 `EXPO_PUBLIC_VOICE_RELAY_URL` 설정 시 직접 Live 대신 중계로 연결하며 중계 실패를 기기 TTS로 숨기지 않는다. 모노레포 test/typecheck/lint와 Android/iOS JS 번들, BOM·copy·font·figma·design 게이트가 통과했다. 실제 공급자 자격 증명·운영 호스팅·실기기 검증·직접 경로 폐쇄는 남아 있으므로 N02 전체/N05~N07 출시 완료나 R010 해결로 판정하지 않는다.

- 사용자 승인 방향을 음성 계획·사업 실행안·기술/출시 문서에 반영했다. 상세 작업·현재 기반·인수 조건·의존성은 `docs/plans/non-db-development-backlog.md` N01~N35로 관리한다.
- 자동 채택 전사와 사람 확인 사실, 생성/채택/실제 재생을 분리한다. 차단·수정·중간 중단된 응답을 모델 맥락에 반영하고 늦은 음성은 폐기한다.
- 일지는 규칙 기반 비교 기준선을 유지하고 최종 확인·선별 공개 승인을 보존한다. 시간/원가 계측을 초기부터 넣으며 과금·LLM 일지·독립 학습은 단계별 게이트를 따른다.
- 이번 작업은 음성 중계·모바일 배선 코드와 계획 문서를 함께 갱신했다. DB 변경·Supabase 배포·실제 공급자 호출·실기기 검증을 완료한 것으로 기록하지 않는다.

## 이전 위치 (2026-09-12 — 사업 기획의 개발 문서 반영)

- 사용자 요청으로 프로젝트 관리·요구사항·출시 문서를 동기화했다. 코드·DB·배포 변경은 없다.
- 실행 목록은 `docs/plans/business-plan-development-delta.md` D1~D11. 자동 대화·Clova 출력·개인화·일지 품질·실측부터 수행한다.
- 현재 웹 초안은 규칙 기반이며 실제 LLM 초안은 미구현이다. 앱 매 턴 승인 없는 목표와 웹 최종 승인 유지를 구분한다.
- 초기 구매·가격 구조는 검증 가설이다. 기관 구독+회상 사용량 제안, 가격·포함량 미확정. 자체 모델·연동·GS·의료 연구는 후속이다.
- 기존 보안 R010 부분 해결 판정·릴리스 차단 항목은 그대로 유효하다. 이번 문서 반영을 새 기능 완료로 표시하지 않는다.

## 이전 위치 (2026-09-11)

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
- **P0(코드)**: 새 음성 AI A0(기준선·계약 확인) → A1(Live 자동 진행 + 검증 Clova TTS) 및 개발 실행안 D1~D5
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
  ~~**모델에 넘기는 것은 확정·교정된 텍스트뿐**이다 → DB 에 남은 텍스트와 모델이 본 텍스트가
  항상 같다(감사 정합). **위기 발화는 모델을 우회**한다.~~
  ⚠️ **이 두 문장은 2026-09-09 에 사실이 아니게 됐다**(2026-09-23 확인). `client.ts` 헤더가
  스스로 *"'교정 텍스트만 모델이 본다'고 가정하면 안 된다"* 로 바꿔 적었다 — 마이크 원음이
  `realtimeInput.audio` 로 모델에 전송된다. **감사 근거로 인용하지 말 것.**
  위기 발화도 마찬가지다: 앱은 `submitUserTurn` 을 건너뛰지만 오디오는 이미 나갔고,
  `activityEnd` 를 안 보내 활동 구간이 열린 채 남아 **다음 턴에 위기 오디오가 함께 들어간다**.
  중계 모드는 `haltRelay()`→`closeLiveEngine()` 으로 연결을 닫아 해소됐으나(2026-09-21),
  **직접 모드(`EXPO_PUBLIC_VOICE_RELAY_URL` 미설정)에는 그대로 남아 있다.**
  로컬 안전 응답·에스컬레이션과 재생 가드(`playableChunks`)는 정상 동작한다. 키는 앱에 없다 — Edge Function `live-token` 이 JWT 검증 후
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

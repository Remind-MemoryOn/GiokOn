# 기억온 (GiokOn) — 프로젝트 메모리

> 📌 **프로젝트 메모리의 단일 소스(SoT)다(2026-09-11 사용자 확정).** 어떤 AI 에이전트로 작업하든 **여기를 읽고, 여기에 기록한다.**
> 루트 `CLAUDE.md` 는 이 파일을 가리키는 **포인터 스텁**이다 — 거기에 내용을 쓰지 말 것(예전에 두 파일이 서로 다른 사실을 말했다).
> **하위 스코프**: 웹 파일을 건드리면 **`apps/web/AGENTS.md`** 도 읽는다(충돌 시 그쪽이 우선). 스코프 메모리를 새로 만들 때도
> 내용은 `<경로>/AGENTS.md`, `<경로>/CLAUDE.md` 는 포인터 스텁으로 둔다.
>
> **이 문서에는 "지금도 유효한 규칙·사실"만 둔다**(2026-09-28 압축). 날짜별 작업 이력·검증 수치·과거 검토 기록은 지웠다 — **git 이력**에 있다.
> 테스크 상태는 `docs/tasks.md`, 무엇을 만들지는 계획 문서가 SoT 다. 여기에 같은 내용을 다시 적지 않는다.

## 제품 한 줄

**인지활동 프로그램을 AI 가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로 남는 도구**(2026-09-23 기획 변경).
요양보호사는 계획하고 감독하며 확인한다. 팀: 임성훈(기획·개발) · 박진우(개발·영업) · 고서연(UI/UX·디자인).

**판단 기준 셋**: ① 기존 ERP(케어포·엔젤시스템·이지케어)가 하는 기능은 만들지 않는다
② **AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는 경로는 없어야 한다**(테스트로 검증)
③ "제공 횟수·기록 품질·시간 절감"을 측정할 이벤트 로그를 1주차부터 남긴다.

## 문서 지도 — 무엇을 어디서 보나

| 알고 싶은 것 | 문서 |
|---|---|
| 무엇을 만들지(파일럿 범위·DB/앱/웹/연동 항목 D·M·W·C) | `docs/plans/pilot-development-plan.md` |
| 테스크별 상태·완료 조건·남은 일 | **`docs/tasks.md`** |
| 출시 전 외부 작업·배포 점검 | `docs/plans/launch-checklist.md` |
| 보안 수정 R001~R012 의 운영 반영 근거 | `docs/runbooks/security-fixes.md` |
| DB 접근 모델·대화 기록 저장 계약·Edge 시크릿 | `docs/database.md` |
| 저장소 구조·기술 스택 표 | `docs/structure.md` |
| 보안·준법·AI 안전·접근성 | `docs/{security,compliance,ai-safety,accessibility}.md` |
| 중계 운영 | `docs/runbooks/voice-relay-operations.md` |
| Figma 추출 절차 | `docs/runbooks/figma-{web,app}-extraction.md` |
| 새로 합류한 사람용 쉬운 설명 | `docs/new-hire/` |

## 구조 (pnpm 모노레포)

- `apps/web` — **요양보호사·기관 관리자·보호자 관리 웹**(React 19 + Vite + Tailwind). 어르신 음성 대화는 웹에 없다. 규칙은 `apps/web/AGENTS.md`.
- `apps/mobile` — **어르신 대화 앱**(Expo SDK 54 + expo-router 6 + NativeWind 4.2). 요양보호사가 조작하는 세션 실행 도구.
  어르신 표시 모드는 별도 라우트가 아니라 `session/talk.tsx` 안의 모드 전환 + PIN 복귀 게이트.
- `apps/voice-relay` — **음성 중계 서버**(Node + ws, Docker). 세션 권한·연결 통제·턴 식별·**안전 규칙 검증**을 통과한 응답만 TTS 로 내보낸다.
- `packages/core` — 도메인 타입·**안전 규칙**·프롬프트·분석·생성문 검증. `packages/data` — supabase-js + TanStack Query 훅 + 인증 + 매퍼.
  `packages/theme` — 디자인 토큰(단일 소스).
- `supabase/migrations`(스키마·RLS) · `supabase/functions`(Edge) · `supabase/tests`(회귀 SQL + `run-rls-regression.sh`).

## 작업 방침

- **⚠️ 디자인의 임시값을 코드에 넣지 않는다(2026-08-12)**: Figma·스크린샷의 수치·예시 분석문·키워드·이름·날짜는 **자리표시자**다.
  실데이터에 바인딩하고, 근거가 없으면 값을 만들지 말고 `null`/빈 배열 → 빈 상태(`—`, "아직 관찰된 기록이 없어요")로 둔다.
  `0`(관찰 0회)과 `null`(측정 불가)을 구분한다. 레이아웃·치수·색·타이포·에셋은 Figma 그대로, 값은 데이터.
- **임의 재디자인 금지.** 시안이 없는 신규 화면은 기존 디자인 언어로 최소 구현하고 시안이 오면 교체한다(2026-09-24 결정).
- **기준(2026-07-03 상향)**: 데이터 국내 보관(서울) · 안전성 확보조치 · 민감정보 별도 동의 · **비의료 포지셔닝** · AI 안전(위기 에스컬레이션·투명성) ·
  KWCAG · 멀티테넌시(기관/RBAC). 상세는 `docs/{compliance,security,ai-safety,accessibility}.md`.
- **⚠️ 안전 아키텍처를 약화시키지 말 것**: 공단 일지 진행자 칸에 AI 를 쓸 수 없다(`facilitator_user_id` + `tool_used` 별도) ·
  위기 시 즉시 종료를 일시정지로 낮추지 않는다 · 위임 가능한 권한은 3개뿐(일지 확정·공개 철회·보호자 연결 승인) —
  위기 대응·출력 검열·진단표현 금지를 설정(`org_capabilities`)으로 끌 수 있게 만들지 않는다.
- **⛔ 법률 문서(`apps/web/src/content/legalDocuments.ts`)는 수정하지 않는다** — 변호사 검토본(2026-09-24). 고칠 내용은 법무 검토 요청으로 돌린다.
- **운영 DB 쓰기·배포는 사용자 승인 후**(읽기 조회는 가능). 기관 AI 초안 스위치(`org_settings.ai_drafts_enabled`)는 **사용자 지시 없이 켜지 않는다**.
- **커밋**: 원격 세션이 지정한 작업 브랜치를 따른다(없으면 `main` 직접 — 사용자 승인). **테스크별 커밋**(개발·검증·기록 뒤 커밋하고 다음으로).
  기능·디자인 수정과 리팩토링은 같은 PR 에 섞지 않는다. PR 을 올린 뒤 **CI 확인은 최대 3회**, 통과를 확인하면 더 확인하지 않는다(2026-09-27).
- **완료 표시 필수(2026-09-24)**: 테스크를 끝내면 커밋 전에 팀원이 보는 계획 문서에 ✅(날짜)·⏳(선행 조건)을 표시한다 —
  `docs/tasks.md` · `docs/plans/pilot-development-plan.md`(상태 열) · 해당되면 `launch-checklist.md` · 앱 `README.md` · `docs/new-hire/02·03` · `docs/requirements.md` · `PLAN.md`.
  계획과 다르게 구현했으면 그 차이도 같은 자리에 적는다. 이 파일에는 **현재 위치**만 갱신한다.
- **리팩토링 원칙**(앱·웹 공통, 사용자 확정): 외부 동작·공개 이름·반환 형식·오류 문구 불변 · 의존성 추가 없음 ·
  게이트(`check:design`·`check:figma`)가 소스 문자열로 고정한 코드는 제자리 · 앱의 **비동기 핵심 `src/lib/live/*` 는 제외**.
- **비밀값**: 커밋 금지(`.env` gitignore) · `.env` 등 민감 파일을 읽지 않는다. 원격 세션은 세션 시작 훅이 `.env` 를 만든다
  (`.claude/hooks/session-start.sh` · `.codex/hooks/session-start.sh` **두 벌 — 함께 고친다**). 웹 로컬은 `apps/web/.env`
  (`VITE_SUPABASE_URL`·`VITE_SUPABASE_PUBLISHABLE_KEY`). **앱 변수는 `EXPO_PUBLIC_` 접두사 필수**(Metro 가 그것만 인라인) ·
  앱에 목업 모드는 없다 · `EXPO_PUBLIC_VOICE_RELAY_URL` 필수(없거나 형식이 틀리면 시작 화면에서 차단).
- **검증**: `pnpm -r typecheck` · `lint` · `test` · `build` + 전용 게이트 `check:copy`(비의료 카피) · `check:bom` · `check:font`(Pretendard) ·
  `check:figma`(앱 실측) · `check:design`(웹 실측) · `check:audit`(SCA) · `check:a11y`·`check:figma-web`(웹 브라우저 검사) ·
  DB 회귀 `bash supabase/tests/run-rls-regression.sh`(로컬 PG16).
  CI 가 도는 것: typecheck·lint·**copy·design**·test·build·`test:auth` · DB 회귀(`rls_regression`·`transcript_provenance`·`pilot_access`·`legal_consents`·
  `journal_worker`·`safety_push`) · `check:audit`. **수동**: 앱 게이트 `check:figma`·`check:font`·`check:bom`, `check:a11y`·`check:figma-web` — 앱을 만졌으면 손으로 돌린다.
  ⚠️ `storage_policies.sql` 은 로컬 러너에만 있고 CI 단계에는 아직 없다.
- **게이트를 코드에 맞춰 고쳐서 통과시키지 않는다.** 새 회귀 단언은 **가드를 지운 변형이 실패하는지** 확인한다.

## 기술 결정

- 서버 상태 = **TanStack Query**, UI 상태 = **Zustand**.
- **음성은 중계 단일 경로**(2026-09-23 · 직접 Gemini Live 모드는 코드에서 삭제):
  `앱 ─▶ voice-relay ─▶ Gemini Live(gemini-3.8-live) ─▶ 서버 검증(screenAiUtterance) ─▶ Gemini 3.8 Flash TTS ─▶ 앱`
  - Gemini 원음(`inlineData`)은 앱에 가지 않는다. 검증을 통과한 텍스트만 합성한다(`voice-relay/output.ts`, RIFF/PCM 검증).
  - 키는 앱에 없다. Edge **`live-token`** 이 JWT·자격·동의·사용량을 검사해 ephemeral token 과 **모델 ID** 를 준다.
    **모델 교체는 `GEMINI_LIVE_MODEL` 시크릿으로만**(`.env.example` 은 런타임에 안 읽힌다). 자동 VAD off·NO_INTERRUPTION 은 중계 `relay.ts` setup 에만 있다.
  - 단계 진행(`session_tick`·`advance_session_phase`)·원격 제어·턴 식별·재생 영수증(v2)·복구 맥락(v3)은 **서버(중계+DB)가 권위**다.
  - **생성문 검증은 재사용 자산**: `packages/core/src/generated-session.ts` 가 모든 문장에 어르신 발화 근거(`turnId`+인용)를 강제하고 진단·효능 표현을 막는다.
    프로그램 일지도 이 계약을 확장해서 쓴다(새로 만들지 말 것).
  - 안전 계층(`assessUtterance`·`screenAiUtterance`·`buildCaregiverAlert`·`buildSafetyEventDraft`/`safetyEventDraftFor`)은 **절대 유지**.
  - 장기: 독립 수집·사람 전사 자료로 Whisper·Qwen 특화 평가. Gemini 참여 세션의 출력·파생 자료는 계약 확인 전 학습 제외.
- **인증** = Supabase Auth(`auth.uid()`), 전 테이블 RLS. 로그인 = 소셜 3종(구글·카카오 = Supabase PKCE, 네이버 = Edge `naver-auth`) + 이메일·비밀번호.
- **권한** = 기관 단위 + 역할(`org_admin`·`center_director`·`social_worker`·`caregiver`·`guardian`). 돌봄팀 판정은 `app.is_care_team()`,
  위임은 `app.has_capability()`. **역할 이름을 `= 'caregiver'` 로 직접 비교하지 않는다**(새 역할이 조용히 빠진다). 배정(`profile_caregivers`)은 접근 게이트가 아니라 알림·"내 담당" 용도.
- **기관은 운영자만 만든다**(A안, 2026-09-25): `select * from app.provision_org('기관 이름');` → `admin_code` 전달(그 코드로 가입 = 즉시 `org_admin`, 1회용).
  추가 관리자 코드 `select app.issue_admin_code('<org_id>');`. 직원은 기관 초대 코드 + 관리 역할 승인. 두 함수는 anon·authenticated 에 닫혀 있다.
- **일지 초안은 자동**: 세션 `ended` → DB 트리거 → 워커 `program-journal-draft` 가 초안을 채워 확인 대기로. "초안 생성" 버튼을 만들지 않는다.
  확정은 사람만(DB 가 `auth.uid()` 없는 확정을 거절). 기관 스위치가 꺼져 있으면 빈 초안(직접 작성).
- **안전 알림**: 중계가 위험 발화를 감지하면 즉시 `safety_events` 기록 → 알림 수신자 = 담당 배정자 ∪ 세션 진행자 → 워커 `push-dispatch` 가 Expo Push
  (**잠금화면 고정 문구 + 알림 id 만** — 성함·발화·위기 종류 금지).
- **파일럿 운영 규칙(2026-09-24·28 사용자 확정)**: 세션 1회 최대 **10분**(일시정지 포함) · 요양보호사 1명당 동시 **4대** ·
  어르신 1명당 실행 중 세션 **1개**(T25.19) · 휴식 요청·거부는 마무리 전환, 위기·급성 고통은 즉시 종료 · 태블릿 지원(`supportsTablet: true`, 세로 고정).
- 배포: 웹 = Vercel(프로젝트 `memory-on`, Root `apps/web`) · 앱 = EAS(번들 ID `kr.giokon.app` — 출시 후 변경 불가) · 중계 = Docker(사용자 배포).

## Supabase 운영

- **운영 프로젝트 = `MemoryOn`(ref `ufkbzpdjomtmxjipmwub`, 서울)** — 앱·웹 공용 실 DB. 구 도쿄 `GiokOn`(`xilmtqnotomuyjifenmo`)은 쓰지 않는다.
- **라이브 DB 는 Supabase MCP 로 조회한다**(컨테이너 HTTP 로는 `*.supabase.co` 가 막힌다). 한 쿼리에 검사를 모은다(`union all`). 조회는 읽기만.
- **마이그레이션 적용 절차(운영 — 한 건씩, 사용자 승인 후)**:
  1. 로컬 PG16 회귀(`run-rls-regression.sh`) 통과 · 가드를 지운 변형이 실패하는지 확인.
  2. MCP `apply_migration` 에는 파일의 `begin;`/`commit;` 을 빼고 넣는다(MCP 가 트랜잭션으로 감싼다).
  3. **적용 직후 이력 버전을 파일명으로 정정**: `update supabase_migrations.schema_migrations set version='<파일 버전>' where name='<이름>';`
     (MCP 는 적용 시각으로 기록한다 — 안 고치면 `db push` 가 재실행하려 든다).
  4. 대조: **저장소 ↔ 운영 버전 차이 0건**(양방향). 보안 advisor 새 경고 확인.
  - 운영에만 있던 이력 2건은 저장소에 **빈 파일**(`select 1;`)로 맞췄다(2026-09-28 사용자 결정) — `20260903002002_inquiries_revoke_anon_history.sql` ·
    `20260921000000_backfill_orphan_auth_users_history.sql`. **본문을 넣지 말 것**(내용은 이미 운영에 있다 — 앞 것은 `20260902000000` 에 흡수, 뒤 것은 SQL 직접 보정).
    이게 없으면 Supabase Preview 체크가 "Remote migration versions not found" 로 마이그레이션을 바꾸는 모든 PR 에서 실패한다.
  - 버전 중복은 CI 가 거절한다(다른 파트와 같은 날 번호가 겹치기 쉽다 — 올리기 전에 main 과 대조).
  - Edge 배포는 CLI 우선(없으면 MCP `deploy_edge_function` — 파일 이름은 저장소 상대 경로, Deno 는 `.ts` 확장자 import 필요). 기존 `verify_jwt` 설정 유지.
- **워커 패턴**(일지 초안·푸시): `app.worker_config(name, endpoint, secret)` — 비밀값은 DB 가 만들고 API 에 노출하지 않는다 · 워커 RPC 는 service_role 전용 +
  `app.verify_worker_secret` · `app.kick_*()` 가 할 일이 있을 때만 `net.http_post` · pg_cron 이 호출 · Edge 는 `verify_jwt=false` + `x-worker-secret` 헤더 인증 →
  202 후 `EdgeRuntime.waitUntil`. 운영 `endpoint` 는 SQL 로 설정한다.
- **운영 상태(2026-09-29 기준)**:
  - 마이그레이션: 저장소 73개(빈 이력 파일 2 포함) · 운영 이력 73(저장소와 일치) — `20260928020000_safety_evidence_guard`(T25.17) · `20260929000000_session_status_recording` → `20260929010000_session_start_integrity`(T25.11·T25.18·T25.19) 2026-09-29 적용·검증(enum·`planned_by`·트리거 3·인덱스·RPC 권한 authenticated 만·advisor 새 경고 없음). T25.1 `20260928000000` 적용됨(정책 8개 교정 확인 — 앱·웹 실제 사진 업로드·표시 확인은 남음).
  - 확장: pg_cron 1.6.4 · pg_net 0.20.4. cron: `program-journal-draft`(30초) · `push-dispatch`(10초). 감사 로그 파기 예약은 없음(T25.8).
  - Edge: `live-token` · `naver-auth` · `stt-transcribe` · `session-report`(기관 AI 스위치 검사) · `program-journal-draft` · `push-dispatch`.
  - 기관 1곳(선문대학교 — 2026-09-25 중복 기관 병합) · **AI 초안 스위치 꺼짐** · 살아 있는 푸시 토큰 0개.
  - 시크릿: `REPORT_ALLOWED_USER_IDS` 는 더 읽지 않는다(지워도 됨) · `EXPO_ACCESS_TOKEN` 은 선택(Expo 강화 보안을 켤 때만).

## 알려진 함정 (다시 밟지 말 것)

- **설치**: session-start 훅의 `pnpm install --prefer-offline` 이 `apps/voice-relay/node_modules` 를 안 만들 수 있다 →
  `pnpm install --filter @giokon/voice-relay` 먼저(안 하면 typecheck TS2688, 테스트가 중계에서 끊겨 모바일까지 안 돈다).
- **배포 순서**: DB 마이그레이션 → `database.types` 대조 → **중계** → 앱 빌드. 역순이면 `session_tick` 부재로 전 세션이 막힌다.
- **enum 값 추가**(`alter type … add value`)는 **단독 마이그레이션**(같은 트랜잭션에서 새 값 사용 불가).
- **회귀 작성**: RPC 인자 안에서 `(select id from <RLS 테이블>)` 로 조회하면 그 시점 `test.uid` 가 비어 NULL 이 들어가 단언이 거짓으로 통과한다 →
  대상 id 는 슈퍼유저로 임시 테이블에 먼저 뽑는다. 임시 테이블에는 테스트 롤 권한을 준다.
- **스토리지 정책**: 정책 하위 질의 안의 `name` 은 `storage.objects.name` 이 아니라 가까운 테이블 칸으로 묶인다(T25.1 결함) — 경로는 함수 인자로 넘긴다.
  테스트 심에 storage 스텁이 없으면 정책 마이그레이션이 통째로 건너뛰어진다.
- **폴백 저장**(`persistWholeSession`): 세션을 만들고 턴·분석·이벤트를 쓴 뒤 **마지막에** `ended`(바로 `ended` 로 넣으면 일지 초안이 발화 없이 잡힌다).
  `safety_events.session_id` 는 `on delete set null` 이라 롤백으로 안 지워진다 → 이벤트는 쓰기 단계 맨 뒤.
  2026-09-29 부터 폴백은 `recording`(실행 불가 기록 전용)으로 넣는다 — `active` 삽입은 DB 가 `started_at` 을 서버 시각으로 덮는다(구버전 앱의 폴백 기록은 시작 시각이 저장 시각이 된다).
- **RN 내장 `URL` 은 `wss://` 의 `pathname` 을 못 읽는다**(항상 `'/'`) → 중계 주소는 `relay-config.ts` 정규식으로 판정. Node 테스트는 통과하니 속지 말 것.
- **Deno**: 확장자 없는 import 를 못 읽는다 → core 의 Edge 공유 파일은 `.ts` 확장자 import(core·mobile·relay tsconfig `allowImportingTsExtensions`).
- **lockfile**: `pnpm add/remove` 가 mobile↔web 사이 eslint·vite peer(jiti·typescript) 배정을 뒤섞는다 — `--frozen-lockfile`·웹 빌드·린트·`expo export` 로 확인.
- **Expo**: `package.json` BOM 이 `eas init` 을 깨뜨린다(`check:bom`) · Android API 36 은 `expo-build-properties` 로 명시 고정 · `react-native-worklets` 0.5.1 고정 ·
  `live/player.ts` 는 `expo-file-system/legacy` · `expo-notifications` 등 네이티브 모듈 추가는 **EAS 재빌드 필요** ·
  `react-native-live-audio-stream@1.1.1` 의 New Architecture 호환은 실기기 미검증. RN 상향은 typecheck 가 아니라 **Metro 번들(Android·iOS) 성공**으로 증명한다.
- **번들 ID 변경 시** EAS·구글/카카오/네이버 콘솔의 패키지명·키해시·URL 스킴도 갱신해야 한다(사용자 작업).
- **R010 은 "부분 해결"** — 이미 열린 공급자 연결을 DB 변경만으로 끊었다고 주장하지 않는다(서버 통제는 중계가 맡는다).
- **컨테이너 egress**: `www.figma.com`·jsdelivr(Pretendard CDN)·`*.supabase.co`(HTTP)·Google 이 막힌다 → Figma 대조는 저장소 PNG, 폰트는 자체 호스팅, DB 는 MCP.
  브라우저는 `/opt/pw-browsers/chromium`(`playwright install` 금지).
- `EXPO_PUBLIC_LIVE_TOKEN_URL` 은 이름과 달리 네이버 로그인 함수 주소 파생에만 쓰인다(`social.ts`).
- "현재 화면에서 호출하지 않는다" ≠ "서버가 허용해도 된다" — 권한 있는 사용자의 직접 API 요청으로 가능한 경로는 서버 계약 결함으로 다룬다.

## 현재 위치 (2026-09-29)

**완료된 큰 묶음**(상세·날짜는 `docs/tasks.md`): 권한 재설계(기관 단위·역할·합류) · 대화 단계·원격 제어·동시 4대 · 앱 직접 모드 제거·어르신 표시 모드·PIN ·
프로그램 일지(D5) + 자동 초안 워커(C4) · 안전 알림 체인(중계 즉시 기록 T21.4 · 푸시 T21.9) · 웹 W1~W9 · 앱·웹 리팩토링 · 웹 선택 메뉴 통일(2026-09-28 사용자 디자인 수정).

**다음 할 일 — 2026-09-27 감사 반영 T25.x**(각 항목의 방향·완료 조건은 `docs/tasks.md` "감사 반영" 두 절):
- DB: ~~T25.11 · T25.18 · T25.19~~(✅ 2026-09-29 코드 — 시작 RPC `start_planned_session` · `planned_by` · `recording` 상태 · 서버 시작 시각 · 어르신당 1세션. 운영 적용 2026-09-29 · 직접 `planned→active` UPDATE 차단은 새 앱이 파일럿 기기 전부에 깔린 뒤 별도 마이그레이션) ·
  T25.4 · T25.5 · T25.8 · T25.12.
- 앱·중계: ~~T25.15~~ → ~~T25.14~~ → ~~T25.17~~(✅ 2026-09-28 코드 — DB `20260928020000` 운영 적용됨 · 중계 배포 후 반영 · 웹 '근거 저장 실패' 표시는 웹 파트) · ~~T25.11 앱 전환~~(같은 묶음 — 운영 DB 적용됨 · 새 EAS 빌드에 싣는다) · T21.11 · T21.12 · T23.5(중계 전용 토큰).
- 웹: T25.2 · T25.3 · T25.6 · T25.7(core·data 포함).
- 검증: T25.16 안전 체인 실기기 종단(중계 배포·EAS 재빌드 뒤 — 파일럿 개시 조건).

**사용자 작업 대기**: 중계 배포(T21.4 포함) · EAS 재빌드(푸시 토큰·알림 수신) · Vercel 운영 배포 설정(T25.9) ·
유출 비밀번호 보호 켜기(T25.13) · `GEMINI_LIVE_MODEL` 운영 시크릿 확인 · `naver-auth` 재배포(도메인 구매 후) · `apps/web/supabase/config.toml` 삭제 여부.

**결정 대기**: 기관 AI 초안 스위치 켜기 · 주황 `#e9822b` 대비(2.73:1 — **배포 직전에 사용자에게 다시 여쭐 것**) · 공단 인정 전제(사람 계획 + AI 진행 + 1인 병렬 감독) ·
지표 분모·수작업 기준선(D8) · 프로그램 일지·수정 이력 보존 기간(법무) · 서버 재시작까지 견디는 위기 근거 저장(요구 확정 시).

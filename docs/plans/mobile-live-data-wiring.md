# 앱 실데이터 배선 계획 (모바일 ↔ 공유 Supabase DB)

> **상태(2026-07-31)**: Phase 1~5 **구현 완료** — 브랜치 `claude/app-development-session-4cvhm5`
> (커밋 `9a6674f`·`50c5be9`·`916ec2d`·`f9872a2`·`4718e72`). 스코프=**핵심 양방향만**
> (관찰지표 집계 화면·Phase 6 세션 예약은 후속). 라이브 경로 실검증은 서울 리전
> Supabase 설정(아래 "확정 필요 사항"·`docs/runbooks/seoul-region-migration.md`) 이후 가능.
> 이 문서는 그 작업의 계획 원본(기록용)이다.

## Context (왜 하는가)

이번 세션의 대화로 아키텍처가 확정됐다: **앱과 웹은 별도 연동 채널 없이 동일한 Supabase
프로젝트/DB 하나를 공유**한다. "앱→웹 전송"의 실제 메커니즘은 공유 DB에 앱이 직접 쓰고
웹이 Realtime으로 읽는 것이고, 방향은 특별한 기능이 아니라 "누가 쓰고 누가 읽느냐"의
문제다(web→app도 대칭으로 성립). 요양보호사 계정을 `auth.users`로 공유해 사용자 통합도
자동 달성된다. 어르신은 무인증(영속 코드+배정 모델).

**문제**: 데이터층(`@giokon/data`의 쓰기/읽기 훅·Realtime·RLS)과 배정 모델은 이미
완성돼 있고 웹은 배선됐지만, **앱(`apps/mobile`)은 아직 목업 Zustand(`useApp` +
`MOCK_*`)로만 동작**한다 — `@giokon/data` 훅을 한 번도 호출하지 않는다(`src/lib/supabase.ts`
주석·`appStore.ts` 참조). 따라서 앱에서 쓴 세션·분석이 웹에 뜨지 않고, 웹의 연대기가
앱에 반영되지 않는다.

**목표**: 앱을 공유 데이터층에 실제로 배선해 이번 대화에서 확인한 양방향 흐름을
라이브로 만든다. **기존 앱 디자인(Figma 19화면 추출본)은 그대로 유지**하고, 화면 JSX는
바꾸지 않으며 데이터 소스만 목업→실데이터로 교체한다. 없는 요소(코드 인계·pending 배너
등)는 기존 컴포넌트(`ui.tsx`·`banners.tsx`)를 재사용해 동일 방식으로 구현한다.
**Supabase 미설정 시 목업 폴백은 그대로 유지**(데모·세션스타트 훅이 의존).

---

## 확정 필요 사항 (아래는 권장 기본값 — 그대로 진행, 원하면 조정)

대화에서 사용자가 AskUserQuestion에 응답하지 않고 "계속"을 지시 → 아래 권장값을 계획에
반영하되, 승인 단계에서 변경 가능하도록 표시한다.

1. **앱 로그인 = 이메일+비밀번호 우선(권장)**. `signInWithEmail`로 세션 내 완전 동작
   (외부 콘솔 작업 불필요). 로그인 화면의 소셜 3종 버튼은 **기존 디자인 유지**하되 OAuth
   콘솔 등록·네이버 모듈 연동 전까지 "준비 중" 안내로 게이트. 계정 생성·온보딩·보호자
   연결은 **웹에 위임**(앱 디자인에 온보딩 화면이 없음 → 새 화면 신설 회피).
2. **어르신 대화 STT = 모의 유지(권장)**. 요양보호사 확인·수정 흐름(`session/correct.tsx`)은
   실 STT 스트리밍·키가 필요해 별도 트랙. 이번엔 대화 진행·안전가드·분석·저장을 전부
   실데이터로 배선하고, 어르신 발화 인식만 `mockStt` 유지(TTS는 이미 `expo-speech`로 실동작).
   기존 `stt-transcribe` Edge Function은 요양일지 음성용(파일 기반)이라 라이브 대화용 아님.
3. **web→app 세션 예약 흐름 = 선택적 Phase 6로 분리(권장)**. 현재 스키마에 `planned`
   상태·예약 테이블이 없어 소규모 마이그레이션+웹 예약 UI+앱 "오늘 할 세션" 수신 화면(신규
   요소)이 필요하다. 코어 배선(Phase 1~5)과 독립적으로 severable 하게 둔다.

---

## 아키텍처 원칙

- **인증**: 웹 `apps/web/src/auth/AuthProvider.tsx`를 **미러링**해 모바일
  `AuthProvider`를 만든다(동일한 `getSession`/`onAuthStateChange`/`getCurrentUserRow`
  패턴). 요양보호사 세션+`users` row(role·org_id)를 앱 전역에 제공.
- **데이터 어댑터 레이어(핵심)**: 화면 JSX를 건드리지 않기 위해
  `apps/mobile/src/data/*`에 앱 전용 훅을 신설한다. 각 훅은 `isSupabaseConfigured`에 따라
  **live(`@giokon/data` 훅 + `mappers`) vs mock(`useApp` 목업 배열)** 을 선택해 화면이
  기대하는 동일 도메인 타입(`ElderProfile`/`ChronicleEntry`/`ConversationLog`/
  `SessionAnalysis`)을 반환. 화면은 `useApp((s)=>...)` 대신 이 어댑터 훅을 호출 → 목업
  폴백과 디자인을 동시에 보존.
- **세션 런타임**: 라이브 대화 상태(active·phase·turns·pendingStt·safety)는 그대로
  `useApp` Zustand 유지(UI/런타임 상태 = Zustand 원칙). DB 영속화는 훅이라 스토어 액션
  안에서 못 부르므로, 세션을 구동하는 화면 계층에 **`useSessionPersistence` 브리지 훅**을
  두어 mutation을 흘려보낸다.
- **재사용**: 신규 도메인 로직 0. 대화·안전·분석은 전부 `@giokon/core`
  (`openConversation`/`respondToUserTurn`/`analyzeSession`) 유지.

---

## Phase 1 — 요양보호사 인증 (Supabase Auth)

- 신설 `apps/mobile/src/auth/AuthProvider.tsx` — 웹 `AuthProvider.tsx` 미러(모바일용:
  `detectSessionInUrl=false`, 스토리지=AsyncStorage는 이미 client에서 처리). `app/_layout.tsx`
  에서 `QueryClientProvider` 안에 래핑 + 인증 게이트(세션 없음→`/login`, 있음→`/main`).
- `app/login.tsx`: `useApp.login`(목업) → **`signInWithEmail`**(설정 시) / 미설정 시 기존
  목업 로그인 폴백. 아이디 찾기=`findLoginEmail`, 비밀번호 찾기=`sendPasswordResetEmail`.
  **소셜 버튼·레이아웃·Wordmark 등 디자인 그대로**, OAuth 미배선 구간은 안내 처리.
- 로그아웃: 기존 위치 유지, `signOut` 연결.
- 온보딩·보호자 연결·계정 생성은 웹 위임(앱 신규 화면 없음).

## Phase 2 — 데이터 읽기 어댑터 레이어

- 신설 `apps/mobile/src/data/`:
  - `useElders()` → live: `useProfiles()`+`toElderProfile`(RLS로 배정된 어르신만) / mock: `useApp`
  - `useChronicles(elderId)` → `useChronicles`+`toChronicleEntry`
  - `useElderSessions(elderId)`/`useLog(id)` → `useSessions`/`useSessionLogs`+`toConversationLog`
  - `useAnalysis(logId)` → `useSessionAnalyses`(+ **`toSessionAnalysis` 매퍼 신설 필요**:
    `mappers.ts`에 session_analyses row↔`SessionAnalysis` 없음 — 소규모 추가)
  - `useElderConsents(elderId)` → `useConsents`
- 화면 스왑(JSX 불변, 셀렉터만 교체): `app/main.tsx`, `app/elder/[id].tsx`,
  `app/chronicle/[id].tsx`, `app/log/[id].tsx`, `app/analysis/[logId].tsx`,
  `app/observations.tsx`, `app/topics/[id].tsx`, `app/consent/[id].tsx`.

## Phase 3 — 세션 실행 영속화 + Realtime

- 신설 `apps/mobile/src/session/useSessionPersistence.ts` — `useApp` 런타임과 다음
  mutation을 브리지:
  - 시작(`beginSession`) → `useCreateSession`(SessionInsert; `status='active'`), 반환 id를
    런타임에 보관.
  - 어르신 턴 확정(`confirmUtterance`) → `useAppendSessionLog`(어르신 턴 + AI 턴), 안전
    이벤트 발생 시 `useRecordSafetyEvent`.
  - 종료(`finishSession`) → `useUpdateSession`(`status='ended'`·ended_at·duration) +
    `useUpsertSessionAnalysis`(`analyzeSession` 결과).
- 화면 배선: `app/session/start.tsx`·`talk.tsx`·`correct.tsx`·`saved.tsx`는 디자인 유지,
  런타임 호출부만 브리지 훅 경유.
- **양방향 Realtime**: `app/_layout.tsx`(또는 main)에서 `useGiokonRealtime` 구독 →
  웹에서 바뀐 연대기·배정이 앱에 즉시 반영(web→app), 앱이 쓴 세션이 웹에 반영(app→web).
  훅은 공용이라 재사용만 하면 됨.
- 미설정 시 전부 기존 목업 경로 유지.

## Phase 4 — 쓰기 화면 배선 (등록·연대기·동의)

- `app/register.tsx`(어르신 등록): `useApp.upsertElder/upsertChronicle` →
  `useCreateProfile`(`toProfileInsert`) + `useCreateChronicle`(`toChronicleInsert`).
- 연대기 편집(`app/chronicle/[id].tsx`): `useUpdateChronicle`/`useCreateChronicle`.
- 동의 수집(`app/consent/[id].tsx`): `useRecordConsent`.
- (선택) 코드로 어르신 인계 필요 시 `useClaimElderByCode` + pending 배너(`banners.tsx`
  재사용) — **기존 컴포넌트로 동일 스타일 구현**.

## Phase 5 — 검증 & 폴백 보존

- 게이트: `pnpm -r typecheck` · `lint` · `test` · `build` · `check:copy`(비의료 카피 린트).
- Metro 번들 스모크(iOS) 통과 확인.
- **미설정(목업) 경로 회귀**: env 없이 앱 전체 화면이 기존처럼 목업으로 동작하는지 확인.
- 설정 경로(로컬/실 Supabase 키 주입 시) 로그인→어르신 목록→세션 실행→저장→분석 조회가
  DB에 반영되고 웹과 실시간 동기화되는지 수동 확인(사용자 키 필요 구간은 문서화).

## Phase 6 — (선택·확정 후) web→app 세션 예약

- 마이그레이션: `session_status`에 `'planned'` 추가(+ `planned_topic`/`planned_by`), RLS 반영.
- 웹: 세션 설계 화면에 "세션 예약" 커밋 UI(기존 웹 컴포넌트 재사용).
- 앱: `main`에 "오늘 할 세션" 수신 목록(신규 요소 — `PatientCard`/`ui.tsx` 스타일 답습),
  시작 시 `planned`→`active` 전환.

---

## 영향 파일 (대표)

- 신설: `apps/mobile/src/auth/AuthProvider.tsx`, `apps/mobile/src/data/*.ts`,
  `apps/mobile/src/session/useSessionPersistence.ts`,
  `packages/data/src/mappers.ts`에 `toSessionAnalysis` 추가.
- 수정: `apps/mobile/app/_layout.tsx`, `app/login.tsx`, 12개 화면의 데이터 셀렉터,
  `src/store/appStore.ts`(목업 데이터 배열은 어댑터가 참조 — 런타임 상태는 유지).
- **불변**: 모든 화면의 레이아웃/스타일 JSX, `src/components/*`, `src/theme.ts`,
  Figma 디자인.

## Verification (end-to-end)

1. `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build && pnpm -r check:copy`
2. `apps/mobile`에서 Metro 번들(iOS) 무오류.
3. env 없이 앱 실행 → 전 화면 목업 동작(회귀).
4. Supabase 키 주입 → 이메일 로그인 → 세션 실행·저장 → 웹 대시보드에 Realtime 반영(양방향)
   수동 확인(실 프로젝트/키는 사용자 외부 작업 M10.1).

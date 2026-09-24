# 작업 목록

> 📌 2026-09-24 정리: 지금 할 일(파일럿 트랙)을 맨 앞에 두고, 2026-04~08 의 작업 분해표(M0~M15)·우선순위·담당·발표 체크리스트는
> 걷어 냈다(원문은 git 이력). 코드 주석이 `T16.x`·`T17.x`·`T19.x`·`T-E3` 를 인용하므로 그 부분만 §3 에 남겼다.
> 무엇을 만들지는 [`plans/pilot-development-plan.md`](plans/pilot-development-plan.md), 출시 점검은 [`plans/launch-checklist.md`](plans/launch-checklist.md).

## 1. 파일럿 트랙 (M20~M23) — 지금 할 일

> **실행 계획의 SoT = [`docs/plans/pilot-development-plan.md`](plans/pilot-development-plan.md)**.
> 아래 태스크의 "계획" 열은 그 문서의 항목 ID(D=DB · M=앱 · W=웹 · C=연동)다.
> 순서는 계획 §10 의 머지 단위 ①~⑤ 를 따른다 — **①(권한 재설계)이 나머지 전부의 선행**.

### M22 — 권한 재설계 (머지 단위 ①) → `PLAN.md` M22.2
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T22.1 | `org_role` 에 `social_worker`·`center_director` 추가 — ⚠️ **단독 마이그레이션**(같은 트랜잭션에서 신규 enum 값 사용 불가) | D1 | — | ⏳ |
| T22.2 | `org_settings`·`org_capabilities` + 조직 생성 시드(행 없으면 기본집합 폴백) + ⚠️ **역할 부여 RPC `set_member_role`**(`org_admin`·`center_director` 만 · 자기 자신 불가 · 보호자↔돌봄팀 전환 불가 · 마지막 `org_admin` 강등 불가). 없으면 새 역할은 0명이다 | D3 | T22.1 | ⏳ |
| T22.3 | `app.is_care_team()`·`app.has_capability()` + **9테이블 RLS 기관 단위 전환**(보호자 브랜치 무변경) | D4 | T22.2 | ⏳ |
| T22.4 | `= 'caregiver'` 비교 전면 grep → `is_care_team()` 치환(새 역할이 조용히 빠지는 것 방지) | §11-8 | T22.3 | ⏳ |
| T22.5 | 권한 매트릭스 UI(3종 × 역할) + 기관 설정 + 구성원 역할 지정 | W6 | T22.3 | ⏳ |
| T22.6 | RLS 회귀 단언: 같은 기관 다른 담당자 열람 성공 · 타 기관·guardian 0건 · 신규 역할 동작 · 위임 on/off · `set_member_role` 거부 4종 · 합류 승인 전 0건 | §12 | T22.3 | ⏳ |
| T22.7 | ⚠️ **직원 합류(파일럿 블로커)** — `org_invites`(초대 코드·합류 후 역할·만료·회수) · `org_join_requests`(pending) · `approve_org_join`(`org_admin`·`center_director` 만, 자기 요청 불가). **`users.org_id` 는 승인 전까지 NULL** — 지금은 가입하는 요양보호사마다 새 기관이 생긴다 | D3 | T22.1 | ⏳ |
| T22.8 | 온보딩 "새 기관 만들기 / 초대 코드로 합류" + 승인 대기 화면 · 기관 관리의 초대 코드 발급·회수·합류 승인("승인하면 기관 전체 기록 열람" 명시) | W9, W6 | T22.7 | ⏳ |

### M20 — 프로그램 일지 자동 생성 (머지 단위 ②) → `PLAN.md` M20
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T20.1 | `care_journals`·`journal_photos` DROP → `program_journals`(공단 12필드 개별 컬럼)·`program_journal_photos`·`program_journal_revisions`·`journal_generation_jobs` + `care_grade` | D5 | T22.3 | ⏳ |
| T20.2 | 트리거 4종: **확정 가드(`auth.uid() is null` 이면 `final` 불가)** · 확정 후 수정 이력 · 세션 종료 enqueue · 공개 게이트 | D5 | T20.1 | ⏳ |
| T20.3 | `generated-session.ts` 확장 — 공단 필드·보호자 문장 스키마, 금지어 `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장` 추가 | C2 | — | ⏳ |
| T20.4 | `program-journal.ts` 신규 — `mapAnalysisToJournalFields`·`screenJournalDraft`(적중 필드만 비움)·`buildGuardianText` | C2 | T20.3 | ⏳ |
| T20.5 | ⚠️ `session-report` 의 `REPORT_ALLOWED_USER_IDS` 데모 허용목록 → org 게이트(안 하면 파일럿 전원 403) | C4 | — | ⏳ |
| T20.6 | 워커 `program-journal-draft`(큐 소비·지수 백오프·`attempts>5` 실패) — **`pending_review` 까지만** | C4 | T20.2, T20.5 | ⏳ |
| T20.7 | 앱 폴백 저장 순서 정리(세션 생성 → 턴·분석 → `ended`) | M7 | — | ✅ (2026-09-24) |
| T20.8 | 웹 프로그램 일지 목록·상세·확정·이력·재시도 + 네비 이름 변경 | W1, W3 | T20.6 | ⏳ |
| T20.9 | 보호자 표현 전환(판정형→기술형·고정 문구·`guardian_text` 만 렌더) + `session_summary` 미렌더 버그 | W4 | T20.8 | ⏳ |

### M21 — 감독 화면 + 대화 단계 (머지 단위 ③) → `PLAN.md` M21·M22.1
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T21.1 | `session_phase` + `sessions` 컬럼 7개 + `session_interventions` + RPC `session_tick`·`advance_session_phase`·`request_session_control`. 목표 시간은 **기존 `duration_minutes` 재사용**(새 컬럼 금지) | D6 | T22.3 | ⏳ |
| T21.2 | `session-phase.ts` 신규(`buildPhaseDirective`·`shouldAdvancePhase`) + `prompt.ts` `PROMPT_VERSION='v2.0'` persist | C2 | — | ⏳ |
| T21.3 | 중계: 2초 폴 → `session_tick` · 단계 지시 주입(`resumeContext` 와 같은 경로) · 원격 제어 처리 | C3 | T21.1, T21.2 | ⏳ |
| T21.4 | ⚠️ 중계: `assessUtterance` 적중 시 **`safety_events` 즉시 INSERT**(실시간 푸시의 선결) | C3 | T21.3 | ⏳ |
| T21.5 | 웹 감독 화면(반응형) + 원격 일시정지·재개·종료 | W2 | T21.3 | ⏳ |
| T21.6 | 앱 원격 제어 수신("잠시 쉬어요" + 마이크 중단) | M5 | T21.3 | ⏳ |
| T21.7 | 세션 설계: 목표 시간(기존 `duration_minutes`, 초기값을 고정 15분 대신 기관 설정에서) · 단계 미리보기 · 기관 기본 피할 주제 | W5 | T21.1 | ⏳ |
| T21.11 | 종료 정책(✅ 권장안 확정 2026-09-24) — 휴식 요청·거부는 즉시 종료 → 마무리 단계 전환 + 감독 화면 알림. 위기·급성 고통은 즉시 종료 **유지** | §9-5 | T21.3 | ⏳ |
| T21.12 | **세션 최대 10분** — 중계 연결 수명 25분 → 10분(서버 고정값), 마무리 단계 진입 시점을 10분 안에서, 세션 설계 선택지 10분 이하 | §9-6 | T21.3 | ⏳ |
| T21.13 | **요양보호사 1명당 동시 최대 4대** — `active` 전환 시 DB 가 같은 감독자의 `active` 수를 세어 5번째를 거절 · 앱은 이유 표시 | §6 | T21.1 | ⏳ |
| T21.14 | `live-token` 한도 조정 — 사용자 분당 3 → 4 이상, 일 한도는 운영 시간 기준 재계산 | §6 | — | ⏳ |

### M23 — core 정리 + 어르신 표시 모드 (머지 단위 ④, **반드시 한 PR**) → `PLAN.md` M22.1·M23
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T23.1 | `ai.ts`·`voice-flow.ts`·`buildJournalDraft` 삭제 · `respondToUserTurn` → `evaluateUserTurn` 축소 · **안전 계층 유지** | C1 | — | ✅ (2026-09-24 · `buildJournalDraft` 는 웹이 아직 써서 W1 때 삭제) |
| T23.2 | 직접 모드 제거 — `RELAY_MODE` 분기 삭제, `EXPO_PUBLIC_VOICE_RELAY_URL` 필수화 | M1 | T23.1 | ✅ (2026-09-24) |
| T23.3 | 어르신 표시 모드 분리(`elder.tsx`) + 어르신 화면에서 요양보호사 UI 제거 | M2, M3 | T23.2 | ⏳ |
| T23.4 | 복귀 게이트(숨김 제스처 또는 PIN) | M4 | T23.3 | ⏳ |
| T23.5 | ⚠️ **`live-token` 중계 전용화** — 지금은 요양보호사 JWT 만으로 Gemini 단기 토큰이 나가 구버전 앱·JWT 소지자가 중계(출력 검열)를 건너뛸 수 있다. 중계만 가진 자격을 추가로 요구, 없으면 403 | C4 | T23.2 | ⏳ |

### 푸시 (머지 단위 ⑤)
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T21.8 | `push_tokens` + `notifications.pushed_at` + `notification_kind` 확장(단독 파일) | D2, D7 | — | ⏳ |
| T21.9 | 워커 `push-dispatch`(Expo Push) — ⚠️ 본문에 어르신 성함·발화 금지 | C4 | T21.8, T21.4 | ⏳ |
| T21.10 | 앱 푸시 토큰 등록 — ⚠️ EAS 재빌드 필요 | M6 | T21.8 | ⏳ |

### 공통·선결
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T24.1 | ⚠️ **어르신 동의 부여/철회 UI** — `ElderDetailPage.tsx:434` 가 없는 라우트를 가리킨다. **파일럿 블로커** | W7 | — | ⏳ |
| T24.2 | `product_events` + 삽입 함수 — "시간 절감"의 유일한 증거. **1주차에 넣는다** | D8 | — | ⏳ |
| T24.3 | 어르신 `care_grade` 입력(주간보호 필수) | W8 | T20.1 | ⏳ |
| T24.4 | 동의 버전 단일화(`app.current_consent_version()`) | D10 | — | ⏳ |
| T24.5 | gemini-3.8-live 기준 재검증 — 폴백 상수 2곳·`client.ts` 설계 근거 주석(3.1에서 도출한 제약) | — | — | ⏳ |
| T24.6 | ✅ **결정(2026-09-24)** — 신규 화면은 기존 디자인과 최대한 같게 최소 구현, 시안이 오면 교체 | §7 | — | ✅ 결정 |
| T24.7 | ✅ **결정(2026-09-24)** — 태블릿 지원(`supportsTablet: true` 반영 완료) · 세션 최대 10분 · 요양보호사 1명당 동시 최대 4대 | §2 | — | ✅ 결정 |

## 2. 완료된 기반 작업 (요약)

| 묶음 | 내용 | 상태 |
|---|---|---|
| M0~M8 | 모노레포 · `packages/core`·`data`·`theme` · Supabase 스키마 · 웹 · 모바일 앱 · 실 AI 연동 · 배포 기반 | ✅ (모바일 실기기·스토어 배포는 [출시 점검표](plans/launch-checklist.md)) |
| M9~M15 | 동의·개인정보 · 보안(서울 리전·RLS·감사 로그) · AI 안전 · 접근성 · 조직·역할 · 웹 디자인 이관 | ✅ 기반 완료 · 남은 운영 과제는 [`security.md`](security.md)·[`compliance.md`](compliance.md) |
| R001~R012 | 감사에서 나온 보안 과제 | ✅ 대부분 운영 반영 — [`runbooks/security-fixes.md`](runbooks/security-fixes.md) |
| 음성 중계 | 중계 서버 · 출력 검증 · CLOVA · 재생 확인 v2 · 복구 맥락 v3 | ✅ 코드 · 운영 배포 전 |

## 3. 완료된 작업 색인 — M16~M19 (코드 주석이 인용하는 번호)

> 확정 구조: 앱(Expo)=요양보호사 세션 실행(환자는 대화만) → 종료 시 AI 요약·분석 →
> Supabase Realtime → 웹 관리·분석 허브(조회·세션설계·요양일지·보호자 커밋·AI 에이전트) →
> 보호자 웹(커밋된 것만). 백엔드는 앱·웹 공용. 상세: `PLAN.md` §2′ M16–M19 · "웹 1차 MVP 재정의".
> 🗣️ 2026-07-13 현직자 인터뷰 반영: M17 확장(T17.0·T17.4)·M18 개정(보호자 설명)·**M19 신설(요양일지)**·Phase W 실행 순서. 입력: 현직자 인터뷰(요약 `docs/product.md` §9).
> 🔐 2026-07-16 인증 개편(계획): 소셜 로그인 3종(구글·카카오·네이버)·이메일 로그인 제거·온보딩 회원가입·보호자 어르신 연결(가입+로그인 후) — T17.4 개정·**T17.5~T17.7 신설**.
> ✅ **2026-07-19 웹 1차 MVP 구현 완료(Phase W1~W6)**: 인증·접근통제(W1) → 세션 DB+Realtime(W2) →
> 분석 페이지(W3) → 요양일지(W4) → 공개 체크리스트·보호자 타임라인(W5) → AI 에이전트 mock(W6).
> 검증: typecheck·lint·test(core 135+data 12)·build·check:copy·RLS 회귀(로컬 PG16)·라우트 스모크
> 17/17(`apps/web/scripts/route-smoke.mjs`). 잔여=실 AI·서울 리전 연동(사용자 외부 작업, 절단선 참조).
> 🔑 **2026-07-22 어르신 영속 코드 + 요양보호사 배정 재설계**: 담당 변경/추가 시 기존 기록 인계.
> `elder_codes`(영속·비소진, 보호자 미열람)·`profile_caregivers`(배정) 신설, 자식 복합 FK 완화,
> 코어+파생 9테이블 RLS 배정 기반 재작성(같은 기관 격리 유지), `claim_elder_by_code`/
> `link_guardian_by_elder_code`(구 1회성 redeem 대체). QR·`/join`·qrcode.react 제거. 마이그레이션
> `20260722100000`, 회귀 §5.7 재작성·§5.7b(연속성) 신설, 라우트 스모크 16/16.
> 🔑 **2026-07-22 후속(적대적 리뷰·기관 합류 승인형)**: 마이그레이션 `20260722110000`(enum
> `pending`)·`20260722120000`. (1) 코드 회전 결정성 버그 → 서버 `rotate_elder_code` RPC·잔여 QR
> 카피 정리. (2) **요양보호사 기관 합류 승인형**: 온보딩에서 어르신 코드로 기존 기관 합류 요청
> (`status='pending'`)·`approve_caregiver_assignment`(활성 담당/admin 승인·자가승인 3중 차단)·
> claim 활성멤버 가드·pending 배너/승인 UI. §5.7b 실제 온보딩→승인 경로 재작성·§5.7c(회전) 신설.
> 전 게이트 재통과.

### 선행 — 세션 영속화 + Realtime (Phase E 갭 해소)

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T-E1 | 세션 설계 CRUD 훅(`useCreateSession`/`useUpdateSession`/`useDeleteSession`) — 웹 세션 설계를 store→Supabase | T10.1 | ✅ (2026-07-19 웹 MVP) |
| T-E2 | 세션 런타임 쓰기(start/append-turn/end) 경로 — 앱→Edge Function(provider 보호), 로그 DB 적재 | T16.2 | ⏳ 실AI |
| T-E3 | 웹 Realtime 구독 훅(sessions·session_logs·session_analyses) — 앱 종료 시 대시보드 실시간 반영 | T-E1 | ✅ (2026-07-19 웹 MVP) |

### M16 — 대화 분석·요약 파이프라인 → `core/analysis`

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T16.1 | `session_analyses` 마이그레이션(`core/analysis` SessionAnalysis JSON·버전, RLS 조직범위 **guardian 제외**·감사) — 앱이 종료 시 insert | T14.1 | ✅ (2026-07-19 웹 MVP) |
| T16.2 | 분석 엔진 `core/analysis`(관찰 지표·주제 호응/저조·추천) + Structured Outputs 스키마 | — | ✅ mock 완료 |
| T16.3 | 주제 추천 `recommendNextTopics`(연대기+과거 분석 기반) — 앱·웹 공용 | T16.2 | ✅ mock 완료 |
| T16.4 | **웹 분석 페이지(SCR-W07)**: 개인/전체(관찰 지표) + Realtime 실시간 반영·새 분석 배지 | T16.1, T-E3 | ✅ (2026-07-19 웹 MVP) |
| T16.5 | Edge Function `analyze-session`(대화 종료 트리거, mock→실 전환) | T16.1, 실AI | ⏳ |

### M17 — 보호자 연결·공개 커밋 → `docs/compliance.md`

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T17.0 | **보안 RLS 가드(필수 선행)**: `safety_events_select_org`에 guardian 배제(`current_org_role() <> 'guardian'`) — 보호자 기관 합류 시 위기 발췌 열람 차단 | T14.1 | ✅ (2026-07-19 웹 MVP) |
| T17.1 | `profile_guardians`(연결·pending/approved/revoked·승인자) + `guardian_invites`(**어르신별 1회성·72h 초대 코드**, QR=코드 URL) 마이그레이션 + RLS·감사 | T14.1, T9.1 | ✅ (2026-07-19 웹 MVP) |
| T17.2 | **공개 체크리스트(SCR-W08)**: `guardian_shares`(유형[일지/분석/세션요약/리포트]·철회) + 일일 체크리스트 UI(체크→미리보기→공개) + RLS(보호자=승인 연결+미철회만) + 감사 | T17.0, T17.1 | ✅ (2026-07-19 웹 MVP) |
| T17.3 | **보호자 대시보드 재작성(SCR-W09)**: 커밋 데이터 타임라인만. 시연용 GuardianLogin/Home **삭제**, 보호자=Supabase Auth(role=guardian)+GuardianGuard | T17.2 | ✅ (2026-07-19 웹 MVP) |
| T17.4 | **가입·라우팅 개편(2026-07-16)**: `handle_new_user` 최소 row 재작업(org_admin 강제 폐지)·`users.org_id` NULL 허용+`phone`·`onboarded_at` + 통합 로그인·**온보딩 게이트**·역할 자동 라우팅 + 랜딩 재작성(SCR-W05, 소개+소셜 로그인 CTA) | T17.1 | ✅ (2026-07-19 웹 MVP) |
| T17.5 | **소셜 로그인·이메일 로그인 제거**: `auth.ts` 이메일 4함수 제거→`signInWithProvider(google/kakao)`, **네이버=커스텀 Edge Function `naver-auth`**(비네이티브). `/caregiver/reset`·비번찾기·설정 비번변경 삭제. 소셜 3버튼 UI(SCR-W05) | T17.4 | ✅ (2026-07-19 웹 MVP) |
| T17.6 | **온보딩 회원가입(SCR-W12)**: `/onboarding` 폼(이름·전화·역할·기관명 또는 어르신 코드[합류]·동의) + `app.complete_onboarding` RPC + `AuthProvider` users(role·org_id·onboarded_at) 노출·`useCurrentUser()` | T17.4, T17.5 | ✅ (2026-07-19 웹 MVP · 07-22 합류 승인형) |
| T17.7 | **보호자 어르신 연결(재사용)**: `redeem_guardian_invite(p_code)` RPC(72h·1회성→pending) — 온보딩 코드 입력 + 보호자 대시보드 "**어르신 연결**"(SCR-W10 확장) 공용 | T17.1, T17.6 | ✅ (2026-07-19 웹 MVP) |

### M18 — AI 에이전트(웹) → 요양보호사 보조 + 보호자 설명

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T18.1 | 도구화 3종: **일지 초안**(M19)·**공개 실행**(M17.2 대행)·**데이터 설명**(보호자용) — 서버 검증 + **실행 전 사람 확인 게이트** | T16, T17, T19 | ✅ (2026-07-19 웹 MVP) |
| T18.2 | 작업 지향 대화 에이전트(SCR-W11): 요양보호사=초안·공개 대행·요약 / 보호자=**커밋 데이터만 근거** 설명(관찰 지표 언어·진단 표현 금지). MVP=mock, 실 LLM 무변경 전환 | T18.1 | ✅ (2026-07-19 웹 MVP) |

### ~~M19 — 요양일지 (현직자 1순위 요청, 2026-07-13 신설)~~ → **폐기, M20 프로그램 일지로 대체(2026-09-23)**

> ⚠️ 아래 T19.x 는 당시 기록이다. **T19.3(실 AI 파이프라인, ⏳)은 착수하지 않고 폐기한다** —
> 음성 입력 경로는 "요양보호사 음성 자가기록"(기획서 §5-1 삭제 대상)에 해당하고, 일지 자체가
> 공단 형식 프로그램 일지로 바뀐다. 기존 `care_journals` 데이터는 삭제(사용자 확정).

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T19.1 | `care_journals` 마이그레이션(내용·source[photo/voice/typed/ai_draft]·사진 경로·draft/final) + Storage `journal-photos`(private) + RLS 조직 패턴(guardian 직접 접근 불가) + **민감정보 취급**(동의·보관파기)·감사 | T14.1 | ✅ (2026-07-19 웹 MVP) |
| T19.2 | 작성 UI(SCR-W06): 사진 업로드 / 타이핑 / 음성 입력 3경로 + AI 초안 → **요양보호사 확인 후 저장** | T19.1 | ✅ (2026-07-19 웹 MVP) |
| T19.3 | 실 AI 파이프라인: 사진→LLM 비전·음성→STT Edge Function(그 전 mock) | T19.1, 실AI | ❌ 폐기(2026-09-23) |
| T19.4 | 일지 → 공개 체크리스트(M17.2) 항목 연동 | T19.2, T17.2 | ✅ (2026-07-19 웹 MVP) |

# 파일럿 개발 계획 — 인지활동 프로그램 + 공단 일지 자동화

> **이 문서가 "무엇을 만들지"의 단일 소스(SoT)다(2026-09-23 기획 변경).**
> 이전 실행 목록(`non-db-development-backlog.md` N01~N35, `business-plan-development-delta.md`
> D1~D11)은 **이전 제품 정의를 전제**하므로 이 문서가 대체한다. 역사 기록으로만 참조할 것.
> 목표는 **파일럿 테스트 가능 수준**이지 정식 출시가 아니다.
> ⚠️ **번호 주의**: 이 문서의 `D1~D10` 은 **DB 파트 항목 번호**다. 대체된
> `business-plan-development-delta.md` 의 `D1~D11`(사업 기획 델타)과 **이름만 같고 무관**하다.
> 다른 문서에서 이 번호를 인용할 때는 "파일럿 계획 D5"처럼 출처를 붙인다.

## 1. 무엇이 바뀌었나

| | |
|---|---|
| 변경 전 | 요양보호사 업무를 전반적으로 돕는 도구(회상 대화 + 요양일지 + 보호자 소통) |
| 변경 후 | **인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로 남는 도구.** 요양보호사는 계획하고 감독하며 확인한다 |

케어포·엔젤시스템·이지케어가 청구·급여기록·보호자 앱을 이미 갖고 있어 "업무 보조"로는 이길 수 없다.
반면 **인지활동은 의무인데 비어 있는 영역**이다 — 요양원은 주 3회 이상 운영해야 하고 기록이 없으면
평가에서 깎이는데, 기존 ERP의 인지활동 기능은 인쇄용 활동지와 영상 콘텐츠 수준이다.
어르신 한 분의 인생사에 맞춘 1:1 대화가 곧바로 공식 기록이 되는 것은 아무도 하지 않고 있다.

### 판단이 애매할 때 쓰는 기준 셋

1. **이 기능을 기존 ERP가 이미 하는가?** → 그렇다면 만들지 않는다.
2. **AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는가?** → 그렇다면 막는다.
   제도상 AI 단독 진행은 인정받기 어렵다. 사람이 계획·감독·확정한 흔적을 데이터로 남기는 것
   자체가 기능이다. **테스트 케이스로 검증한다.**
3. **이 기능이 "제공 횟수·기록 품질·시간 절감"을 측정 가능하게 하는가?** → 그렇다면 로그를 남긴다.
   시설 무료 + 정부 사업(용역·R&D) 수익 구조라 측정이 곧 매출 근거다.

## 2. 파일럿 범위 (사용자 확정 2026-09-23)

| 항목 | 결정 |
|---|---|
| 기능 범위 | 프로그램 일지 자동생성 · 분석→일지 매핑 · 감독 화면 · 안전 이벤트 푸시 · 대화 정책 체계화 · 권한 재설계 · 고령자 UI |
| 요양일지 → 프로그램 일지 | 전환. 기존 `care_journals` 데이터는 **삭제** |
| ERP API 연동 | 보류(붙여넣기 포맷 복사로 대체, 파일럿 범위 밖) |
| 보호자 옛 사진 | 검수 후 연대기 반영으로 확정(파일럿 범위 밖) |
| 보호자→요양보호사 메시지 | 이번 범위 밖 — **동결이지 제거가 아니다** |
| 시설 유형 | **요양원 + 주간보호** |
| 대화 모델 | **gemini-3.8-live** |
| 음성 경로 | **중계 단일화** — 직접 Gemini Live 폐기 |
| 감독 화면 | **웹 우선**(반응형). 앱에는 만들지 않는다 |
| 파일럿 규모 | 1기관 · 동시 2~4대 |

**범위 밖이지만 데이터는 지금부터 남긴다**: 월간 계획표·현황판·"평소와 다름" 플래그·
카카오 알림톡·ERP 복사. 나중에 붙일 때 소급 계산이 불가능한 값(관찰 지표 기준선, 작성 시간 델타)이
있기 때문이다.

## 3. 현재 상태에서 출발하며 알아야 할 것

**① 권한 모델이 기획서와 정반대다.** 기획서는 기관 단위 격리를 요구하는데(교대근무라 오후
담당자가 오전 담당자의 세션 기록을 봐야 한다), 현재는 **요양보호사별 배정 격리**다 —
`20260722100000_elder_codes_caregiver_assignment.sql` 이 9개 테이블 정책을
`app.is_assigned_caregiver(profile_id)` 기반으로 재작성했다. 역할도
`org_admin|caregiver|guardian` 3종뿐이라 사회복지사·센터장이 없다. **모든 작업의 선행 조건.**

**② 일지가 기획서 요구를 담을 수 없다.** `care_journals.status` 는 `draft|final` 2상태,
공단 서식 필드 없음, `content` 자유서술 한 칸. 초안 생성은 전부 **수동 버튼**이다.

**③ 규칙 기반 대화는 중계 모드에서 이미 죽어 있다.** `packages/core/src/ai.ts`(779줄)의
`generateReply` 결과 질문은 중계 모드에서 계산되고 **버려진다**. 중계로 단일화하면 폴백 용도까지
없어져 파일 전체를 삭제할 수 있다.

**④ 어르신이 든 화면에 요양보호사 UI 가 그대로 있다.** 위기 배너(전화번호 포함), STT 수정 패널,
확인 없이 세션을 끝내는 X 버튼이 한 화면에 있다. 어르신 표시 모드 분리는 신규 기능이기 전에
**현 상태의 결함 수정**이다.

**⑤ 푸시가 통째로 없다.** FCM·APNs·expo-notifications 참조가 저장소에 0건이다.

**⑥ 생성문 검증은 이미 강하다 — 재사용 자산.** `packages/core/src/generated-session.ts` 가
모든 문장에 어르신 발화의 `turnId` + 원문 인용을 강제하고(`GroundedClaim`), 진단·효능 표현을
정규식으로 막으며, `handler.ts`·`provider.ts` 양쪽에서 검증한다. **새로 만들지 말고 확장한다.**
못 막는 것만 추가하면 된다: `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장`.

**⑦ 동의 가드는 튼튼하나 철회 UI 가 없다.** DB 트리거가 `PROCESSING_CONSENT_REQUIRED` 로 막고
`app.stop_unconsented_sessions()` 도 있는데, `ElderDetailPage.tsx:434` 가 존재하지 않는 라우트를
가리켜 `/` 로 튕긴다. **파일럿 블로커.**

## 4. 설계 결정과 근거

**A. 역할은 enum 확장, 권한은 별도 테이블.** `org_role` 에 `social_worker`·`center_director` 를
추가한다 — 기존 9테이블 RLS 의 핵심 술어가 `current_org_role() <> 'guardian'` 이라
**보호자 격리가 코드 변경 0으로 유지**된다. 기관별 위임은
`org_capabilities(org_id, capability, allowed_roles org_role[])` 테이블로 둔다(RLS 에 역할을
하드코딩하면 위임을 바꿀 때마다 마이그레이션이 필요하다). 읽기 술어는 `app.is_care_team()` 으로
바꾸되 `app.is_assigned_caregiver()` 는 **삭제하지 않는다** — 알림 타깃팅과 "내 담당" 필터가 쓴다.

**B. 일지는 새 테이블 `program_journals`.** 데이터 삭제가 확정이라 가능하다. 공단 필드는 jsonb 가
아니라 **개별 컬럼**으로 둔다 — 길이 제약·진단표현 린트·부분 수정·이력 diff 가 전부 컬럼 단위여야
의미가 있다. `session_analyses.analysis` 가 불투명 jsonb 라서 지금 아무 집계도 못 하는 게 반례다.
공개 여부는 status 에 넣지 않고 **기존 `guardian_shares` 를 재사용**한다(철회·열람 이력이 이미 있다).

**C. 초안 자동 생성 = DB 트리거 → 큐 → 외부 워커.** 동기 호출은 불가능하다 —
`persistWholeSession`(폴백) 경로에서는 세션이 `ended` 가 될 때 분석 행이 아직 없다.

**D. 대화 단계는 `sessions` 컬럼.** 중계 메모리는 프로세스 재시작에 소실되고, 별도 테이블은 배선이
는다. `sessions` 는 이미 realtime publication 에 있어 감독 화면이 배선 0으로 단계를 본다.
**중계의 기존 2초 폴(`can_process_session`)을 `session_tick` RPC 로 교체**해 단계·원격 제어를
합승시킨다 — 새 타이머·소켓·인증이 없다.

**E. 원격 제어는 DB 행 + Realtime.** broadcast 는 RLS 를 타지 않아 기관 격리를 손으로 짜야 하는데,
이 시스템의 모든 격리는 RLS 가 한다. 게다가 "누가 언제 개입했나"가 제도 증빙이라 어차피 행이 남아야 한다.

**F. 푸시는 Expo Push.** 앱이 Expo SDK 54 managed 라 EAS 가 FCM/APNs 자격증명을 관리한다.
발송자는 트리거가 아니라 **`notifications` 행 소비자**로 둔다 — `app.notify_safety_event()` 가
이미 수신자 결정과 멱등 유니크를 갖고 있으므로 그 위에 얇게 얹는다.

**G. 직접(비중계) 모드 폐기.** 검열되지 않은 Gemini 오디오 경로가 코드에 살아있는 한 기준 2가
코드 레벨에서 거짓이다. 단계·원격 제어·안전 일시정지가 전부 서버 권위인데 직접 모드에는 서버가 없다.

---

## 5. DB 파트

작업 순서 = 마이그레이션 파일 순서. 전부 append-only(기존 53개 파일 무수정).

| # | 파일 | 내용 |
|---|---|---|
| **D1** | `..._org_role_add_values.sql` | `alter type org_role add value 'social_worker'/'center_director'` — ⚠️ **이 파일에 다른 DDL 금지**. 같은 트랜잭션에서 신규 enum 값을 쓸 수 없다 |
| **D2** | `..._notification_kind_add_values.sql` | `session_paused`·`journal_ready`·`journal_failed`. D1과 같은 제약 |
| **D3** | `..._org_settings_capabilities.sql` | `org_settings`(facility_type·target_minutes·default_avoid_topics·default_program_type·default_location), `org_capability` enum, `org_capabilities`, 조직 생성 시드 트리거. 행이 없으면 기본집합으로 폴백(기존 조직 안전). **역할 부여 RPC `public.set_member_role(target, role)`** — 아래 "역할을 부여하는 경로" 참조 |
| **D4** | `..._org_scoped_rls.sql` | `app.is_care_team()`·`app.has_capability()` 신설. 9테이블 SELECT/UPDATE 술어를 `org_id = current_org_id() and is_care_team()` 로 교체. **보호자 브랜치는 복사해 무변경 유지**. DELETE 정책은 **교체하지 않는다**(배정·관리자 기준 유지 — 교대근무가 요구하는 것은 열람·기록이지 삭제가 아니다) |
| **D5** | `..._program_journals.sql` | `care_journals`·`journal_photos` DROP. `program_journals`·`program_journal_photos`·`program_journal_revisions`·`journal_generation_jobs` 신설 + 트리거 4종(확정 가드·이력·enqueue·공개 게이트). `care_grade` enum + `profiles.care_grade` 포함 |
| **D6** | `..._session_phase_supervision.sql` | `session_phase` enum, `sessions` 컬럼 7개(phase·phase_started_at·paused_at/by·pause_reason·control_request·prompt_version), `session_interventions`, RPC `session_tick`/`advance_session_phase`/`request_session_control`. ⚠️ **목표 시간 컬럼은 새로 만들지 않는다** — `sessions.duration_minutes`(`20260822020000`, 5~120분, 웹 세션 설계의 "예상 소요 시간")가 이미 그 값이다. 비어 있으면 `org_settings.target_minutes` 로 폴백 |
| **D7** | `..._push_tokens.sql` | `push_tokens`(본인 only RLS), `notifications.pushed_at` |
| **D8** | `..._product_events.sql` | `product_events(event_key, payload, ...)` + definer 삽입 함수 |
| **D9** | D5·D6 말미 | realtime publication 에 `program_journals`·`session_interventions` 추가. ⚠️ `if exists (pg_publication)` 가드 필수(CI는 순정 PG16) |
| **D10** | 권고 | `app.current_consent_version()` 1개로 통일 — 지금 `'v1.0'` 이 SQL·TS 양쪽에 하드코딩돼 드리프트한다 |

### 역할을 부여하는 경로 (D3 · W6)

지금 역할을 바꾸는 길은 **온보딩 RPC 하나뿐**이다 — `20260908000000_users_privilege_hardening.sql`
이 `users.role` 직접 쓰기를 컬럼 권한·트리거·정책 3중으로 막았고, 온보딩은 요양보호사·보호자만
고를 수 있다. enum 에 `social_worker`·`center_director` 를 추가해도 **그 역할을 가질 방법이 없다.**
그대로 두면 기본 위임(사회복지사·센터장)만 켜진 기관에서 일지를 확정할 사람이 0명이 된다.

- `public.set_member_role(target_user_id, role)` — SECURITY DEFINER RPC, 3중 방어의 **신뢰된 우회로**.
  호출자는 같은 기관의 `org_admin`·`center_director` 만. **자기 자신은 바꿀 수 없다**(셀프 승격 차단 원칙 유지).
  보호자(`guardian`) ↔ 돌봄팀 역할 간 전환은 금지(보호자 격리가 역할 하나로 무너지지 않게).
  기관의 마지막 `org_admin` 은 강등 불가. 변경은 `audit_log` 에 남긴다.
- **권한 매트릭스 편집 자체는 위임 대상이 아니다** — `org_admin`·`center_director` 고정.
  편집권을 위임할 수 있으면 위임받은 사람이 스스로 모든 권한을 켤 수 있다.
- 3개 위임 항목의 기본 허용 = 사회복지사·센터장(기획서 예시) + `org_admin`.
  매트릭스를 고칠 수 있는 역할을 기본값에서 빼 봐야 스스로 켜면 그만이라 의미가 없다.
- RLS 회귀: 요양보호사가 호출 = 실패 · 자기 자신 대상 = 실패 · 타 기관 대상 = 실패 · 보호자 → 돌봄팀 = 실패.

### 자동 확정 차단을 DB 가 집행한다

`program_journals` BEFORE UPDATE 트리거에서 `status='final'` 전환 시 **`auth.uid() is null` 이면
예외**를 던진다. service_role 로 도는 워커는 `final` 을 **물리적으로 쓸 수 없다.**
이것이 기준 2의 DB 레벨 집행이다.

### `program_journals` 핵심 스키마

- 식별: `session_id`(unique, 미제공 일지는 null 허용)
- 상태: `generating | pending_review | final | failed`
- 공단 서식: `program_type`(기본 "인지활동 - 회상훈련") · `operated_from/to`(세션 시작·종료) ·
  `location` · **`facilitator_user_id`**(진행자 = 감독한 요양보호사. **AI 아님**) · `participants` ·
  `goal`(세션 설계 승계) · `activity_content` · `participant_response` ·
  **`opinion_collected`**(의견수렴 — 신규) · `overall_evaluation` · `next_plan` ·
  `tool_used`(기본 "AI 대화 프로그램 보조")
- 주간보호: `delivered` · `non_delivery_reason`(결석/컨디션난조/거부/기타)
- 보호자: `guardian_text` · `guardian_text_approved_by/at`
- 확정·생성: `finalized_by/at` · `draft_generated_at` · `generation_attempts` · `last_error`

⚠️ **주간보호 출석 테이블은 만들지 않는다**(기준 1 — ERP 영역). 제공 여부는 `program_journals`
행의 유무와 `delivered`/`non_delivery_reason` 으로만 표현한다. 이게 "제공 횟수"의 분모·분자를
동시에 준다.

---

## 6. 앱 파트 (`apps/mobile`)

| # | 내용 | 파일 |
|---|---|---|
| **M1** | **직접 모드 제거** — `RELAY_MODE` 분기·직접 UI 전체 삭제. `EXPO_PUBLIC_VOICE_RELAY_URL` 미설정 시 세션 시작 차단 | `app/session/talk.tsx`, `src/store/appStore.ts` |
| **M2** | **어르신 표시 모드 분리** — `talk.tsx`(요양보호사) + `app/session/elder.tsx`(표시 전용) 신설, 공용 로직은 `src/features/session/` 으로 추출 | 신규 + 기존 |
| **M3** | 어르신 화면에서 **반드시 제거**: 위기 배너 전화번호(`talk.tsx:377-389`) · STT 수정 패널(`:570-648`) · 중계 컨트롤(`:433-466`) · 확인 없이 종료하는 X(`:371`). ⚠️ 위기 안내(전화번호·사람 연결)는 **없애는 게 아니라 옮긴다** — 요양보호사 모드와 감독 화면(W2)의 위기 카드로. 어르신 화면에서만 빠진다 | `talk.tsx` |
| **M4** | 복귀 게이트 — 숨김 제스처(4모서리 순차 탭) 또는 PIN(`expo-secure-store`) | `elder.tsx` |
| **M5** | 원격 제어 수신 — `{relayControl:{state:'paused'}}` → "잠시 쉬어요" 화면 + 마이크 중단 | `src/features/session/` |
| **M6** | 푸시 토큰 등록 — `expo-notifications` 권한 → `getExpoPushTokenAsync()` → `push_tokens` upsert. 로그아웃 시 `revoked_at`. ⚠️ `app.json` 플러그인 추가 → **EAS 재빌드 필요** | 신규 |
| **M7** | `persistWholeSession`(폴백) 저장 순서를 `finalizeSession` 과 맞춘다(세션 생성 → 턴·분석 → `ended`). 워커 첫 시도 성공률이 오른다 | `src/data/session-persistence.ts` |

**기기 1대 = 세션 1개는 이미 보장된다** — 중계 `main.ts` 의 `inUse` Set 이 `SESSION_BUSY` 로
막는다. 여러 기기 병렬은 각기 다른 `session_id` 라 그대로 동작한다.

고령 사용자 기준(큰 글씨·고대비·큰 터치 영역, 핵심 흐름 3단계 이내, 텍스트 입력 최소화 — 선택형·버튼형 우선,
첫 사용 시 따라 하기 튜토리얼 1회)은 M2 재작성 때 함께 적용한다. **검증 기준**: 기술에 익숙하지 않은 50~60대가 설명 없이 세션 1회를
끝까지 진행할 수 있는지.

---

## 7. 웹 파트 (`apps/web`)

| # | 내용 | 파일 |
|---|---|---|
| **W1** | **프로그램 일지 화면** — 목록(상태 칩 · "확인 대기 N건" 최상단) + 상세(공단 서식 12필드 폼, AI 초안 배지, 확정 버튼은 `has_capability` 일 때만) + **확정 후 수정 시 사유 입력 필수** + 이력 탭 + 생성 실패 재시도 | `pages/caregiver/ProgramJournal{List,Detail}Page.tsx`(기존 `Journal*Page.tsx` 대체) |
| **W2** | **감독 화면** — 기관 내 `status='active'` 세션 카드(어르신·기기·경과·**현재 단계**·상태) + 일시정지/재개/종료. **반응형 우선**(요양보호사 휴대폰 브라우저). 위기 발화 카드에 위기 안내(전화번호·대응 절차)를 둔다 — 어르신 화면에서 옮겨 온 것(M3) | `pages/caregiver/SupervisionPage.tsx` 신규 |
| **W3** | 네비게이션 — 요양보호사 `요양일지`→`프로그램 일지`, **보호자** `분석`→`대화 관찰 리포트`(기획 6-5 는 보호자 메뉴 한정 — 요양보호사 `분석` 은 기관 내부 화면이라 이름 유지), 보호자 소식 필터 `요양일지`→`오늘의 이야기` | `components/shell/nav.ts` |
| **W4** | **보호자 표현 전환** — 판정형→기술형, 하단 고정 문구 공용 컴포넌트, 일지 상세는 **`guardian_text` 만** 렌더(공단 서식 직접 노출 금지). 함께: `session_summary` 가 생성돼도 렌더되지 않는 기존 버그 수정, 죽은 `'report'` item_type 정리 | `pages/guardian/*` |
| **W5** | 세션 설계의 기존 "예상 소요 시간"(`duration_minutes`)을 **목표 시간**으로 쓴다 — 초기값을 지금의 고정 15분 대신 `org_settings.target_minutes` 에서 가져온다. 단계 미리보기·기관 기본 피할 주제 | `SessionPlanDialog.tsx` |
| **W6** | 기관 설정 + **권한 매트릭스 UI**(일지 확정·공개 철회·보호자 연결 승인 × 역할 체크박스) + **구성원 역할 지정**(`set_member_role` — 지금 구성원 표는 역할을 보여주기만 한다) | `pages/caregiver/OrgPage.tsx` |
| **W7** | ⚠️ **어르신 동의 부여/철회 UI** — 지금 `ElderDetailPage.tsx:434` 가 없는 라우트를 가리킨다. **파일럿 블로커** | 신규 라우트 |
| **W8** | 어르신 `care_grade` 드롭다운(주간보호 필수) | 등록·수정 화면 |

### 보호자 표현 규칙 (W4)

| 금지 | 허용 |
|---|---|
| "인지 기능 저하 의심", 점수·등급 | "이번 달 대화 시간 추이", "고향·가족 이름을 말씀하심" |
| "우울 경향", "정서 불안" | "긍정 표현이 많았던 주제 Top 3", "웃음이 나온 순간" |
| "병원 진료 권장" | 보호자용에는 넣지 않음. 기관 내부 플래그로만 |

모든 리포트 하단에 고정: **"본 리포트는 대화 기록 요약이며 진단·평가 목적이 아닙니다."**

---

## 8. 웹·앱 연동 파트

**C1. `packages/core` 정리** — `ai.ts` + `ai.test.ts` **파일 삭제**, `voice-flow.ts`(호출처 0) 삭제,
`journal.ts` 의 `buildJournalDraft`(명시적 mock) 삭제. `conversation.ts` 의 `respondToUserTurn` →
**`evaluateUserTurn()` 으로 축소**(안전 계산만, `generateReply` 호출 제거).
**절대 유지**: `safety.ts` 전체(`assessUtterance`·`screenAiUtterance`·`buildCaregiverAlert`·
`buildSafetyEventDraft`·`assessEngagement`), `analysis.ts` 의 `detectTurnTopic`·`recommendNextTopics`.
⚠️ `assessEngagement`·`detectTurnTopic` 은 **분석·화면에서도 쓴다** — 대화에서 떼어내도 함수는 남는다.

**C2. `packages/core` 신규·확장**
- `session-phase.ts`(신규): `buildPhaseDirective(phase)`, `shouldAdvancePhase(...)` — 순수 함수, 중계와 공유
- `program-journal.ts`(신규): `mapAnalysisToJournalFields()`, `screenJournalDraft()`(진단표현 결정론
  차단 — 적중한 **필드만 비우고** `pending_review` 로 넘긴다. 전체 실패가 아니다), `buildGuardianText()`
- `generated-session.ts` **확장**: 스키마에 공단 필드·보호자 문장 추가, `disallowedConclusion` 에
  `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장` 추가, 지시문 보강
- `prompt.ts`: `buildSystemPrompt(..., phase?)`, **`PROMPT_VERSION='v2.0'` 을
  `sessions.prompt_version` 에 persist**(지금은 선언만 되고 아무도 읽지 않는다).
  `RESPONSE_JSON_SCHEMA` 삭제(직접 모드 폐기로 사문화)
- `analysis.ts`: `opinionSignals?`·`baselineDeltas?` 추가 — 파일럿 범위 밖이지만 **데이터는 지금부터**

**C3. `apps/voice-relay`**
- 2초 폴을 **`session_tick` RPC 로 교체** → `{allowed, phase, target_minutes, paused, control_request}` 일괄 수신(`target_minutes` 는 `coalesce(sessions.duration_minutes, org_settings.target_minutes)` 로 계산한 값이지 컬럼이 아니다)
- 단계 전환 시 `forward({clientContent:{turns, turnComplete:false}})` 로 지시 주입 —
  **`resumeContext` 주입과 완전히 같은 경로**다. 어르신에게 들리지 않고, 출력은 여전히 Clova 검증을 통과한다
- `control_request` 처리: `pause`→입력 forward 차단 + `relayControl` 송신, `end`→`close()`
- ⚠️ **`assessUtterance` 적중 시 `safety_events` 즉시 INSERT 추가** — 안전 푸시의 선결 조건
- 타이머·턴 캡·수명·재생 영수증 게이팅은 **손대지 않는다**

**C4. Edge Functions**
- `session-report/handler.ts` 의 생성 로직을 `_shared/report-generation.ts` 로 추출(양쪽 공유)
- ⚠️ **`REPORT_ALLOWED_USER_IDS` 데모 허용목록을 org 게이트로 교체** — 안 하면 파일럿 전원 403
- `program-journal-draft/`(신규): 큐 소비 → 지수 백오프(30s→5m) → `attempts>5` 면 `failed`.
  **`pending_review` 까지만 쓴다**
- `push-dispatch/`(신규): `pushed_at is null` 소비 → Expo Push.
  ⚠️ **본문에 어르신 성함·발화 금지**(잠금화면 노출) — 고정 문구 + deep link 만
- 스케줄 30초. 두 워커를 한 함수에 합쳐도 무방

**C5. `packages/data`**
- `journals.ts`·`journalPhotos.ts` → `programJournals.ts` 등으로 교체 +
  `useFinalizeProgramJournal`·`useRetryJournalDraft`·`useJournalRevisions`·`useApproveGuardianText`
- 신규: `supervision.ts` · `orgSettings.ts`(`useHasCapability` = UI 활성화의 단일 근거) ·
  `pushTokens.ts` · `events.ts`
- `analyses.ts` 의 `useUpsertSessionAnalysis` **삭제**(현재 dead code)
- `realtime.ts`: `RealtimeTable`·`DEFAULT_TABLES`·`invalidateFor` **세 곳 모두**에 신규 테이블 등록.
  ⚠️ publication 에만 넣으면 아무도 듣지 않는다(2026-09-04 에 이미 겪은 함정)

---

## 9. 대화 정책 (6-3)

대화 통제를 코드 분기가 아니라 **대화 정책**으로 정의하고 세션 설정·시스템 지시로 AI 에 주입한다.

1. **세션 구조(단계형)** — 도입(인사·컨디션 확인) → 회상(설계된 주제) → 마무리·의견수렴
   ("오늘 이야기 어떠셨어요?" → `opinion_collected`). 목표 시간(기관 설정, 예 20~30분)이 되면
   마무리로 넘어가도록 지시한다. **현재 단계는 서버가 상태로 관리하고 AI 지시에 반영한다** —
   AI 자율 판단에 맡기지 않는다.
2. **주제 정책** — 설계 주제 목록, 피할 주제 목록(예: 사별한 배우자), 반복 회피
3. **대화 스타일** — 짧은 문장, 한 번에 질문 하나, 응답이 짧거나 침묵하면 쉬운 질문(예·아니오·선택형),
   재촉 금지
4. **위기 대응** — ⚠️ **현재 동작(결정론 감지 시 즉시 연결 종료)을 약화시키지 않는다.**
   `close` 를 유지하고 `paused_at` 기록 + `safety_events` 즉시 기록 + 감독 화면·푸시 알림으로
   **확장**한다. AI 판단을 최종 근거로 삼지 않는다
5. **종료 정책** — "그만할래", "힘들어" 같은 말이 나오면 마무리 단계로 넘어가 짧게 끝내고 감독 화면에 알린다

| 기관·세션별 변경 가능 (`org_settings`) | 고정 (코드 상수) |
|---|---|
| `target_minutes`(세션별 `duration_minutes` 가 우선), `default_avoid_topics`, `facility_type`, `default_program_type`, `default_location` | `safety.ts` CRISIS_*, `screenAiUtterance`, 출력 200자 제한, 진단표현 금칙어, 턴 캡, 세션 수명 |

**DB 설정으로 안전 가드를 끌 수 있으면 안 된다.**

---

## 10. 순서 의존

```
D1·D2(enum 단독) → D3 → D4(RLS) ──→ W2 감독목록 · W6 권한UI
                 └→ D5 ──→ C4 워커 ──→ W1 일지화면
                 └→ D6 ──→ C3 중계 ──→ W2 원격제어 · M5 앱수신
                 └→ D7 ──→ C4 push ──→ M6 토큰등록
                 └→ D8 product_events ──→ 전 화면 계측(1주차)

C1(core 삭제) ⟷ M1·M2   ← 반드시 같은 PR. core 만 먼저 머지하면 앱이 깨진다
M7(저장 순서) → C4 워커 첫 시도 성공률
W7(동의 UI) → 파일럿 개시 전 블로커
```

**권장 머지 단위 5개**: ① D1~D4 + RLS 회귀 ② D5 + C4(draft) + W1 ③ D6 + C3 + W2 + M5
④ C1 + M1~M4 ⑤ D7 + C4(push) + M6. **①이 나머지 전부의 선행.**

---

## 11. 착수 전 처리해야 할 것

### 블로커
1. **`alter type ... add value` 트랜잭션 제약** — D1·D2를 단독 파일로. 합치면 CI 가 실패한다.
2. **`REPORT_ALLOWED_USER_IDS` 데모 허용목록**(`session-report/index.ts:19`) — 교체하지 않으면
   파일럿 전원 403.
3. **`safety_events` 가 세션 종료 시 일괄 기록된다** — 실시간 안전 푸시가 구조적으로 불가능하다.
   중계 즉시 기록(C3)이 선결.
4. **어르신 동의 철회 UI 부재**(W7) — AI 진행 프로그램이 제품 본체가 되는데 철회 경로가 화면에 없다.

### 주의
5. 기관 전체 열람 ↔ 개인정보 최소수집 충돌 — `product_events.profile_viewed` 로 열람 이력을 남겨 보완.
6. **`= 'caregiver'` 비교 잔존** — `<> 'guardian'` 은 새 역할을 자동 포함하지만 `= 'caregiver'` 는
   자동 제외한다. SQL·TS 전면 grep 후 `is_care_team()` 으로 치환.
7. `check:copy` 비의료 린트 ↔ 공단 서식 문구 충돌 가능 — W1 착수 전 사전 검증.
8. `pnpm install --prefer-offline` 이 `apps/voice-relay/node_modules` 를 만들지 않는다 —
   `pnpm install --filter @giokon/voice-relay` 선행.
9. **새 역할을 부여할 경로가 없다** — `users.role` 은 3중으로 잠겨 있고 온보딩은 요양보호사·보호자만 고른다.
   `set_member_role` RPC(D3)·역할 지정 UI(W6) 없이 D1 만 넣으면 사회복지사·센터장은 영원히 0명이다.

### 안전 아키텍처를 약화시키지 말 것
10. **공단 일지의 진행자 칸에 AI 를 쓸 수 없다.** `facilitator_user_id` 를 확정 시 NOT NULL 로
   강제하고 `tool_used`("AI 대화 프로그램 보조")를 별도 필드로 둔다.
11. **위기 시 즉시 `close` 를 `paused` 로 약화시키지 말 것**(§9-4).
12. **위임 대상은 3개뿐**(일지 확정·공개 철회·보호자 연결 승인). 위기 대응·출력 검열·진단표현 금지·
    Clova 경유를 `org_capabilities` 에 넣는 순간 안전 구조가 설정 한 줄로 무력화된다.
13. 주간보호 출석 테이블을 만들지 말 것(기준 1).

---

## 12. 검증

### 게이트 (매 머지 단위마다 전부)
```
pnpm install --filter @giokon/voice-relay   # 선행 필수
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm check:bom && pnpm check:font && pnpm check:figma && pnpm check:copy
bash supabase/tests/run-rls-regression.sh   # PG16 실기동, 마이그레이션 전부 적용
```

### RLS 회귀에 추가할 단언 (권한 전환의 유일한 실증 게이트)
- 같은 기관 **다른 담당자**의 세션 기록 열람 = 성공(교대근무 요구)
- 타 기관 0건 · guardian 0건 · `social_worker`/`center_director` 역할 동작
- 위임 on/off 에 따른 일지 확정 성공/실패
- **service_role 로 `status='final'` 시도 = 실패**(기준 2)
- `guardian_text_approved_at` 없이 공개 시도 = 실패
- 확정 후 수정 시 revision 행 자동 생성
- `set_member_role`: 요양보호사 호출·자기 자신 대상·타 기관 대상·보호자↔돌봄팀 전환 = 전부 실패

### 기준 2 전용 테스트
"AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는 경로가 없다"를
**DB·워커·UI 세 층에서 각각** 단언한다.

### 수동 E2E (파일럿 개시 전)
두 브라우저에서 한쪽 일시정지 → 다른 쪽 2초 내 반영 · 세션 종료 → 초안 자동 생성 → 확인 대기 ·
확정 → 공개 → 보호자 화면 확인 · 철회 → 즉시 닫힘.

---

## 13. 기획이 정해 줘야 개발이 확정되는 것

- 공단 질의: "요양보호사 계획 + AI 진행 + 1인 병렬 감독"이 프로그램 제공으로 인정되는가 (영향: 전체 구조, 특히 감독 화면)
- 개인정보 국외 이전·법정대리인 동의 법률 검토 (영향: 동의 문구·버전)
- 관찰 리포트의 의료기기 규제 경계 — 식약처 가이드라인 (영향: 보호자 리포트·플래그)
- 고령자 발화 인식률 Gemini vs Clova 비교 (영향: 전사 출처 구조)
- Gemini Live 동시 세션 한도·요금 (영향: 기기 수 확장)
- 카카오 알림톡 템플릿 심사 — **리드타임이 기니 일찍 착수** (영향: 파일럿 이후 보호자 알림)

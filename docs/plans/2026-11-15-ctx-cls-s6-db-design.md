# 전사 문맥 분류기 S6 — DB 설계안 (시스템 원인 일시정지 · 분류기 기록 · 개인 표현 사전)

- 작성: 2026-11-15 · 테스크 `docs/tasks.md` CTX-CLS-S6 · 상위 기획 `2026-11-13-risk-emotion-detection.md` §13·§14.1·§7.4
- **상태: 설계안 — 사용자 승인 전.** 이 문서는 마이그레이션·Edge 함수·RLS 를 만들지 않았다. 승인 뒤 구현하고 로컬 PG16 회귀(`run-rls-regression.sh`)로 검증한다.
- ⚠️ main 병합 = Supabase 연동이 마이그레이션을 운영에 자동 적용한다(`AGENTS.md`). 구현 PR 은 DB 회귀 통과 상태로만 올린다.

## 0. 확정된 결정 (다시 묻지 않음)

| # | 결정 | 날짜 |
|---|---|---|
| D3 | 규칙 미적중 + 분류기 단독 위기·고통 → **직원 확인 일시정지**(규칙 적중은 기존 즉시 종료) | 11-13 |
| D6 | 일시정지 중에는 듣지 않는다 — 연결을 닫고 재개 때 새 연결 + 복구 맥락 | 11-13 |
| D7·Q9 | 시스템 원인 기록은 중계 전용 자격으로만 — **새 Edge 함수가 `x-relay-secret`(기존 `VOICE_RELAY_SECRET` 재사용) + 직원 JWT 검사 → service_role 전용 RPC** | 11-13·15 |
| Q6 | 분류기 단독 일시정지는 **안전 사건(`safety_events`) + 푸시**(잠금화면 고정 문구 + 알림 id 만) | 11-14 |
| Q7 | 직원 미응답 = **현행 유지**: 수신자 = 담당 배정자 ∪ 세션 진행자, 확인 대기도 10분 상한에 포함, 미응답이면 상한에서 종료(사건은 미확인으로 남음) | 11-15 |
| Q8 | 개인 표현 의미 사전 = 직원 입력 없이 **완전 자동**, 대화 개인화 전용(분류기·결합 정책 입력 아님), **구현은 법무(D10) 뒤** | 11-15 |
| — | 자동 재개 없음 — 재개는 기존 직원 `request_session_control(…, 'resume')` | 인계서 O16 권고 |

## 1. 지금 DB 가 막고 있는 것 (설계가 바꿔야 하는 곳)

| 현재 | 위치 | 시스템 일시정지와의 충돌 |
|---|---|---|
| `sessions_pause_pair_check`: `(paused_at is null) = (paused_by is null)` | `20260924040000` | 일시정지면 **직원 id 가 반드시** 있어야 한다 → 시스템 사건에 직원 id 를 넣게 된다(기획 §14.1 금지) |
| `session_interventions.action` ∈ pause·resume·end·phase_advance·elder_closing | `20261004010000` | 시스템 원인 값이 없다 |
| `safety_events` insert 정책: `user_id = auth.uid()` ∧ 돌봄팀 | `20260924030000` | 감지 경로(규칙/분류기)·모델 버전을 남길 칸이 없다. service_role 기록은 정책 밖(definer RPC 로만) |
| `caregiver_alert` 규칙 문구: "키워드 기반 안전장치" | core `CRISIS_CAREGIVER_ALERT` | 분류기 사건에 그대로 쓰면 사실과 다르다 → 분류기용 문구 필요(§3.5) |
| `voice_session_leases`(T26.1): 연결마다 `holder` + 진행 직원 `user_id` + 15초 만료 | `20261003000000` | **활용**: "그 세션의 지금 연결에서 온 요청"을 증명하는 데 쓴다(§3.3) |

## 2. 흐름

```
중계(분류기 단독 적중 → decideContextSafety = staff_review_pause)
  ├─ ① 합성·전달 즉시 중단(기존 stopForReview 와 같이 — 기록 실패·지연이 멈춤을 늦추지 않는다)
  ├─ ② POST Edge relay-review-pause  [x-relay-secret + Authorization: 직원 JWT]
  │      └─ Edge: 비밀 비교(SHA-256, 길이 무관) → JWT 검증(user id) → 본문 검증
  │             → service_role 로 public.system_pause_for_review(...) 호출
  │                  ├─ 점유 확인: (session_id, holder, user_id) 가 살아 있는 점유와 일치
  │                  ├─ safety_events INSERT(id = 중계가 만든 사건 id — 재시도 멱등)
  │                  │     └─ (기존 트리거) notifications → push-dispatch → 푸시
  │                  ├─ sessions: paused_at·pause_origin='system'·paused_by=null·control_request='pause'
  │                  └─ session_interventions: action='system_review_pause', actor_id=null
  ├─ ③ 앱에 일시정지 알림(제어 메시지 이름·문구는 중계·앱 파트) → 연결 종료 → 점유 반납
  └─ 직원: 감독 화면에서 확인 → request_session_control('resume') → 새 연결 + 복구 맥락(기존)
```

## 3. 설계 A — 시스템 원인 일시정지

### 3.1 스키마 변경 (마이그레이션 ①)

```sql
-- sessions: 일시정지 출처
alter table public.sessions add column pause_origin text;              -- 'staff' | 'system'
update public.sessions set pause_origin = 'staff' where paused_at is not null;   -- 기존 행 보정
alter table public.sessions
  add constraint sessions_pause_origin_check check (pause_origin is null or pause_origin in ('staff','system')),
  drop constraint sessions_pause_pair_check,
  add constraint sessions_pause_pair_check check (
    (paused_at is null and paused_by is null and pause_origin is null)
    or (paused_at is not null and pause_origin = 'staff'  and paused_by is not null)
    or (paused_at is not null and pause_origin = 'system' and paused_by is null));
-- 직접 쓰기 차단 트리거(20260924040000 89~95행)의 감시 칸에 pause_origin 추가

-- session_interventions: 시스템 원인 값
… action in ('pause','resume','end','phase_advance','elder_closing','system_review_pause')

-- safety_events: 감지 경로와 판정 묶음 버전
alter table public.safety_events
  add column detected_by text not null default 'rule',                  -- 'rule' | 'classifier'
  add column detection_reason text,                                     -- decideContextSafety 의 reason(분류기만)
  add column classifier_model_version text,
  add column policy_version text,
  add constraint safety_events_detection_check check (
    (detected_by = 'rule' and detection_reason is null and classifier_model_version is null and policy_version is null)
    or (detected_by = 'classifier' and detection_reason in (
        'classifier_unavailable','classifier_crisis_direct','classifier_distress_direct',
        'classifier_ambiguous','classifier_out_of_scope','classifier_self_harm_context')
        and policy_version is not null));
-- 판정 불변 가드(app.guard_safety_event_evidence)의 판정 칸에 detected_by·detection_reason·두 버전을 추가
```

- 모두 `check` 제약이라 enum `add value` 가 없다 → 한 마이그레이션 안에서 써도 된다.
- 기존 중계·앱은 새 칸을 모른다 → 기본값(`rule`)으로 그대로 동작(배포 순서 무관하게 안전).
- `classifier_unavailable`(분류기 실패)은 모델 버전이 없을 수 있어 `classifier_model_version` 을 필수로 두지 않는다.

### 3.2 Edge 함수 `relay-review-pause` (신규)

| 항목 | 내용 |
|---|---|
| 인증 | ⓪ `x-relay-secret` = `VOICE_RELAY_SECRET`(32자 이상 · SHA-256 다이제스트 비교 — `live-token/handler.ts` `secretMatches` 재사용) → 불일치 403, **JWT·DB 보다 먼저** ① `Authorization` 직원 JWT → `auth.getUser` 로 user id |
| `verify_jwt` | `true`(live-token 과 같음) |
| 본문(≤ 2KB, 모르는 칸 거절) | `session_id` · `lease_holder` · `event_id`(uuid) · `reason`(위 6종) · `categories`(self_harm·medical_emergency·abuse 부분집합) · `excerpt`(≤200, 선택) · `model_version`(선택) · `policy_version` |
| 호출 | service_role 키로 `system_pause_for_review(… p_requested_by = JWT user id …)`. `SUPABASE_SECRET_KEYS` 는 JSON 맵 — 파싱해 기본 키를 쓴다(`AGENTS.md` 함정) |
| 응답 | `{ safetyEventId, paused: boolean, state: 'paused' \| 'already_paused' \| 'not_active' }` · 오류는 상태 코드만(원문·발췌를 로그에 남기지 않음) |
| 비밀 | 새 비밀 없음 — Supabase Edge 시크릿에 `VOICE_RELAY_SECRET` 가 이미 있다(live-token). Cloud Run 쪽도 같은 값 |

### 3.3 RPC `public.system_pause_for_review` (신규 · service_role 전용)

```sql
system_pause_for_review(p_session_id uuid, p_lease_holder uuid, p_requested_by uuid, p_event_id uuid,
                        p_reason text, p_categories text[], p_excerpt text,
                        p_model_version text, p_policy_version text) returns jsonb
-- security definer · revoke from public, anon, authenticated · grant execute to service_role
```

순서(한 트랜잭션, 세션 행 `for update`):
1. **연결 증명**: `voice_session_leases` 에 `(session_id, holder = p_lease_holder, user_id = p_requested_by, expires_at > now())` 가 있어야 한다. 없으면 `SYSTEM_PAUSE_FORBIDDEN`(42501). → 비밀이 새어도 **살아 있는 연결의 점유 id 와 그 직원 JWT** 없이는 다른 세션을 멈출 수 없다.
2. **안전 사건 기록**(세션 상태와 무관하게 — 근거 보존이 먼저): `insert … (id = p_event_id, user_id = sessions.user_id(진행자), detected_by = 'classifier', level, categories, excerpt, caregiver_alert, …) on conflict (id) do nothing` → 중계 재시도가 사건을 두 번 만들지 않는다. 푸시는 기존 insert 트리거가 처리.
   - `level`: §5 결정 ② 에 따름. `caregiver_alert`: §5 결정 ③ 의 고정 문구(서버가 고른다 — 중계가 문구를 보내지 않는다).
3. **일시정지**: `status = 'active'` 이고 아직 멈춰 있지 않으면 `paused_at = now(), pause_origin = 'system', paused_by = null, pause_reason = null, control_request = 'pause'`. 이미 직원이 멈춰 둔 상태면 출처를 바꾸지 않는다(`already_paused`). `active` 가 아니면 사건만 남기고 `not_active`.
4. **개입 기록**: 3에서 실제로 멈췄을 때만 `session_interventions(action = 'system_review_pause', actor_id = null, detail = {event_id, reason, policy_version, model_version, via_user: p_requested_by})`. `actor_id` 는 비운다 — 연결 계정(`via_user`)은 "누가 눌렀나"가 아니라 "어느 연결에서 왔나"다(기획 §14.1 actor/origin 구분). 같은 `event_id` 의 개입이 이미 있으면 넣지 않는다(멱등).

### 3.4 기존 함수 수정 (마이그레이션 ②)

| 함수 | 변경 |
|---|---|
| `request_session_control` | `pause`: `pause_origin = coalesce(기존, 'staff')`(시스템 정지 위에 직원이 눌러도 출처 유지 · 개입 기록은 남김) · `resume`: `pause_origin = null` 추가. 나머지 불변(돌봄팀·같은 기관·active 만) |
| `session_tick` | 반환에 `pause_origin` 추가(기존 칸 불변 — 구버전 중계는 무시). 중계·앱이 "직원 확인 중" 안내를 고르는 데 쓴다 |
| `app.guard_safety_event_evidence` | 판정 불변 칸에 `detected_by`·`detection_reason`·`classifier_model_version`·`policy_version` 추가 |
| 세션 직접 쓰기 차단 트리거 | 감시 칸에 `pause_origin` 추가 |

- 10분 상한: 손대지 않는다(경과 = `started_at` 기준 — 일시정지 포함, Q7).
- invoker 함수에서 `app.*` 를 부르지 않는다(운영 `authenticated` 에 `app` USAGE 없음 — `prod_privileges.sql` 로 확인).

### 3.5 알림·화면 (각 파트 작업 — 이 세션은 목록만)

- 푸시: 변화 없음(고정 문구 + 알림 id). 앱 안 알림 본문 = `caregiver_alert`.
- 웹 감독 화면: `detected_by = 'classifier'` 사건을 기존 위기 카드와 **구별 표시**(기획 §13.3 "감지 경로") · `pause_origin = 'system'` 세션에 "직원 확인 대기" 표시 · 재개 버튼은 기존.
- 앱: 시스템 일시정지 안내 문구(현재 원격 일시정지 = "현장 재개 불가", `automatic.ts` `remoteHeld`).
- 일시정지 중에는 듣지 않으므로 그동안의 새 위험 발화는 탐지되지 않는다 — 직원 화면에 명시(기획 §13.2).

### 3.6 실패 처리 (중계 통합 요구 — 인계 자료에 싣는다)

- Edge·RPC 실패·지연이 멈춤을 늦추지 않는다: 중계는 ①을 먼저 하고, 기록은 기존 `recordWithRetry`(같은 사건 id) 방식으로 재시도한다.
- 기록이 끝내 실패하면 DB 에는 일시정지가 없다 → 앱이 자동으로 다시 붙지 않도록 중계가 보낸 제어 메시지로 멈춤을 유지해야 한다(앱 파트). 앱 대체 기록(`pendingSafetyEventId`)을 이 경로에도 쓸지는 중계·앱 세션에서 정한다.

## 4. 설계 B — "계속 + 기록"의 저장 (⚠️ 결정 필요 — §5 ①)

결합 정책은 `classifier_context_logged`(자해 외 과거·인용·부정·관용 등)·`classifier_closing`(분류기 단독 거부·휴식)에서 대화를 멈추지 않고 `record: true` 를 돌려준다. 저장 위치가 아직 없다.

**권고안**: 새 테이블 `public.classifier_observations` — 원문·발췌 없이 판정만.

| 칸 | 내용 |
|---|---|
| `id` · `org_id` · `profile_id` · `session_id` | 세션 FK `(id, profile_id, org_id)` — 기관 격리 |
| `turn_id` · `input_revision` | 어느 턴의 판단인지 |
| `reason` · `action` | `classifier_context_logged`·`classifier_closing` · `continue`·`elder_closing` |
| `categories` · `model_version` · `policy_version` | 판정 묶음 |
| `created_at` | |

- 쓰기: 같은 Edge 함수에 기록 전용 동작을 두거나(같은 자격) 별도 RPC. 읽기: 같은 기관 돌봄팀(`app.is_care_team()`). 수정·삭제 불가.
- 원문을 넣지 않는 이유: 이 자료는 오탐·미탐 분석과 게이트 이후 운영 점검용이다. 원문이 필요한 경우는 일시정지(안전 사건 발췌)뿐이다.
- 대안: ⓑ Cloud Run 로그에 판정만 남김(DB 변경 없음 · 기관 화면에서 못 봄 · 보존 기간이 로그 설정에 묶임) ⓒ 저장하지 않음(결정 "계속 + 기록"과 어긋남).

## 5. 승인 요청 — 결정이 필요한 것

| # | 질문 | 권고 |
|---|---|---|
| ① | "계속 + 기록"을 어디에 남길지(§4) | 새 테이블 `classifier_observations`(원문 없음) |
| ② | 분류기 사건의 `level` | 규칙과 같은 대응: 위기 범주가 있으면 `crisis`, 급성 고통·해석 부족·범위 밖·실패면 `watch` · `detected_by` 로 구별 |
| ③ | 분류기 사건의 직원 알림 문구(`caregiver_alert`) — 규칙 문구의 "키워드 기반"이 사실과 다르다 | 범주별 대응 자원(☎109·119·1577-1389)은 그대로, 머리말만 "대화 문맥 확인 요청 — 진단 아님"으로 바꾼 분류기용 고정 문구(초안은 구현 PR 에서 `check:copy` 통과로 제시) |
| ④ | 점유(lease) 결합을 필수로 할지(§3.3-1) | 필수 — 비밀 하나만으로 다른 세션을 멈출 수 없게 |
| ⑤ | 이 설계안 전체 승인 → 마이그레이션 2개 + Edge 1개 + 회귀 작성 | — |

## 6. 설계 C — 개인 표현 의미 사전(자동) — 설계만, 구현은 법무 뒤

| 항목 | 설계 |
|---|---|
| 테이블 | `public.elder_expression_notes`: `id` · `org_id` · `profile_id` · `expression` · `meaning` · `related`(인물·장소, 선택) · `evidence_turn_ids` uuid[] · `source_session_id` · `extractor_version` · `status`('auto_unverified' 고정) · `created_at` · `revoked_at` |
| 생성 | 세션 종료 뒤 워커(일지 초안 워커와 같은 `app.worker_config` 패턴). 추출 방식(규칙 / 모델 호출 — 비용)은 미정 |
| 사용 | 중계가 세션 시작 때 직원 JWT 로 상위 N건만 조회해 **프롬프트 맥락에만** 넣는다(`chronicle_entries` 와 같은 방식). **분류기 입력·`decideContextSafety` 입력·일지·보호자 공개에 쓰지 않는다** |
| 격리 | 같은 기관 돌봄팀만 읽기(`app.is_care_team()`) · 다른 어르신·다른 기관 유입 회귀 필수 |
| 철회 | 동의 철회·어르신 삭제 시 행 삭제(또는 `revoked_at`) — 보존 기간은 법무 |
| 선행 조건 | 법무(D10): Gemini 자동 전사로 만든 파생 자료의 운영 저장·사용이 동의 범위·공급자 계약 안에 드는지 |

## 7. 회귀 테스트 계획 (`supabase/tests/` — 새 파일 `system_review_pause.sql`)

각 단언은 **가드를 지운 변형이 실패하는지** 확인한다. 대상 id 는 슈퍼유저로 임시 테이블에 먼저 뽑는다(`AGENTS.md` 회귀 함정).

1. `authenticated`·`anon` 은 `system_pause_for_review` 를 실행할 수 없다(권한 거부).
2. 점유가 없거나·만료됐거나·holder 가 다르거나·user 가 다르면 거절, 사건·정지·개입 모두 0건.
3. 정상 호출 → 안전 사건 1건(`detected_by='classifier'`, `user_id = 진행자`) + `paused_at`·`pause_origin='system'`·`paused_by is null` + 개입 1건(`actor_id is null`).
4. 같은 `event_id` 로 재호출 → 사건·개입이 늘지 않는다.
5. 이미 직원이 멈춘 세션 → 사건은 남고 출처는 `staff` 유지.
6. `active` 아닌 세션 → 사건만 남고 정지 없음.
7. 제약: `pause_origin='system'` 인데 `paused_by` 있음 / `staff` 인데 없음 → 거절. 기존 정지 행은 보정 뒤 `staff`.
8. 직원 `resume` → `pause_origin` 이 비워진다. 다른 기관 직원의 `resume` 은 거절(기존).
9. 분류기 사건의 판정 칸(`detected_by`·`detection_reason`·버전)은 사용자 요청으로 바꿀 수 없다.
10. 분류기 사건도 수신자(담당 배정자 ∪ 진행자)에게 알림 행이 생긴다 — 다른 기관 사람에게는 0건.
11. `session_tick` 이 `pause_origin` 을 돌려준다(기존 칸 불변).
12. `prod_privileges.sql`(운영 권한 재현)에서도 1~11 이 같은 결과.

Edge 함수: `live-token` 처럼 핸들러를 의존성 주입으로 만들어 Deno/Node 테스트 — 비밀 없음·틀림(403, DB 호출 0) · JWT 없음(401) · 본문 초과·모르는 칸·잘못된 reason(400) · 진입점 환경 연결(`SUPABASE_SECRET_KEYS` 파싱 — `live-token-entrypoint.test.ts` 와 같은 회귀).

## 8. 배포 순서 (사용자 승인 사항)

1. 마이그레이션 ①(스키마) → ②(RPC·함수 수정): 기존 중계·앱과 호환(새 칸 기본값, 기존 반환 칸 불변).
2. `database.types` 대조.
3. Edge `relay-review-pause` 배포(새 시크릿 없음).
4. 중계 통합(게이트 통과 뒤 — 중계 담당 세션) → 앱·웹 표시.

버전 번호는 구현 시점에 main 과 대조해 겹치지 않게 정한다(현재 main 최신 `20261105000000`).

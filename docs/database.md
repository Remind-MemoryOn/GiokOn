# Database Setup

> ## ⚠️ 2026-09-23 기획 변경 — 이 문서보다 새 계획이 우선한다
>
> 제품 정의가 **"요양보호사 업무 보조 도구"** 에서
> **"인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로
> 남는 도구"** 로 바뀌었다. 요양보호사는 계획하고 감독하며 확인한다.
>
> **"무엇을 만들지"의 SoT = [`docs/plans/pilot-development-plan.md`](../docs/plans/pilot-development-plan.md)**.
> 이 문서에서 **요양일지·per-caregiver 격리·규칙 기반 대화·직접 Gemini Live** 를 전제한 서술은
> 낡았다. 새 계획과 충돌하면 새 계획을 따른다.

> 🏢 **엔터프라이즈·정부심사 트랙(2026-07-03)**: 스키마 상향 — `organizations`/`consents`/`audit_log` + **조직 RBAC**(전 테이블 RLS를 조직+역할 기준으로 확장), 리전=**서울(ap-northeast-2)**, 보관/파기 정책. 상세: PLAN §2′(M9·M10·M14) · `docs/security.md` · `docs/compliance.md`.

## Direction

기억온 v1 데이터베이스는 Supabase PostgreSQL을 사용한다. 인증은 **Supabase Auth**를 사용하며, 데이터 접근은 클라이언트(웹·모바일)가 supabase-js로 직접 연동하고 **RLS(`auth.uid()`)** 로 소유자별로 격리한다. Supabase는 DB·Auth·Storage·Edge Functions를 통합 제공한다.

> ⚠️ "소유자별 격리"는 v1 서술이다. 격리 모델은 두 번 바뀌었다 — **현재**(`20260722100000`)는 기관(org_id) + **담당 배정**
> (`app.is_assigned_caregiver`), **파일럿 목표**(2026-09-23)는 기관 + **역할**(`app.is_care_team()` · `app.has_capability()`)이다.
> 전환 전후 모두 보호자는 `guardian_shares`(공개 커밋) 경유로만 읽는다. 아래 "파일럿 신규·변경" 참조.

## Files

- `supabase/migrations/`: v1 스키마, 인덱스, 트리거, RLS 정책. (RLS는 `auth.uid()` 기준으로 작성한다.)
- `supabase/functions/`: Edge Functions — `live-token`(음성 세션 토큰·모델 ID) · `session-report`(세션 분석 생성) · `naver-auth` · `stt-transcribe`(요양일지 음성 — 기획 변경으로 재검토 대상). 파일럿에서 일지 초안 워커·푸시 발송 워커가 추가된다. 장시간 음성 중계는 Edge Function 이 아니라 `apps/voice-relay` 가 맡는다.
- `docs/database.md`: Supabase 적용 절차와 접근 모델.

## Tables

- `users`: 요양보호사 계정. `auth.users`와 1:1로 연결되며(가입 시 트리거로 생성), `id = auth.uid()`.
- `profiles`: 요양보호사가 담당하는 어르신 기본 연대기.
- `chronicle_entries`: 요양보호사 입력 및 AI 추출 연대기 항목.
- `sessions`: 세션 메타데이터와 진행 상태.
- `session_logs`: AI/어르신 발화 전문, STT 수정 이력, TTS 오디오 URL.
- `organizations` / `consents` / `audit_log` / `safety_events`: 기관(테넌트)·동의·감사·위기 이벤트 — 적용 완료(마이그레이션 7종, PLAN §2′ M9·M10·M12·M14).

웹 1차 MVP 신규(2026-07-13 인터뷰 반영 — Phase W, 계획 확정·마이그레이션 예정):

- `session_analyses`: 세션 종료 시 AI 분석 결과(`core/analysis` SessionAnalysis JSON·버전). RLS 조직 범위(**guardian 제외**). 앱이 insert.
- ~~`care_journals`~~: 요양일지(내용·source[photo/voice/typed/ai_draft]·사진 경로·draft/final). **민감정보 취급**(동의·보관파기). guardian 직접 접근 불가. ⚠️ **2026-09-23 삭제 확정 → `program_journals`**(아래 파일럿 절).
- `profile_guardians`: 어르신↔보호자 연결(status pending/approved/revoked·승인자).
- `guardian_invites`: 어르신별 1회성·72h 만료 초대 코드(QR=코드 URL).
- `guardian_shares`: 공개 커밋(항목 유형[일지/분석/세션요약/리포트]·승인자·시점·**철회**). **보호자는 승인된 연결+미철회 행만 SELECT**. 파일럿에서도 **공개 수단으로 재사용**한다(일지 공개 여부를 status 에 넣지 않는다).
- Storage 버킷 `journal-photos`(private): 일지 사진 원본. RLS·보관 정책 적용. ⚠️ 2026-09-23: `journal_photos` 삭제와 함께 기존 객체 정리(아래).
- ⚠️ RLS 가드(필수 선행, T17.0): `safety_events` SELECT에 guardian 역할 배제 — 보호자 기관 합류 시 위기 발췌 노출 차단.

인증 개편 신규/변경(2026-07-16 — 소셜 로그인·회원가입·연결, 계획 확정·마이그레이션 예정):

- `users`(변경): `org_id` **NOT NULL → NULL 허용**(미온보딩·미연결 보호자), `phone text`·`onboarded_at timestamptz` 컬럼 추가.
- `handle_new_user`(재작업): 기관 자동생성·org_admin 강제 제거 → `(id, name, email)` **최소 insert(org_id NULL)**. 온보딩 완료 전까지 데이터 미노출.
- `app.complete_onboarding(p_name, p_phone, p_role, p_org_name, p_elder_code)`(RPC, SECURITY DEFINER): caregiver→기관 생성+role=org_admin / guardian→role=guardian, 어르신 코드 있으면 기관 합류+`profile_guardians`(pending). 원자적.
- Edge Function `naver-auth`(신규): **네이버=Supabase 비네이티브** → OAuth 콜백→프로필→Supabase Admin 사용자 매핑·세션. 구글·카카오는 네이티브 `signInWithOAuth`. 네이버 client secret 등 비밀값=서버(secrets) 보관.

어르신 영속 코드 + 요양보호사 배정 재설계(2026-07-22 — 담당 변경/추가 시 데이터 연속성. 마이그레이션 `20260722100000`, 로컬 PG16 검증):

- **핵심**: 어르신(profiles)의 단일 소유(user_id) → "최초 생성 actor"로 의미 축소(nullable·**ON DELETE SET NULL**). 접근은 **배정(profile_caregivers)** 기반으로 전환. 담당이 바뀌거나 늘어도 기존 어르신·연대기·세션·분석·일지를 그대로 인계받는다(신규 생성 없음).
- `elder_codes`: 어르신별 **영속·비소진** 코드(profile_id 1:1·unique). 어르신 생성 트리거가 자동 발급. **보호자 미열람**(별도 테이블·RLS로 권한 상승 차단) — 보호자는 코드를 link RPC 입력으로만 사용. 회전(rotate) 지원.
- `profile_caregivers`: 어르신↔요양보호사 **배정**(다대다·status active/removed·감사). 코드로 self-claim.
- **자식 FK 완화**: chronicle_entries/sessions/session_logs의 복합 FK `(profile_id,user_id)` → `profile_id`(자식은 session_id) 단독 + `user_id` nullable actor(SET NULL). → 새 담당자의 **쓰기 연속성** 확보.
- **RLS 재작성(배정 기반 — ⚠️ 파일럿에서 기관 단위로 다시 바뀐다)**: profiles·chronicle_entries·sessions·session_logs·session_analyses·care_journals·guardian_shares(요양보호사 브랜치)·safety_events·consents 를 `org_id=현재기관 AND 비 guardian AND (배정 or org_admin)`으로. 같은 기관 org_id 격리 유지(타 기관 이관은 범위 밖). 보호자 경로(공개 커밋·연결 승인)는 유지.
- `app.is_assigned_caregiver(profile_id)`(security definer): 배정 판정 헬퍼(RLS 재귀 방지).
- `claim_elder_by_code(p_code)`(RPC): **활성 담당/관리자**만 같은 기관의 다른 어르신을 즉시 인계(멱등). 미승인 요양보호사의 자가 승격 우회는 가드로 차단.
- `link_guardian_by_elder_code(p_code)`(RPC): 보호자 연결(영속·비소진·멱등). 구 `redeem_guardian_invite`(1회성) 대체.
- 구 `guardian_invites`·`redeem_guardian_invite`는 **폐기**(감사 이력 보존 위해 테이블·함수는 잔존, 신규 발급 없음). QR/`/join` 경로 제거.

요양보호사 기관 합류(**승인형**) — `20260722110000`(enum `pending` 추가)·`20260722120000`:

- **온보딩(caregiver)**: 기관명 → 새 기관(org_admin) / 어르신 코드 → **기존 기관 합류 요청**(role=caregiver, org_id 확정, 배정 `status='pending'`). 코드만으로 즉시 권한을 얻지 못한다(보호자 연결과 대칭).
- `profile_caregivers.status='pending'` 신설: `is_assigned_caregiver`(status='active' 만 인정)에 걸리지 않아 **승인 전 어떤 데이터 접근도 없음**.
- `approve_caregiver_assignment(p_id)`(RPC): 그 어르신의 **활성 담당** 또는 **org_admin** 이 pending → active. **본인 자가승인 불가**.
- **자가승인 3중 차단**: (a) UPDATE 정책 강화(본인 행은 'removed' 로만), (b) approve RPC 본인 배제, (c) claim 가드(활성 담당/admin 만). + 본인 배정 self-select 정책(승인 대기 상태 확인용).
- `rotate_elder_code(p_profile_id)`(RPC): 코드 회전(서버 생성·매번 상이·배정/admin 게이트). 클라이언트 코드 생성 제거. profile_id 불변 → 보호자 연결 유지.
- **코드 생성 강화(`20260722130000`)**: `app.generate_invite_code()` 를 **암호학적 난수**(`gen_random_bytes`, pgcrypto CSPRNG — 예측 가능한 `random()` 대체) + **혼동문자 전면 제외 30자 알파벳**(`0/1/I/L/O/U` 제외) + **10자**로 개선. 승인 게이트와 함께 추측/열거 저항. 기존 8자 코드는 유효(check 6~32), 신규 발급·회전분부터 10자.

이메일 인증 병행 + 소셜 본인인증 캡처(`20260722140000`, 2026-07-23 — 이메일 로그인 재도입):

- 이메일(아이디)+비밀번호 로그인·회원가입·비밀번호 재설정은 **Supabase Auth 기본 제공**(데이터층 `signInWithEmail`/`signUpWithEmail`/`sendPasswordResetEmail`/`updatePassword`). 실 메일 발송은 프로젝트 **SMTP 설정 필요**(runbook).
- `find_login_email(p_name, p_phone)`(RPC, SECURITY DEFINER): **아이디(이메일) 찾기** — 이름+전화 정확히 1건 일치일 때만 **마스킹 이메일**(`ab***@dom`) 반환, 없음·중복은 null(존재 노출 최소화). 로그인 전 기능이라 `anon`+`authenticated` 에 grant. 프로덕션은 본인인증(PASS) 게이트 권장.
- `handle_new_user` 보강: provider 메타의 **전화(본인인증)** 를 형식 검증 후 `users.phone` 에 선반영 → 온보딩 프리필(구글은 전화 미제공, 카카오·네이버는 동의·검수 시 제공).

온보딩 단순화 + 음성 STT(`20260722150000` · Edge Function, 2026-07-25):

- `complete_onboarding` 개정: **요양보호사 = 소속 기관명 입력**(새 기관+org_admin)으로 되돌림(어르신 코드 합류 토글 제거 — 코드는 보호자용). 보호자 브랜치(어르신 코드 연결) 유지. 여러 요양보호사 같은 기관 합류(연속성)는 추후 기관 초대 메커니즘으로(런북).
- Edge Function **`stt-transcribe`**(신규 — ⚠️ 요양일지 음성 입력용이라 기획 변경 후 재검토 대상): 요양일지 음성 파일 → CLOVA CSR 인식 → `{text}`. CLOVA 키는 서버 시크릿(`NCP_CLOVA_CLIENT_ID/SECRET`). 데이터층 `transcribeAudio(file)`. 미배포 시 UI 안내.

파일럿 신규·변경(2026-09-23 기획 변경 — **2026-09-24 부터 마이그레이션 작성 중: D1 ✅ · D3 설정·권한표·역할 부여·직원 합류 ✅ · D4 기관 단위 RLS ✅ · D6 대화 단계·원격 제어·동시 4대 ✅ — 로컬 PG16 검증만, 운영 미적용**. 상세·순서: [`pilot-development-plan.md`](plans/pilot-development-plan.md) §5 D1~D10):

- **접근 모델 전환**: 요양보호사별 배정 격리 → **기관 단위 + 역할 기반**. 교대근무라 같은 기관의 돌봄팀은 담당과 관계없이 기록을 본다.
  `app.is_care_team()`(비 guardian 돌봄팀) · `app.has_capability(capability)`(기관별 위임) 신설, 9테이블 SELECT/UPDATE 술어를
  `org_id = app.current_org_id() and app.is_care_team()` 로 교체(D4). **보호자 브랜치는 복사해 무변경 유지.**
  `app.is_assigned_caregiver()` 는 **삭제하지 않는다** — "내 담당" 필터·알림 대상이 쓴다.
- `org_role` enum 에 `social_worker`·`center_director` 추가(D1) · `notification_kind` 에 `session_paused`·`journal_ready`·`journal_failed`(D2).
  ⚠️ `alter type ... add value` 는 **각각 단독 마이그레이션 파일** — 같은 트랜잭션에서 새 값을 쓸 수 없다.
- `org_settings`(시설 유형·목표 시간·기본 피할 주제·기본 프로그램 유형·기본 장소) · `org_capabilities`(일지 확정·공개 철회·보호자 연결 승인
  **3종만** 역할별 위임) · **`set_member_role(target, role)`** RPC — `users.role` 이 3중으로 잠겨 있어(`20260908000000`) 이 RPC 가 없으면
  새 역할을 가질 방법이 없다(D3).
- ⚠️ **직원 합류(D3 — 파일럿 블로커)**: 2026-07-25 이후 `complete_onboarding` 은 요양보호사마다 **새 기관 + `org_admin`** 을 만든다.
  `org_invites`(초대 코드 — `app.generate_invite_code()` 재사용, 합류 후 역할, 만료·회수) · `org_join_requests`(pending) ·
  `approve_org_join`(`org_admin`·`center_director` 만, 자기 요청 불가) 을 추가하고, **`users.org_id` 는 승인 전까지 NULL** 로 둔다 —
  "org_id 가 없으면 데이터 0건" 불변식을 그대로 쓴다. 기존 어르신 단위 배정은 접근 게이트가 아니라 "내 담당" 표시로 남는다.
- ⚠️ **`care_journals`·`journal_photos` DROP**(데이터 포함 — 사용자 확정). `program_journals`(공단 서식 필드를 **개별 컬럼**으로,
  상태 `generating|pending_review|final|failed`) · `program_journal_photos` · `program_journal_revisions`(확정 후 수정 이력) ·
  `journal_generation_jobs`(초안 생성 큐) + 트리거 4종 — **확정 가드(`auth.uid() is null` 이면 `final` 불가 — 서비스 계정 워커는 확정을 못 쓴다)** ·
  이력 · 세션 종료 enqueue · 공개 게이트(확정 + 보호자 문장 승인 + 권한). `care_grade` enum + `profiles.care_grade`(D5).
  Storage 버킷 `journal-photos` 의 기존 객체는 데이터 삭제 확정에 따라 함께 정리한다 — SQL 로 `storage.objects` 행만 지우면 실제 파일이
  남으므로 Storage API 로 지운다.
- `session_phase` enum + `sessions` 컬럼 7개(phase·phase_started_at·paused_at·paused_by·pause_reason·control_request·prompt_version) ·
  `session_interventions`(감독 개입 기록) · RPC `session_tick`·`advance_session_phase`·`request_session_control`(D6).
  목표 시간은 **기존 `sessions.duration_minutes`** 를 쓴다 — 새 컬럼을 만들지 않는다.
- ✅(로컬 2026-09-24) `push_tokens`(본인 행 조회만 · 쓰기는 `register_push_token`·`revoke_push_token` RPC — 기기 인계 시 주인 이동) · `notifications.pushed_at`(D7, 사용자 변경 불가) · `product_events` + definer 삽입 함수(D8 — 시간 절감·열람 이력의 유일한 증거).
- realtime publication 에 `program_journals`·`session_interventions` 추가(D9, `if exists (pg_publication)` 가드) ·
  동의 버전 단일화 `app.current_consent_version()`(D10).
- ⚠️ **출석 테이블은 만들지 않는다**(ERP 영역). 주간보호 제공 여부는 `program_journals` 행 유무 + `delivered`/`non_delivery_reason` 로만 표현한다.

## Access Model

대부분의 요청은 클라이언트가 **supabase-js로 직접** 수행한다. 인증된 사용자의 JWT가 자동 첨부되고, RLS가 각 행의 소유자(`user_id = auth.uid()`)를 검증한다.

```sql
-- 예시 정책 (모든 테이블 동일 패턴)
create policy profiles_select_own on profiles
  for select using (user_id = auth.uid());
```

> ⚠️ 위 예시는 v1 패턴이다. 운영 DB 는 아직 `org_id = app.current_org_id() and <비 guardian> and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())`,
> 저장소(파일럿 D4 `20260924030000`, 로컬 검증·운영 미적용)는 아래와 같다 — 위임 권한이 필요한 쓰기(일지 확정 등)는 정책이 아니라 트리거·RPC 에서 `app.has_capability()` 로 검사한다.

```sql
-- 파일럿 목표 술어(D4) — 같은 기관 돌봄팀 읽기
using (org_id = app.current_org_id() and app.is_care_team())
```

공급자 키는 서버에만 둔다. 현재 토큰 발급·웹 STT 등은 Edge Function이 처리한다. 새 장시간 음성 중계는 별도 실행 환경에서 호출자 권한을 집행하며, 서버 권한으로 기록하더라도 호출자·기관·대상·동의 검증을 생략하지 않는다.

음성 중계 흐름(2026-09-13 승인 → **코드 구현·로컬 검증 완료, 운영 배포·실기기 미검증**. 2026-09-23 **유일한 음성 경로로 확정** — 앱 직접 연결은 폐기):

1. 앱이 음성 중계에 인증된 연결을 요청한다. 중계가 세션·기관·배정·동의·상태·한도를 검사한다. ⚠️ 중계는 **사용자 JWT 로** `live-token` 을 불러 Gemini 토큰을 받는다 — 서버가 중계와 앱 직접 호출을 구분하지 못하므로 파일럿에서 `live-token` 을 중계 전용으로 잠근다(파일럿 계획 C4).
2. 중계가 Gemini Live 입력과 연결 수명을 통제한다. ~~기존 앱 직접 연결 경로의 전환 정책도 필요하다.~~ → 직접 경로는 **폐기**(파일럿 계획 M1). 파일럿에서는 중계의 2초 권한 폴을 `session_tick` RPC 로 바꿔 단계·원격 제어를 함께 받는다(D6).
3. Live 출력 전사 → 서버 검증·채택 → Clova 합성 → 앱 재생으로 연결한다. Live Structured Outputs를 전제하지 않는다.
4. 생성·채택·실제 재생과 전사/교정 출처를 구분하는 기록 계약을 설계한다. 기존 컬럼과 신규 필요 항목은 DB 작업에서 대조하며 고정 `audio_url` 반환을 전제하지 않는다. 상세: [음성 계획 §3.4](plans/voice-ai-personalization.md#34-서버-통제턴기록-계약-2026-09-13-승인-미구현) · 아래 "대화 기록 저장 계약".

## 대화 기록 저장 계약 (음성 경로)

> 📌 2026-09-24: `runbooks/transcript-storage-rollout.md` 와 `plans/playback-storage-contract.md` 를 이 절로 합쳤다.

**전사 출처 저장 v1** — `20260919175923_transcript_provenance.sql`(⚠️ **운영 미적용**, 로컬 PG16 검증만).
- `session_logs` 에 `transcript_provenance`·`transcript_revisions` 를 더한다. `kind = automatic | caregiver_confirmed`,
  `inputSource = gemini_live | manual | unknown`. 입력 출처의 **보고**이지 음성과 일치한다는 검증이 아니다.
- `caregiver_confirmed` 의 확인자·시각은 서버가 `auth.uid()`·`statement_timestamp()` 로 적는다. 수정하면 이전 내용·출처·수정자가 보존되고
  클라이언트가 이력을 지울 수 없다(100회 상한). 과거 NULL 출처를 "확인됨"으로 추정하지 않는다.
- 앱은 `transcript_storage_version()` 이 1 일 때만 새 필드를 보낸다. 자동 채택 턴은 구서버에 저장하지 않는다.
- 적용 순서: 운영 이력 확인 → 사용자 승인 후 한 건 적용 → 카탈로그·왕복 검증 → 서버 → 앱 순 배포.
  롤백은 자동 진행을 끄는 것이고 **출처 컬럼은 지우지 않는다**.

**재생 관측 저장** — 제안 계약(⚠️ SQL·마이그레이션 **미구현**, TypeScript 어댑터와 가상 RPC 시험만).
- `save_voice_playback_v1(p_session_id, p_observations jsonb) returns integer` — 최대 120개의
  `{turnIndex, text, result: completed|interrupted|empty, observedAt}`. 저장된 AI 턴과 대조해 한 트랜잭션으로 기록하고,
  하나라도 틀리면 전체 거절. 같은 요청 재시도는 같은 결과(멱등). `completed` 를 뒤늦게 낮추지 않는다.
- `completed` 는 앱의 보고이지 실제로 들었다는 증명이 아니다. 기기 시각과 서버 수신 시각을 구분한다.

## Apply to Supabase

Supabase CLI로 공식 마이그레이션 흐름을 사용한다.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push          # 마이그레이션 적용
supabase functions deploy # Edge Functions 배포
```

로컬 개발은 `supabase start`로 로컬 스택을 띄워 마이그레이션·함수를 검증한 뒤 원격에 반영한다. CLI 없이 먼저 적용하려면 Supabase Dashboard의 SQL Editor에서 마이그레이션 SQL을 실행한다.

## Environment Variables

Supabase **publishable/secret 키 체계**를 사용한다(레거시 anon/service_role 키는 2026말 폐기 예정). 클라이언트(웹·모바일)는 공개 가능한 값만 사용한다.

```env
# 클라이언트 (웹: Vite / 모바일: Expo)
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<publishable-key>"   # 레거시 anon key 대체
```

Edge Functions 전용 비밀값은 Supabase secrets로 관리하고 클라이언트에 노출하지 않는다.

```env
# Edge Functions secrets (클라이언트 미노출)
SUPABASE_SECRET_KEY="<secret-key>"             # 레거시 service_role key 대체
OPENAI_API_KEY="sk-..."                        # 과거 공급자 예시; 초기 Live 필수 키가 아님
NCP_CLOVA_CLIENT_ID="<X-NCP-APIGW-API-KEY-ID>"     # CLOVA Voice(TTS)/Speech(STT) — Client ID
NCP_CLOVA_CLIENT_SECRET="<X-NCP-APIGW-API-KEY>"    # CLOVA — Client Secret (쌍으로 인증)
NAVER_CLIENT_ID="<...>"                         # 소셜 로그인(네이버, 커스텀 naver-auth)
NAVER_CLIENT_SECRET="<...>"                     # 서버에만 보관
```

실제 값은 커밋하지 않는다.

## Notes

- 실시간 동기화: 웹 1차 MVP(Phase W)부터 **Supabase Realtime 구독**을 사용한다 — `sessions`·`session_analyses`·`guardian_shares` 변경을 웹 대시보드/분석/보호자 화면에 실시간 반영(T-E3). 별도 실시간 DB는 두지 않는다.
- ⚠️ Realtime 에 테이블을 추가할 때는 publication(마이그레이션)과 **`packages/data` `realtime.ts` 의 세 곳**(`RealtimeTable` 타입·`DEFAULT_TABLES`·`invalidateFor`)을 함께 바꾼다. publication 에만 넣으면 아무도 듣지 않는다(2026-09-04 에 겪었다). 파일럿 대상: `program_journals`·`session_interventions`.
- 어르신 출생연도는 입력 검증 기준에 맞춰 `1900..2006`으로 제한한다.
- TTS 출력 저장·재사용은 공급자 계약 확인 전 기능으로 전제하지 않는다. 기존 오디오 관련 컬럼이 있어도 저장 구현 완료를 뜻하지 않으며, 텍스트 기록·입력 원음·TTS 출력에 동일한 24시간 정책을 적용하지 않는다.
- API 응답의 `timestamp` 필드는 DB의 `session_logs.spoken_at`에서 매핑한다.
- 기존 마이그레이션이 `firebase_uid` / `app.user_id` 기반으로 작성돼 있다면, `auth.users` 연결 + `auth.uid()` 기반 RLS로 재작성한다.

## 2026-09-12 사업 기획 반영 사항 (당시 기록)

현재 테이블을 변경한 것은 아니다. 신규 데이터 계약 후보: 회상/직접 관찰 출처, 입력 원문·생성 초안·최종본 연결, 공급자 모델·프롬프트 버전·청구 토큰·TTS 문자 수·기관/세션 귀속·멱등 키, 작성/수정/승인과 개입 이벤트, 학습 동의·독립 원음/전사·검수·철회 계보. 기존 컬럼으로 가능한 범위를 먼저 대조하고 필요한 마이그레이션만 설계한다. 공개 전환은 초안 승인과 별개이며 RLS·감사·철회 검증이 필요하다.

## 2026-09-23 기획 변경 반영 사항

위 계약 후보 중 다수가 **새 계획에서 확정됐다**([`pilot-development-plan.md`](plans/pilot-development-plan.md) §5):
프롬프트 버전(`sessions.prompt_version`) · 작성/수정/승인 이벤트(`program_journal_revisions`, `product_events`) ·
개입 이벤트(`session_interventions`). 신규: **기관 단위 RLS 전환**(현재 9테이블이 배정 격리 —
`20260722100000`), `org_capabilities`, `program_journals`(공단 필드는 **jsonb 가 아니라 개별 컬럼**),
`care_grade`, `push_tokens`. ⚠️ `care_journals`·`journal_photos` 는 **삭제**(데이터 포함, 사용자 확정).
⚠️ 출석 테이블은 만들지 않는다(ERP 영역) — 제공 여부는 `program_journals` 행 유무 + `delivered` 로 표현한다.

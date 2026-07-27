# 런북 — Supabase 서울 리전 이전 (M10.1)

> **목적**: 데이터 국내보관을 위해 도쿄(ap-northeast-1) `GiokOn` → **서울(ap-northeast-2)**
> 신규 프로젝트로 이전한다. 컨테이너는 `*.supabase.co` egress가 차단돼 Claude가 직접
> 적용할 수 없으므로, **대시보드/CLI로 사용자가 이 체크리스트를 따라 적용**한다.
> 마이그레이션 **19종**은 로컬 PostgreSQL 16으로 전체 적용·RLS 회귀·기능검증을 마친 상태다.
>
> **소셜 로그인 콘솔 등록·SMTP·naver-auth·AI 키 등 "외부 연동 전체"는**
> [`go-live-external-setup.md`](./go-live-external-setup.md) 에 순서대로 정리돼 있다.
> 이 문서는 그 중 **리전 이전 + Supabase 자체 설정**에 집중한다.

적용 순서: **① 프로젝트 생성 → ② 마이그레이션(19종) → ③ Auth 설정 → ④ 검증 → ⑤ 앱 재배선 → ⑥ 도쿄 폐기**.

---

## 0. 사전 준비
- [ ] Supabase 조직 접근 권한, 결제 수단(백업/PITR 위해 **Pro 플랜 권장**).
- [ ] 강력한 DB 비밀번호 준비(비밀번호 관리자 보관, **레포에 커밋 금지**).
- [ ] 도쿄 프로젝트에 보존할 실데이터가 있는지 확인 — 현재는 테스트 가입뿐이면 **신규 시작 권장**(데이터 이관 불필요).

---

## 1. 서울 프로젝트 생성
1. Supabase 대시보드 → **New project**.
2. **Region: `Northeast Asia (Seoul)` = ap-northeast-2** ← 반드시 확인.
3. Name: `GiokOn-Seoul`(또는 조직 규칙에 맞게). DB password 설정.
4. 생성 완료 후 **Project Settings → General → Region**이 `Northeast Asia (Seoul)`인지 재확인.
5. (권장) **Settings → Add-ons/Database → Point-in-Time Recovery** 활성화, 자동 백업 확인.

---

## 2. 마이그레이션 적용 — 19개 **전부**, 순서 엄수

> ❓ **"파일이 7개보다 많던데 다 적용하나요?" → 네, `supabase/migrations/`의 SQL 19개를 파일명
> 순서대로 전부 적용합니다.** 각 파일은 앞 파일이 만든 테이블/함수/타입 위에 쌓이므로(예: 15번이
> 9개 테이블 RLS를 재작성, 16번이 그 위에 enum 값 추가) **하나라도 빠지거나 순서가 틀리면 뒤가
> 에러**납니다. 파일명 앞 숫자(타임스탬프)가 곧 적용 순서입니다.

> 실 Supabase에는 `auth.users`·`auth.uid()`·`authenticated`·`anon` 롤이 이미 존재하므로
> **로컬 테스트용 심(`supabase/tests/_supabase_shims.sql`)과 `supabase/tests/*`는 적용하지 않는다.**
> (그 파일들은 로컬 검증 전용입니다. 오직 `supabase/migrations/*.sql`만 올립니다.)

### 방법 A — Supabase CLI (권장·가장 안전, 순서 자동)
CLI가 19개를 타임스탬프 순으로 자동 적용하고, 이미 적용된 건 건너뜁니다. 사람이 순서를 헷갈릴 일이 없습니다.
```bash
# 1) CLI 설치(최초 1회). macOS: brew install supabase/tap/supabase
# 2) 로그인
supabase login
# 3) 이 저장소 루트에서 서울 프로젝트에 연결(ref = 대시보드 Project Settings → General → Reference ID)
supabase link --project-ref <서울_project_ref>
# 4) migrations/ 전체를 순서대로 적용
supabase db push
```
> `supabase db push`가 "Applying migration ..." 를 19번 출력하고 에러 없이 끝나면 완료입니다.

### 방법 B — 대시보드 SQL Editor (CLI 없이)
**아래 표의 순서 그대로** 각 파일을 열어 → 내용 전체 복사 → SQL Editor에 붙여넣기 → **Run** →
"Success"를 확인한 뒤 **다음 파일로**. 절대 순서를 바꾸지 마세요.

| # | 파일 | 내용 |
|---|---|---|
| 1 | `20260521131723_initial_schema.sql` | 5테이블·인덱스·기본 RLS |
| 2 | `20260624090000_supabase_auth_rls.sql` | Auth 전환·가입 트리거·auth.uid() RLS |
| 3 | `20260703120000_organizations_rbac.sql` | 조직·RBAC·org_id·조직 RLS |
| 4 | `20260703130000_audit_log.sql` | 감사로그·2년 보관 |
| 5 | `20260703140000_consents.sql` | 동의(민감·국외이전·대리동의) |
| 6 | `20260703150000_consent_retention.sql` | 동의 증빙 보존 |
| 7 | `20260711100000_safety_events.sql` | 안전 이벤트(위기 에스컬레이션) |
| 8 | `20260718100000_safety_events_guardian_rls.sql` | safety_events guardian 배제 가드 |
| 9 | `20260718110000_auth_onboarding.sql` | **가입 트리거 최소화**(org 자동생성 폐지)+`complete_onboarding` |
| 10 | `20260718120000_guardian_links.sql` | 보호자 연결(구 초대·감사 이력) |
| 11 | `20260718125000_realtime_publication.sql` | Realtime 퍼블리케이션 |
| 12 | `20260718130000_session_analyses.sql` | 세션 분석 |
| 13 | `20260718140000_care_journals.sql` | 요양일지 + Storage 정책(**버킷 필요 — §5**) |
| 14 | `20260718150000_guardian_shares.sql` | 공개 커밋(보호자 노출) |
| 15 | `20260722100000_elder_codes_caregiver_assignment.sql` | 어르신 영속 코드·배정·9테이블 RLS 재작성 |
| 16 | `20260722110000_caregiver_assignment_pending.sql` | 배정 `pending` enum 값 추가(별도 파일=트랜잭션 제약 회피) |
| 17 | `20260722120000_caregiver_org_join_approval.sql` | 요양보호사 기관 합류 승인형 |
| 18 | `20260722130000_elder_code_generation_hardening.sql` | 코드 생성 CSPRNG·혼동문자 제거 |
| 19 | `20260722140000_email_auth_support.sql` | 이메일 인증 보조(find_login_email·전화 캡처) |

- 2·9번에서 `NOTICE: trigger "..." does not exist, skipping`, 18번에서 `extension "pgcrypto" already exists, skipping` 는 **정상**(있으면 건너뛰는 안전장치).
- [ ] 19개 전부 오류 없이 적용됐는지 확인. (Realtime·wal_level 관련 NOTICE도 실 프로젝트에선 정상.)

---

## 3. Auth 설정 (처음 하는 분을 위해 자세히)

Supabase 대시보드 왼쪽 메뉴 **Authentication**(사람 아이콘)에서 진행합니다. 크게 3가지:
**(A) 이메일 로그인 켜기 → (B) 메일 발송용 SMTP → (C) 돌아올 주소(Redirect URL)**.
소셜 3종(구글·카카오·네이버) 콘솔 등록은 분량이 커서
[`go-live-external-setup.md` §3](./go-live-external-setup.md)에 따로 정리했습니다 — 이메일 로그인만
먼저 살리려면 (A)~(C)만 해도 됩니다.

### (A) 이메일 로그인 활성화
1. **Authentication → Sign In / Providers**(또는 Providers) 로 이동.
2. 목록에서 **Email** 을 찾아 **Enable(켜기)**.
3. **Confirm email(이메일 확인)** 옵션 선택:
   - **켜기(운영 권장)**: 가입하면 확인 메일이 가고, 링크를 눌러야 로그인됩니다. → 이 경우 (B) SMTP가 **반드시** 필요합니다.
   - **끄기(테스트 편의)**: 가입 즉시 로그인됩니다. 처음 시연만 할 거라면 꺼두고 시작해도 됩니다.
4. (지금 안 해도 됨) **비밀번호 최소 길이** 등은 Authentication → Policies에서 나중에 강화(앱은 8자 이상 검증).

### (B) SMTP (메일 발송) — 비밀번호 찾기·가입 확인에 필수
Supabase 기본 내장 메일러는 **하루 발송량이 매우 적어** 실사용엔 부적합합니다. 그래서 외부 메일
서비스를 연결합니다(무료 등급으로 시작 가능).
1. **SendGrid / AWS SES / Mailgun** 중 하나에 가입 → **SMTP 자격증명**(host, port, username, password)과
   **발신 이메일 주소**(예: `no-reply@giokon.co.kr`)를 발급/인증받습니다.
2. Supabase → **Authentication → Emails → SMTP Settings**(또는 Project Settings → Auth → SMTP) 로 이동
   → **Enable Custom SMTP** 켜고 위 값 입력 → 저장.
3. (Confirm email을 껐고, 아직 SMTP가 없다면 이 단계는 나중에 해도 됩니다. 단 **비밀번호 찾기 메일은
   SMTP가 있어야 실제로 발송**됩니다.)

### (C) Redirect URL (로그인·메일 링크가 돌아올 주소) — 매우 중요
이걸 등록 안 하면 소셜 로그인/비밀번호 재설정 링크가 **"redirect not allowed"** 로 막힙니다.
1. **Authentication → URL Configuration** 로 이동.
2. **Site URL**: 서비스 대표 주소(예: `https://app.giokon.co.kr`). 아직 배포 전이면 로컬 `http://localhost:5173`.
3. **Redirect URLs** 에 아래를 **모두 추가**(줄바꿈 또는 콤마):
   ```
   https://<서비스도메인>/login
   https://<서비스도메인>/onboarding
   https://<서비스도메인>/reset-password
   http://localhost:5173/login
   http://localhost:5173/onboarding
   http://localhost:5173/reset-password
   ```
   - `/onboarding` = 가입 확인 후 복귀, `/reset-password` = 비밀번호 재설정 링크 착지, `/login` = 소셜 복귀.
4. 저장.

- [ ] (A) Email 켜짐 · (B) SMTP(운영 시) · (C) Redirect URL 3주소 등록 완료.
- [ ] 소셜 3종을 쓸 거면 → [`go-live-external-setup.md` §3~§5](./go-live-external-setup.md)(콜백 URL·스코프·naver-auth 배포).

---

## 4. 검증 (읽기 전용 — 프로덕션 안전)
> ⚠️ `supabase/tests/rls_regression.sql`은 **모든 데이터를 삭제**하므로 **실 프로젝트에서 실행 금지**.
> 아래 읽기 전용 쿼리로만 확인합니다(SQL Editor).

**4-1. 테이블 16개 + RLS 활성 확인**
```sql
select tablename, rowsecurity
from pg_tables where schemaname = 'public'
order by tablename;
-- 기대(16): audit_log, care_journals, chronicle_entries, consents, elder_codes,
--   guardian_invites, guardian_shares, organizations, profile_caregivers,
--   profile_guardians, profiles, safety_events, session_analyses, session_logs,
--   sessions, users  → 전부 rowsecurity = true
```

**4-2. 정책·트리거·함수·enum 존재 확인**
```sql
-- 테이블별 RLS 정책 수(0이면 정책 누락)
select tablename, count(*) policies from pg_policies where schemaname='public' group by 1 order by 1;
-- app 스키마 헬퍼(정체성/감사/배정 판정 등)
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app' order by 1;
--   기대 포함: current_org_id, current_org_role, is_org_admin, stamp_org_id,
--   write_audit_log, set_updated_at, generate_invite_code, is_assigned_caregiver,
--   is_linked_guardian, is_shared_to_me, bootstrap_profile
-- public RPC(온보딩·코드·인증 보조)
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and proname in ('complete_onboarding','claim_elder_by_code','link_guardian_by_elder_code',
      'rotate_elder_code','approve_caregiver_assignment','find_login_email','handle_new_user')
  order by 1;   -- 7개 모두 나와야 함
-- 핵심 enum 값
select typname, string_agg(enumlabel, ',' order by enumsortorder) labels
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  where typname in ('org_role','caregiver_assignment_status','guardian_link_status')
  group by 1;
--   기대: caregiver_assignment_status = active,removed,pending
```

**4-3. 가입 스모크 (앱 또는 대시보드 Authentication → Users에서 계정 1개 생성 후)**
```sql
select id, email, role, org_id, onboarded_at
from public.users order by created_at desc limit 3;
-- 기대(중요·최신 동작): 가입 직후엔 role='caregiver'(기본값), org_id = NULL,
--   onboarded_at = NULL 인 "최소 row" 만 생성된다.
--   ※ 예전 문서처럼 '가입 시 기관 자동생성 + org_admin' 이 되면 안 됩니다(9번 마이그레이션으로 폐지).
--   기관·역할은 앱의 온보딩(complete_onboarding)에서 확정됩니다.
```

- [ ] 4-1 전부 `true`(16테이블), 4-2 함수/enum 존재, 4-3에서 **org_id NULL·onboarded_at NULL 최소 row** 확인되면 통과.

---

## 5. Storage 버킷 (요양일지 사진)
13번 마이그레이션이 `journal-photos` 버킷의 접근 정책을 만들지만, **버킷 자체는 대시보드에서 생성**해야 합니다.
- [ ] **Storage → Buckets → New bucket → 이름 `journal-photos`, Public 체크 해제(Private)** 로 생성.
- [ ] (음성 원본을 쓰게 되면 그 버킷도 서울 프로젝트에 생성.)

---

## 6. 앱 재배선
- [ ] **로컬 dev**: `apps/web/.env`
  ```
  VITE_SUPABASE_URL=https://<서울_ref>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=<서울 publishable(anon) key>
  ```
  (키는 대시보드 **Project Settings → API → Project URL / anon(publishable) key**.)
- [ ] **원격 세션**: 환경 설정 env(`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`)를 서울 값으로 교체
      (`.claude/hooks/session-start.sh`가 `.env` 재생성).
- [ ] **Vercel**(웹 배포): Project → Settings → Environment Variables를 서울 값으로 교체 후 재배포.
- [ ] **키 원칙**: publishable(anon) 키만 클라이언트. **secret(service_role) 키는 서버(Edge Function) 전용**, 커밋 금지.

---

## 7. 도쿄 폐기
- [ ] 6번 재배선 후 앱이 **서울에 붙는지** 실동작 확인(이메일 가입·로그인·어르신 CRUD).
- [ ] 어떤 env도 도쿄 ref를 가리키지 않는지 grep 확인.
- [ ] 도쿄 `GiokOn` 프로젝트 **Pause → Delete**(데이터 국외 잔존 제거).
- [ ] `CLAUDE.md`·`PLAN.md`의 리전 표기를 "서울 이전 완료"로 갱신(적용 후 Claude가 반영).

---

## 완료 기준 (M10.1 Done)
- ✅ 전 개인정보 테이블(16개)이 서울(ap-northeast-2)에 존재, RLS 활성.
- ✅ 가입 시 **최소 row**(org_id NULL) 생성 → 온보딩에서 기관·역할 확정, 조직 단위 격리 동작.
- ✅ 이메일 로그인 켜짐(+운영 시 SMTP), Redirect URL 등록.
- ✅ 앱(로컬·Vercel)이 서울에 연결, 도쿄 폐기. (권장) PITR/백업 활성.

> 적용 중 오류·의문이 생기면 **해당 단계 번호 + 에러 메시지 전문**을 붙여 알려 주세요. 검증
> 쿼리 결과를 붙여 주시면 정상 여부를 함께 확인하고, 완료 후 문서 리전 표기를 갱신하겠습니다.

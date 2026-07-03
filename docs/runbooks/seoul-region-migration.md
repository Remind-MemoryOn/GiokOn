# 런북 — Supabase 서울 리전 이전 (M10.1)

> **목적**: 데이터 국내보관을 위해 도쿄(ap-northeast-1) `GiokOn` → **서울(ap-northeast-2)**
> 신규 프로젝트로 이전한다. 컨테이너는 `*.supabase.co` egress가 차단돼 Claude가 직접
> 적용할 수 없으므로, **대시보드/CLI로 사용자가 이 체크리스트를 따라 적용**한다.
> 마이그레이션 6종은 로컬 PostgreSQL 16으로 전체 적용·기능검증을 마친 상태다.

적용 순서: **① 프로젝트 생성 → ② 마이그레이션 → ③ Auth 설정 → ④ 검증 → ⑤ 앱 재배선 → ⑥ 도쿄 폐기**.

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

## 2. 마이그레이션 적용 (순서 엄수)
> 실 Supabase에는 `auth.users`·`auth.uid()`·`authenticated` 롤이 이미 존재하므로
> **로컬 테스트용 심(`supabase/tests/_supabase_shims.sql`)은 적용하지 않는다.**
> 아래 6개 파일을 **번호 순서대로** 각각 끝까지 실행한다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `supabase/migrations/20260521131723_initial_schema.sql` | 5개 테이블·인덱스·기본 RLS |
| 2 | `supabase/migrations/20260624090000_supabase_auth_rls.sql` | Auth 전환·가입 트리거·RLS auth.uid() |
| 3 | `supabase/migrations/20260703120000_organizations_rbac.sql` | 조직·RBAC·org_id·조직 RLS·가입 시 기관 자동생성 |
| 4 | `supabase/migrations/20260703130000_audit_log.sql` | 감사로그·처리기록 트리거·2년 보관 |
| 5 | `supabase/migrations/20260703140000_consents.sql` | 동의(민감·국외이전·대리동의) |
| 6 | `supabase/migrations/20260703150000_consent_retention.sql` | 동의 증빙 보존(user_id SET NULL) |

**방법 A — Supabase CLI(권장, 자동 순서):**
```bash
supabase link --project-ref <서울_project_ref>
supabase db push          # migrations/ 전체를 순서대로 적용
```

**방법 B — 대시보드 SQL Editor:**
- 각 파일 내용을 **위 순서대로** 복사 → 실행. 다음 파일로 넘어가기 전 오류 없이 완료됐는지 확인.
- 2번에서 `NOTICE: trigger "on_auth_user_created" ... does not exist, skipping`는 **정상**(drop-if-exists).

---

## 3. Auth 설정
- [ ] **Authentication → Providers → Email** 활성화(도쿄에서 했던 설정 재적용).
- [ ] 이메일 확인(Confirm email) 정책 확인. 테스트 편의를 위해 초기엔 확인 없이도 가능하게 두었다면 동일하게.
- [ ] (선택) MFA·비밀번호 정책은 보안 강화 단계(M10.2)에서.

---

## 4. 검증 (읽기 전용 — 프로덕션 안전)
> ⚠️ `supabase/tests/rls_regression.sql`은 **모든 데이터를 삭제**하므로 **실 프로젝트에서 실행 금지**.
> 아래 읽기 전용 쿼리로 확인한다.

**4-1. 테이블·RLS 활성 확인** (SQL Editor)
```sql
select tablename, rowsecurity
from pg_tables where schemaname = 'public'
order by tablename;
-- 기대: users, profiles, chronicle_entries, sessions, session_logs,
--       organizations, consents, audit_log 모두 rowsecurity = true
```

**4-2. 정책·트리거·함수·enum**
```sql
select tablename, count(*) policies from pg_policies where schemaname='public' group by 1 order by 1;
select event_object_table, trigger_name from information_schema.triggers
  where trigger_schema='public' order by 1,2;
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app' order by 1;   -- current_org_id, is_org_admin, stamp_org_id, write_audit_log, purge_audit_log ...
select typname, string_agg(enumlabel, ',' order by enumsortorder) labels
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  where typname in ('org_role','consent_type','consent_subject_type','consent_capacity')
  group by 1;
```

**4-3. 가입 스모크 테스트** (앱 또는 대시보드 Auth에서 계정 1개 생성 후)
```sql
select u.email, u.role, o.name as org
from public.users u join public.organizations o on o.id = u.org_id;
-- 기대: role = 'org_admin', org = '<이름>의 기관' (가입 트리거가 기관 자동생성)
```

- [ ] 4-1 모두 `true`, 4-3에서 org 자동생성 + `org_admin` 확인되면 통과.

---

## 5. 앱 재배선
- [ ] **로컬 dev**: `apps/web/.env`
  ```
  VITE_SUPABASE_URL=https://<서울_ref>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=<서울 publishable(anon) key>
  ```
- [ ] **원격 세션**: 환경 설정 env(`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`)를 서울 값으로 교체
      (`.claude/hooks/session-start.sh`가 `.env` 재생성).
- [ ] **Vercel**(웹 배포): Project → Settings → Environment Variables를 서울 값으로 교체 후 재배포.
- [ ] **키 원칙**: publishable(anon) 키만 클라이언트. **secret(service_role) 키는 서버(Edge Function) 전용**, 커밋 금지.
- [ ] Storage 사용 시 버킷도 서울 프로젝트에 생성(음성 원본).

---

## 6. 도쿄 폐기
- [ ] 5번 재배선 후 앱이 **서울에 붙는지** 실동작 확인(로그인·어르신 CRUD).
- [ ] 어떤 env도 도쿄 ref를 가리키지 않는지 grep 확인.
- [ ] 도쿄 `GiokOn` 프로젝트 **Pause → Delete**(데이터 국외 잔존 제거).
- [ ] `CLAUDE.md`·`PLAN.md`의 리전 표기를 "서울 이전 완료"로 갱신(적용 후 Claude가 반영).

---

## 완료 기준 (M10.1 Done)
- ✅ 전 개인정보 테이블이 서울(ap-northeast-2)에 존재, RLS 활성.
- ✅ 가입 시 기관 자동생성 + org_admin, 조직 단위 격리 동작.
- ✅ 앱(로컬·Vercel)이 서울에 연결, 도쿄 폐기.
- ✅ (권장) PITR/백업 활성.

> 적용 중 오류·의문이 생기면 해당 단계 로그와 함께 알려 주세요. 검증 쿼리 결과를 붙여
> 주시면 정상 여부를 함께 확인하고, 완료 후 문서 리전 표기를 갱신하겠습니다.

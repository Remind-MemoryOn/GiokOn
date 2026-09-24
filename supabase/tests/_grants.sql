-- MemoryOn(기억온) — 테스트용 authenticated 롤 권한 부여
--
-- 마이그레이션 적용 후(테이블 생성 후) 실행한다. RLS 는 활성 상태이므로 권한을
-- 줘도 정책 범위 밖 데이터는 보이지 않는다(격리 검증의 전제). 테스트 전용.

-- 광범위한 테스트 권한을 주기 전에 실제 마이그레이션의 1차 방어를 검사한다.
-- 테스트 안에서 REVOKE를 다시 실행한 뒤 확인하면 마이그레이션 누락도 통과한다.
do $$
begin
  assert not has_function_privilege('anon','public.can_process_profile(uuid)','EXECUTE'),
    'Anonymous callers must not inspect processing eligibility';
  assert not has_function_privilege('authenticated','app.has_processing_consent(uuid)','EXECUTE'),
    'Internal consent predicate must remain private';
  assert not has_table_privilege('authenticated', 'public.users', 'UPDATE'),
    '마이그레이션은 users 테이블 UPDATE 권한을 회수해야 함';
  assert not has_table_privilege('authenticated','public.consents','UPDATE'), 'Consent table UPDATE must be revoked';
  assert not (select prosecdef from pg_proc where oid='app.guard_record_identity()'::regprocedure),
    'Record identity guard must remain SECURITY INVOKER';
  assert has_column_privilege('authenticated','public.consents','revoked_at','UPDATE'), 'Withdrawal must remain possible';
  assert not (select prosecdef from pg_proc where oid='app.guard_consent_evidence_update()'::regprocedure),
    'Consent evidence guard must use SECURITY INVOKER';
  assert not exists(select 1 from pg_attribute where attrelid='public.consents'::regclass
    and attnum>0 and not attisdropped and attname not in ('granted','revoked_at')
    and has_column_privilege('authenticated','public.consents',attname,'UPDATE')), 'Evidence columns must not be writable';
  assert has_column_privilege('authenticated', 'public.users', 'name', 'UPDATE'),
    '표시 이름 수정 권한은 유지되어야 함';
  assert not exists (
    select 1 from pg_attribute
    where attrelid = 'public.users'::regclass and attnum > 0 and not attisdropped
      and attname <> 'name'
      and has_column_privilege('authenticated', 'public.users', attname, 'UPDATE')
  ), 'name 이외 컬럼은 직접 수정할 수 없어야 함';
  assert not (select prosecdef from pg_proc
    where oid = 'app.protect_user_privileges()'::regprocedure),
    '권한 보호 트리거는 SECURITY INVOKER여야 함';
  -- 파일럿 D3: 초대·합류 요청·권한표 쓰기는 RPC 전용 / 설정·권한표 삭제 경로 없음 / anon 접근 없음
  assert not has_table_privilege('authenticated', 'public.org_invites', 'INSERT,UPDATE,DELETE'),
    'org_invites 쓰기는 RPC 전용이어야 함';
  assert not has_table_privilege('authenticated', 'public.org_join_requests', 'INSERT,UPDATE,DELETE'),
    'org_join_requests 쓰기는 RPC 전용이어야 함';
  assert not has_table_privilege('authenticated', 'public.org_settings', 'DELETE')
     and not has_table_privilege('authenticated', 'public.org_capabilities', 'DELETE'),
    '기관 설정·권한표는 클라이언트가 지울 수 없어야 함';
  assert not has_table_privilege('anon', 'public.org_settings', 'SELECT')
     and not has_table_privilege('anon', 'public.org_capabilities', 'SELECT')
     and not has_table_privilege('anon', 'public.org_invites', 'SELECT')
     and not has_table_privilege('anon', 'public.org_join_requests', 'SELECT'),
    '파일럿 신규 테이블은 anon 이 읽을 수 없어야 함';
  assert not has_function_privilege('anon', 'public.set_member_role(uuid, public.org_role)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'app.decide_org_join(uuid, boolean)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'app.enqueue_org_join(uuid, text, text)', 'EXECUTE'),
    '역할·합류 내부 함수는 직접 호출할 수 없어야 함';
  -- 파일럿 D6: 개입 기록은 RPC 전용 · 감독 RPC 는 anon 불가
  assert not has_table_privilege('authenticated', 'public.session_interventions', 'INSERT,UPDATE,DELETE')
     and not has_table_privilege('anon', 'public.session_interventions', 'SELECT'),
    'session_interventions 쓰기는 RPC 전용, anon 은 읽을 수 없어야 함';
  assert not has_function_privilege('anon', 'public.session_tick(uuid)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.request_session_control(uuid, text, text)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.advance_session_phase(uuid, public.session_phase, text)', 'EXECUTE'),
    '감독 RPC 는 anon 이 부를 수 없어야 함';
  assert not (select prosecdef from pg_proc where oid = 'app.protect_session_supervision()'::regprocedure),
    '감독 컬럼 보호 트리거는 SECURITY INVOKER 여야 함(current_user 판별)';
end $$;

grant usage on schema public, app to authenticated;
-- ⚠️ auth 스키마 권한이 없으면 authenticated 가 auth.uid() 를 부를 때
-- "permission denied for schema auth"(42501 = insufficient_privilege)가 난다.
-- 그러면 `exception when insufficient_privilege` 로 차단을 확인하는 테스트들이
-- **엉뚱한 이유로 통과**한다(2026-09-08 발견 — §5.12 is_site_admin 테스트가 그랬다).
-- 실제 Supabase 에서는 authenticated 가 auth.uid() 를 호출할 수 있으므로 맞춘다.
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

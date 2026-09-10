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

-- MemoryOn(기억온) — 테스트용 authenticated 롤 권한 부여
--
-- 마이그레이션 적용 후(테이블 생성 후) 실행한다. RLS 는 활성 상태이므로 권한을
-- 줘도 정책 범위 밖 데이터는 보이지 않는다(격리 검증의 전제). 테스트 전용.

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
grant execute on all functions in schema app to authenticated;

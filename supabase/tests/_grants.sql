-- MemoryOn(기억온) — 테스트용 authenticated 롤 권한 부여
--
-- 마이그레이션 적용 후(테이블 생성 후) 실행한다. RLS 는 활성 상태이므로 권한을
-- 줘도 정책 범위 밖 데이터는 보이지 않는다(격리 검증의 전제). 테스트 전용.

grant usage on schema public, app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema app to authenticated;

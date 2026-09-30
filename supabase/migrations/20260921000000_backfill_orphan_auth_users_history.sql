-- 운영 이력 맞춤용 빈 마이그레이션(의도적으로 아무것도 하지 않는다) — 2026-09-28 사용자 결정
--
-- 운영 이력에는 `20260921000000_backfill_orphan_auth_users`(SQL 로 직접 넣은 일회성 데이터 보정)가 있는데
-- 저장소에는 이 버전 파일이 없었다. 원래 본문은 저장소에 없고, 운영 데이터를 맞춘 일회성 작업이라 새 DB 에서 다시 할 일이 없다.
-- 저장소에 같은 버전의 빈 파일을 두어 Supabase Preview 의 "Remote migration versions not found in local migrations directory" 를 해소한다.
-- ⚠️ 여기에 SQL 을 넣지 않는다 — 운영에는 이미 적용된 버전이라 다시 실행되지 않는다.
select 1;

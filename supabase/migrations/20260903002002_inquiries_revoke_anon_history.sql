-- 운영 이력 맞춤용 빈 마이그레이션(의도적으로 아무것도 하지 않는다) — 2026-09-28 사용자 결정
--
-- 운영 이력에는 `20260903002002`(이름 `20260902000100_inquiries_revoke_anon`)가 있는데 저장소에는 이 버전 파일이 없었다.
-- 그 내용(`revoke all on public.inquiries/inquiry_replies from anon`)은 이미 `20260902000000_inquiries.sql` 에 흡수돼 있다.
-- 운영 기록은 실제로 적용했던 사실이라 지우지 않고(AGENTS.md), 저장소에 같은 버전의 빈 파일을 두어
-- Supabase Preview 의 "Remote migration versions not found in local migrations directory" 를 해소한다.
-- ⚠️ 여기에 SQL 을 넣지 않는다 — 운영에는 이미 적용된 버전이라 다시 실행되지 않는다.
select 1;

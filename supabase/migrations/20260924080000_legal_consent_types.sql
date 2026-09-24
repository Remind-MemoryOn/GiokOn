-- 법률 문서 확정본(2026-09-24)에 맞춰 동의 종류 2개를 추가한다.
--   terms_required         — 이용약관 동의(계정)
--   elder_privacy_required — 어르신 개인정보 수집·이용 동의(어르신)
-- ⚠️ 이 파일에 다른 DDL 을 넣지 않는다 — 새 enum 값은 같은 트랜잭션에서 쓸 수 없다.
--    값을 쓰는 정책·함수는 다음 파일(20260924090000)에 있다.
-- (원래 jinwoo 브랜치의 20260924000000 이었으나, main 의 20260924000000_org_role_add_values 와
--  번호가 겹치고 운영에 이미 적용된 버전이라 main 의 마지막 번호 뒤로 옮겼다.)
alter type public.consent_type add value if not exists 'terms_required';
alter type public.consent_type add value if not exists 'elder_privacy_required';

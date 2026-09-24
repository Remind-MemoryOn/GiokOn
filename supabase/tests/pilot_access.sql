-- 기억온 — 파일럿 권한 재설계 회귀 (파일럿 계획 §12 "RLS 회귀에 추가할 단언")
--
-- rls_regression.sql 뒤에 실행된다(run-rls-regression.sh). 기존 파일은 배정 기반(2026-07) 시나리오를
-- 담고 있고, 이 파일은 파일럿 D1~D6 의 기관 단위·역할 기반 불변식을 따로 모은다.
-- 모든 데이터는 이 파일 안에서 만들고, 단언은 ASSERT 로 즉시 중단한다.

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ── D1: org_role 확장 ─────────────────────────────────────────────────────
do $$
begin
  assert 'social_worker'::public.org_role::text = 'social_worker', 'org_role 에 social_worker 가 있어야 함';
  assert 'center_director'::public.org_role::text = 'center_director', 'org_role 에 center_director 가 있어야 함';
  assert (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'org_role') = 5,
    'org_role 은 5개 값이어야 함(org_admin·caregiver·guardian·social_worker·center_director)';
end $$;

select 'pilot access assertions passed' as result;

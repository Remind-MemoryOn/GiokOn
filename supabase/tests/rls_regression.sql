-- MemoryOn(기억온) — RLS·RBAC·테넌트 격리 회귀 테스트 (T10.4 / M13.3)
--
-- 목적: 조직(멀티테넌시) 도입 후 "다른 기관·다른 사용자 데이터 접근 0건"과
-- 역할별 권한 범위(caregiver=본인 / org_admin=소속 기관 전체)를 자동 검증한다.
-- 마이그레이션을 모두 적용한 DB 위에서 실행한다(로컬은 tests/run-rls-regression.sh
-- 가 auth 심을 먼저 만든다; Supabase 는 auth.users/auth.uid() 가 실재).
--
-- 실행: SET 으로 사용자/역할을 바꿔가며 psql 로 구동. 실패 시 ASSERT 로 즉시 중단.

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ── 0) 깨끗한 상태 보장(재실행 가능) ──────────────────────────────────────
-- security definer 함수/트리거가 RLS 를 우회하므로 superuser 로 정리한다.
delete from public.audit_log;
delete from public.consents;
delete from public.session_logs;
delete from public.sessions;
delete from public.chronicle_entries;
delete from public.profiles;
delete from public.users;
delete from public.organizations;
delete from auth.users;

-- ── 1) 가입(트리거가 기관 자동생성 + org_admin 부여) ───────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.kr', '{"name":"기관A관리자"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@y.kr', '{"name":"기관B관리자"}'),
  ('33333333-3333-3333-3333-333333333333', 'c@x.kr', '{"name":"기관A요양보호사"}');

-- 요양보호사 C 를 기관 A 소속(role=caregiver)으로 이동(초대 플로우 모사).
update public.users
  set org_id = (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111'),
      role = 'caregiver'
  where id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  assert (select count(*) from public.organizations) = 3,
    '가입 시 사용자별 기본 기관 자동 생성(3개) 실패';
  assert (select role from public.users where id = '11111111-1111-1111-1111-111111111111') = 'org_admin',
    '가입자는 org_admin 이어야 함';
  assert (select bool_and(org_id is not null) from public.users),
    '모든 사용자 org_id 채워져야 함';
end $$;

-- ── 2) 데이터 생성(org_id 자동 스탬프) ─────────────────────────────────────
set role authenticated;

set test.uid = '11111111-1111-1111-1111-111111111111';  -- 관리자 A
insert into public.profiles (user_id, name, birth_year)
  values ('11111111-1111-1111-1111-111111111111', 'A어르신', 1945);

set test.uid = '33333333-3333-3333-3333-333333333333';  -- 요양보호사 C(기관 A)
insert into public.profiles (user_id, name, birth_year)
  values ('33333333-3333-3333-3333-333333333333', 'C어르신', 1938);

set test.uid = '22222222-2222-2222-2222-222222222222';  -- 관리자 B(다른 기관)
insert into public.profiles (user_id, name, birth_year)
  values ('22222222-2222-2222-2222-222222222222', 'B어르신', 1950);

reset role;
do $$
begin
  assert (select bool_and(p.org_id = u.org_id)
          from public.profiles p join public.users u on u.id = p.user_id),
    'org_id 자동 스탬프가 소유자 기관과 일치해야 함';
end $$;

-- ── 3) 테넌트 격리 + 역할 범위(핵심 보안 불변식) ───────────────────────────
set role authenticated;

-- caregiver C: 본인 것만(1)
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.profiles) = 1,
    'caregiver 는 본인 어르신만 조회해야 함(기대 1)';
end $$;

-- org_admin A: 소속 기관 전체(2 = 본인 + 요양보호사 C)
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.profiles) = 2,
    'org_admin 은 소속 기관 전체를 조회해야 함(기대 2)';
end $$;

-- org_admin B: 다른 기관 → 0
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.profiles where name in ('A어르신','C어르신')) = 0,
    '다른 기관 데이터는 절대 보이면 안 됨(기대 0)';
end $$;

reset role;

-- ── 4) 쓰기 차단(다른 기관/타인 소유로 삽입 시도) ──────────────────────────
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true); -- 기관 B
  begin
    insert into public.profiles (user_id, name, birth_year)
      values ('11111111-1111-1111-1111-111111111111', '탈취시도', 1950); -- 기관 A 소유로 위장
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  reset role;
  assert blocked, '다른 사용자 소유로의 삽입은 RLS 로 차단되어야 함';
end $$;

-- ── 5) 동의 제약(대리동의 시 대리인 필수) ──────────────────────────────────
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$
declare
  pid uuid := (select id from public.profiles where name = 'A어르신');
  blocked boolean := false;
begin
  -- 본인 동의: OK
  insert into public.consents (user_id, profile_id, consent_type, granted, version, subject_type)
    values ('11111111-1111-1111-1111-111111111111', pid, 'sensitive_health_voice', true, 'v1.0', 'self');
  -- 대리동의인데 대리인 이름 없음: 제약 위반
  begin
    insert into public.consents (user_id, profile_id, consent_type, granted, version, subject_type)
      values ('11111111-1111-1111-1111-111111111111', pid, 'privacy_required', true, 'v1.0', 'guardian');
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, '대리동의(subject_type<>self)는 대리인 이름이 없으면 차단되어야 함';
end $$;
reset role;

-- ── 6) 감사로그 적재(처리기록) + 기관관리자 열람 범위 ──────────────────────
do $$ begin
  assert (select count(*) from public.audit_log where table_name = 'profiles' and action = 'insert') = 3,
    '어르신 3건 생성이 감사로그에 적재되어야 함';
end $$;

set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';  -- caregiver(비관리자)
do $$ begin
  assert (select count(*) from public.audit_log) = 0,
    '비관리자는 감사로그를 볼 수 없어야 함(기대 0)';
end $$;
reset role;

select '✅ RLS·RBAC·테넌트 격리·동의·감사 회귀 테스트 전부 통과' as result;

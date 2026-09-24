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

-- ── 공용 픽스처: 기관 PA(관리자·요양보호사·직원·보호자) · 기관 PB(관리자) ──────────────
-- a...01 PA 관리자 / a...02 PA 요양보호사 / a...03 PA 직원(역할 부여 대상) / a...04 PA 보호자 /
-- a...05 PB 관리자 / a...06 PA 두 번째 관리자 후보
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'pa-admin@x.kr', '{"name":"PA관리자"}'),
  ('a0000000-0000-0000-0000-000000000002', 'pa-care@x.kr', '{"name":"PA요양보호사"}'),
  ('a0000000-0000-0000-0000-000000000003', 'pa-staff@x.kr', '{"name":"PA직원"}'),
  ('a0000000-0000-0000-0000-000000000004', 'pa-guard@x.kr', '{"name":"PA보호자"}'),
  ('a0000000-0000-0000-0000-000000000005', 'pb-admin@y.kr', '{"name":"PB관리자"}'),
  ('a0000000-0000-0000-0000-000000000006', 'pa-admin2@x.kr', '{"name":"PA관리자2"}');

set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
select public.complete_onboarding('PA관리자', '010-0000-0001', 'caregiver', '파일럿A요양원', null, array['privacy_required'], 'v1.0', true);
set test.uid = 'a0000000-0000-0000-0000-000000000005';
select public.complete_onboarding('PB관리자', '010-0000-0005', 'caregiver', '파일럿B요양원', null, array['privacy_required'], 'v1.0', true);
set test.uid = 'a0000000-0000-0000-0000-000000000002';
select public.complete_onboarding('PA요양보호사', '010-0000-0002', 'caregiver', '임시2', null, array['privacy_required'], 'v1.0', true);
set test.uid = 'a0000000-0000-0000-0000-000000000003';
select public.complete_onboarding('PA직원', '010-0000-0003', 'caregiver', '임시3', null, array['privacy_required'], 'v1.0', true);
set test.uid = 'a0000000-0000-0000-0000-000000000004';
select public.complete_onboarding('PA보호자', '010-0000-0004', 'caregiver', '임시4', null, array['privacy_required'], 'v1.0', true);
set test.uid = 'a0000000-0000-0000-0000-000000000006';
select public.complete_onboarding('PA관리자2', '010-0000-0006', 'caregiver', '임시6', null, array['privacy_required'], 'v1.0', true);
reset role;
set test.uid = '';

-- 기관 합류 경로(D3 후반)가 생기기 전의 모사: 슈퍼유저로 PA 에 옮긴다.
update public.users set org_id = (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001'),
    role = 'caregiver'
  where id in ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006');
update public.users set org_id = (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001'),
    role = 'guardian'
  where id = 'a0000000-0000-0000-0000-000000000004';

-- ── D3: 기관 생성 시 설정·권한표 시드 ────────────────────────────────────────
do $$
declare pa uuid := (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001');
begin
  assert exists (select 1 from public.org_settings where org_id = pa and target_minutes = 10),
    '기관 생성 시 org_settings 가 기본값(목표 10분)으로 시드돼야 함';
  assert (select count(*) from public.org_capabilities where org_id = pa) = 3,
    '기관 생성 시 위임 3종이 시드돼야 함';
  assert (select bool_and(allowed_roles = app.default_capability_roles()) from public.org_capabilities where org_id = pa),
    '위임 기본값은 org_admin·social_worker·center_director';
  assert (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'org_capability') = 3,
    '위임 대상은 3종뿐(안전 가드를 위임 enum 에 넣지 않는다)';
end $$;

-- ── D3: 설정·권한표 RLS — 읽기는 돌봄팀, 쓰기는 관리 역할 ──────────────────────
do $$
declare n int; blocked boolean := false;
begin
  set role authenticated;
  -- 요양보호사: 같은 기관 설정은 읽고, 다른 기관은 0건, 쓰기는 0건 반영
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  select count(*) into n from public.org_settings;
  assert n = 1, '요양보호사는 자기 기관 설정 1건만 봐야 함';
  update public.org_settings set target_minutes = 5;
  get diagnostics n = row_count;
  assert n = 0, '요양보호사는 기관 설정을 바꿀 수 없어야 함';
  update public.org_capabilities set allowed_roles = array['caregiver']::public.org_role[];
  get diagnostics n = row_count;
  assert n = 0, '요양보호사는 권한표를 바꿀 수 없어야 함';
  -- 보호자: 기관 설정·권한표 0건
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', true);
  assert (select count(*) from public.org_settings) = 0, '보호자는 기관 설정을 볼 수 없어야 함';
  assert (select count(*) from public.org_capabilities) = 0, '보호자는 권한표를 볼 수 없어야 함';
  -- 관리자: 바꿀 수 있고, 10분 상한은 넘을 수 없다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', true);
  update public.org_settings set target_minutes = 8, facility_type = 'day_care';
  get diagnostics n = row_count;
  assert n = 1, '관리자는 자기 기관 설정을 바꿀 수 있어야 함';
  begin
    update public.org_settings set target_minutes = 11;
  exception when check_violation then blocked := true;
  end;
  assert blocked, '목표 시간은 10분을 넘을 수 없어야 함(서버 고정 상한)';
  blocked := false;
  begin
    update public.org_capabilities set allowed_roles = array['guardian']::public.org_role[] where capability = 'share_revoke';
  exception when check_violation then blocked := true;
  end;
  assert blocked, '보호자에게 위임할 수 없어야 함';
  -- 다른 기관 관리자는 PA 설정을 못 본다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000005', true);
  assert (select count(*) from public.org_settings
           where org_id = (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001')) = 0,
    '다른 기관 설정은 0건이어야 함';
  reset role;
  assert (select updated_by from public.org_settings
           where org_id = (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001'))
         = 'a0000000-0000-0000-0000-000000000001', '수정자는 서버가 auth.uid() 로 채워야 함';
end $$;

-- ── D3: set_member_role 거부 4종 + 성공 + 마지막 관리자 ──────────────────────
create or replace function pg_temp.expect_error(p_uid text, p_target uuid, p_role public.org_role, p_code text)
returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, true);
  begin
    perform public.set_member_role(p_target, p_role);
  exception when others then got := sqlerrm;
  end;
  if got is distinct from p_code then
    raise exception 'set_member_role(%→%, by %) 기대 %, 실제 %', p_target, p_role, p_uid, p_code, coalesce(got, '성공');
  end if;
end $$;

set role authenticated;
-- 요양보호사가 호출 = 실패
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'social_worker', 'MEMBER_ROLE_FORBIDDEN');
-- 자기 자신 대상 = 실패
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'caregiver', 'MEMBER_ROLE_SELF');
-- 타 기관 대상 = 실패(존재를 흘리지 않는 같은 코드)
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'caregiver', 'MEMBER_ROLE_FORBIDDEN');
-- 보호자 ↔ 돌봄팀 = 실패(양방향)
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'caregiver', 'MEMBER_ROLE_GUARDIAN');
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'guardian', 'MEMBER_ROLE_GUARDIAN');
-- 보호자가 호출 = 실패
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'social_worker', 'MEMBER_ROLE_FORBIDDEN');
-- 관리자가 직원을 사회복지사로 = 성공
set test.uid = 'a0000000-0000-0000-0000-000000000001';
select public.set_member_role('a0000000-0000-0000-0000-000000000003', 'social_worker');
-- 관리자가 두 번째 사람을 센터장으로 = 성공 → 센터장도 역할을 부여할 수 있다
select public.set_member_role('a0000000-0000-0000-0000-000000000006', 'center_director');
set test.uid = 'a0000000-0000-0000-0000-000000000006';
select public.set_member_role('a0000000-0000-0000-0000-000000000002', 'social_worker');
select public.set_member_role('a0000000-0000-0000-0000-000000000002', 'caregiver');
-- 유일한 관리자 강등 = 실패
select pg_temp.expect_error('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'caregiver', 'MEMBER_ROLE_LAST_ADMIN');
reset role;
set test.uid = '';

do $$
begin
  assert (select role from public.users where id = 'a0000000-0000-0000-0000-000000000003') = 'social_worker',
    '역할 부여가 반영돼야 함';
  assert (select role from public.users where id = 'a0000000-0000-0000-0000-000000000001') = 'org_admin',
    '마지막 관리자는 그대로 남아야 함';
  assert (select count(*) from public.audit_log where action = 'set_member_role'
           and record_id = 'a0000000-0000-0000-0000-000000000003'
           and detail = '{"from":"caregiver","to":"social_worker"}'::jsonb) = 1,
    '역할 변경은 이전·이후 역할과 함께 감사 로그에 남아야 함';
end $$;

-- 직접 UPDATE 경로는 RPC 가 생겨도 넓어지지 않는다.
-- (1차 방어 = users 컬럼 권한은 _grants.sql 이 테스트 권한을 넓히기 **전에** 검사한다. 여기서는 2차 방어 트리거를 본다:
--  트리거는 org_admin 만 다른 구성원의 역할을 바꾸게 두므로, 센터장의 직접 UPDATE 는 막혀야 한다.)
do $$
declare n int := 0;
begin
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000006', true);
  begin
    update public.users set role = 'center_director' where id = 'a0000000-0000-0000-0000-000000000003';
    get diagnostics n = row_count;  -- RLS(users_update_scope)가 행을 걸러 0행이거나
  exception when insufficient_privilege then n := 0;  -- 트리거가 예외로 막는다
  end;
  reset role;
  assert n = 0 and (select role from public.users where id = 'a0000000-0000-0000-0000-000000000003') = 'social_worker',
    '센터장도 직접 UPDATE 로는 역할을 바꿀 수 없어야 함(set_member_role 경유만)';
end $$;

-- ── D3: 위임 판정 has_capability — 기본값·편집·보호자 ─────────────────────────
do $$
declare
  sw boolean; cg boolean; gd boolean; sw_after boolean;
begin
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  sw := app.has_capability('journal_finalize');
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  cg := app.has_capability('journal_finalize');
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', true);
  gd := app.has_capability('journal_finalize');
  -- 센터장이 권한표에서 사회복지사를 뺀다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000006', true);
  update public.org_capabilities set allowed_roles = array['org_admin','center_director']::public.org_role[]
   where capability = 'journal_finalize';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  sw_after := app.has_capability('journal_finalize');
  reset role;
  assert sw, '사회복지사는 기본 위임으로 일지 확정 권한이 있어야 함';
  assert not cg, '요양보호사는 기본 위임에 없다';
  assert not gd, '보호자는 어떤 위임도 받을 수 없다';
  assert not sw_after, '권한표에서 빼면 즉시 권한이 사라져야 함';
end $$;

-- 권한표 행이 없는 기관도 기본 집합으로 폴백한다(기존 기관 안전)
do $$
declare ok boolean;
begin
  delete from public.org_capabilities
   where org_id = (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001')
     and capability = 'share_revoke';
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  ok := app.has_capability('share_revoke');
  reset role;
  assert ok, '권한표 행이 없으면 기본 집합으로 폴백해야 함';
end $$;

select 'pilot access assertions passed' as result;

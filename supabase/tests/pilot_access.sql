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

-- ── D3 후반: 직원 합류(초대 코드 → 대기 → 승인) — T22.7 ──────────────────────
-- a...11 합류 희망자(승인될 사람) / a...12 거절 후 재요청 / a...13 만료·회수 코드 시도자
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000011', 'join1@x.kr', '{"name":"합류1"}'),
  ('a0000000-0000-0000-0000-000000000012', 'join2@x.kr', '{"name":"합류2"}'),
  ('a0000000-0000-0000-0000-000000000013', 'join3@x.kr', '{"name":"합류3"}');

create or replace function pg_temp.expect_sqlerrm(p_uid text, p_sql text, p_code text)
returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, true);
  begin
    execute p_sql;
  exception when others then got := sqlerrm;
  end;
  if got is distinct from p_code then
    raise exception '[%] 기대 %, 실제 %', p_sql, p_code, coalesce(got, '성공');
  end if;
end $$;

set role authenticated;
-- 발급: 요양보호사·보호자·타 역할 거부, 보호자/관리자 역할 코드 거부
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000002', $q$select public.create_org_invite('caregiver')$q$, 'ORG_INVITE_FORBIDDEN');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000004', $q$select public.create_org_invite('caregiver')$q$, 'ORG_INVITE_FORBIDDEN');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000001', $q$select public.create_org_invite('guardian')$q$, 'ORG_INVITE_ROLE');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000001', $q$select public.create_org_invite('org_admin')$q$, 'ORG_INVITE_ROLE');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000001', $q$select public.create_org_invite('caregiver', 31)$q$, 'ORG_INVITE_EXPIRY');
-- 직접 INSERT 로 초대를 만들 수 없다(RPC 전용). 1차 = 권한 회수(_grants.sql 사전 검사), 2차 = INSERT 정책 없음(여기)
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000001',
  $q$insert into public.org_invites (org_id, code, role, created_by, expires_at) values (app.current_org_id(), 'ZZZZZZZZZZ', 'caregiver', auth.uid(), now() + interval '1 day')$q$,
  'new row violates row-level security policy for table "org_invites"');
reset role;

-- 센터장이 사회복지사 초대 발급, 관리자가 두 번째 초대 발급 후 회수, 만료 초대는 슈퍼유저로 모사
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000006';
create temp table pilot_invite as select * from public.create_org_invite('social_worker', 7);
set test.uid = 'a0000000-0000-0000-0000-000000000001';
create temp table pilot_invite_revoked as select * from public.create_org_invite('caregiver', 7);
select public.revoke_org_invite((select id from pilot_invite_revoked));
reset role;
insert into public.org_invites (org_id, code, role, created_by, created_at, expires_at)
  values ((select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001'), 'EXPIRED222', 'caregiver',
          'a0000000-0000-0000-0000-000000000001', now() - interval '3 days', now() - interval '1 day');
grant select on pilot_invite, pilot_invite_revoked to authenticated;

set role authenticated;
-- 만료·회수·없는 코드 = 같은 거부
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000013',
  $q$select public.complete_onboarding('합류3', '010-0000-0013', 'caregiver', null, null, array['privacy_required'], 'v1.0', true, 'EXPIRED222')$q$, 'ORG_INVITE_INVALID');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000013',
  format($q$select public.complete_onboarding('합류3', '010-0000-0013', 'caregiver', null, null, array['privacy_required'], 'v1.0', true, %L)$q$, (select code from pilot_invite_revoked)), 'ORG_INVITE_INVALID');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000013',
  $q$select public.complete_onboarding('합류3', '010-0000-0013', 'caregiver', null, null, array['privacy_required'], 'v1.0', true, 'NOSUCHCODE')$q$, 'ORG_INVITE_INVALID');
-- 새 기관명과 초대 코드를 함께 주면 거부
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000013',
  format($q$select public.complete_onboarding('합류3', '010-0000-0013', 'caregiver', '새기관', null, array['privacy_required'], 'v1.0', true, %L)$q$, (select code from pilot_invite)),
  '새 기관 만들기와 초대 코드 합류 중 하나만 선택해 주세요');

-- 정상 합류 요청 두 건
set test.uid = 'a0000000-0000-0000-0000-000000000011';
select public.complete_onboarding('합류1', '010-0000-0011', 'caregiver', null, null, array['privacy_required'], 'v1.0', true, lower((select code from pilot_invite)));
set test.uid = 'a0000000-0000-0000-0000-000000000012';
select public.complete_onboarding('합류2', '010-0000-0012', 'caregiver', null, null, array['privacy_required'], 'v1.0', true, (select code from pilot_invite));
reset role;
set test.uid = '';

-- 요청 id 는 슈퍼유저로 미리 뽑아 둔다. ⚠️ 호출 인자 안에서 RLS 로 조회하면 test.uid 가 비어 NULL 이 되고,
-- 그러면 구현과 무관하게 "없는 요청" 오류가 나 단언이 공허하게 통과한다(2026-09-24 변형 테스트로 발견).
create temp table pilot_req as
  select user_id, id from public.org_join_requests
   where user_id in ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012');
grant select on pilot_req to authenticated;

do $$
declare pa uuid := (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001');
begin
  assert (select count(*) from pilot_req) = 2, '픽스처: 요청 2건';
  assert (select org_id is null and onboarded_at is not null from public.users where id = 'a0000000-0000-0000-0000-000000000011'),
    '합류 요청자는 가입은 끝나되 승인 전까지 org_id 가 NULL 이어야 함';
  assert (select count(*) from public.org_join_requests where org_id = pa and status = 'pending') = 2,
    '대기 요청 2건이 PA 에 있어야 함';
  assert (select count(*) from public.organizations where name in ('합류1','합류2')) = 0, '합류 경로는 새 기관을 만들지 않아야 함';
  assert (select requested_role from public.org_join_requests where user_id = 'a0000000-0000-0000-0000-000000000011') = 'social_worker',
    '합류 후 역할은 초대 코드가 정한다';
end $$;

-- 승인 전: 요청자는 기관 데이터 0건, 자기 요청만 본다 / 다른 기관 관리자는 요청을 못 본다
do $$
declare n_settings int; n_req int; n_other int;
begin
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000011', true);
  select count(*) into n_settings from public.org_settings;
  select count(*) into n_req from public.org_join_requests;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000005', true);
  select count(*) into n_other from public.org_join_requests;
  reset role;
  assert n_settings = 0, '승인 전 합류 요청자는 기관 데이터를 볼 수 없어야 함';
  assert n_req = 1, '요청자는 자기 요청만 봐야 함';
  assert n_other = 0, '다른 기관 관리자는 요청을 볼 수 없어야 함';
end $$;

set role authenticated;
-- 승인 거부: 요양보호사·보호자·다른 기관 관리자·요청자 본인
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000002',
  format($q$select public.approve_org_join(%L)$q$, (select id from pilot_req where user_id = 'a0000000-0000-0000-0000-000000000011')), 'ORG_JOIN_FORBIDDEN');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000005',
  format($q$select public.approve_org_join(%L)$q$, (select id from pilot_req where user_id = 'a0000000-0000-0000-0000-000000000011')), 'ORG_JOIN_NOT_FOUND');
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000011',
  format($q$select public.approve_org_join(%L)$q$, (select id from pilot_req where user_id = 'a0000000-0000-0000-0000-000000000011')), 'ORG_JOIN_FORBIDDEN');
-- 센터장이 승인 → 합류, 관리자가 두 번째 요청 거절
set test.uid = 'a0000000-0000-0000-0000-000000000006';
select public.approve_org_join((select id from pilot_req where user_id = 'a0000000-0000-0000-0000-000000000011'));
set test.uid = 'a0000000-0000-0000-0000-000000000001';
select public.reject_org_join((select id from pilot_req where user_id = 'a0000000-0000-0000-0000-000000000012'));
-- 이미 처리된 요청은 다시 처리할 수 없다
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000001',
  format($q$select public.approve_org_join(%L)$q$, (select id from pilot_req where user_id = 'a0000000-0000-0000-0000-000000000011')), 'ORG_JOIN_NOT_PENDING');
-- 거절된 사람은 다시 요청할 수 있고, 대기 중 중복 요청은 막힌다. 회수된 코드는 요청 단계에서 막힌다.
set test.uid = 'a0000000-0000-0000-0000-000000000012';
select public.request_org_join((select code from pilot_invite));
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000012',
  format($q$select public.request_org_join(%L)$q$, (select code from pilot_invite)), 'ORG_JOIN_PENDING');
set test.uid = 'a0000000-0000-0000-0000-000000000012';
select public.cancel_org_join();
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000012',
  format($q$select public.request_org_join(%L)$q$, (select code from pilot_invite_revoked)), 'ORG_INVITE_INVALID');
-- 이미 기관이 있는 사람은 합류 요청을 할 수 없다
select pg_temp.expect_sqlerrm('a0000000-0000-0000-0000-000000000002',
  format($q$select public.request_org_join(%L)$q$, (select code from pilot_invite)), 'ORG_JOIN_FORBIDDEN');
reset role;
set test.uid = '';

do $$
declare pa uuid := (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001');
  n int;
begin
  assert (select org_id = pa and role = 'social_worker' from public.users where id = 'a0000000-0000-0000-0000-000000000011'),
    '승인되면 초대 코드의 역할로 기관에 합류해야 함';
  assert (select org_id is null from public.users where id = 'a0000000-0000-0000-0000-000000000012'),
    '거절·취소된 사람은 기관이 없어야 함';
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000011', true);
  select count(*) into n from public.org_settings;
  reset role;
  assert n = 1, '승인 후에는 같은 기관 돌봄팀으로 기관 데이터를 볼 수 있어야 함';
  assert (select count(*) from public.audit_log where action in ('org_invite_create','org_invite_revoke','org_join_request','org_join_approve','org_join_reject')) >= 6,
    '발급·회수·요청·승인·거절이 감사 로그에 남아야 함';
end $$;

-- ── D4: 기관 단위 열람·기록 (T22.3·T22.6) ────────────────────────────────────
-- 파일럿어르신 P1 은 관리자(a01)가 만들고, 요양보호사(a02)·사회복지사(a03)·센터장(a06)·합류자(a11)는 **배정되지 않았다**.
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
insert into public.profiles (user_id, name, birth_year) values ('a0000000-0000-0000-0000-000000000001', '파일럿어르신', 1941);
set test.uid = 'a0000000-0000-0000-0000-000000000005';
insert into public.profiles (user_id, name, birth_year) values ('a0000000-0000-0000-0000-000000000005', 'PB어르신', 1943);
reset role;
set test.uid = '';
create temp table pilot_p as
  select (select id from public.profiles where name = '파일럿어르신') as p1,
         (select id from public.profiles where name = 'PB어르신') as pb,
         (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001') as pa;
grant select on pilot_p to authenticated;
-- 처리 동의(관리자가 기록) — 대화 처리 가드 통과용
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
  select (select p1 from pilot_p), (select pa from pilot_p), 'a0000000-0000-0000-0000-000000000001', t::public.consent_type, true, 'v1.0', 'capable'
  from unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) t;
reset role;
set test.uid = '';

do $$
declare
  p1 uuid := (select p1 from pilot_p);
  sid uuid;
  n int;
  blocked boolean;
begin
  assert (select pb from pilot_p) is not null, '픽스처: 다른 기관 어르신 id 는 슈퍼유저로 미리 뽑는다(RLS 아래 조회 = NULL 함정)';
  assert not exists (select 1 from public.profile_caregivers where profile_id = p1 and caregiver_user_id <> 'a0000000-0000-0000-0000-000000000001'),
    '픽스처: P1 은 관리자 외 누구에게도 배정되지 않았다';
  set role authenticated;

  -- 담당이 아닌 요양보호사: 열람 + 대화 진행(세션·대화 기록·연대기 INSERT) = 성공
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  assert (select count(*) from public.profiles where id = p1) = 1, '같은 기관 돌봄팀은 담당이 아닌 어르신도 봐야 함';
  assert public.can_process_profile(p1), '담당이 아닌 같은 기관 요양보호사도 대화를 진행할 수 있어야 함(결정 ①)';
  insert into public.sessions (profile_id, user_id, status) values (p1, 'a0000000-0000-0000-0000-000000000002', 'active') returning id into sid;
  insert into public.session_logs (session_id, profile_id, user_id, turn_index, role, content)
    values (sid, p1, 'a0000000-0000-0000-0000-000000000002', 1, 'ai', '고향 이야기를 들려주시겠어요?');
  insert into public.chronicle_entries (profile_id, user_id, topic, content)
    values (p1, 'a0000000-0000-0000-0000-000000000002', '고향', '전주에서 자랐다');
  -- 동의·보호자 공개 INSERT 는 배정·관리자 기준 유지(결정 ①)
  blocked := false;
  begin
    insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
      values (p1, (select pa from pilot_p), 'a0000000-0000-0000-0000-000000000002', 'ai_processing', true, 'v1.0', 'capable');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, '담당이 아닌 요양보호사는 어르신 동의를 새로 기록할 수 없어야 함';
  -- 공개 대상이 실재해야 트리거를 지나 RLS 에 닿는다 → 담당이 아닌 요양보호사가 분석을 먼저 남긴다(INSERT 허용).
  insert into public.session_analyses (session_id, profile_id, user_id, analysis, version)
    values (sid, p1, 'a0000000-0000-0000-0000-000000000002', '{}'::jsonb, 1);
  blocked := false;
  begin
    insert into public.guardian_shares (profile_id, item_type, item_id, shared_by)
      values (p1, 'analysis', (select id from public.session_analyses where session_id = sid), 'a0000000-0000-0000-0000-000000000002');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, '담당이 아닌 요양보호사는 보호자에게 공개할 수 없어야 함';
  -- DELETE 는 배정·관리자 기준 유지
  delete from public.chronicle_entries where profile_id = p1 and user_id = 'a0000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, '담당이 아닌 요양보호사는 기록을 지울 수 없어야 함(DELETE 는 배정 기준 유지)';

  -- 교대 근무: 다른 직원(사회복지사·센터장·승인된 합류자)이 그 세션 기록을 본다
  foreach n in array array[3, 6, 11] loop
    perform set_config('test.uid', format('a0000000-0000-0000-0000-0000000000%s', lpad(n::text, 2, '0')), true);
    assert (select count(*) from public.session_logs where session_id = sid) = 1,
      format('같은 기관 직원(a..%s)은 다른 담당자의 세션 기록을 봐야 함', n);
    assert (select count(*) from public.chronicle_entries where profile_id = p1) = 1, '연대기도 같은 기관 전체 열람';
  end loop;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  assert public.can_process_profile(p1), '사회복지사도 대화를 진행할 수 있어야 함(결정 ②)';
  update public.sessions set current_topic = '고향' where id = sid;
  get diagnostics n = row_count;
  assert n = 1, '같은 기관 돌봄팀은 다른 담당자의 세션을 갱신할 수 있어야 함(restrictive 정책 포함)';

  -- 격리: 보호자·다른 기관·합류 대기(취소)자 = 0건
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', true);
  assert (select count(*) from public.profiles where id = p1) = 0, '보호자는 연결되지 않은 어르신을 볼 수 없어야 함';
  assert (select count(*) from public.session_logs where session_id = sid) = 0, '보호자는 공개되지 않은 대화 기록을 볼 수 없어야 함';
  assert not public.can_process_profile(p1), '보호자는 대화를 진행할 수 없어야 함';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000005', true);
  assert (select count(*) from public.profiles where id = p1) = 0, '다른 기관 관리자는 0건';
  assert (select count(*) from public.session_logs where session_id = sid) = 0, '다른 기관 관리자는 대화 기록 0건';
  assert not public.can_process_profile(p1), '다른 기관은 대화를 진행할 수 없어야 함';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000012', true);
  assert (select count(*) from public.profiles) = 0, '기관이 없는 합류 대기·취소자는 0건';
  -- 다른 기관 어르신에 대해 기록을 만들 수 없다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  blocked := false;
  begin
    insert into public.chronicle_entries (profile_id, user_id, topic, content)
      values ((select pb from pilot_p), 'a0000000-0000-0000-0000-000000000002', '고향', '타 기관');
  exception when insufficient_privilege or foreign_key_violation or check_violation then blocked := true;
  end;
  assert blocked, '다른 기관 어르신에 대한 기록은 만들 수 없어야 함';

  -- 구성원 목록: 센터장은 같은 기관 구성원을 보고, 요양보호사는 자기만
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000006', true);
  assert (select count(*) from public.users where org_id = (select pa from pilot_p)) >= 5, '센터장은 같은 기관 구성원을 봐야 함';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  -- (기존 users_select_org_guardians 가 돌봄팀에게 같은 기관 보호자 행을 보여 준다 — 그건 그대로)
  assert (select count(*) from public.users where role <> 'guardian') = 1, '요양보호사는 동료 직원 목록을 보지 않는다(자기 행만)';
  reset role;
end $$;

-- ── D6: 대화 단계 · 원격 제어 · 개입 기록 · 동시 4대 (T21.1·T21.13) ─────────────────
create temp table pilot_s as
  select id as sid from public.sessions
   where profile_id = (select p1 from pilot_p) and user_id = 'a0000000-0000-0000-0000-000000000002' and status = 'active';
grant select on pilot_s to authenticated;

do $$
declare
  sid uuid := (select sid from pilot_s);
  t jsonb;
  n int;
  blocked boolean;
begin
  assert sid is not null and (select count(*) from pilot_s) = 1, '픽스처: 요양보호사 a02 의 진행 중 세션 1건';
  set role authenticated;

  -- 시작자(중계 JWT 의 주인): 첫 tick 은 단계 없음, 목표 시간은 기관 설정(8분)
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  t := public.session_tick(sid);
  assert (t->>'allowed')::boolean and t->'phase' = 'null'::jsonb and (t->>'target_minutes')::int = 8
     and not (t->>'paused')::boolean and not (t->>'end_requested')::boolean,
    format('첫 tick 이 기대와 다름: %s', t);
  assert public.advance_session_phase(sid, 'intro', 'v2.0') = 'intro', '시작자는 도입 단계로 올릴 수 있어야 함';
  assert public.advance_session_phase(sid, 'reminiscence') = 'reminiscence', '도입 → 회상';
  blocked := false;
  begin perform public.advance_session_phase(sid, 'intro');
  exception when others then blocked := sqlerrm = 'SESSION_PHASE_ORDER'; end;
  assert blocked, '단계는 뒤로 갈 수 없어야 함';
  t := public.session_tick(sid);
  assert t->>'phase' = 'reminiscence' and (t->>'phase_elapsed_seconds')::int >= 0, format('tick 에 단계가 보여야 함: %s', t);

  -- 목표 시간은 세션 설계가 있어도 10분을 넘지 않는다
  update public.sessions set duration_minutes = 40 where id = sid;
  assert (public.session_tick(sid)->>'target_minutes')::int = 10, '목표 시간은 서버 상한 10분';

  -- 직접 UPDATE 로 단계·일시정지를 고칠 수 없다(RPC 전용)
  blocked := false;
  begin update public.sessions set phase = 'closing' where id = sid;
  exception when insufficient_privilege then blocked := sqlerrm = 'SESSION_SUPERVISION_RPC_ONLY'; end;
  assert blocked, '단계는 직접 UPDATE 로 바꿀 수 없어야 함';
  blocked := false;
  begin update public.sessions set paused_at = now(), paused_by = auth.uid() where id = sid;
  exception when insufficient_privilege then blocked := sqlerrm = 'SESSION_SUPERVISION_RPC_ONLY'; end;
  assert blocked, '일시정지 상태는 직접 UPDATE 로 바꿀 수 없어야 함';

  -- 시작자가 아닌 직원은 단계를 못 바꾸지만(중계만), 원격 일시정지는 할 수 있다(감독)
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  blocked := false;
  begin perform public.advance_session_phase(sid, 'closing');
  exception when others then blocked := sqlerrm = 'SESSION_PHASE_FORBIDDEN'; end;
  assert blocked, '시작자가 아니면 단계를 바꿀 수 없어야 함';
  perform public.request_session_control(sid, 'pause', '어르신이 화장실에 가셨어요');

  -- 보호자·다른 기관은 제어할 수 없다(존재도 모른다)
  foreach n in array array[4, 5] loop
    perform set_config('test.uid', format('a0000000-0000-0000-0000-00000000000%s', n), true);
    blocked := false;
    begin perform public.request_session_control(sid, 'end');
    exception when others then blocked := sqlerrm = 'SESSION_CONTROL_NOT_FOUND'; end;
    assert blocked, format('a..0%s 는 원격 제어를 할 수 없어야 함', n);
    assert not (public.session_tick(sid)->>'allowed')::boolean, '보호자·타 기관 tick 은 거부(값 없음)';
    assert (select count(*) from public.session_interventions) = 0, '보호자·타 기관은 개입 기록을 볼 수 없어야 함';
  end loop;

  -- 중계(시작자)는 다음 tick 에서 일시정지를 본다 → 재개 → 종료 요청
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  assert (public.session_tick(sid)->>'paused')::boolean, '원격 일시정지가 tick 에 보여야 함';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000006', true);
  perform public.request_session_control(sid, 'resume');
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  assert not (public.session_tick(sid)->>'paused')::boolean, '재개가 tick 에 보여야 함';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000011', true);
  perform public.request_session_control(sid, 'end');
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  assert (public.session_tick(sid)->>'end_requested')::boolean, '종료 요청이 tick 에 보여야 함';
  -- 개입 기록: 단계 2 + 일시정지·재개·종료 3, 누가 했는지 남는다
  assert (select count(*) from public.session_interventions where session_id = sid) = 5, '개입 5건이 기록돼야 함';
  assert (select actor_id from public.session_interventions where session_id = sid and action = 'pause')
         = 'a0000000-0000-0000-0000-000000000003', '일시정지한 사람이 기록돼야 함';
  reset role;
end $$;

-- 감독자(시작자)당 동시 active 4대 — 5번째는 거부, 30분이 지난 좀비는 세지 않는다
do $$
declare p1 uuid := (select p1 from pilot_p); blocked boolean := false; n int;
begin
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  select count(*) into n from public.sessions where user_id = auth.uid() and status = 'active';
  assert n = 1, '픽스처: 진행 중 1대';
  insert into public.sessions (profile_id, user_id, status) values
    (p1, auth.uid(), 'active'), (p1, auth.uid(), 'active'), (p1, auth.uid(), 'active');
  begin
    insert into public.sessions (profile_id, user_id, status) values (p1, auth.uid(), 'active');
  exception when program_limit_exceeded then blocked := sqlerrm = 'SESSION_SUPERVISOR_LIMIT';
  end;
  assert blocked, '같은 감독자의 5번째 동시 세션은 거부돼야 함';
  -- planned → active 전환도 같은 규칙
  insert into public.sessions (profile_id, user_id, status) values (p1, auth.uid(), 'planned');
  blocked := false;
  begin
    update public.sessions set status = 'active' where user_id = auth.uid() and status = 'planned';
  exception when program_limit_exceeded then blocked := true;
  end;
  assert blocked, '설계된 세션을 5번째로 시작하는 것도 거부돼야 함';
  -- 다른 직원은 따로 센다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  insert into public.sessions (profile_id, user_id, status) values (p1, auth.uid(), 'active');
  reset role;
  -- 좀비: 한 대를 1시간 전에 시작한 것으로 만들면(슈퍼유저) 다시 시작할 수 있다
  update public.sessions set started_at = now() - interval '1 hour'
   where id = (select id from public.sessions where user_id = 'a0000000-0000-0000-0000-000000000002' and status = 'active'
               and id <> (select sid from pilot_s) limit 1);
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  insert into public.sessions (profile_id, user_id, status) values (p1, auth.uid(), 'active');
  reset role;
end $$;

-- ── D5: 프로그램 일지 — 세션 종료 생성 · 확정 가드 · 확정 후 수정 이력 · 워커 칸 · 공개 게이트 · 재시도 ─────
-- 역할: a02 요양보호사(기본 권한표에 journal_finalize 없음) · a03 사회복지사(있음) · a01 관리자 · a04 보호자 · a05 타 기관.
create or replace function pg_temp.expect_sql(p_uid text, p_sql text, p_code text)
returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, true);
  begin
    execute p_sql;
  exception when others then got := sqlerrm;
  end;
  if got is distinct from p_code then
    raise exception '% (by %) 기대 %, 실제 %', p_sql, p_uid, coalesce(p_code, '성공'), coalesce(got, '성공');
  end if;
end $$;

-- D3 단언이 권한표에서 사회복지사를 뺐다 → 기본 위임으로 되돌린다(슈퍼유저).
update public.org_capabilities set allowed_roles = app.default_capability_roles() where capability = 'journal_finalize';

-- 세션 종료 → generating 일지 + 생성 작업(트리거 ③)
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now() where id = (select sid from pilot_s);
update public.sessions set status = 'ended' where id = (select sid from pilot_s);  -- 다시 끝내도 중복 생성 없음
reset role;
create temp table pilot_j as select id as jid from public.program_journals where session_id = (select sid from pilot_s);
grant select on pilot_j to authenticated;
do $$
declare j public.program_journals%rowtype;
begin
  assert (select count(*) from pilot_j) = 1, '세션 종료 1회 = 일지 1건(재종료로 늘지 않음)';
  select * into j from public.program_journals where id = (select jid from pilot_j);
  assert j.status = 'generating', '세션 종료 시 일지는 generating 으로 생겨야 함';
  assert j.facilitator_user_id = 'a0000000-0000-0000-0000-000000000002', '진행자 = 세션을 시작한 요양보호사(AI 아님)';
  assert j.tool_used = 'AI 대화 프로그램 보조' and j.program_type = '인지활동 - 회상훈련', '공단 서식 기본값';
  assert (select count(*) from public.journal_generation_jobs where journal_id = j.id and status = 'queued') = 1,
    '생성 작업이 대기열에 들어가야 함';
end $$;

-- 워커(서비스 계정 = auth.uid 없음)는 초안까지만 — 확정은 물리적으로 불가(기준 2)
select set_config('test.uid', '', false);
update public.program_journals
   set status = 'pending_review', activity_content = '고향 전주 이야기를 나누셨다.', guardian_text = '오늘 고향 이야기를 들려주셨어요.',
       draft_generated_at = now()
 where id = (select jid from pilot_j);
do $$
declare blocked boolean := false;
begin
  begin
    update public.program_journals set status = 'final' where id = (select jid from pilot_j);
  exception when insufficient_privilege then blocked := sqlerrm = 'JOURNAL_FINALIZE_HUMAN_ONLY';
  end;
  assert blocked, '서비스 계정(auth.uid 없음)은 일지를 확정할 수 없어야 함';
end $$;

set role authenticated;
-- 클라이언트는 워커 칸을 못 쓴다
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set status = %L where id = %L', 'generating', (select jid from pilot_j)), 'JOURNAL_WORKER_FIELDS');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set generation_attempts = 3 where id = %L', (select jid from pilot_j)), 'JOURNAL_WORKER_FIELDS');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('insert into public.program_journals (profile_id, status) values (%L, %L)', (select p1 from pilot_p), 'failed'), 'JOURNAL_WORKER_FIELDS');
-- 위임 권한 없는 요양보호사는 확정 불가, 사회복지사는 가능
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set status = %L where id = %L', 'final', (select jid from pilot_j)), 'JOURNAL_FINALIZE_FORBIDDEN');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000003',
  format('update public.program_journals set status = %L, finalized_by = %L where id = %L', 'final',
    'a0000000-0000-0000-0000-000000000005', (select jid from pilot_j)), null);
reset role;
do $$ begin
  assert (select finalized_by from public.program_journals where id = (select jid from pilot_j)) = 'a0000000-0000-0000-0000-000000000003',
    '확정자는 클라이언트 값이 아니라 호출자로 채워야 함';
end $$;
set role authenticated;
-- 확정은 되돌릴 수 없다 · 확정 후 수정은 권한 + 사유
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000003',
  format('update public.program_journals set status = %L where id = %L', 'pending_review', (select jid from pilot_j)), 'JOURNAL_FINAL_LOCKED');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000003',
  format('update public.program_journals set activity_content = %L where id = %L', '고친 내용', (select jid from pilot_j)), 'JOURNAL_EDIT_REASON_REQUIRED');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set activity_content = %L, edit_reason = %L where id = %L', '고친 내용', '오기 수정', (select jid from pilot_j)), 'JOURNAL_EDIT_FORBIDDEN');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000003',
  format('update public.program_journals set activity_content = %L, edit_reason = %L where id = %L', '고친 내용', '오기 수정', (select jid from pilot_j)), null);
reset role;
do $$
declare r public.program_journal_revisions%rowtype;
begin
  select * into r from public.program_journal_revisions where journal_id = (select jid from pilot_j);
  assert (select count(*) from public.program_journal_revisions where journal_id = (select jid from pilot_j)) = 1, '확정 후 수정은 이력 1건';
  assert r.changed_by = 'a0000000-0000-0000-0000-000000000003' and r.reason = '오기 수정', '이력에 누가·왜';
  assert r.changes -> 'activity_content' ->> 'from' = '고향 전주 이야기를 나누셨다.' and r.changes -> 'activity_content' ->> 'to' = '고친 내용',
    '이력에 무엇이(이전·이후)';
  assert (select edit_reason from public.program_journals where id = (select jid from pilot_j)) is null, '사유는 행에 남지 않는다';
end $$;

-- 보호자 문장 승인: 승인자·시각은 서버가 채우고, 문장이 바뀌면 승인이 풀린다 · 공개 게이트(트리거 ④)
set role authenticated;
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set guardian_text_approved_at = %L, guardian_text_approved_by = %L where id = %L',
    '2000-01-01', 'a0000000-0000-0000-0000-000000000005', (select jid from pilot_j)), null);
reset role;
do $$ begin
  assert (select guardian_text_approved_by = 'a0000000-0000-0000-0000-000000000002' and guardian_text_approved_at > now() - interval '1 minute'
            from public.program_journals where id = (select jid from pilot_j)), '보호자 문장 승인자·시각은 서버가 채워야 함';
end $$;
set role authenticated;
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set guardian_text = %L where id = %L', '바뀐 보호자 문장', (select jid from pilot_j)), null);
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000001',
  format('insert into public.guardian_shares (shared_by, profile_id, item_type, item_id) values (%L, %L, %L, %L)',
    'a0000000-0000-0000-0000-000000000001', (select p1 from pilot_p), 'journal', (select jid from pilot_j)), 'SHARE_JOURNAL_NOT_READY');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.program_journals set guardian_text_approved_at = now() where id = %L', (select jid from pilot_j)), null);
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000001',
  format('insert into public.guardian_shares (shared_by, profile_id, item_type, item_id) values (%L, %L, %L, %L)',
    'a0000000-0000-0000-0000-000000000001', (select p1 from pilot_p), 'journal', (select jid from pilot_j)), null);

-- 수기 일지: 진행자는 같은 기관 돌봄팀만 · 확정에 진행자 필수 · 위임을 켜면 요양보호사도 확정
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('insert into public.program_journals (profile_id, activity_content, facilitator_user_id) values (%L, %L, %L)',
    (select p1 from pilot_p), '수기', 'a0000000-0000-0000-0000-000000000004'), 'JOURNAL_FACILITATOR_INVALID');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000003',
  format('insert into public.program_journals (profile_id, activity_content, status) values (%L, %L, %L)',
    (select p1 from pilot_p), '수기', 'final'), 'JOURNAL_FACILITATOR_REQUIRED');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000001',
  $q$update public.org_capabilities set allowed_roles = allowed_roles || 'caregiver'::public.org_role where capability = 'journal_finalize'$q$, null);
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('insert into public.program_journals (profile_id, activity_content, facilitator_user_id, status) values (%L, %L, %L, %L)',
    (select p1 from pilot_p), '위임 뒤 수기 확정', 'a0000000-0000-0000-0000-000000000002', 'final'), null);
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000001',
  $q$update public.org_capabilities set allowed_roles = array_remove(allowed_roles, 'caregiver'::public.org_role) where capability = 'journal_finalize'$q$, null);
reset role;

-- 세션 일지는 삭제 불가(파이프라인 기록) · 실패 재시도는 같은 기관 돌봄팀만, 실패 상태에서만
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now()
 where id = (select id from public.sessions where user_id = 'a0000000-0000-0000-0000-000000000002' and status = 'active'
               and started_at > now() - interval '30 minutes' limit 1);
reset role;
create temp table pilot_j2 as
  select j.id as jid from public.program_journals j
   where j.session_id is not null and j.id <> (select jid from pilot_j) and j.status = 'generating'
     and j.profile_id = (select p1 from pilot_p) limit 1;
grant select on pilot_j2 to authenticated;
update public.program_journals set status = 'failed', generation_attempts = 6, last_error = 'synthetic' where id = (select jid from pilot_j2);
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
delete from public.program_journals where id = (select jid from pilot_j2);
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000005',
  format('select public.retry_journal_generation(%L)', (select jid from pilot_j2)), 'JOURNAL_NOT_FOUND');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('select public.retry_journal_generation(%L)', (select jid from pilot_j)), 'JOURNAL_RETRY_NOT_FAILED');
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('select public.retry_journal_generation(%L)', (select jid from pilot_j2)), null);
-- 장기요양등급 입력
select pg_temp.expect_sql('a0000000-0000-0000-0000-000000000002',
  format('update public.profiles set care_grade = %L where id = %L', 'grade_3', (select p1 from pilot_p)), null);
reset role;
do $$ begin
  assert (select count(*) from pilot_j2) = 1, '픽스처: 두 번째 세션 일지';
  assert exists (select 1 from public.program_journals where id = (select jid from pilot_j2)), '세션 일지는 삭제할 수 없어야 함';
  assert (select status = 'generating' and generation_attempts = 0 and last_error is null
            from public.program_journals where id = (select jid from pilot_j2)), '재시도는 generating·시도 0 으로 되돌려야 함';
  assert (select status = 'queued' and attempts = 0 from public.journal_generation_jobs where journal_id = (select jid from pilot_j2)),
    '재시도는 작업을 다시 대기열에';
  assert (select care_grade from public.profiles where id = (select p1 from pilot_p)) = 'grade_3', '장기요양등급 저장';
end $$;

-- ── D7: 푸시 토큰 — 본인만 조회 · 돌봄팀만 등록 · 기기 인계 시 주인 이동 · pushed_at 사용자 변경 불가 ─────────
-- 아래 블록은 _grants.sql 의 광범위 테스트 권한 아래서 돈다 — RLS·RPC·트리거 판정을 본다(권한 회수는 _grants 사전 검사).
set role authenticated;
do $$
declare blocked boolean;
begin
  -- 요양보호사 02 가 등록
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  perform public.register_push_token('ExponentPushToken[pilotDeviceA1]', 'android');
  perform public.register_push_token('ExponentPushToken[pilotDeviceA1]', 'android'); -- 멱등
  assert (select count(*) from public.push_tokens) = 1, '본인 토큰 1건만 보여야 함(재등록은 멱등)';
  -- 형식·플랫폼 검사
  blocked := false;
  begin perform public.register_push_token('not-a-token', 'android');
  exception when invalid_parameter_value then blocked := sqlerrm = 'PUSH_TOKEN_INVALID'; end;
  assert blocked, '형식이 틀린 토큰은 거부돼야 함';
  blocked := false;
  begin perform public.register_push_token('ExponentPushToken[pilotDeviceA2]', 'web');
  exception when invalid_parameter_value then blocked := sqlerrm = 'PUSH_TOKEN_PLATFORM'; end;
  assert blocked, '모르는 플랫폼은 거부돼야 함';
  -- 보호자(04)는 등록 불가
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', true);
  blocked := false;
  begin perform public.register_push_token('ExponentPushToken[pilotGuardian1]', 'ios');
  exception when insufficient_privilege then blocked := sqlerrm = 'PUSH_TOKEN_ROLE'; end;
  assert blocked, '보호자는 푸시 토큰을 등록할 수 없어야 함(돌봄팀 알림 전용)';
  -- 다른 사용자(03)는 02 의 토큰을 볼 수도, 회수할 수도 없다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  assert (select count(*) from public.push_tokens) = 0, '남의 푸시 토큰은 보이지 않아야 함';
  perform public.revoke_push_token('ExponentPushToken[pilotDeviceA1]');
end $$;
reset role;
do $$
begin
  assert (select revoked_at from public.push_tokens where token = 'ExponentPushToken[pilotDeviceA1]') is null,
    '남이 회수를 시도해도 토큰은 살아 있어야 함';
end $$;
set role authenticated;
do $$
begin
  -- 같은 기기를 03 이 이어 쓰면 토큰 주인이 03 으로 옮겨 간다(02 에게 가야 할 알림이 03 기기로 가지 않게)
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  perform public.register_push_token('ExponentPushToken[pilotDeviceA1]', 'android');
  assert (select count(*) from public.push_tokens) = 1, '기기 인계 후 새 사용자에게 토큰이 보여야 함';
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  assert (select count(*) from public.push_tokens) = 0, '기기 인계 후 앞사람에게서 토큰이 빠져야 함';
  -- 03 이 로그아웃하며 회수
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', true);
  perform public.revoke_push_token('ExponentPushToken[pilotDeviceA1]');
  assert (select revoked_at from public.push_tokens) is not null, '본인은 토큰을 회수할 수 있어야 함';
  -- 다시 등록하면 되살아난다
  perform public.register_push_token('ExponentPushToken[pilotDeviceA1]', 'android');
  assert (select revoked_at from public.push_tokens) is null, '재등록은 회수를 되돌려야 함';
end $$;
reset role;

-- pushed_at: 워커만 채운다. 사용자는 자기 알림이라도 바꿀 수 없다(재발송 유도·억제 불가). 읽음 처리는 그대로.
insert into public.notifications (org_id, user_id, kind, title, body)
select org_id, id, 'message', '테스트 알림', '본문' from public.users where id = 'a0000000-0000-0000-0000-000000000002';
set role authenticated;
do $$
declare blocked boolean := false;
begin
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  update public.notifications set read_at = now() where user_id = auth.uid() and title = '테스트 알림';
  begin
    update public.notifications set pushed_at = now() where user_id = auth.uid() and title = '테스트 알림';
  exception when insufficient_privilege then blocked := sqlerrm = 'RECORD_IDENTITY_IMMUTABLE';
  end;
  assert blocked, '사용자는 pushed_at 을 바꿀 수 없어야 함';
end $$;
reset role;
do $$
begin
  assert (select read_at from public.notifications where title = '테스트 알림') is not null, '읽음 처리는 계속 가능해야 함';
  assert (select pushed_at from public.notifications where title = '테스트 알림') is null, 'pushed_at 은 비어 있어야 함';
end $$;

select 'pilot access assertions passed' as result;

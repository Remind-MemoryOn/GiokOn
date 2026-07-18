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
delete from public.safety_events;
delete from public.profile_guardians;
delete from public.guardian_invites;
delete from public.consents;
delete from public.session_logs;
delete from public.sessions;
delete from public.chronicle_entries;
delete from public.profiles;
delete from public.users;
delete from public.organizations;
delete from auth.users;

-- ── 1) 가입(트리거=최소 row) + 온보딩(RPC 가 기관·역할 확정) — T17.4 ────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.kr', '{"name":"기관A관리자"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@y.kr', '{"name":"기관B관리자"}'),
  ('33333333-3333-3333-3333-333333333333', 'c@x.kr', '{"name":"기관A요양보호사"}');

do $$
begin
  assert (select count(*) from public.organizations) = 0,
    '가입 트리거는 기관을 만들지 않아야 함(온보딩에서 생성)';
  assert (select bool_and(org_id is null and onboarded_at is null) from public.users),
    '가입 직후에는 org_id·onboarded_at 이 비어 있어야 함';
  assert (select count(*) from public.users) = 3,
    '가입 트리거가 최소 users row 를 생성해야 함';
end $$;

-- 온보딩 전에는 조직 범위 RLS 가 닫혀 어떤 데이터도 만들 수 없다.
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into public.profiles (user_id, name, birth_year)
      values ('11111111-1111-1111-1111-111111111111', '온보딩전', 1940);
  exception when insufficient_privilege or check_violation or not_null_violation then
    blocked := true;
  end;
  reset role;
  assert blocked, '온보딩 전 사용자는 데이터를 만들 수 없어야 함';
end $$;

-- 온보딩(요양보호사) — 기관 생성 + org_admin.
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
select public.complete_onboarding('기관A관리자', '010-1111-2222', 'caregiver', 'A요양원');
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.complete_onboarding('기관B관리자', '010-2222-3333', 'caregiver', 'B요양원');
set test.uid = '33333333-3333-3333-3333-333333333333';
select public.complete_onboarding('기관A요양보호사', '010-3333-4444', 'caregiver', '임시기관C');
reset role;

-- 요양보호사 C 를 기관 A 소속(role=caregiver)으로 이동(기관 합류 초대는 후속 — 모사).
update public.users
  set org_id = (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111'),
      role = 'caregiver'
  where id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  assert (select count(*) from public.organizations) = 3,
    '온보딩 시 기관 생성(3개) 실패';
  assert (select role from public.users where id = '11111111-1111-1111-1111-111111111111') = 'org_admin',
    '요양보호사 온보딩은 org_admin 이어야 함';
  assert (select bool_and(org_id is not null and onboarded_at is not null) from public.users),
    '온보딩 완료 후 org_id·onboarded_at 이 채워져야 함';
end $$;

-- 중복 온보딩 차단.
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  begin
    perform public.complete_onboarding('다시', '010-9999-9999', 'caregiver', '중복기관');
  exception when others then
    blocked := true;
  end;
  reset role;
  assert blocked, '온보딩은 1회만 가능해야 함';
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

-- ── 5.5) 안전 이벤트: 기관 내 공유 조회·타 기관 차단·삭제 불가 ─────────────
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';  -- 요양보호사 C(기관 A)
do $$
declare
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  insert into public.safety_events (user_id, profile_id, level, categories, matched_terms, excerpt, caregiver_alert)
    values ('33333333-3333-3333-3333-333333333333', pid, 'crisis', '{self_harm}', '{죽고싶}', '이제 그만 죽고 싶어', '🚨 자살·자해 위기 신호 — 즉시 확인 ☎109');
end $$;

-- 같은 기관 관리자 A: 조회 가능(교대 대비 기관 공유).
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.safety_events) = 1,
    '같은 기관 구성원은 안전 이벤트를 조회할 수 있어야 함';
end $$;

-- 관리자 A 가 확인(acknowledge) 처리.
update public.safety_events
  set acknowledged_at = now(), acknowledged_by = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.safety_events where acknowledged_at is not null) = 1,
    '기관 구성원이 안전 이벤트를 확인 처리할 수 있어야 함';
end $$;

-- 다른 기관 B: 조회 0건.
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.safety_events) = 0,
    '다른 기관의 안전 이벤트는 절대 보이면 안 됨';
end $$;

-- 삭제 불가(deny by default).
set test.uid = '11111111-1111-1111-1111-111111111111';
delete from public.safety_events;
do $$ begin
  assert (select count(*) from public.safety_events) = 1,
    '안전 이벤트는 임의 삭제할 수 없어야 함';
end $$;
reset role;

-- ── 5.6) 안전 이벤트: guardian 역할 배제(T17.0) ────────────────────────────
-- 보호자가 기관에 합류(같은 org_id)해도 위기 발췌를 볼 수 없어야 한다.
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'g@x.kr', '{"name":"기관A보호자"}');
update public.users
  set org_id = (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111'),
      role = 'guardian'
  where id = '44444444-4444-4444-4444-444444444444';

set role authenticated;
set test.uid = '44444444-4444-4444-4444-444444444444';  -- 보호자 G(기관 A)
do $$ begin
  assert (select count(*) from public.safety_events) = 0,
    'guardian 은 같은 기관이어도 안전 이벤트를 볼 수 없어야 함(기대 0)';
end $$;

-- guardian 의 안전 이벤트 기록 시도: 차단.
do $$
declare
  pid uuid;
  blocked boolean := false;
begin
  select id into pid from public.profiles where name = 'A어르신';
  begin
    insert into public.safety_events (user_id, profile_id, level, categories, matched_terms, caregiver_alert)
      values ('44444444-4444-4444-4444-444444444444', pid, 'watch', '{distress}', '{힘들}', '관찰 알림');
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  assert blocked, 'guardian 의 안전 이벤트 기록은 차단되어야 함';
end $$;

-- guardian 의 확인(acknowledge) 시도: 대상 행이 보이지 않아 0건 갱신.
update public.safety_events
  set acknowledged_at = now(), acknowledged_by = '44444444-4444-4444-4444-444444444444';
reset role;
do $$ begin
  assert (select count(*) from public.safety_events
          where acknowledged_by = '44444444-4444-4444-4444-444444444444') = 0,
    'guardian 은 안전 이벤트를 확인 처리할 수 없어야 함';
end $$;

-- ── 5.7) 보호자 초대·연결 워크플로(T17.1·T17.7) ───────────────────────────
-- 요양보호사 C(기관 A)가 'C어르신' 초대 코드 발급 → 신규 보호자 H 가 온보딩에서
-- 코드 사용 → 기관 A 합류 + pending → C 가 승인 → H 는 연결 어르신만 열람.

-- 발급(요양보호사 C).
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
insert into public.guardian_invites (profile_id, created_by)
  select id, '33333333-3333-3333-3333-333333333333'
  from public.profiles where name = 'C어르신';
reset role;

do $$ begin
  assert (select count(*) from public.guardian_invites) = 1,
    '요양보호사는 본인 어르신 초대 코드를 발급할 수 있어야 함';
  assert (select expires_at > now() from public.guardian_invites limit 1),
    '초대 코드는 만료 시각(72h)이 설정되어야 함';
end $$;

-- 다른 기관 어르신으로는 발급 불가(기관 B 관리자가 기관 A 어르신 지정 시도).
do $$
declare
  pid uuid;
  blocked boolean := false;
begin
  select id into pid from public.profiles where name = 'C어르신';
  set role authenticated;
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    insert into public.guardian_invites (profile_id, created_by)
      values (pid, '22222222-2222-2222-2222-222222222222');
  exception when insufficient_privilege or check_violation or foreign_key_violation then
    blocked := true;
  end;
  reset role;
  assert blocked, '다른 기관 어르신에 대한 초대 발급은 차단되어야 함';
end $$;

-- 신규 보호자 H 가입(트리거=최소 row) → 온보딩에서 코드 사용.
-- 코드는 발급자가 보호자에게 외부 전달(QR/구두)한다 — 테스트에서는 GUC 로 전달.
-- (보호자 RLS 로는 초대 목록을 SELECT 할 수 없으므로 서브쿼리 전달은 NULL 이 된다.)
insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'h@z.kr', '{"name":"보호자H"}');

select set_config('test.invite_code', (select code from public.guardian_invites limit 1), false);

set role authenticated;
set test.uid = '55555555-5555-5555-5555-555555555555';
select public.complete_onboarding(
  '보호자H', '010-5555-6666', 'guardian', null,
  current_setting('test.invite_code')
);
reset role;

do $$
declare
  org_a uuid := (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111');
begin
  assert (select org_id from public.users where id = '55555555-5555-5555-5555-555555555555') = org_a,
    '코드 사용 시 보호자는 해당 기관에 합류해야 함';
  assert (select role from public.users where id = '55555555-5555-5555-5555-555555555555') = 'guardian',
    '보호자 온보딩은 role=guardian 이어야 함';
  assert (select status from public.profile_guardians
          where guardian_user_id = '55555555-5555-5555-5555-555555555555') = 'pending',
    '코드 사용 직후 연결은 pending 이어야 함';
  assert (select used_at is not null from public.guardian_invites limit 1),
    '사용된 초대 코드는 소진 처리되어야 함';
end $$;

-- 코드 재사용 차단(1회성).
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
  begin
    perform public.redeem_guardian_invite(current_setting('test.invite_code'));
  exception when others then
    blocked := true;
  end;
  reset role;
  assert blocked, '사용된 초대 코드는 재사용할 수 없어야 함';
end $$;

-- 승인 전: H 는 어르신 정보가 보이지 않는다.
set role authenticated;
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$ begin
  assert (select count(*) from public.profiles) = 0,
    '승인 전 보호자는 어르신 정보를 볼 수 없어야 함(기대 0)';
  assert (select count(*) from public.guardian_invites) = 0,
    'guardian 은 초대 코드 목록을 볼 수 없어야 함';
end $$;

-- 보호자는 자기 연결을 스스로 승인할 수 없다(정책상 0건 갱신).
update public.profile_guardians
  set status = 'approved', approved_by = '55555555-5555-5555-5555-555555555555', approved_at = now();
reset role;
do $$ begin
  assert (select count(*) from public.profile_guardians where status = 'approved') = 0,
    'guardian 은 연결을 자가 승인할 수 없어야 함';
end $$;

-- 요양보호사 C 가 승인 → H 는 연결 어르신(1명)만 열람.
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
update public.profile_guardians
  set status = 'approved', approved_by = '33333333-3333-3333-3333-333333333333', approved_at = now()
  where status = 'pending';

set test.uid = '55555555-5555-5555-5555-555555555555';
do $$ begin
  assert (select count(*) from public.profiles) = 1,
    '승인 후 보호자는 연결된 어르신만 볼 수 있어야 함(기대 1)';
  assert (select count(*) from public.profiles where name <> 'C어르신') = 0,
    '연결되지 않은 어르신은 보이면 안 됨';
  -- 보호자는 users 에서 본인 row 만 볼 수 있다(돌봄 구성원 정보 비노출).
  assert (select count(*) from public.users) = 1,
    '보호자는 users 에서 본인만 볼 수 있어야 함(기대 1)';
end $$;

-- 요양보호사 C 는 승인 화면을 위해 소속 기관 보호자 계정을 볼 수 있다.
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.users where role = 'guardian') >= 1,
    '요양보호사는 소속 기관 보호자 계정을 볼 수 있어야 함';
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

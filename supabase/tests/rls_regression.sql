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
delete from public.notifications;
delete from public.messages;
delete from public.safety_events;
delete from public.profile_guardians;
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
select public.complete_onboarding('기관A관리자', '010-1111-2222', 'caregiver', 'A요양원', null, array['privacy_required'], 'v1.0', true);
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.complete_onboarding('기관B관리자', '010-2222-3333', 'caregiver', 'B요양원', null, array['privacy_required'], 'v1.0', true);
set test.uid = '33333333-3333-3333-3333-333333333333';
select public.complete_onboarding('기관A요양보호사', '010-3333-4444', 'caregiver', '임시기관C', null, array['privacy_required'], 'v1.0', true);
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

-- caregiver C: 같은 기관 전체(2) — 파일럿 D4(20260924030000)로 배정 격리 → 기관 단위 돌봄팀 열람.
-- (2026-07 기준 단언은 "본인 것만 1" 이었다. 교대근무 요구로 바뀐 것이지 격리 약화가 아니다 —
--  타 기관·보호자 격리는 아래 단언이 그대로 지킨다.)
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.profiles) = 2,
    'caregiver 는 같은 기관 어르신 전체를 조회해야 함(기대 2 — 파일럿 D4)';
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

-- ── 5.7) 어르신 영속 코드 — 보호자 연결(비소진·멱등, T17.7 재설계) ─────────
-- C어르신은 부트스트랩 트리거로 영속 코드를 갖는다. 신규 보호자 H 가 그 코드로
-- 온보딩 → 기관 A 합류 + pending → C 승인 → H 는 연결 어르신만 열람. 코드는
-- 소진되지 않으며 보호자는 코드를 직접 조회할 수 없다(link RPC 입력으로만 사용).

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'h@z.kr', '{"name":"보호자H"}');

-- 발급자가 보호자에게 외부 전달한 코드를 GUC 로 모사(보호자 RLS 로는 코드 조회 불가).
select set_config('test.elder_code',
  (select ec.code from public.elder_codes ec
     join public.profiles p on p.id = ec.profile_id
   where p.name = 'C어르신'), false);

set role authenticated;
set test.uid = '55555555-5555-5555-5555-555555555555';
select public.complete_onboarding(
  '보호자H', '010-5555-6666', 'guardian', null, current_setting('test.elder_code'), array['privacy_required'], 'v1.0', true);
reset role;

do $$
declare org_a uuid := (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111');
begin
  assert (select org_id from public.users where id = '55555555-5555-5555-5555-555555555555') = org_a,
    '코드 사용 시 보호자는 해당 기관에 합류해야 함';
  assert (select role from public.users where id = '55555555-5555-5555-5555-555555555555') = 'guardian',
    '보호자 온보딩은 role=guardian 이어야 함';
  assert (select status from public.profile_guardians
          where guardian_user_id = '55555555-5555-5555-5555-555555555555') = 'pending',
    '코드 사용 직후 연결은 pending 이어야 함';
end $$;

-- 영속·멱등: 같은 보호자가 코드를 재입력해도(소진 아님) 중복 pending 생성되지 않음.
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
  begin
    perform public.link_guardian_by_elder_code(current_setting('test.elder_code'));
  exception when others then blocked := true;
  end;
  reset role;
  assert blocked, '이미 대기 중인 연결은 중복 생성되지 않아야 함';
end $$;

-- 승인 전: H 는 어르신·코드가 보이지 않는다.
set role authenticated;
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$ begin
  assert (select count(*) from public.profiles) = 0,
    '승인 전 보호자는 어르신 정보를 볼 수 없어야 함(기대 0)';
  assert (select count(*) from public.elder_codes) = 0,
    '보호자는 어르신 코드를 조회할 수 없어야 함(권한 상승 차단)';
end $$;

-- 보호자 자가 승인 불가.
update public.profile_guardians
  set status = 'approved', approved_by = '55555555-5555-5555-5555-555555555555', approved_at = now();
reset role;
do $$ begin
  assert (select count(*) from public.profile_guardians where status = 'approved') = 0,
    'guardian 은 연결을 자가 승인할 수 없어야 함';
end $$;

-- C 승인 → H 는 연결 어르신(1명)만 열람.
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
  assert (select count(*) from public.users) = 1,
    '보호자는 users 에서 본인만 볼 수 있어야 함(기대 1)';
end $$;

set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.users where role = 'guardian') >= 1,
    '요양보호사는 소속 기관 보호자 계정을 볼 수 있어야 함';
end $$;
reset role;

-- ── 5.7b) 신규 요양보호사 = 소속 기관명 온보딩 + 테넌트 격리(2026-07-25 단순화) ──
-- 요양보호사는 어르신 코드가 아니라 본인 소속 기관명으로 온보딩한다(새 기관·org_admin).
-- 담당 본인(C)은 C어르신 연대기를 계속 열람·기록할 수 있고, 다른 기관 요양보호사(D)는
-- C어르신·연대기를 볼 수 없으며 어르신 코드로도 담당이 되지 않는다(같은 기관 격리 유지).

set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
insert into public.chronicle_entries (user_id, profile_id, topic, content)
  select '33333333-3333-3333-3333-333333333333', id, '고향', '전주에서 국밥집을 오래 하셨다'
  from public.profiles where name = 'C어르신';
do $$ begin
  assert (select count(*) from public.chronicle_entries) >= 1,
    '담당 요양보호사는 본인 어르신 연대기를 열람할 수 있어야 함(배정 기반 접근)';
end $$;
reset role;

-- 신규 요양보호사 D 가입 → 소속 기관명으로 온보딩(본인 기관 = 다른 기관·org_admin).
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'd@x.kr', '{"name":"요양보호사D"}');
set role authenticated;
set test.uid = '66666666-6666-6666-6666-666666666666';
select public.complete_onboarding('요양보호사D', '010-6666-7777', 'caregiver', 'D요양원', null, array['privacy_required'], 'v1.0', true);
do $$ begin
  assert (select role from public.users where id = '66666666-6666-6666-6666-666666666666') = 'org_admin',
    '기관명으로 온보딩한 요양보호사는 org_admin 이어야 함';
end $$;

-- 다른 기관 D 는 C어르신·연대기를 볼 수 없다(테넌트 격리).
do $$ begin
  assert (select count(*) from public.profiles where name = 'C어르신') = 0,
    '다른 기관 요양보호사는 C어르신을 볼 수 없어야 함';
  assert (select count(*) from public.chronicle_entries) = 0,
    '다른 기관 요양보호사는 C어르신 연대기를 볼 수 없어야 함';
end $$;

-- 다른 기관 D 는 C어르신 코드로도 담당이 될 수 없다(같은 기관 한정).
do $$
declare blocked boolean := false;
begin
  begin
    perform public.claim_elder_by_code(current_setting('test.elder_code'));
  exception when others then blocked := true;
  end;
  assert blocked, '다른 기관 요양보호사는 어르신 코드로 담당이 될 수 없어야 함';
end $$;
reset role;

-- ── 5.7c) 코드 회전(rotate) — 매번 새 코드(서버 생성)·연결 유지 ─────────────
-- 배정된 C 가 rotate_elder_code 를 두 번 호출 → 매번 서로 다른 새 코드여야 하고
-- (결정적 재사용 금지), profile_id 기준 보호자 연결(H 승인)은 그대로 유지된다.
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_pid uuid := (select id from public.profiles where name = 'C어르신');
  v_old text;
  v_new1 text;
  v_new2 text;
begin
  select code into v_old from public.elder_codes where profile_id = v_pid;
  v_new1 := (public.rotate_elder_code(v_pid)).code;
  v_new2 := (public.rotate_elder_code(v_pid)).code;
  assert v_new1 <> v_old, '회전 후 코드가 바뀌어야 함';
  assert v_new2 <> v_new1, '연속 회전은 매번 다른 코드여야 함(결정적 재사용 금지)';
  assert (select count(*) from public.profile_guardians
          where profile_id = v_pid and status = 'approved') = 1,
    '코드 회전은 기존 보호자 연결(profile_id 기준)에 영향을 주지 않아야 함';
end $$;
reset role;

-- 보호자 H 는 회전 권한이 없다(코드 조회 자체가 불가 — 권한 상승 차단).
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
  begin
    -- H 는 승인된 C어르신 profile 은 볼 수 있으나(연결), 코드 회전 권한은 없어야 함.
    perform public.rotate_elder_code(
      (select id from public.profiles where name = 'C어르신'));
  exception when others then blocked := true;
  end;
  reset role;
  assert blocked, '보호자는 어르신 코드를 회전할 수 없어야 함';
end $$;

-- 코드 생성 형식(CSPRNG·혼동문자 없는 30자 알파벳·10자) 검증.
do $$
declare v text := app.generate_invite_code();
begin
  assert char_length(v) = 10, '생성 코드는 10자여야 함';
  assert v ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]+$',
    '생성 코드는 혼동문자(0/1/I/L/O/U) 없는 30자 알파벳만 사용해야 함';
end $$;

-- 아이디(이메일) 찾기 — 이름+전화 정확히 1건일 때만 마스킹 이메일 반환.
do $$ begin
  assert public.find_login_email('기관A관리자', '010-1111-2222') = 'a***@x.kr',
    '이름+전화 1건 일치 시 마스킹 이메일을 반환해야 함';
  assert public.find_login_email('기관A관리자', '010-9999-9999') is null,
    '전화 불일치 시 null 이어야 함(존재 노출 최소화)';
  assert public.find_login_email('없는사람', '010-1111-2222') is null,
    '이름 불일치 시 null 이어야 함';
end $$;

-- ── 5.8) 세션 분석: 기관 공유·guardian 배제·타 기관 차단(T16.1) ────────────
-- These normal processing fixtures have explicit current, self/capable consent.
insert into public.consents(user_id, profile_id, org_id, consent_type, granted, version, capacity)
  select p.user_id, p.id, p.org_id, t::public.consent_type, true, 'v1.0', 'capable'
  from public.profiles p cross join
    unnest(array['sensitive_health_voice','cross_border_transfer','ai_processing']) t
  where p.name in ('A어르신','B어르신','C어르신');
-- 요양보호사 C 가 세션 + 분석 기록 → 같은 기관 A 조회 가능 / 보호자 H 는
-- 연결 승인된 어르신이라도 직접 조회 불가(공개 커밋 경유만) / 기관 B 0건.
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  pid uuid := (select id from public.profiles where name = 'C어르신');
  sid uuid;
begin
  insert into public.sessions (user_id, profile_id, status, turn_count, ended_at)
    values ('33333333-3333-3333-3333-333333333333', pid, 'ended', 6, now())
    returning id into sid;
  -- 대화 원문 2턴 — 5.13(보호자 공개 열람)이 이 행들을 본다.
  insert into public.session_logs (user_id, session_id, profile_id, turn_index, role, content)
    values
      ('33333333-3333-3333-3333-333333333333', sid, pid, 1, 'ai', '고향은 어디셨어요?'),
      ('33333333-3333-3333-3333-333333333333', sid, pid, 2, 'user', '전주에서 나고 자랐지.');
  insert into public.session_analyses (user_id, session_id, profile_id, analysis, version)
    values (
      '33333333-3333-3333-3333-333333333333', sid, pid,
      '{"summary":"고향 이야기에 호응이 좋으셨어요.","topicsEngaged":["고향"],"metrics":{"responseRate":0.8}}'::jsonb,
      'v1.0'
    );
end $$;

set test.uid = '11111111-1111-1111-1111-111111111111';  -- 같은 기관 관리자 A
do $$ begin
  assert (select count(*) from public.session_analyses) = 1,
    '같은 기관 돌봄 구성원은 세션 분석을 조회할 수 있어야 함';
end $$;

set test.uid = '55555555-5555-5555-5555-555555555555';  -- 보호자 H(연결 승인됨)
do $$ begin
  assert (select count(*) from public.session_analyses) = 0,
    'guardian 은 연결 승인 후에도 분석을 직접 볼 수 없어야 함(커밋 경유만)';
  -- 공개 전에는 세션 원본도 닫혀 있어야 한다(5.13 이 공개 후를 본다).
  assert (select count(*) from public.sessions) = 0,
    'guardian 은 공개 전 세션을 볼 수 없어야 함';
  assert (select count(*) from public.session_logs) = 0,
    'guardian 은 공개 전 대화 원문을 볼 수 없어야 함';
end $$;

set test.uid = '22222222-2222-2222-2222-222222222222';  -- 다른 기관 B
do $$ begin
  assert (select count(*) from public.session_analyses) = 0,
    '다른 기관의 세션 분석은 보이면 안 됨';
end $$;

-- 삭제 불가(deny by default).
set test.uid = '33333333-3333-3333-3333-333333333333';
delete from public.session_analyses;
reset role;
do $$ begin
  assert (select count(*) from public.session_analyses) = 1,
    '세션 분석은 임의 삭제할 수 없어야 함';
end $$;

-- ── 5.9) 요양일지: 기관 공유·guardian 배제·final 삭제 불가(T19.1) ──────────
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';  -- 요양보호사 C
do $$
declare
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  insert into public.care_journals (author_id, profile_id, content, source, status)
    values ('33333333-3333-3333-3333-333333333333', pid, '점심 잘 드시고 산책도 하셨어요.', 'typed', 'final');
  insert into public.care_journals (author_id, profile_id, content, source, status)
    values ('33333333-3333-3333-3333-333333333333', pid, '초안 메모', 'ai_draft', 'draft');
end $$;

set test.uid = '11111111-1111-1111-1111-111111111111';  -- 같은 기관 관리자 A
do $$ begin
  assert (select count(*) from public.care_journals) = 2,
    '같은 기관 돌봄 구성원은 요양일지를 조회할 수 있어야 함';
end $$;

set test.uid = '55555555-5555-5555-5555-555555555555';  -- 보호자 H(연결 승인됨)
do $$ begin
  assert (select count(*) from public.care_journals) = 0,
    'guardian 은 요양일지를 직접 볼 수 없어야 함(공개 커밋 경유만)';
end $$;

-- guardian 의 일지 작성 시도: 차단.
do $$
declare
  pid uuid;
  blocked boolean := false;
begin
  select id into pid from public.profiles where name = 'C어르신';
  begin
    insert into public.care_journals (author_id, profile_id, content)
      values ('55555555-5555-5555-5555-555555555555', pid, '보호자 작성 시도');
  exception when insufficient_privilege or check_violation or not_null_violation then
    blocked := true;
  end;
  assert blocked, 'guardian 의 요양일지 작성은 차단되어야 함';
end $$;

set test.uid = '22222222-2222-2222-2222-222222222222';  -- 다른 기관 B
do $$ begin
  assert (select count(*) from public.care_journals) = 0,
    '다른 기관의 요양일지는 보이면 안 됨';
end $$;

-- 확정(final) 일지는 삭제 불가, 초안(draft)은 작성자만 삭제 가능.
set test.uid = '33333333-3333-3333-3333-333333333333';
delete from public.care_journals where status = 'final';
delete from public.care_journals where status = 'draft';
reset role;
do $$ begin
  assert (select count(*) from public.care_journals where status = 'final') = 1,
    '확정(final) 일지는 삭제할 수 없어야 함';
  assert (select count(*) from public.care_journals where status = 'draft') = 0,
    '작성자는 본인 초안을 삭제할 수 있어야 함';
end $$;

-- ── 5.9b) 일지 사진: 일지와 같은 격리 · guardian 배제 · 확정 일지 첨부는 못 뺀다 ──
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';  -- 작성자 C
do $$
declare
  fid uuid := (select id from public.care_journals where status = 'final' limit 1);
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  insert into public.journal_photos (journal_id, path, sort)
    values (fid, pid::text || '/p1.jpg', 0);
end $$;

set test.uid = '11111111-1111-1111-1111-111111111111';  -- 같은 기관 관리자 A
do $$ begin
  assert (select count(*) from public.journal_photos) = 1,
    '같은 기관 돌봄 구성원은 일지 사진을 조회할 수 있어야 함';
end $$;

set test.uid = '55555555-5555-5555-5555-555555555555';  -- 보호자 H(연결 승인됨)
do $$ begin
  assert (select count(*) from public.journal_photos) = 0,
    'guardian 은 일지 사진을 직접 볼 수 없어야 함(공개 커밋 경유만)';
end $$;

set test.uid = '22222222-2222-2222-2222-222222222222';  -- 다른 기관 B
do $$ begin
  assert (select count(*) from public.journal_photos) = 0,
    '다른 기관의 일지 사진은 보이면 안 됨';
end $$;

-- 확정(final) 일지의 사진은 삭제 불가.
set test.uid = '33333333-3333-3333-3333-333333333333';
delete from public.journal_photos;
reset role;
do $$ begin
  assert (select count(*) from public.journal_photos) = 1,
    '확정 일지의 사진은 삭제할 수 없어야 함';
end $$;

-- ── 5.10) 공개 커밋: 보호자는 승인된 연결 + 미철회 커밋만(T17.2) ───────────
-- C 가 final 일지·분석을 공개 → 연결 승인된 H 만 열람. 철회 시 즉시 차단.
-- 연결 없는 보호자 G(같은 기관)·타 기관 B 는 0건.
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  jid uuid := (select id from public.care_journals where status = 'final' limit 1);
  aid uuid := (select id from public.session_analyses limit 1);
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  insert into public.guardian_shares (shared_by, profile_id, item_type, item_id)
    values ('33333333-3333-3333-3333-333333333333', pid, 'journal', jid);
  insert into public.guardian_shares (shared_by, profile_id, item_type, item_id)
    values ('33333333-3333-3333-3333-333333333333', pid, 'analysis', aid);
end $$;

-- 보호자 H(연결 승인): 공개 커밋 + 공개된 원본을 볼 수 있다.
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$ begin
  assert (select count(*) from public.guardian_shares) = 2,
    '보호자는 승인된 연결의 공개 커밋을 볼 수 있어야 함(기대 2)';
  assert (select count(*) from public.care_journals) = 1,
    '보호자는 공개된 일지 원본을 볼 수 있어야 함(기대 1)';
  assert (select count(*) from public.session_analyses) = 1,
    '보호자는 공개된 분석 원본을 볼 수 있어야 함(기대 1)';
  -- W-2a: 분석이 공개되면 그 세션의 원본(세션 행·대화 원문)도 함께 열린다.
  -- 분석 카드가 셋을 같이 읽는데 앞의 둘이 닫혀 있어 화면이 비어 보였다.
  assert (select count(*) from public.sessions) = 1,
    '분석이 공개된 세션은 보호자가 볼 수 있어야 함(기대 1)';
  assert (select count(*) from public.session_logs) = 2,
    '분석이 공개된 세션의 대화 원문을 보호자가 볼 수 있어야 함(기대 2)';
end $$;

-- 연결 없는 보호자 G(같은 기관): 0건.
set test.uid = '44444444-4444-4444-4444-444444444444';
do $$ begin
  assert (select count(*) from public.guardian_shares) = 0,
    '연결되지 않은 보호자는 공개 커밋을 볼 수 없어야 함';
  assert (select count(*) from public.care_journals) = 0,
    '연결되지 않은 보호자는 일지를 볼 수 없어야 함';
end $$;

-- 타 기관 B: 0건.
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.guardian_shares) = 0,
    '다른 기관은 공개 커밋을 볼 수 없어야 함';
end $$;

-- W-2d: 다른 어르신의 기록을 이 어르신 이름으로 공개하려는 시도는 차단된다.
-- (RLS 는 profile_id 만 보므로 A 담당 요양보호사가 B 의 일지를 A 로 붙일 수 있었다.)
-- ⚠️ 실제 id 를 집으려면 **RLS 밖에서** 읽어야 한다 — 직전 블록이 남긴 역할을 먼저 푼다.
reset role;
do $$
declare
  other_pid uuid;
  jid uuid;
  blocked boolean := false;
begin
  select id into other_pid from public.profiles where name = 'A어르신';
  select id into jid from public.care_journals where status = 'final' limit 1;
  assert other_pid is not null and jid is not null, '테스트 준비: 어르신·일지 id 를 찾지 못함';
  set role authenticated;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true); -- 관리자 A
  begin
    -- A어르신 앞으로 C어르신의 일지를 공개하려 한다.
    insert into public.guardian_shares (shared_by, profile_id, item_type, item_id)
      values ('11111111-1111-1111-1111-111111111111', other_pid, 'journal', jid);
  exception when check_violation or insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '다른 어르신의 기록을 공개하는 조합은 차단되어야 함';
end $$;

-- 존재하지 않는 항목도 공개할 수 없다(빈 공개 행이 남으면 이력이 거짓말을 한다).
reset role;
do $$
declare
  pid uuid;
  blocked boolean := false;
begin
  select id into pid from public.profiles where name = 'C어르신';
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    insert into public.guardian_shares (shared_by, profile_id, item_type, item_id)
      values ('33333333-3333-3333-3333-333333333333', pid, 'journal',
              '00000000-0000-0000-0000-0000000000ff');
  exception when foreign_key_violation or insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '없는 항목은 공개할 수 없어야 함';
end $$;

-- 보호자의 공개 시도(커밋 생성): 차단.
do $$
declare
  pid uuid;
  jid uuid;
  blocked boolean := false;
begin
  select id into pid from public.profiles where name = 'C어르신';
  select id into jid from public.care_journals where status = 'final' limit 1;
  set role authenticated;
  perform set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
  begin
    insert into public.guardian_shares (shared_by, profile_id, item_type, item_id)
      values ('55555555-5555-5555-5555-555555555555', pid, 'journal', jid);
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  reset role;
  assert blocked, '보호자는 공개 커밋을 만들 수 없어야 함';
end $$;

-- 철회 → 보호자 화면에서 즉시 사라진다(커밋·원본 모두).
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
update public.guardian_shares
  set revoked_at = now(), revoked_by = '33333333-3333-3333-3333-333333333333'
  where item_type = 'journal';

set test.uid = '55555555-5555-5555-5555-555555555555';
do $$ begin
  assert (select count(*) from public.guardian_shares where item_type = 'journal') = 0,
    '철회된 공개는 보호자에게 보이면 안 됨';
  assert (select count(*) from public.care_journals) = 0,
    '철회 즉시 일지 원본 접근도 차단되어야 함';
  assert (select count(*) from public.session_analyses) = 1,
    '철회되지 않은 분석 공개는 유지되어야 함';
end $$;
reset role;

-- ── 5.10b) 보호자 확인 영수증: 보호자만 남길 수 있고, 열은 함수로만 바뀐다 ──
set role authenticated;
set test.uid = '55555555-5555-5555-5555-555555555555';  -- 보호자 H(연결 승인)
do $$
declare
  sid uuid := (select id from public.guardian_shares where item_type = 'analysis' limit 1);
  r public.guardian_shares;
begin
  r := public.mark_share_viewed(sid);
  assert r.view_count = 1, '첫 확인이면 횟수가 1 이어야 함';
  assert r.viewed_at is not null, '첫 확인 시각이 남아야 함';
  assert r.viewed_by = '55555555-5555-5555-5555-555555555555'::uuid,
    '확인자는 호출한 보호자여야 함';
  r := public.mark_share_viewed(sid);
  assert r.view_count = 2, '다시 열면 횟수가 늘어야 함';
end $$;

-- 보호자는 공개 행을 직접 고칠 수 없다(철회·공개까지 손대지 못하게).
do $$
declare
  sid uuid := (select id from public.guardian_shares where item_type = 'analysis' limit 1);
  n int;
begin
  update public.guardian_shares set notify_on_view = true where id = sid;
  get diagnostics n = row_count;
  assert n = 0, '보호자는 공개 행을 직접 수정할 수 없어야 함';
end $$;

-- 연결 없는 보호자 G 는 확인을 남길 수 없다.
set test.uid = '44444444-4444-4444-4444-444444444444';
do $$
declare
  ok boolean := false;
begin
  begin
    perform public.mark_share_viewed(
      (select id from public.guardian_shares where item_type = 'analysis' limit 1));
  exception when others then ok := true;
  end;
  assert ok, '연결이 없는 보호자는 확인을 남길 수 없어야 함';
end $$;

-- 요양보호사는 알림 토글을 켤 수 있다(확인 열은 함수만 건드린다).
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  n int;
begin
  update public.guardian_shares set notify_on_view = true
   where item_type = 'analysis';
  get diagnostics n = row_count;
  assert n = 1, '돌봄 구성원은 확인 알림 토글을 켤 수 있어야 함';
end $$;
reset role;

-- ── 5.10c) 알림: 본인 것만 · 사람은 못 만든다(트리거만) ────────────────────
-- notifications 는 클라이언트가 만들지 않는다. 안전 이벤트(5.5)·보호자 확인에서
-- DB 트리거가 파생하고, 각자 자기 알림만 읽고 읽음 처리한다.

-- 5.5 의 위기 이벤트는 그 어르신의 활성 담당(요양보호사 C)에게 알림을 남긴다.
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.notifications) = 1,
    '안전 이벤트가 담당 요양보호사에게 알림을 남겨야 함(기대 1)';
  assert (select count(*) from public.notifications where kind = 'safety') = 1,
    '안전 알림의 종류는 safety 여야 함';
end $$;

-- 같은 기관 관리자 A 도 남의 알림은 못 본다(안전 이벤트 자체는 5.5 에서 보였다).
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.notifications) = 0,
    '알림은 수신자 본인만 볼 수 있어야 함(기관 관리자도 예외 아님)';
end $$;

-- 연결된 보호자 H·타 기관 B 도 0건.
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$ begin
  assert (select count(*) from public.notifications) = 0,
    '보호자에게는 담당자 알림이 보이면 안 됨';
end $$;
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.notifications) = 0,
    '다른 기관의 알림은 절대 보이면 안 됨';
end $$;

-- 사람이 알림을 만들 수 없다(INSERT 정책 없음) — 자기 앞으로도 차단.
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.notifications (user_id, kind, title)
      values ('33333333-3333-3333-3333-333333333333', 'message', '내가 만든 알림');
  exception when insufficient_privilege or check_violation then
    blocked := true;
  end;
  assert blocked, '알림은 사람이 만들 수 없어야 함(트리거만)';
end $$;

-- 본인 알림 읽음 처리는 가능.
do $$
declare
  n int;
begin
  update public.notifications set read_at = now() where read_at is null;
  get diagnostics n = row_count;
  assert n = 1, '본인 알림은 읽음 처리할 수 있어야 함';
end $$;

-- 남의 알림은 갱신 대상 자체가 보이지 않는다(0건).
set test.uid = '44444444-4444-4444-4444-444444444444';
do $$
declare
  n int;
begin
  update public.notifications set read_at = null;
  get diagnostics n = row_count;
  assert n = 0, '남의 알림은 갱신할 수 없어야 함';
end $$;

-- 삭제 불가(deny by default) — append-only.
set test.uid = '33333333-3333-3333-3333-333333333333';
delete from public.notifications;
do $$ begin
  assert (select count(*) from public.notifications) = 1,
    '알림은 임의 삭제할 수 없어야 함';
end $$;

-- 보호자 확인 → 공개한 사람에게 알림(알림 받기를 켠 공개만).
-- 5.10b 에서 확인된 분석 공개는 이미 viewed_at 이 차 있어 다시 알리지 않는다
-- (같은 사건 중복 방지) → 알림 받기를 켠 새 공개를 하나 만들어 확인시킨다.
do $$
declare
  pid uuid := (select id from public.profiles where name = 'C어르신');
  jid uuid := (select id from public.care_journals where status = 'final' limit 1);
begin
  insert into public.guardian_shares
    (shared_by, profile_id, item_type, item_id, notify_on_view)
    values ('33333333-3333-3333-3333-333333333333', pid, 'journal', jid, true);
end $$;

set test.uid = '55555555-5555-5555-5555-555555555555';
do $$
declare
  sid uuid := (select id from public.guardian_shares
                where item_type = 'journal' and revoked_at is null limit 1);
begin
  perform public.mark_share_viewed(sid);
end $$;

set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.notifications where kind = 'share_viewed') = 1,
    '보호자가 확인하면 공개한 사람에게 알림이 가야 함';
  assert (select count(*) from public.notifications
           where kind = 'share_viewed' and read_at is null) = 1,
    '새 알림은 안 읽음 상태여야 함';
end $$;

-- 같은 공개를 다시 열어도 알림은 늘지 않는다(첫 확인만).
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$
declare
  sid uuid := (select id from public.guardian_shares
                where item_type = 'journal' and revoked_at is null limit 1);
begin
  perform public.mark_share_viewed(sid);
end $$;
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.notifications where kind = 'share_viewed') = 1,
    '다시 열어도 확인 알림은 한 번만 남아야 함';
end $$;
reset role;

-- ── 5.11) 보호자 메시지: 보호자 → 담당 요양보호사 단방향 · append-only ─────
-- 디자인에 답장 UI 가 없고 사용자가 단방향으로 확정했다 → 요양보호사는 읽기만 한다.
-- 이용 안내 모달이 "내용과 전송 시간이 자동 저장" 이라 약속하므로 수정·삭제도 없다.

-- 승인된 보호자 H 는 연결 어르신에 대해 보낼 수 있다.
set role authenticated;
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$
declare
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  insert into public.messages (profile_id, sender_user_id, body)
    values (pid, '55555555-5555-5555-5555-555555555555',
            '어제 산책 사진 잘 봤습니다. 무릎이 불편해 보이셨는데 괜찮으셨는지요?');
end $$;
do $$ begin
  assert (select count(*) from public.messages) = 1,
    '보낸 보호자는 자기 메시지를 볼 수 있어야 함';
end $$;

-- 보낸 사람 이름을 남의 것으로 적을 수 없다.
do $$
declare
  blocked boolean := false;
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  begin
    insert into public.messages (profile_id, sender_user_id, body)
      values (pid, '33333333-3333-3333-3333-333333333333', '남의 이름으로');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, '보낸 사람을 위조할 수 없어야 함';
end $$;

-- 연결 없는 보호자 G: 보이지도 않고 보내지도 못한다.
set test.uid = '44444444-4444-4444-4444-444444444444';
do $$
declare
  blocked boolean := false;
  pid uuid := (select id from public.profiles where name = 'A어르신');
begin
  assert (select count(*) from public.messages) = 0,
    '연결되지 않은 보호자에게는 메시지가 보이면 안 됨';
  begin
    insert into public.messages (profile_id, sender_user_id, body)
      values (pid, '44444444-4444-4444-4444-444444444444', '연결 없이 보내기');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, '연결되지 않은 보호자는 메시지를 보낼 수 없어야 함';
end $$;

-- 담당 요양보호사 C: 읽을 수 있고, 알림도 받는다. 그러나 답장(insert)은 못 한다.
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  blocked boolean := false;
  pid uuid := (select id from public.profiles where name = 'C어르신');
begin
  assert (select count(*) from public.messages) = 1,
    '담당 요양보호사는 메시지를 볼 수 있어야 함';
  assert (select count(*) from public.notifications where kind = 'message') = 1,
    '메시지가 오면 담당 요양보호사에게 알림이 가야 함';
  begin
    insert into public.messages (profile_id, sender_user_id, body)
      values (pid, '33333333-3333-3333-3333-333333333333', '답장합니다');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, '요양보호사는 메시지를 보낼 수 없어야 함(단방향)';
end $$;

-- 배정되지 않은 기관 관리자 A · 다른 기관 B: 0건(개인 간 문의라 기관 공유가 아니다).
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.messages) = 0,
    '배정되지 않은 기관 관리자에게는 메시지가 보이면 안 됨';
end $$;
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.messages) = 0,
    '다른 기관의 메시지는 절대 보이면 안 됨';
end $$;

-- append-only: 보낸 사람도 고치거나 지울 수 없다.
set test.uid = '55555555-5555-5555-5555-555555555555';
do $$
declare
  n int;
begin
  update public.messages set body = '내용을 바꿔치기';
  get diagnostics n = row_count;
  assert n = 0, '보낸 메시지는 수정할 수 없어야 함';
  delete from public.messages;
  get diagnostics n = row_count;
  assert n = 0, '보낸 메시지는 삭제할 수 없어야 함';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.messages) = 1,
    '메시지는 append-only 로 남아야 함';
end $$;

-- ── 5.12) 문의사항: 비공개는 제목·본문 모두 작성자·운영자만 ────────────────
-- ⚠️ list_inquiries() 는 security definer 라 RLS 를 우회한다 → 함수 자체가 가리는지 본다.
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';  -- 기관A 요양보호사
insert into public.inquiries (author_id, title, content, visibility) values
  ('33333333-3333-3333-3333-333333333333', '공개 문의 제목', '공개 본문', 'public'),
  ('33333333-3333-3333-3333-333333333333', '비공개 문의 제목', '비공개 본문', 'private');
do $$ begin
  assert (select count(*) from public.inquiries) = 2, '작성자는 자기 문의 2건을 봐야 함';
  assert (select count(*) from public.list_inquiries() where locked) = 0,
    '작성자에게는 잠긴 행이 없어야 함';
  assert (select bool_and(title <> '비공개 문의입니다') from public.list_inquiries()),
    '작성자는 비공개 제목 원문을 봐야 함';
end $$;
reset role;

-- 같은 기관의 다른 사람 = 남이다. 비공개는 목록에서 제목이 가려지고 본문은 안 보인다.
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';  -- 기관A 관리자(사이트 운영자 아님)
do $$ begin
  assert (select count(*) from public.inquiries) = 1,
    '남의 비공개 문의 본문은 RLS 가 막아야 함(공개 1건만)';
  assert (select count(*) from public.list_inquiries()) = 2,
    '목록에는 두 행이 모두 남아야 함(작성일·답변 여부는 게시판 운영에 필요)';
  assert (select title from public.list_inquiries() where locked) = '비공개 문의입니다',
    '남에게는 비공개 제목이 잠금 문구로 나가야 함';
  assert (select masked_author from public.list_inquiries() where locked) = '비공개',
    '남에게는 비공개 작성자도 가려져야 함';
end $$;
reset role;

-- 비로그인(anon)도 같은 함수를 부른다 — 비공개 제목이 새면 안 된다.
set role anon;
do $$
declare blocked boolean := false;
begin
  begin
    perform count(*) from public.inquiries;
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked, '비로그인에게는 inquiries 테이블 권한 자체가 없어야 함';
end $$;
do $$ begin
  assert (select count(*) from public.list_inquiries()) = 2,
    '비로그인도 목록 함수는 부를 수 있어야 함(공개 게시판)';
  assert (select count(*) from public.list_inquiries() where locked) = 1,
    '비로그인에게 비공개 문의는 잠긴 행이어야 함';
  assert (select title from public.list_inquiries() where locked) = '비공개 문의입니다',
    '비로그인에게 비공개 제목이 새면 안 됨';
  assert (select title from public.list_inquiries() where not locked) = '공개 문의 제목',
    '공개 문의 제목은 비로그인에게도 보여야 함';
end $$;
reset role;

-- 운영자 플래그는 스스로 켤 수 없다.
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    update public.users set is_site_admin = true where id = auth.uid();
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '사이트 운영자 권한은 스스로 올릴 수 없어야 함';
end $$;

-- 답변은 운영자만 단다.
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    insert into public.inquiry_replies (inquiry_id, author_id, content)
      select id, auth.uid(), '일반 사용자 답변' from public.inquiries limit 1;
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '운영자가 아니면 답변을 달 수 없어야 함';
end $$;

-- ── 5.13) 공개된 세션 원본: 철회하면 즉시 닫힌다 · 남의 보호자는 못 본다 ────
-- 5.10 에서 열린 것이 **분석 공개에 매달려 있는지** 확인한다. 매달려 있지 않으면
-- 한 번 공개한 세션이 철회 후에도 계속 보인다(감사·동의 철회 요건 위반).

-- 연결 없는 보호자 G(같은 기관): 공개돼 있어도 남의 어르신이라 0건.
set role authenticated;
set test.uid = '44444444-4444-4444-4444-444444444444';
do $$ begin
  assert (select count(*) from public.sessions) = 0,
    '연결되지 않은 보호자는 공개된 세션도 볼 수 없어야 함';
  assert (select count(*) from public.session_logs) = 0,
    '연결되지 않은 보호자는 공개된 대화 원문도 볼 수 없어야 함';
end $$;

-- 요양보호사 C 가 분석 공개를 철회한다.
set test.uid = '33333333-3333-3333-3333-333333333333';
update public.guardian_shares
  set revoked_at = now(), revoked_by = '33333333-3333-3333-3333-333333333333'
  where item_type = 'analysis';

set test.uid = '55555555-5555-5555-5555-555555555555';  -- 보호자 H
do $$ begin
  assert (select count(*) from public.session_analyses) = 0,
    '철회 즉시 분석 원본이 닫혀야 함';
  assert (select count(*) from public.sessions) = 0,
    '철회 즉시 세션 원본도 닫혀야 함';
  assert (select count(*) from public.session_logs) = 0,
    '철회 즉시 대화 원문도 닫혀야 함';
end $$;
reset role;

-- ── 5.14) 권한 상승 차단 — 본인 role 셀프 승격 불가 (2026-09-08 발견 취약점) ──
--
-- 그전에는 users_update_scope 의 WITH CHECK 가 role 을 전혀 제약하지 않아
--   update public.users set role = 'org_admin' where id = auth.uid();
-- 가 통과했다. 요양보호사·보호자 누구나 publishable 키만으로 기관 관리자가 되어
-- 기관 전체 어르신 기록을 볼 수 있었다.
--
-- ⚠️ 이 테스트가 도는 시점에는 _grants.sql 이 테이블 단위 UPDATE 를 이미 다시
--    부여한 상태다(러너가 마이그레이션 뒤에 실행). 즉 **1차 컬럼 권한이 없는 조건**
--    에서 2차 트리거·3차 정책만으로 막히는지를 본다. 1차는 (g) 에서 따로 확인한다.

-- (a) 요양보호사 C 의 셀프 승격 — 막혀야 한다.
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    update public.users set role = 'org_admin' where id = auth.uid();
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '요양보호사가 본인 역할을 org_admin 으로 올릴 수 있으면 안 됨';
  assert (select role from public.users where id = '33333333-3333-3333-3333-333333333333')
         = 'caregiver', '차단 후에도 역할이 caregiver 로 남아야 함';
end $$;

-- (b) 본인 소속 기관 변경 — 막혀야 한다(타 기관 데이터로 갈아타기 차단).
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    update public.users
      set org_id = (select org_id from public.users where id = '22222222-2222-2222-2222-222222222222')
      where id = auth.uid();
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '본인 소속 기관을 직접 바꿀 수 있으면 안 됨';
end $$;

-- (c) 사이트 운영자 플래그 셀프 부여 — 막혀야 한다(inquiries 트리거).
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    update public.users set is_site_admin = true where id = auth.uid();
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '사이트 운영자 플래그를 스스로 켤 수 있으면 안 됨';
end $$;

-- (d) 과차단 아님 — 본인 표시 이름은 계속 바꿀 수 있어야 한다(useUpdateMyName).
set role authenticated;
set test.uid = '33333333-3333-3333-3333-333333333333';
update public.users set name = '요양보호사C수정' where id = auth.uid();
do $$ begin
  assert (select name from public.users where id = auth.uid()) = '요양보호사C수정',
    '본인 이름 수정은 계속 허용되어야 함';
end $$;
reset role;

-- (e) 정상 기능 유지 — 기관 관리자는 **다른** 구성원의 역할을 바꿀 수 있다.
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';  -- org_admin A
update public.users set role = 'org_admin'
  where id = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select role from public.users where id = '33333333-3333-3333-3333-333333333333')
         = 'org_admin', '기관 관리자는 소속 구성원 역할을 바꿀 수 있어야 함';
end $$;
reset role;
-- 뒤 섹션(§6)이 C 를 비관리자로 전제하므로 되돌린다(superuser 문맥 = 트리거 우회).
update public.users set role = 'caregiver'
  where id = '33333333-3333-3333-3333-333333333333';

-- (f) 관리자도 **본인** 역할은 직접 못 바꾼다(마지막 관리자 자멸·자기 승격 방지).
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  begin
    update public.users set role = 'caregiver' where id = auth.uid();
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '기관 관리자도 본인 역할은 직접 바꿀 수 없어야 함';
end $$;

-- (g) 1차 방어(컬럼 권한) 단독 확인 — 마이그레이션이 준 권한 상태를 복원하고 검사.
revoke update on public.users from authenticated;
grant update (name) on public.users to authenticated;
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin
    update public.users set role = 'org_admin' where id = auth.uid();
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, '컬럼 권한만으로도 role 갱신이 막혀야 함(RLS·트리거 이전 단계)';
end $$;
-- 뒤 섹션을 위해 러너 기본 권한으로 되돌린다.
grant update on public.users to authenticated;

-- (h) 트리거 단독: RLS 없이도 정확히 해당 가드가 차단해야 한다.
-- SECURITY DEFINER로 되돌리면 이 테스트는 실패한다. 변경은 항상 롤백한다.
begin;
alter table public.users disable row level security;
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  assert auth.uid() = '33333333-3333-3333-3333-333333333333'::uuid;
  begin
    update public.users set role = 'org_admin' where id = auth.uid();
  exception when insufficient_privilege then
    assert sqlerrm = '본인의 역할은 변경할 수 없습니다',
      '다른 권한 오류를 트리거 성공으로 오인하면 안 됨';
    blocked := true;
  end;
  reset role;
  assert blocked, 'RLS 없이 트리거만으로 셀프 승격을 차단해야 함';
end $$;
rollback;

-- (i) 정책 단독: 트리거 없이 일반 사용자/관리자 모두 자기 역할 변경 불가.
begin;
alter table public.users disable trigger users_protect_privileges;
do $$
declare actor uuid; blocked boolean;
begin
  foreach actor in array array[
    '33333333-3333-3333-3333-333333333333'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid
  ] loop
    blocked := false;
    set role authenticated;
    perform set_config('test.uid', actor::text, true);
    begin
      update public.users set role = case when role = 'org_admin'
        then 'caregiver'::public.org_role else 'org_admin'::public.org_role end
        where id = auth.uid();
    exception when insufficient_privilege then
      assert sqlerrm like '%row-level security%',
        '정책 검증은 실제 RLS 오류여야 함';
      blocked := true;
    end;
    reset role;
    assert blocked, '트리거 없이 정책만으로 자기 역할 변경을 차단해야 함';
  end loop;
end $$;
rollback;

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

-- ── 7) R002: 실제 부모 세션의 소속과 제출한 소속은 반드시 같아야 한다. ──
-- 합성 자료만 쓰며 뒤의 정상 공유/분석 회귀와 격리한다.
begin;
do $$
declare
  own_profile uuid := (select id from public.profiles where name = 'C어르신');
  other_profile uuid;
  own_org uuid := (select org_id from public.profiles where id = own_profile);
  other_org uuid;
  own_session uuid;
  other_session uuid;
  target_table text;
  violated text;
  blocked boolean;
begin
  insert into public.sessions(user_id, profile_id, org_id, status, ended_at)
    values ('33333333-3333-3333-3333-333333333333', own_profile, own_org, 'ended', now())
    returning id into own_session;
  -- 정상 로그/분석/안전 이벤트 저장은 계속 허용되어야 한다.
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  insert into public.session_logs(user_id, profile_id, session_id, turn_index, role, content)
    values (auth.uid(), own_profile, own_session, 1, 'user', '합성 검증 발화');
  insert into public.session_analyses(user_id, profile_id, session_id, analysis, version)
    values (auth.uid(), own_profile, own_session, '{"summary":"합성 검증"}', 'test');
  insert into public.safety_events(user_id, profile_id, session_id, level, caregiver_alert)
    values (auth.uid(), own_profile, own_session, 'watch', '합성 검증 알림');
  reset role;

  for other_profile, other_org in
    select id, org_id from public.profiles where name in ('A어르신', 'B어르신')
  loop
    insert into public.sessions(profile_id, org_id, status, ended_at)
      values (other_profile, other_org, 'ended', now()) returning id into other_session;
    foreach target_table in array array['session_logs', 'session_analyses', 'safety_events'] loop
      blocked := false;
      set role authenticated;
      perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
      begin
        if target_table = 'session_logs' then
          insert into public.session_logs(user_id, profile_id, session_id, turn_index, role, content)
            values (auth.uid(), own_profile, other_session, 1, 'user', '잘못된 연결');
        elsif target_table = 'session_analyses' then
          insert into public.session_analyses(user_id, profile_id, session_id, analysis, version)
            values (auth.uid(), own_profile, other_session, '{"summary":"잘못된 연결"}', 'test');
        else
          insert into public.safety_events(user_id, profile_id, session_id, level, caregiver_alert)
            values (auth.uid(), own_profile, other_session, 'watch', '잘못된 연결');
        end if;
      exception when foreign_key_violation then
        get stacked diagnostics violated = constraint_name;
        assert violated = target_table || '_session_profile_org_fk', '예상한 소속 FK로 차단해야 함';
        blocked := true;
      end;
      reset role;
      assert blocked, '동일/다른 기관 세션을 자기 어르신 기록에 연결할 수 없어야 함';
      blocked := false;
      set role authenticated;
      perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
      begin
        execute format('update public.%I set session_id = $1 where session_id = $2', target_table)
          using other_session, own_session;
      exception when insufficient_privilege then
        assert sqlerrm = 'RECORD_IDENTITY_IMMUTABLE';
        blocked := true;
      when foreign_key_violation then
        get stacked diagnostics violated = constraint_name;
        assert violated = target_table || '_session_profile_org_fk';
        blocked := true;
      end;
      reset role;
      assert blocked, '기존 하위 행의 session_id를 타 세션으로 바꿀 수 없어야 함';
    end loop;

    -- org_id만 다른 세션도 FK가 차단해야 한다(RLS를 우회하는 서버 쓰기 포함).
    if other_org <> own_org then
      blocked := false;
      begin
        insert into public.sessions(profile_id, org_id) values (other_profile, own_org);
      exception when foreign_key_violation then blocked := true;
      end;
      assert blocked, '세션과 어르신의 기관이 달라서는 안 됨';
    end if;
  end loop;

  -- 세션 삭제 시 안전 이벤트의 대상은 유지하고 세션 연결만 비운다.
  set role authenticated;
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  delete from public.sessions where id = own_session;
  reset role;
  assert exists (select 1 from public.safety_events
    where profile_id = own_profile and session_id is null and caregiver_alert = '합성 검증 알림'),
    '세션 삭제가 안전 이벤트 대상/기관까지 지워서는 안 됨';
end $$;
rollback;

-- 8) FK가 없던 시절의 불일치 분석이 있어도 공유 헬퍼 자체가 부모 소속을 확인한다.
begin;
alter table public.session_analyses drop constraint session_analyses_session_profile_org_fk;
do $$
declare
  own_profile uuid := (select id from public.profiles where name = 'C어르신');
  own_org uuid := (select org_id from public.profiles where id = own_profile);
  target record;
  sid uuid;
  aid uuid;
begin
  update public.profile_guardians set status = 'approved', revoked_at = null
    where profile_id = own_profile and guardian_user_id = '55555555-5555-5555-5555-555555555555';
  assert found, '정상 공유 대조군의 보호자 연결이 있어야 함';
  for target in select id, org_id from public.profiles where name in ('C어르신', 'A어르신', 'B어르신') loop
    insert into public.sessions(profile_id, org_id, status, ended_at)
      values (target.id, target.org_id, 'ended', now()) returning id into sid;
    insert into public.session_analyses(profile_id, org_id, session_id, analysis, version)
      values (own_profile, own_org, sid, '{"summary":"합성 검증"}', 'test') returning id into aid;
    insert into public.guardian_shares(profile_id, org_id, item_type, item_id)
      values (own_profile, own_org, 'analysis', aid);
    set role authenticated;
    perform set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
    assert app.is_session_shared_to_me(sid) = (target.id = own_profile),
      '실제 부모 세션이 공유 대상과 다르면 읽기 권한이 열려서는 안 됨';
    assert (select count(*) from public.sessions where id = sid) =
      case when target.id = own_profile then 1 else 0 end,
      '실제 SELECT 정책도 타 세션을 숨겨야 함';
    reset role;
    if target.id = own_profile then
      update public.sessions set status = 'active', ended_at = null where id = sid;
      set role authenticated;
      perform set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
      assert not app.is_session_shared_to_me(sid), '진행 중 세션은 분석이 있어도 공개하지 않음';
      reset role;
    end if;
  end loop;
end $$;
rollback;

-- R005: role/assignment/consent/status gates and all-or-nothing budget consumption.
begin;
do $$
declare
  uid uuid := '33333333-3333-3333-3333-333333333333';
  oid uuid;
  pid uuid;
  sid uuid;
  rejected boolean;
  test_case text;
begin
  select org_id into oid from public.users where id = uid;
  select id into pid from public.profiles where user_id = uid limit 1;
  perform set_config('test.uid', uid::text, true);
  delete from public.consents where profile_id = pid;
  insert into public.profile_caregivers (profile_id, org_id, caregiver_user_id, status)
    values (pid, oid, uid, 'active')
    on conflict (profile_id, caregiver_user_id) do update set status = 'active', removed_at = null;
  insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
    select pid, oid, uid, t::public.consent_type, true, 'v1.0', 'capable'
    from unnest(array['sensitive_health_voice','cross_border_transfer','ai_processing']) t;
  insert into public.sessions (profile_id, org_id, user_id, status)
    values (pid, oid, uid, 'active') returning id into sid;
  assert not has_function_privilege('anon', 'public.reserve_live_token(uuid)', 'EXECUTE');
  assert not has_table_privilege('authenticated', 'app.live_token_usage', 'UPDATE');
  assert not has_table_privilege('authenticated', 'app.live_token_limits', 'UPDATE');

  -- 파일럿 D4(20260924030000, 사용자 결정 2026-09-24): 배정은 더 이상 접근 게이트가 아니다 — 같은 기관 돌봄팀은
  -- 담당이 아니어도 대화를 진행한다. 그래서 'unassigned' 는 거부 목록에서 빠지고 아래에서 **허용**을 단언한다.
  foreach test_case in array array['guardian','foreign_org','ended','planned','revoked','version','missing_consent'] loop
    -- Use a subtransaction so each rejected scenario restores the same valid baseline.
    begin
      case test_case
        when 'guardian' then update public.users set role = 'guardian' where id = uid;
        when 'foreign_org' then update public.users set org_id = (select org_id from public.users where id = '22222222-2222-2222-2222-222222222222') where id = uid;
        when 'ended' then update public.sessions set status = 'ended', ended_at = now() where id = sid;
        when 'planned' then update public.sessions set status = 'planned' where id = sid;
        when 'revoked' then update public.consents set revoked_at = now() where profile_id = pid;
        when 'version' then update public.consents set version = 'v0.0' where profile_id = pid;
        when 'missing_consent' then delete from public.consents where profile_id = pid and consent_type = 'ai_processing';
      end case;
      rejected := false;
      set local role authenticated;
      begin
        perform public.reserve_live_token(sid);
      exception when insufficient_privilege then
        if sqlerrm not in ('LIVE_TOKEN_FORBIDDEN','LIVE_TOKEN_CONSENT_REQUIRED') then raise; end if;
        rejected := true;
      end;
      reset role;
      assert rejected, 'Live token scenario must be rejected: ' || test_case;
      raise exception 'restore_case' using errcode = 'ZX001';
    exception when sqlstate 'ZX001' then null;
    end;
  end loop;
  assert (select count(*) from app.live_token_usage) = 0, 'Denied requests must not consume quota';

  -- 배정 해제(담당 아님)여도 같은 기관 돌봄팀은 발급된다(파일럿 D4). 쿼터를 쓰므로 확인 뒤 비운다.
  update public.profile_caregivers set status = 'removed', removed_at = now() where profile_id = pid and caregiver_user_id = uid;
  set local role authenticated;
  assert public.reserve_live_token(sid), '담당이 아닌 같은 기관 돌봄팀도 대화 토큰을 받아야 함(파일럿 D4)';
  reset role;
  update public.profile_caregivers set status = 'active', removed_at = null where profile_id = pid and caregiver_user_id = uid;
  delete from app.live_token_usage;

  -- Exercise every cap independently; a later cap rejection must roll back earlier counters.
  foreach test_case in array array['user_minute','user_day','org_day','project_day'] loop
    delete from app.live_token_usage;
    update app.live_token_limits set user_minute=100, user_day=100, org_day=100, project_day=100;
    execute format('update app.live_token_limits set %I = 2', test_case);
    set local role authenticated;
    assert public.reserve_live_token(sid);
    assert public.reserve_live_token(sid);
    rejected := false;
    begin
      perform public.reserve_live_token(sid);
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'LIVE_TOKEN_LIMIT' then raise; end if;
      rejected := true;
    end;
    reset role;
    assert rejected, 'Cap must reject third call: ' || test_case;
    assert (select count(*) = 4 and bool_and(issued = 2) from app.live_token_usage),
      'Failed reservation must roll back every bucket';
  end loop;
end $$;
rollback;

begin;
do $$
declare sid uuid := gen_random_uuid(); proof text := repeat('a',43); result jsonb;
begin
  assert not has_function_privilege('anon','public.store_naver_mobile_handoff(uuid,text,text,text,timestamptz)','EXECUTE');
  assert not has_function_privilege('authenticated','public.consume_naver_mobile_handoff(uuid,text)','EXECUTE');
  assert has_function_privilege('service_role','public.consume_naver_mobile_handoff(uuid,text)','EXECUTE');
  assert not has_table_privilege('authenticated','app.naver_mobile_handoffs','SELECT');
  assert public.store_naver_mobile_handoff(sid,proof,'synthetic-code','synthetic-state',now()+interval '9 minutes');
  assert not public.store_naver_mobile_handoff(sid,proof,'replacement','replacement',now()+interval '9 minutes'), 'Callback replay must not overwrite original';
  assert public.consume_naver_mobile_handoff(sid,repeat('b',43)) is null, 'Wrong verifier must not consume';
  result := public.consume_naver_mobile_handoff(sid,proof);
  assert result = '{"code":"synthetic-code","state":"synthetic-state"}'::jsonb;
  assert public.consume_naver_mobile_handoff(sid,proof) is null, 'One-time redemption';
  assert (select auth_code is null and auth_state is null and consumed_at is not null from app.naver_mobile_handoffs where id=sid), 'Erase redeemed credentials, retain replay tombstone';
  assert not public.store_naver_mobile_handoff(sid,proof,'replacement','replacement',now()+interval '9 minutes'), 'Consumed ID must not be re-created';
  sid := gen_random_uuid();
  assert public.store_naver_mobile_handoff(sid,proof,'expired','expired',now()+interval '9 minutes');
  update app.naver_mobile_handoffs set expires_at=now()-interval '1 second' where id=sid;
  assert public.consume_naver_mobile_handoff(sid,proof) is null, 'Expired handoff must not redeem';
end $$;
rollback;

do $$ begin
  assert exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='users'
  ), 'Role/organization changes must reach mobile access subscribers';
  assert (select relrowsecurity from pg_class where oid='public.users'::regclass),
    'Realtime publication must retain users RLS';
end $$;

-- R010: a valid fixture succeeds; invalid consent cannot start or continue processing.
begin;
do $$
declare
  actor uuid := '33333333-3333-3333-3333-333333333333';
  pid uuid := (select id from public.profiles where name='C어르신');
  oid uuid := (select org_id from public.profiles where name='C어르신');
  sid uuid; planned uuid; scenario text; operation text; blocked boolean;
begin
  assert not has_function_privilege('anon','public.can_process_profile(uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','app.has_processing_consent(uuid)','EXECUTE');
  perform set_config('test.uid', actor::text, true);
  foreach scenario in array array['none','partial','revoked','old_version','future','other_profile','other_org','unknown_self','incomplete_proxy'] loop
    delete from public.consents where profile_id=pid;
    insert into public.consents(user_id,profile_id,org_id,consent_type,granted,version,capacity)
      select actor,pid,oid,t::public.consent_type,true,'v1.0','capable'
      from unnest(array['sensitive_health_voice','cross_border_transfer','ai_processing']) t;
    set role authenticated;
    assert public.can_process_profile(pid), 'Valid current self consent must allow processing';
    insert into public.sessions(profile_id,user_id,status) values(pid,actor,'active') returning id into sid;
    assert public.can_process_session(sid);
    insert into public.session_logs(profile_id,session_id,user_id,turn_index,role,content)
      values(pid,sid,actor,1,'user','synthetic consent test');
    reset role;
    case scenario
      when 'none' then delete from public.consents where profile_id=pid;
      when 'partial' then delete from public.consents where profile_id=pid and consent_type='ai_processing';
      when 'revoked' then update public.consents set granted=false,revoked_at=now() where profile_id=pid;
      when 'old_version' then update public.consents set version='v0.0' where profile_id=pid;
      when 'future' then update public.consents set granted_at=now()+interval '1 day' where profile_id=pid;
      when 'other_profile' then update public.consents set profile_id=(select id from public.profiles where name='A어르신') where profile_id=pid;
      when 'other_org' then update public.consents set org_id=(select org_id from public.profiles where name='B어르신') where profile_id=pid;
      when 'unknown_self' then update public.consents set capacity='unknown' where profile_id=pid;
      when 'incomplete_proxy' then update public.consents set subject_type='legal_representative',capacity='incapable',guardian_name='synthetic',guardian_relation=null where profile_id=pid;
    end case;
    assert (select status='ended' from public.sessions where id=sid), 'Invalidated consent must end active sessions';
    set role authenticated;
    assert not public.can_process_profile(pid), scenario;
    assert not public.can_process_session(sid), scenario;
    insert into public.sessions(profile_id,user_id,status) values(pid,actor,'planned') returning id into planned;
    foreach operation in array array['active','ended','activate','log','edit_log','analysis','token'] loop
      blocked := false;
      begin
        case operation
          when 'active' then insert into public.sessions(profile_id,user_id,status) values(pid,actor,'active');
          when 'ended' then insert into public.sessions(profile_id,user_id,status,ended_at) values(pid,actor,'ended',now());
          when 'activate' then update public.sessions set status='active' where id=planned;
          when 'log' then insert into public.session_logs(profile_id,session_id,user_id,turn_index,role,content) values(pid,sid,actor,2,'user','blocked');
          when 'edit_log' then update public.session_logs set content='blocked' where session_id=sid;
          when 'analysis' then insert into public.session_analyses(profile_id,session_id,user_id,analysis,version) values(pid,sid,actor,'{}','test');
          when 'token' then perform public.reserve_live_token(sid);
        end case;
      exception when insufficient_privilege then blocked := true;
      end;
      assert blocked, scenario || '/' || operation || ' must be rejected';
    end loop;
    -- End bookkeeping is safe and must remain possible after withdrawal.
    update public.sessions set ended_at=now() where id=sid;
    reset role;
  end loop;
end $$;
rollback;

select '✅ RLS·RBAC·테넌트 격리·동의·감사 회귀 테스트 전부 통과' as result;

-- R011: evidence edits are denied even if a deployment accidentally grants table UPDATE.
begin;
do $$
declare cid uuid; changed record; rejected boolean;
begin
  set role authenticated;
  perform set_config('test.uid','11111111-1111-1111-1111-111111111111',true);
  insert into public.consents(user_id,profile_id,consent_type,granted,version,capacity,granted_at,created_at)
    values(auth.uid(),(select id from public.profiles where name='A어르신'),'ai_processing',true,'v1.0','capable','2000-01-01','2000-01-01') returning id into cid;
  assert (select granted_at=statement_timestamp() and created_at=statement_timestamp() from public.consents where id=cid),
    'Consent collection timestamps must come from the server';
  rejected:=false;
  begin
    insert into public.consents(user_id,profile_id,consent_type,granted,version,capacity)
      values(auth.uid(),(select id from public.profiles where name='A어르신'),'ai_processing',true,'v0.0','capable');
  exception when data_exception then rejected:=sqlerrm='CURRENT_CONSENT_REQUIRED'; end;
  assert rejected,'A client must not record obsolete consent as a new collection';
  for changed in select * from (values
    ('version','v0.0'),('basis','rewritten'),('guardian_name','rewritten'),('voice_record_url','rewritten'),
    ('granted_at','2000-01-01'),('created_at','2000-01-01'),('capacity','unknown'),
    ('user_id','33333333-3333-3333-3333-333333333333'),('profile_id','ffffffff-ffff-ffff-ffff-ffffffffffff')
  ) p(field,value) loop
    rejected:=false;
    begin
      execute format('update public.consents set %I=%L where id=%L',changed.field,changed.value,cid);
    exception when insufficient_privilege then
      rejected := sqlerrm = 'CONSENT_EVIDENCE_IMMUTABLE';
    end;
    assert rejected, 'Consent evidence edit must fail in the guard: '||changed.field;
  end loop;
  update public.consents set granted=false,revoked_at='2000-01-01' where id=cid;
  assert (select not granted and revoked_at=statement_timestamp() from public.consents where id=cid), 'Withdrawal must use server time';
  rejected:=false;
  begin update public.consents set granted=true,revoked_at=null where id=cid;
  exception when insufficient_privilege then rejected:=sqlerrm='CONSENT_WITHDRAWAL_IMMUTABLE'; end;
  assert rejected,'Revoked evidence must not be resurrected';
  rejected:=false;
  begin update public.consents set revoked_at='2001-01-01' where id=cid;
  exception when insufficient_privilege then rejected:=sqlerrm='CONSENT_WITHDRAWAL_IMMUTABLE'; end;
  assert rejected,'Withdrawal time must not be rewritten';
  reset role;
end $$;
rollback;

-- Missing/old/incorrect account evidence must not create an organization or finish onboarding.
begin;
insert into auth.users(id,email,raw_user_meta_data) values('b0110011-1111-4111-8111-111111111111','r011@synthetic.invalid','{}');
do $$
declare candidate record; rejected boolean; before_orgs integer;
begin
  select count(*) into before_orgs from public.organizations;
  set role authenticated;
  perform set_config('test.uid','b0110011-1111-4111-8111-111111111111',true);
  for candidate in select * from (values
    (null::text[],'v1.0',true), (array[]::text[],'v1.0',true), (array['marketing_optional'],'v1.0',true),
    (array['privacy_required'],'v0.0',true), (array['privacy_required'],null,true),
    (array['privacy_required'],'v1.0',false), (array['privacy_required'],'v1.0',null),
    (array['privacy_required','ai_processing'],'v1.0',true), (array['privacy_required',null],'v1.0',true)
  ) p(consents,version,acknowledged) loop
    rejected:=false;
    begin
      perform public.complete_onboarding('Synthetic','010-0000-0000','caregiver','Synthetic',null,
        candidate.consents,candidate.version,candidate.acknowledged);
    exception when data_exception then rejected:=true; end;
    assert rejected,'Invalid onboarding evidence accepted';
  end loop;
  assert (select onboarded_at is null from public.users where id=auth.uid()), 'Rejected onboarding must be atomic';
  perform public.complete_onboarding('Synthetic','010-0000-0000','guardian',null,null,
    array['privacy_required','privacy_required'],'v1.0',true);
  assert (select org_id is null and onboarded_at is not null from public.users where id=auth.uid()),'Unlinked guardian onboarding failed';
  assert (select count(*)=1 from public.consents where user_id=auth.uid() and profile_id is null
    and org_id is null and consent_type='privacy_required' and version='v1.0' and granted), 'Org-less guardian evidence missing or duplicated';
  update public.consents set granted=false where user_id=auth.uid();
  assert (select bool_and(not granted and revoked_at is not null) from public.consents where user_id=auth.uid()),'Org-less account withdrawal failed';
  reset role;
  assert (select count(*) from public.organizations)=before_orgs,'Rejected onboarding created organizations';
end $$;
rollback;

-- R012: exercise every identity field with an UPDATE-capable caller.
-- Extra test policies deliberately make the guard, rather than an unrelated RLS
-- rejection, responsible for failure. They disappear on rollback.
begin;
set local test.role='service_role';
update public.users set is_site_admin=true where id='11111111-1111-1111-1111-111111111111';
set local test.role='authenticated';
set local test.uid='11111111-1111-1111-1111-111111111111';
insert into public.inquiry_replies(inquiry_id,author_id,content)
  select id,'11111111-1111-1111-1111-111111111111','R012 synthetic reply' from public.inquiries limit 1;
do $$
declare t text; field record; original jsonb; target uuid; own_org uuid;
  rejected boolean; replacement text; affected integer; checked integer:=0;
begin
  select org_id into own_org from public.users where id='11111111-1111-1111-1111-111111111111';
  foreach t in array array['profiles','chronicle_entries','sessions','session_logs','session_analyses',
    'safety_events','care_journals','journal_photos','guardian_shares','profile_caregivers',
    'profile_guardians','elder_codes','notifications','inquiries','inquiry_replies'] loop
    execute format('create policy r012_test_update on public.%I for update to authenticated using(true) with check(true)',t);
    execute format('create policy r012_test_select on public.%I for select to authenticated using(true)',t);
    if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||t) and attname='org_id') then
      execute format('select to_jsonb(r) from public.%I r where org_id=$1 limit 1',t) into original using own_org;
    else
      execute format('select to_jsonb(r) from public.%I r limit 1',t) into original;
    end if;
    assert original is not null,'R012 needs an actual fixture for '||t;
    target:=(original->>'id')::uuid;
    set role authenticated;
    perform set_config('test.uid','11111111-1111-1111-1111-111111111111',true);
    execute format('update public.%I set id=id where id=$1',t) using target;
    get diagnostics affected=row_count;
    assert affected=1,'Caller must be able to update original row: '||t;
    for field in select a.attname,pt.typname from pg_attribute a join pg_type pt on pt.oid=a.atttypid
      where a.attrelid=to_regclass('public.'||t) and a.attnum>0 and not a.attisdropped
      and a.attname=any(array['id','org_id','profile_id','session_id','user_id','author_id','journal_id',
        'item_id','item_type','shared_by','caregiver_user_id','guardian_user_id','inquiry_id','kind','source_id'])
      or (a.attrelid=to_regclass('public.'||t) and t='journal_photos' and a.attname='path') loop
      replacement := case field.typname
        when 'uuid' then 'ffffffff-ffff-4fff-8fff-ffffffffffff'
        when 'share_item_type' then case when original->>field.attname='journal' then 'analysis' else 'journal' end
        when 'notification_kind' then case when original->>field.attname='safety' then 'message' else 'safety' end
        else 'synthetic-reassigned-path' end;
      rejected:=false;
      begin
        execute format('update public.%I set %I=%L where id=$1',t,field.attname,replacement) using target;
      exception when insufficient_privilege then rejected:=sqlerrm='RECORD_IDENTITY_IMMUTABLE'; end;
      assert rejected,'Identity guard did not reject '||t||'.'||field.attname;
      checked:=checked+1;
    end loop;
    reset role;
  end loop;
  assert checked=62,'Unexpected identity column coverage';
end $$;
rollback;

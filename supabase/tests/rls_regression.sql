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
  '보호자H', '010-5555-6666', 'guardian', null, current_setting('test.elder_code'));
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
select public.complete_onboarding('요양보호사D', '010-6666-7777', 'caregiver', 'D요양원');
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

-- 기억온 — 어르신 요청으로 마무리 기록(T21.11, 20261004010000) 회귀
--
-- voice_lease.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a01 · 요양보호사 a02 · 보호자 a04)와 다른 기관 a05 를 쓴다.
-- 지키는 것:
--   ① 세션 시작자 본인만 기록 · 같은 기관 다른 직원·보호자·다른 기관·없는 세션은 ELDER_CLOSING_FORBIDDEN(구분 없음)
--   ② situation 은 rest_request·refusal 만 · detail 에는 situation 하나뿐(원문 없음)
--   ③ 세션당 한 번(두 번째는 false, 행 1개) · 종료된 세션은 거절
--   ④ 사용자는 여전히 session_interventions 에 직접 쓰지 못한다 · anon 은 RPC 실행 불가 · 돌봄팀은 기록을 읽는다

\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.expect_err(p_uid text, p_sql text, p_code text)
returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, true);
  begin
    execute p_sql;
    got := null;
  exception when others then got := sqlerrm;
  end;
  if got is distinct from p_code then
    raise exception '% (by %) 기대 %, 실제 %', p_sql, p_uid, coalesce(p_code, '성공'), coalesce(got, '성공');
  end if;
end $$;

set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
insert into public.profiles (user_id, name, birth_year) values ('a0000000-0000-0000-0000-000000000001', '마무리어르신', 1940);
insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
  select p.id, p.org_id, 'a0000000-0000-0000-0000-000000000001', t::public.consent_type, true, 'v1.0', 'capable'
    from public.profiles p
    cross join unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) t
   where p.name = '마무리어르신';
set test.uid = 'a0000000-0000-0000-0000-000000000002';
insert into public.sessions (profile_id, user_id, status)
  select id, auth.uid(), 'active' from public.profiles where name = '마무리어르신';
reset role;
set test.uid = '';
create temp table ec as
select (select s.id from public.sessions s join public.profiles p on p.id = s.profile_id where p.name = '마무리어르신') sid;
grant select on ec to authenticated;

-- ① 본인 외 거절(구분 없음)
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000001',
  format('select public.record_elder_closing(%L, %L)', (select sid from ec), 'rest_request'), 'ELDER_CLOSING_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000004',
  format('select public.record_elder_closing(%L, %L)', (select sid from ec), 'rest_request'), 'ELDER_CLOSING_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000005',
  format('select public.record_elder_closing(%L, %L)', (select sid from ec), 'rest_request'), 'ELDER_CLOSING_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.record_elder_closing(%L, %L)', gen_random_uuid(), 'rest_request'), 'ELDER_CLOSING_FORBIDDEN');
-- ② situation 제한
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.record_elder_closing(%L, %L)', (select sid from ec), 'crisis'), 'ELDER_CLOSING_SITUATION');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.record_elder_closing(%L, null)', (select sid from ec)), 'ELDER_CLOSING_SITUATION');

-- ③ 본인은 한 번 기록 · 두 번째는 false
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert public.record_elder_closing((select sid from ec), 'refusal') = true, '첫 기록 성공';
  assert public.record_elder_closing((select sid from ec), 'rest_request') = false, '세션당 한 번';
end $$;
-- ④ 돌봄팀(같은 기관 관리자)은 기록을 읽는다 — 감독 화면
set test.uid = 'a0000000-0000-0000-0000-000000000001';
do $$
begin
  assert (select count(*) from public.session_interventions where session_id = (select sid from ec) and action = 'elder_closing') = 1,
    '같은 기관 돌봄팀은 마무리 기록을 본다';
end $$;
reset role;
do $$
begin
  assert (select detail = '{"situation":"refusal"}'::jsonb and actor_id = 'a0000000-0000-0000-0000-000000000002'
            from public.session_interventions where session_id = (select sid from ec) and action = 'elder_closing'),
    'detail 은 situation 하나뿐 · 기록자는 세션 시작자';
  assert not has_function_privilege('anon', 'public.record_elder_closing(uuid, text)', 'execute'), 'anon 실행 불가';
end $$;
-- ④ 직접 INSERT 는 여전히 불가 — 새 종류라도. 운영의 1차 방어(INSERT 권한 회수, 20260924040000)는 이 하네스가 넓은 권한을 다시 줘서
--    여기서는 2차 방어(RLS — INSERT 정책 없음)로 확인한다.
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('set local role authenticated; insert into public.session_interventions (session_id, profile_id, org_id, actor_id, action) select id, profile_id, org_id, auth.uid(), %L from public.sessions where id = %L',
         'elder_closing', (select sid from ec)),
  'new row violates row-level security policy for table "session_interventions"');

-- ③ 종료된 세션은 거절
update public.sessions set status = 'ended', ended_at = now(), duration_seconds = 60 where id = (select sid from ec);
delete from public.session_interventions where session_id = (select sid from ec) and action = 'elder_closing';
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.record_elder_closing(%L, %L)', (select sid from ec), 'rest_request'), 'ELDER_CLOSING_FORBIDDEN');

\echo 'elder_closing: OK'

-- 기억온 — 세션 시작 무결성(T25.11 · T25.18 · T25.19, 20260929000000·010000) 회귀
--
-- safety_evidence.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a01 · 요양보호사 a02 · 직원 a03 · 보호자 a04)와
-- 다른 기관 사용자 a05 를 쓴다. 이 파일은 자기 어르신을 새로 만든다(앞 파일의 세션과 섞이지 않게).
-- 지키는 것:
--   T25.11 A 설계 / B 시작 → user_id=B · planned_by=A · 서버 시각 · B 의 단계 전환·tick 허용, A 불가 · 일지 진행자=B ·
--          같은 사람 재호출은 같은 값 · 다른 사람은 SESSION_ALREADY_STARTED · 권한·기관·없음은 구분 없이 SESSION_START_FORBIDDEN ·
--          동의 없음 PROCESSING_CONSENT_REQUIRED · 동시 4대 SESSION_SUPERVISOR_LIMIT · planned_by 는 사용자가 못 바꾼다
--   T25.18 실행 중 세션 시작 시각 = 서버 시각(보낸 값 무시·이후 변경 불가) · 구 직접 전환도 서버 시각 ·
--          recording = 과거 시각 보존 · 실행 불가(tick·live-token 거절) · ended 로만 · ended 전까지 일지 초안 없음
--   T25.19 어르신 1명당 실행 중 세션 1개(즉석+즉석·즉석+설계·설계+설계·일시정지 중) · 종료 뒤에는 다시 시작 가능

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

-- 어르신: E1~E4(처리 동의) · E0(동의 없음) · L1~L4(감독 한도 시험용, 동의)
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
insert into public.profiles (user_id, name, birth_year)
  select 'a0000000-0000-0000-0000-000000000001', n, 1942
    from unnest(array['시작어르신1','시작어르신2','시작어르신3','시작어르신4','시작어르신0','시작한도1','시작한도2','시작한도3','시작한도4']) n;
insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
  select p.id, p.org_id, 'a0000000-0000-0000-0000-000000000001', t::public.consent_type, true, 'v1.0', 'capable'
    from public.profiles p
    cross join unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) t
   where p.name like '시작%' and p.name <> '시작어르신0';
reset role;
set test.uid = '';
create temp table ss as
select (select id from public.profiles where name = '시작어르신1') e1, (select id from public.profiles where name = '시작어르신2') e2,
       (select id from public.profiles where name = '시작어르신3') e3, (select id from public.profiles where name = '시작어르신4') e4,
       (select id from public.profiles where name = '시작어르신0') e0,
       (select array_agg(id order by name) from public.profiles where name like '시작한도%') l;
grant select on ss to authenticated;

-- ── T25.11 ────────────────────────────────────────────────────────────────────
-- 관리자 A(a01)가 E1 을 설계(기기와 무관한 먼 과거 시각을 적어도 무시된다). planned_by 는 보낸 값이 아니라 본인.
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
create temp table ss_p1 as
with ins as (
  insert into public.sessions (profile_id, user_id, status, started_at, planned_by)
  values ((select e1 from ss), auth.uid(), 'planned', now() - interval '3 days', 'a0000000-0000-0000-0000-000000000003')
  returning id, planned_by)
select id as sid, planned_by from ins;
reset role;
do $$ begin
  assert (select planned_by from ss_p1) = 'a0000000-0000-0000-0000-000000000001', '설계자는 설계 행을 만든 본인(보낸 값 무시)';
end $$;
grant select on ss_p1 to authenticated;

-- 권한·기관·없음 → 구분 없이 SESSION_START_FORBIDDEN
set role authenticated;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000004', format('select public.start_planned_session(%L)', (select sid from ss_p1)), 'SESSION_START_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000005', format('select public.start_planned_session(%L)', (select sid from ss_p1)), 'SESSION_START_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002', format('select public.start_planned_session(%L)', gen_random_uuid()), 'SESSION_START_FORBIDDEN');

-- 교대 직원 B(a02)가 시작 → 진행자 B · 설계자 A · 서버 시각
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
create temp table ss_r1 as select public.start_planned_session((select sid from ss_p1)) as r;
reset role;
do $$ begin
  assert (select user_id = 'a0000000-0000-0000-0000-000000000002' and planned_by = 'a0000000-0000-0000-0000-000000000001'
                 and status = 'active' and abs(extract(epoch from started_at - now())) < 60
            from public.sessions where id = (select sid from ss_p1)), '진행자=B · 설계자=A · active · 서버 시각';
  assert ((select r from ss_r1)->>'started_at')::timestamptz = (select started_at from public.sessions where id = (select sid from ss_p1)),
    'RPC 가 돌려준 시작 시각 = 저장된 시각';
end $$;
grant select on ss_r1 to authenticated;

set role authenticated;
-- 같은 사람 재호출(응답 유실) = 같은 값으로 성공
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert public.start_planned_session((select sid from ss_p1)) = (select r from ss_r1), '재호출은 같은 값';
end $$;
-- 다른 사람 = SESSION_ALREADY_STARTED
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000003', format('select public.start_planned_session(%L)', (select sid from ss_p1)), 'SESSION_ALREADY_STARTED');
-- 중계 소유 경로: B 는 tick·단계 전환 가능, 설계자 A 는 단계 전환 불가
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (public.session_tick((select sid from ss_p1))->>'allowed')::boolean, 'B 의 tick 허용';
  assert public.advance_session_phase((select sid from ss_p1), 'reminiscence') = 'reminiscence', 'B 의 단계 전환';
end $$;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000001',
  format('select public.advance_session_phase(%L, %L)', (select sid from ss_p1), 'closing'), 'SESSION_PHASE_FORBIDDEN');
-- planned_by 는 사용자가 바꿀 수 없다
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('update public.sessions set planned_by = null where id = %L', (select sid from ss_p1)), 'RECORD_IDENTITY_IMMUTABLE');
-- 실행 중 세션의 시작 시각은 서버만 정한다
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('update public.sessions set started_at = now() - interval ''1 hour'' where id = %L', (select sid from ss_p1)), 'SESSION_STARTED_AT_SERVER_ONLY');
-- 종료 → 일지 진행자 = 실제 진행자 B
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now(), duration_seconds = 60 where id = (select sid from ss_p1);
reset role;
do $$ begin
  assert (select facilitator_user_id from public.program_journals where session_id = (select sid from ss_p1))
       = 'a0000000-0000-0000-0000-000000000002', '일지 진행자 = 실제 진행자';
end $$;

-- 동의 없음 → PROCESSING_CONSENT_REQUIRED (설계는 동의 없이도 된다)
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
create temp table ss_p0 as
with ins as (insert into public.sessions (profile_id, user_id, status) values ((select e0 from ss), auth.uid(), 'planned') returning id)
select id as sid from ins;
grant select on ss_p0 to authenticated;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002', format('select public.start_planned_session(%L)', (select sid from ss_p0)), 'PROCESSING_CONSENT_REQUIRED');

-- 동시 4대 → SESSION_SUPERVISOR_LIMIT (B 가 한도 어르신 4명과 진행 중)
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
insert into public.sessions (profile_id, user_id, status) select t.pid, auth.uid(), 'active' from unnest((select l from ss)) as t(pid);
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
create temp table ss_p2 as
with ins as (insert into public.sessions (profile_id, user_id, status) values ((select e2 from ss), auth.uid(), 'planned') returning id)
select id as sid from ins;
grant select on ss_p2 to authenticated;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002', format('select public.start_planned_session(%L)', (select sid from ss_p2)), 'SESSION_SUPERVISOR_LIMIT');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now() where user_id = auth.uid() and profile_id = any((select l from ss)::uuid[]) and status = 'active';
reset role;

-- ── T25.19 ────────────────────────────────────────────────────────────────────
set role authenticated;
-- 즉석 + 즉석(다른 직원 기기) → 두 번째 거절
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
insert into public.sessions (profile_id, user_id, status) values ((select e3 from ss), auth.uid(), 'active');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000003',
  format('insert into public.sessions (profile_id, user_id, status) values (%L, auth.uid(), %L)', (select e3 from ss), 'active'), 'ELDER_SESSION_ACTIVE');
-- 즉석 진행 중 + 설계 시작 → 거절
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
create temp table ss_p3 as
with ins as (insert into public.sessions (profile_id, user_id, status) values ((select e3 from ss), auth.uid(), 'planned') returning id)
select id as sid from ins;
grant select on ss_p3 to authenticated;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000003', format('select public.start_planned_session(%L)', (select sid from ss_p3)), 'ELDER_SESSION_ACTIVE');
-- 일시정지 중에도 거절(일시정지는 실행 중)
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
select public.request_session_control(
  (select id from public.sessions where profile_id = (select e3 from ss) and status = 'active'), 'pause');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000003', format('select public.start_planned_session(%L)', (select sid from ss_p3)), 'ELDER_SESSION_ACTIVE');
-- 종료 뒤에는 시작 가능
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now() where profile_id = (select e3 from ss) and status = 'active';
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000003', format('select public.start_planned_session(%L)', (select sid from ss_p3)), null);
-- 설계 + 설계(같은 어르신의 두 설계) → 두 번째 거절
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
create temp table ss_p4 as
with ins as (insert into public.sessions (profile_id, user_id, status) values ((select e3 from ss), auth.uid(), 'planned') returning id)
select id as sid from ins;
grant select on ss_p4 to authenticated;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002', format('select public.start_planned_session(%L)', (select sid from ss_p4)), 'ELDER_SESSION_ACTIVE');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
update public.sessions set status = 'ended', ended_at = now() where id = (select sid from ss_p3);
reset role;
do $$ begin
  assert exists (select 1 from pg_indexes where indexname = 'sessions_one_active_per_elder_idx'), '부분 유일 인덱스(최종 보장)';
end $$;

-- ── T25.18 ────────────────────────────────────────────────────────────────────
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
-- 즉석 세션: 기기 시계(2시간 전)를 보내도 서버 시각
create temp table ss_i as
with ins as (insert into public.sessions (profile_id, user_id, status, started_at)
             values ((select e4 from ss), auth.uid(), 'active', now() - interval '2 hours') returning id, started_at)
select id as sid, started_at from ins;
reset role;
do $$ begin
  assert abs(extract(epoch from (select started_at from ss_i) - now())) < 60, '즉석 세션 시작 시각 = 서버 시각';
end $$;
grant select on ss_i to authenticated;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now() where id = (select sid from ss_i);
-- 구 직접 전환(planned → active)도 서버 시각
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
create temp table ss_p5 as
with ins as (insert into public.sessions (profile_id, user_id, status, started_at) values ((select e4 from ss), auth.uid(), 'planned', now() + interval '1 day') returning id)
select id as sid from ins;
update public.sessions set status = 'active', started_at = now() - interval '5 hours' where id = (select sid from ss_p5);
reset role;
do $$ begin
  assert abs(extract(epoch from (select started_at from public.sessions where id = (select sid from ss_p5)) - now())) < 60,
    '직접 전환도 서버 시각';
end $$;
update public.sessions set status = 'ended', ended_at = now() where id = (select sid from ss_p5);

-- 종료 후 일괄 기록: recording 은 과거 시각 보존 · 실행 불가 · ended 로만 · ended 전까지 일지 없음
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
create temp table ss_rec as
with ins as (insert into public.sessions (profile_id, user_id, status, started_at)
             values ((select e4 from ss), auth.uid(), 'recording', now() - interval '3 hours') returning id, started_at)
select id as sid, started_at from ins;
reset role;
grant select on ss_rec to authenticated;
do $$ begin
  assert abs(extract(epoch from (select started_at from ss_rec) - (now() - interval '3 hours'))) < 60, 'recording 은 과거 시각 보존';
  assert not exists (select 1 from public.program_journals where session_id = (select sid from ss_rec)), '기록 중에는 일지 초안 없음';
  assert not exists (select 1 from public.journal_generation_jobs j join public.program_journals p on p.id = j.journal_id
                      where p.session_id = (select sid from ss_rec)), '기록 중에는 초안 작업 없음';
end $$;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert not (public.session_tick((select sid from ss_rec))->>'allowed')::boolean, 'recording 은 tick 거절';
end $$;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002', format('select public.reserve_live_token(%L)', (select sid from ss_rec)), 'LIVE_TOKEN_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('update public.sessions set status = %L where id = %L', 'active', (select sid from ss_rec)), 'SESSION_RECORDING_ONLY');
-- 기록 중인 어르신에게 새 세션을 시작하는 것은 막지 않는다(recording 은 실행 중이 아니다)
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
insert into public.sessions (profile_id, user_id, status) values ((select e4 from ss), auth.uid(), 'active');
update public.sessions set status = 'ended', ended_at = now() where profile_id = (select e4 from ss) and status = 'active';
-- 마지막에 ended → 그때 일지 1건
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.sessions set status = 'ended', ended_at = now(), duration_seconds = 120 where id = (select sid from ss_rec);
do $$ begin
  assert not (public.session_tick((select sid from ss_rec))->>'allowed')::boolean, 'ended 는 tick 거절';
end $$;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002', format('select public.reserve_live_token(%L)', (select sid from ss_rec)), 'LIVE_TOKEN_FORBIDDEN');
reset role;
do $$ begin
  assert (select count(*) from public.program_journals where session_id = (select sid from ss_rec)) = 1, 'ended 전환 뒤 일지 1건';
  assert (select started_at from public.sessions where id = (select sid from ss_rec)) = (select started_at from ss_rec), '종료해도 과거 시작 시각 유지';
end $$;

select 'session start assertions passed' as result;

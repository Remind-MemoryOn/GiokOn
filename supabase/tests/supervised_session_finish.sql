\set ON_ERROR_STOP on
begin;
-- Production privileges: public RPC must not require app schema USAGE.
revoke usage on schema app from authenticated;
create temp table sf as
select gen_random_uuid() sid, gen_random_uuid() planned_sid,
  (select id from public.profiles where org_id = u.org_id order by id limit 1) pid, u.org_id
from public.users u where id = 'a0000000-0000-0000-0000-000000000001';
grant select on sf to authenticated;
-- Fixture only: avoid unrelated active-session limits and consent state from prior suites.
set local session_replication_role = replica;
insert into public.sessions(id, profile_id, org_id, user_id, status, control_request)
select sid, pid, org_id, 'a0000000-0000-0000-0000-000000000002', 'active', 'end' from sf;
insert into public.sessions(id, profile_id, org_id, user_id, status)
select planned_sid, pid, org_id, 'a0000000-0000-0000-0000-000000000002', 'planned' from sf;
insert into public.session_logs(session_id, profile_id, org_id, user_id, turn_index, role, content)
select sid, pid, org_id, 'a0000000-0000-0000-0000-000000000002', 1, 'user', '저장된 발화' from sf;
delete from public.consents where profile_id = (select pid from sf);
set local session_replication_role = origin;

create function pg_temp.sf_error(p_uid text, p_sql text, expected text)
returns void language plpgsql as $$
declare actual text;
begin
  perform set_config('test.uid', p_uid, true);
  begin execute p_sql; exception when others then actual := sqlerrm; end;
  assert actual is not distinct from expected, 'expected ' || expected || ', got ' || coalesce(actual, 'success');
end $$;

set local role authenticated;
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000004',
  format('select public.finish_supervised_session(%L)', (select sid from sf)), 'SESSION_CONTROL_NOT_FOUND');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000005',
  format('select public.finish_supervised_session(%L)', (select sid from sf)), 'SESSION_CONTROL_NOT_FOUND');
select pg_temp.sf_error('',
  format('select public.finish_supervised_session(%L)', (select sid from sf)), 'SESSION_CONTROL_NOT_FOUND');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  format('select public.finish_supervised_session(%L)', (select planned_sid from sf)), 'SESSION_CONTROL_NOT_ACTIVE');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  'select public.finish_supervised_session(''00000000-0000-0000-0000-000000000000'')', 'SESSION_CONTROL_NOT_FOUND');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
select public.finish_supervised_session((select sid from sf));
select public.finish_supervised_session((select sid from sf));
reset role;
do $$ begin
  assert (select status = 'ended' and ended_at is not null and duration_seconds is null
    and control_request = 'end' from public.sessions where id = (select sid from sf)), 'immediate end without invented duration';
  assert (select count(*) = 1 from public.session_interventions where session_id = (select sid from sf)
    and actor_id = 'a0000000-0000-0000-0000-000000000002' and detail->>'source' = 'supervision_finalize'), 'one attributed audit';
  assert (select count(*) = 1 from public.program_journals where session_id = (select sid from sf)), 'automatic journal exactly once';
  assert not public.can_process_session((select sid from sf)), 'relay authorization revoked';
  assert not has_function_privilege('anon', 'public.finish_supervised_session(uuid)', 'execute'), 'anon denied';
  assert (select count(*) = 1 and min(content) = '저장된 발화' from public.session_logs
    where session_id = (select sid from sf)), 'stored transcript preserved without invention';
  assert not exists(select 1 from public.session_analyses where session_id = (select sid from sf)), 'no invented analyses';
end $$;
-- Keep the late-write guard independent of consent and normal RLS. Run as owner
-- with only the consent trigger disabled; its specific error must still reject.
alter table public.sessions disable trigger require_session_processing_consent;
alter table public.session_logs disable trigger require_log_processing_consent;
alter table public.session_analyses disable trigger require_analysis_processing_consent;
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  format('update public.sessions set status = ''active'', ended_at = null where id = %L', (select sid from sf)), 'SESSION_SUPERVISED_FINISHED');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  format('update public.sessions set duration_seconds = 25 where id = %L', (select sid from sf)), 'SESSION_SUPERVISED_FINISHED');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  format('insert into public.session_logs(session_id,profile_id,org_id,user_id,turn_index,role,content) select sid,pid,org_id,''a0000000-0000-0000-0000-000000000002'',1,''user'',''late'' from sf'), 'SESSION_SUPERVISED_FINISHED');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  'insert into public.session_analyses(session_id,profile_id,org_id,user_id,analysis,version) select sid,pid,org_id,''a0000000-0000-0000-0000-000000000002'',''{}'',''test'' from sf', 'SESSION_SUPERVISED_FINISHED');
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  'update public.session_logs set content = ''late overwrite'' where session_id = (select sid from sf)', 'SESSION_SUPERVISED_FINISHED');
-- 2026-10-28 장애 회귀: 감독 종료되지 않은 세션의 일반 UPDATE 는 막지 않는다
-- (트리거가 sessions 행에서 없는 session_id 칸을 읽어 모든 UPDATE·대화 시작이 실패했다).
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  format('update public.sessions set updated_at = now() where id = %L', (select planned_sid from sf)), null);
select pg_temp.sf_error('a0000000-0000-0000-0000-000000000002',
  format('insert into public.session_logs(session_id,profile_id,org_id,user_id,turn_index,role,content) select planned_sid,pid,org_id,''a0000000-0000-0000-0000-000000000002'',1,''user'',''정상'' from sf'), null);
-- 로그인 사용자가 없는 서버 경로(운영자 SQL·워커·FK set null 연쇄)는 감독 종료 세션도 막지 않는다.
select pg_temp.sf_error('',
  format('update public.sessions set updated_at = now() where id = %L', (select sid from sf)), null);
-- Ordinary deletion still works for retention/erasure flows (this is not a final journal).
delete from public.session_logs where session_id = (select sid from sf);
do $$ begin
  assert not exists(select 1 from public.session_logs where session_id = (select sid from sf)), 'erasure remains available';
end $$;
rollback;

-- Isolated PG16 only, after migrations + _supabase_shims.sql + _grants.sql.
-- Public requests and persisted outcomes, no catalog/body/coverage inspection.
\set ON_ERROR_STOP on
begin;
set client_min_messages = warning;
create temp table uc_results(id text, steps int, result text);
create temp table uc_context(pid uuid, sid uuid, jid uuid, share_id uuid);
grant select,insert,update on uc_context to authenticated;

insert into auth.users(id,email,raw_user_meta_data)
select ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'usecase' || n || '@example.invalid', jsonb_build_object('name','UC actor ' || n)
from generate_series(1,6) n;
set role authenticated;
set test.uid = '30000000-0000-4000-8000-000000000001';
select public.complete_onboarding('UC admin','010-0000-0001','caregiver',null,null,array['privacy_required'],'v1.0',true,public.test_admin_code('UC institution A'));
set test.uid = '30000000-0000-4000-8000-000000000005';
select public.complete_onboarding('UC other admin','010-0000-0005','caregiver',null,null,array['privacy_required'],'v1.0',true,public.test_admin_code('UC institution B'));
reset role;
-- Established employees and guardian are preconditions, not onboarding results.
update public.users set org_id=(select org_id from public.users where id='30000000-0000-4000-8000-000000000001'),
  role=case right(id::text,1) when '2' then 'caregiver'::public.org_role when '3' then 'social_worker'::public.org_role else 'guardian'::public.org_role end,
  onboarded_at=now()
where id in ('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004');
set role authenticated;
set test.uid = '30000000-0000-4000-8000-000000000001';
with p as (insert into public.profiles(user_id,name,birth_year) values(auth.uid(),'UC synthetic elder',1940) returning id)
insert into uc_context(pid) select id from p;
reset role;
-- Match production schema privileges for every user journey.
revoke usage on schema app from authenticated;

-- UC-D01: invite -> pending/no records -> manager approval -> coworker visibility.
do $$
declare inv public.org_invites; req uuid; pid uuid := (select c.pid from uc_context c); foreign_count int;
begin
  set role authenticated;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  inv := public.create_org_invite('caregiver',7);
  perform set_config('test.uid','30000000-0000-4000-8000-000000000006',true);
  perform public.complete_onboarding('UC newcomer','010-0000-0006','caregiver',null,null,array['privacy_required'],'v1.0',true,inv.code);
  assert (select org_id is null from public.users where id=auth.uid()), 'Newcomer must remain outside org';
  assert (select count(*) from public.profiles)=0, 'Pending newcomer must see no records';
  select id into req from public.org_join_requests where user_id=auth.uid() and status='pending';
  assert req is not null, 'Pending request must exist';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  perform public.approve_org_join(req);
  perform set_config('test.uid','30000000-0000-4000-8000-000000000006',true);
  assert (select count(*) from public.profiles where id=pid)=1, 'Approved employee must see coworker record';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000005',true);
  select count(*) into foreign_count from public.profiles where id=pid;
  assert foreign_count=0, 'Other institution stays isolated';
  reset role;
  insert into uc_results values('UC-D01',6,'PASS');
end $$;

-- UC-D02: consent -> planned/start -> pause/resume/end -> automatic blank draft
-- -> caregiver review -> social-worker finalization -> publish/read/revoke.
do $$
<<lifecycle>>
declare pid uuid := (select c.pid from uc_context c); sid uuid; jid uuid; shid uuid; blocked text; t jsonb; elder_code text;
begin
  set role authenticated;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  insert into public.sessions(profile_id,user_id,status,title,duration_minutes)
    values(pid,auth.uid(),'planned','UC reminiscence',5) returning id into sid;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000002',true);
  blocked:=null;
  begin perform public.start_planned_session(sid); exception when others then blocked:=sqlerrm; end;
  assert blocked='PROCESSING_CONSENT_REQUIRED', 'No consent must block start: ' || coalesce(blocked,'accepted');
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  insert into public.consents(profile_id,org_id,user_id,consent_type,granted,version,capacity)
    select pid,org_id,auth.uid(),c::public.consent_type,true,public.current_consent_version(),'capable'
    from public.users cross join unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) c where id=auth.uid();
  perform set_config('test.uid','30000000-0000-4000-8000-000000000002',true);
  perform public.start_planned_session(sid);
  assert (select status='active' and user_id=auth.uid() from public.sessions where id=sid), 'Actual facilitator must own started session';
  perform public.advance_session_phase(sid,'intro');
  perform public.advance_session_phase(sid,'reminiscence');
  perform set_config('test.uid','30000000-0000-4000-8000-000000000003',true);
  perform public.request_session_control(sid,'pause','UC break');
  perform set_config('test.uid','30000000-0000-4000-8000-000000000002',true);
  t:=public.session_tick(sid);
  assert (t->>'paused')::boolean, 'Relay tick must observe pause';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000003',true);
  perform public.request_session_control(sid,'resume');
  perform public.request_session_control(sid,'end');
  perform set_config('test.uid','30000000-0000-4000-8000-000000000002',true);
  assert (public.session_tick(sid)->>'end_requested')::boolean, 'Relay tick must observe end request';
  update public.sessions set status='ended',ended_at=now(),duration_seconds=60 where id=sid;
  select id into jid from public.program_journals where session_id=sid;
  assert jid is not null, 'Ending session must create journal without a button';
  assert (select status='pending_review' and facilitator_user_id=auth.uid() from public.program_journals where id=jid), 'AI-off org must have blank review draft and actual facilitator';
  update public.program_journals set activity_content='INTERNAL: reminiscence observation',guardian_text='PUBLIC: hometown story' where id=jid;
  blocked:=null;
  begin update public.program_journals set status='final' where id=jid; exception when others then blocked:=sqlerrm; end;
  assert blocked='JOURNAL_FINALIZE_FORBIDDEN', 'Undelegated caregiver cannot finalize';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000003',true);
  update public.program_journals set status='final' where id=jid;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  blocked:=null;
  begin insert into public.guardian_shares(profile_id,item_type,item_id) values(pid,'journal',jid); exception when others then blocked:=sqlerrm; end;
  assert blocked='SHARE_JOURNAL_NOT_READY', 'Final alone must not publish unapproved guardian text';
  update public.program_journals set guardian_text_approved_at=now() where id=jid;
  select code into elder_code from public.elder_codes where profile_id=pid;
  assert elder_code is not null, 'Owner must have an elder connection code';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000004',true);
  perform public.link_guardian_by_elder_code(elder_code);
  assert (select count(*) from public.profiles where id=pid)=0, 'Guardian request alone must not grant access';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  update public.profile_guardians set status='approved',approved_by=auth.uid(),approved_at=now()
    where profile_id=pid and guardian_user_id='30000000-0000-4000-8000-000000000004';
  insert into public.guardian_shares(profile_id,item_type,item_id) values(pid,'journal',jid) returning id into shid;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000004',true);
  assert (select guardian_text from public.get_my_shared_journals() where id=jid)='PUBLIC: hometown story', 'Guardian receives approved public wording';
  assert (select count(*) from public.program_journals where id=jid)=0, 'Guardian must not read internal form';
  perform public.mark_share_viewed(shid);
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  assert (select viewed_at is not null and viewed_by='30000000-0000-4000-8000-000000000004' from public.guardian_shares where id=shid), 'Reading must persist guardian receipt';
  update public.guardian_shares set revoked_at=now(),revoked_by=auth.uid() where id=shid;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000004',true);
  assert (select count(*) from public.get_my_shared_journals() where id=jid)=0, 'Revoked journal must be closed to guardian';
  reset role;
  update uc_context set sid=lifecycle.sid,jid=lifecycle.jid,share_id=shid;
  insert into uc_results values('UC-D02',16,'PASS');
end $$;

-- UC-D03: finalized record correction without/with reason -> durable history.
do $$
declare jid uuid := (select c.jid from uc_context c); blocked text;
begin
  set role authenticated;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000003',true);
  blocked:=null;
  begin update public.program_journals set location='UC corrected room' where id=jid; exception when others then blocked:=sqlerrm; end;
  assert blocked='JOURNAL_EDIT_REASON_REQUIRED', 'Correction without reason must be rejected';
  update public.program_journals set location='UC corrected room',edit_reason='UC room correction' where id=jid;
  assert (select status='final' and location='UC corrected room' from public.program_journals where id=jid), 'Correction must keep record final';
  assert exists(select 1 from public.program_journal_revisions where journal_id=jid and reason='UC room correction' and changed_by=auth.uid()), 'Actor and correction reason must survive';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  blocked:=null;
  begin delete from public.profiles where id=(select pid from uc_context); exception when others then blocked:=sqlerrm; end;
  assert blocked='JOURNAL_FINAL_DELETE_FORBIDDEN', 'Authorized owner deletion must return final-record retention error: ' || coalesce(blocked,'accepted');
  assert (select count(*) from public.program_journals where id=jid)=1, 'Upper-level deletion must not erase final record';
  reset role;
  insert into uc_results values('UC-D03',4,'PASS');
end $$;

-- UC-D04: a new session runs -> consent withdrawal -> relay permission revoked.
do $$
declare pid uuid := (select c.pid from uc_context c); sid uuid; blocked text;
begin
  set role authenticated;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000002',true);
  insert into public.sessions(profile_id,user_id,status) values(pid,auth.uid(),'active') returning id into sid;
  assert (public.session_tick(sid)->>'allowed')::boolean, 'Consent must permit running session';
  perform set_config('test.uid','30000000-0000-4000-8000-000000000001',true);
  update public.consents set revoked_at=now() where profile_id=pid and consent_type='ai_processing' and revoked_at is null;
  perform set_config('test.uid','30000000-0000-4000-8000-000000000002',true);
  assert not (public.session_tick(sid)->>'allowed')::boolean, 'Permission poll must reject after withdrawal';
  blocked:=null;
  begin perform public.reserve_live_token(sid); exception when others then blocked:=sqlerrm; end;
  assert blocked='LIVE_TOKEN_FORBIDDEN', 'Fresh token must be denied after withdrawal: ' || coalesce(blocked,'accepted');
  reset role;
  insert into uc_results values('UC-D04',4,'PASS');
end $$;

select * from uc_results order by id;
select count(*)=4 and bool_and(result='PASS') as all_usecases_passed from uc_results;
rollback;

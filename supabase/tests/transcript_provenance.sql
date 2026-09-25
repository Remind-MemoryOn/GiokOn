-- Run only on an isolated database initialized with repository migrations/shims.
\set ON_ERROR_STOP on
begin;
do $$ begin
  assert to_regprocedure('public.transcript_storage_version()') is not null,
    'Transcript storage capability must exist';
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('91919191-9191-4191-8191-919191919191','provenance@example.invalid','{}');
set local role authenticated;
set local test.uid='91919191-9191-4191-8191-919191919191';
select public.complete_onboarding('Test','010-1234-5678','caregiver', null, null, array['privacy_required'], 'v1.0', true, public.test_admin_code('Test'));
do $$
declare pid uuid; sid uuid; lid uuid; saved jsonb; retried jsonb; history jsonb; rejected boolean;
begin
  assert public.transcript_storage_version()=1;
  insert into public.profiles(user_id,name,birth_year) values(auth.uid(),'Synthetic',1940) returning id into pid;
  insert into public.consents(user_id,profile_id,consent_type,granted,version,capacity)
    select auth.uid(),pid,k::public.consent_type,true,'v1.0','capable'
    from unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) k;
  insert into public.sessions(user_id,profile_id,status) values(auth.uid(),pid,'active') returning id into sid;
  -- Existing clients stay unknown.
  insert into public.session_logs(user_id,profile_id,session_id,turn_index,role,content)
    values(auth.uid(),pid,sid,1,'user','Legacy') returning id into lid;
  assert (select transcript_provenance is null from public.session_logs where id=lid);
  insert into public.session_logs(user_id,profile_id,session_id,turn_index,role,content,transcript_provenance)
    values(auth.uid(),pid,sid,2,'user','Raw', '{"version":1,"kind":"automatic","presentedText":"Raw","inputSource":"gemini_live"}') returning id into lid;
  assert (select not (transcript_provenance ? 'confirmedBy') from public.session_logs where id=lid);
  update public.session_logs set content='Corrected',original_content='Raw',transcript_provenance=
    '{"version":1,"kind":"caregiver_confirmed","presentedText":"Raw","inputSource":"gemini_live","confirmedBy":"fake","confirmedAt":"1900-01-01"}' where id=lid
    returning transcript_provenance,transcript_revisions into saved,history;
  assert saved->>'confirmedBy'=auth.uid()::text;
  assert (saved->>'confirmedAt')::timestamptz>=transaction_timestamp();
  assert jsonb_array_length(history)=1 and history->0->>'content'='Raw';
  assert history->0->'provenance'->>'kind'='automatic';
  -- Upsert retries must not change confirmation time or create another revision.
  insert into public.session_logs(user_id,profile_id,session_id,turn_index,role,content,original_content,transcript_provenance)
    values(auth.uid(),pid,sid,2,'user','Corrected','Raw','{"version":1,"kind":"caregiver_confirmed","presentedText":"Raw","inputSource":"gemini_live"}')
    on conflict(session_id,turn_index) do update set content=excluded.content,original_content=excluded.original_content,transcript_provenance=excluded.transcript_provenance
    returning transcript_provenance,transcript_revisions into retried,history;
  assert retried=saved and jsonb_array_length(history)=1;
  -- Legacy no-op updates cannot erase evidence.
  update public.session_logs set transcript_provenance=null,transcript_revisions='[]' where id=lid;
  assert (select transcript_provenance=saved and jsonb_array_length(transcript_revisions)=1 from public.session_logs where id=lid);
  rejected:=false;
  begin
    update public.session_logs set content='Unattributed change',transcript_provenance=null where id=lid;
  exception when check_violation then rejected:=true; end;
  assert rejected,'Known source must not silently disappear';
  rejected:=false;
  begin
    update public.session_logs set role='ai' where id=lid;
  exception when check_violation then rejected:=true; end;
  assert rejected,'Transcript confirmation applies only to elder input';
  rejected:=false;
  begin
    update public.session_logs set transcript_provenance='{"version":2,"kind":"automatic"}' where id=lid;
  exception when check_violation then rejected:=true; end;
  assert rejected,'Unknown contracts must fail';
end $$;
rollback;
\echo transcript provenance assertions passed

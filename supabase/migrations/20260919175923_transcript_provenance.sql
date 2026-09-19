begin;
alter table public.session_logs
  add column transcript_provenance jsonb,
  add column transcript_revisions jsonb not null default '[]'::jsonb;

-- Functional storage contract. Existing RLS/processing/identity checks stay active.
create function app.stamp_transcript_provenance() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p jsonb; old_input jsonb; changed boolean;
begin
  p:=new.transcript_provenance;
  if tg_op='UPDATE' and p is null and old.transcript_provenance is not null then
    if new.content is distinct from old.content or new.original_content is distinct from old.original_content then
      raise exception 'TRANSCRIPT_SOURCE_REQUIRED' using errcode='23514';
    end if;
    p:=old.transcript_provenance;
  end if;
  if p is not null then
    if new.role<>'user' or jsonb_typeof(p)<>'object' or
      p->'version' is distinct from '1'::jsonb or
      coalesce(p->>'kind','') not in ('automatic','caregiver_confirmed') or
      not (p ? 'presentedText') or
      (jsonb_typeof(p->'presentedText') not in ('string','null')) or
      (p->>'kind'='automatic' and (jsonb_typeof(p->'presentedText')<>'string' or length(btrim(p->>'presentedText'))=0)) or
      length(coalesce(p->>'presentedText',''))>5000 or
      coalesce(p->>'inputSource','') not in ('gemini_live','manual','unknown') or
      (p - array['version','kind','presentedText','inputSource','confirmedBy','confirmedAt'])<>'{}'::jsonb then
      raise exception 'INVALID_TRANSCRIPT_PROVENANCE' using errcode='23514';
    end if;
    p:=p-array['confirmedBy','confirmedAt'];
    if auth.uid() is null then raise exception 'TRANSCRIPT_ACTOR_REQUIRED' using errcode='42501'; end if;
    if p->>'kind'='caregiver_confirmed' then
      if tg_op='UPDATE' then old_input:=old.transcript_provenance-array['confirmedBy','confirmedAt']; end if;
      if tg_op='UPDATE' and p=old_input and new.content=old.content and new.original_content is not distinct from old.original_content then
        p:=old.transcript_provenance;
      else
        p:=p || jsonb_build_object('confirmedBy',auth.uid(),'confirmedAt',statement_timestamp());
      end if;
    end if;
  end if;
  new.transcript_provenance:=p;
  if tg_op='INSERT' then
    new.transcript_revisions:='[]'::jsonb;
  else
    new.transcript_revisions:=old.transcript_revisions;
    changed:=new.content is distinct from old.content or new.original_content is distinct from old.original_content or p is distinct from old.transcript_provenance;
    if changed and (p is not null or old.transcript_provenance is not null) then
      if jsonb_array_length(old.transcript_revisions)>=100 then raise exception 'TRANSCRIPT_REVISION_LIMIT' using errcode='23514'; end if;
      new.transcript_revisions:=old.transcript_revisions || jsonb_build_array(jsonb_build_object(
        'content',old.content,'originalContent',old.original_content,'provenance',old.transcript_provenance,
        'changedBy',auth.uid(),'changedAt',statement_timestamp()));
    end if;
  end if;
  return new;
end $$;
revoke all on function app.stamp_transcript_provenance() from public, anon, authenticated;
create trigger stamp_transcript_provenance before insert or update on public.session_logs
  for each row execute function app.stamp_transcript_provenance();

create function public.transcript_storage_version() returns integer
language sql stable security invoker set search_path='' as $$ select 1 $$;
revoke all on function public.transcript_storage_version() from public, anon;
grant execute on function public.transcript_storage_version() to authenticated;
comment on column public.session_logs.transcript_provenance is
 'v1 adoption metadata. Source is reported, not independently verified. Confirmation actor/time stamped by server; NULL means legacy unknown.';
comment on column public.session_logs.transcript_revisions is
 'Prior text and provenance snapshots on correction, server maintained. Maximum 100 revisions; follows session log retention.';
commit;

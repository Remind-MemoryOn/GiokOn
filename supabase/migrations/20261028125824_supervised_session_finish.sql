begin;

-- Separate from the normal device end request: crashed devices cannot acknowledge it.
create function public.finish_supervised_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if auth.uid() is null or s.id is null or s.org_id is distinct from app.current_org_id()
     or not app.is_care_team() then
    raise exception 'SESSION_CONTROL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if s.status = 'ended' then return; end if;
  if s.status <> 'active' then
    raise exception 'SESSION_CONTROL_NOT_ACTIVE' using errcode = '22023';
  end if;
  -- Do not invent activity duration from time spent abandoned. Preserve stored fields,
  -- including supervision metadata, so closing remains possible after consent withdrawal.
  update public.sessions set status = 'ended', ended_at = statement_timestamp(), updated_at = now()
    where id = s.id;
  insert into public.session_interventions(session_id, profile_id, org_id, actor_id, action, detail)
    values (s.id, s.profile_id, s.org_id, auth.uid(), 'end', '{"source":"supervision_finalize"}');
end $$;
revoke all on function public.finish_supervised_session(uuid) from public, anon;
grant execute on function public.finish_supervised_session(uuid) to authenticated;

-- The device may reconnect and try saving its stale buffer. Serialize child writes
-- with the same session row and freeze only explicitly supervisor-finished records.
-- Safety event persistence is intentionally independent and remains available.
create function app.protect_supervised_session_finish()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid uuid;
begin
  if tg_table_name = 'sessions' then
    sid := old.id;
  else
    sid := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    perform 1 from public.sessions where id = sid for update;
  end if;
  if exists (select 1 from public.session_interventions
    where session_id = sid and action = 'end' and detail->>'source' = 'supervision_finalize') then
    raise exception 'SESSION_SUPERVISED_FINISHED' using errcode = '42501';
  end if;
  -- Moving an existing child away cannot evade the original session's freeze.
  if tg_table_name <> 'sessions' and tg_op = 'UPDATE' and old.session_id is distinct from new.session_id then
    perform 1 from public.sessions where id = old.session_id for update;
    if exists (select 1 from public.session_interventions
      where session_id = old.session_id and action = 'end' and detail->>'source' = 'supervision_finalize') then
      raise exception 'SESSION_SUPERVISED_FINISHED' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app.protect_supervised_session_finish() from public, anon, authenticated;
create trigger sessions_supervised_finish before update on public.sessions
  for each row execute function app.protect_supervised_session_finish();
create trigger session_logs_supervised_finish before insert or update on public.session_logs
  for each row execute function app.protect_supervised_session_finish();
create trigger session_analyses_supervised_finish before insert or update on public.session_analyses
  for each row execute function app.protect_supervised_session_finish();

commit;

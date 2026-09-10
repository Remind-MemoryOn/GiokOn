-- R010: processing consent is a database invariant, not just a route check.
begin;

create function app.has_processing_consent(p_profile_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists(select 1 from public.profiles where id = p_profile_id)
    and not exists (
      select 1 from unnest(array['sensitive_health_voice','cross_border_transfer','ai_processing']) required(kind)
      where not exists (
        select 1 from public.consents c join public.profiles p on p.id = c.profile_id
        where c.profile_id = p_profile_id and c.org_id = p.org_id
          and c.consent_type::text = required.kind and c.version = 'v1.0'
          and c.granted and c.revoked_at is null and c.granted_at <= statement_timestamp()
          and (
            (c.subject_type = 'self' and c.capacity = 'capable')
            or (c.subject_type = 'legal_representative' and c.capacity in ('incapable','limited')
              and nullif(btrim(c.guardian_name),'') is not null
              and nullif(btrim(c.guardian_relation),'') is not null)
            or (c.subject_type = 'guardian' and c.capacity = 'unknown'
              and nullif(btrim(c.guardian_name),'') is not null
              and nullif(btrim(c.guardian_relation),'') is not null
              and nullif(btrim(c.basis),'') is not null)
          )
      )
    );
$$;
revoke all on function app.has_processing_consent(uuid) from public, anon, authenticated;

create function public.can_process_profile(p_profile_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u join public.profiles p on p.org_id = u.org_id
    where u.id = auth.uid() and u.onboarded_at is not null and p.id = p_profile_id
      and u.role in ('caregiver','org_admin')
      and (u.role = 'org_admin' or exists (
        select 1 from public.profile_caregivers pc
        where pc.profile_id = p.id and pc.org_id = p.org_id
          and pc.caregiver_user_id = u.id and pc.status = 'active'
      ))
  ) and app.has_processing_consent(p_profile_id);
$$;
revoke all on function public.can_process_profile(uuid) from public, anon;
grant execute on function public.can_process_profile(uuid) to authenticated;

create function public.can_process_session(p_session_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select coalesce((select s.status = 'active' and public.can_process_profile(s.profile_id)
    from public.sessions s where s.id = p_session_id), false);
$$;
revoke all on function public.can_process_session(uuid) from public, anon;
grant execute on function public.can_process_session(uuid) to authenticated;

-- Serialize processing checks with consent edits for the same elder. PostgREST
-- uses READ COMMITTED; volatile checks see the completed edit after waiting.
create function app.require_processing_consent()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'sessions' then
    if new.status = 'planned' then return new; end if;
    -- Closing a session remains possible after withdrawal; no conversation fields
    -- may be changed through this exception.
    if tg_op = 'UPDATE' and new.status = 'ended'
      and (to_jsonb(new) - array['status','ended_at','duration_seconds','updated_at'])
        = (to_jsonb(old) - array['status','ended_at','duration_seconds','updated_at']) then
      return new;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 1010));
  if not app.has_processing_consent(new.profile_id) then
    raise exception 'PROCESSING_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.require_processing_consent() from public, anon, authenticated;

create trigger require_session_processing_consent before insert or update on public.sessions
  for each row execute function app.require_processing_consent();
create trigger require_log_processing_consent before insert or update on public.session_logs
  for each row execute function app.require_processing_consent();
create trigger require_analysis_processing_consent before insert or update on public.session_analyses
  for each row execute function app.require_processing_consent();

create function app.lock_processing_consent()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare pid uuid;
begin
  for pid in select distinct id from unnest(array[
    case when tg_op <> 'INSERT' then old.profile_id end,
    case when tg_op <> 'DELETE' then new.profile_id end
  ]) id where id is not null order by id loop
    perform pg_advisory_xact_lock(hashtextextended(pid::text, 1010));
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app.lock_processing_consent() from public, anon, authenticated;
create trigger lock_processing_consent before insert or update or delete on public.consents
  for each row execute function app.lock_processing_consent();

create function app.stop_unconsented_sessions()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare pid uuid;
begin
  for pid in select distinct id from unnest(array[
    case when tg_op <> 'INSERT' then old.profile_id end,
    case when tg_op <> 'DELETE' then new.profile_id end
  ]) id where id is not null loop
    if not app.has_processing_consent(pid) then
      update public.sessions set status = 'ended', ended_at = statement_timestamp()
        where profile_id = pid and status = 'active';
    end if;
  end loop;
  return null;
end $$;
revoke all on function app.stop_unconsented_sessions() from public, anon, authenticated;
create trigger stop_unconsented_sessions after insert or update or delete on public.consents
  for each row execute function app.stop_unconsented_sessions();

-- Do not invent missing consent metadata. Stop existing unconsented sessions.
update public.sessions set status = 'ended', ended_at = statement_timestamp()
  where status = 'active' and not app.has_processing_consent(profile_id);

create or replace function public.reserve_live_token(p_session_id uuid)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare
  actor public.users%rowtype;
  target public.sessions%rowtype;
  limits app.live_token_limits%rowtype;
  bucket record;
  stamp timestamptz := statement_timestamp();
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.onboarded_at is null or actor.org_id is null
     or actor.role not in ('caregiver', 'org_admin') then
    raise exception 'LIVE_TOKEN_FORBIDDEN' using errcode = '42501';
  end if;
  select * into target from public.sessions where id = p_session_id;
  if target.id is null or target.org_id <> actor.org_id or target.status <> 'active'
     or not exists (select 1 from public.profiles p
       where p.id = target.profile_id and p.org_id = actor.org_id)
     or (actor.role <> 'org_admin' and not exists (
       select 1 from public.profile_caregivers pc
       where pc.profile_id = target.profile_id and pc.org_id = actor.org_id
         and pc.caregiver_user_id = actor.id and pc.status = 'active'
     )) then
    raise exception 'LIVE_TOKEN_FORBIDDEN' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.profile_id::text, 1010));
  if not exists(select 1 from public.sessions where id = target.id and status = 'active')
    or not app.has_processing_consent(target.profile_id) then
    raise exception 'LIVE_TOKEN_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  select * into strict limits from app.live_token_limits where singleton;
  -- Every caller locks in this same order. ON CONFLICT's conditional increment is
  -- atomic across Edge instances; an exception rolls back ALL increments in this call.
  for bucket in
    select * from (values
      (1, 'project_day', '00000000-0000-0000-0000-000000000000'::uuid, date_trunc('day', stamp, 'Asia/Seoul'), limits.project_day),
      (2, 'org_day', actor.org_id, date_trunc('day', stamp, 'Asia/Seoul'), limits.org_day),
      (3, 'user_day', actor.id, date_trunc('day', stamp, 'Asia/Seoul'), limits.user_day),
      (4, 'user_minute', actor.id, date_trunc('minute', stamp), limits.user_minute)
    ) b(priority, scope, subject, window_start, maximum) order by priority
  loop
    insert into app.live_token_usage as usage (scope, subject, window_start, issued)
      values (bucket.scope, bucket.subject, bucket.window_start, 1)
    on conflict (scope, subject, window_start) do update set issued = usage.issued + 1
      where usage.issued < bucket.maximum;
    if not found then
      raise exception 'LIVE_TOKEN_LIMIT' using errcode = 'P0001';
    end if;
  end loop;
  -- Counters contain no transcript; keep a bounded rolling history, including failed
  -- provider attempts. Never refund ambiguous failures that may already have minted a token.
  delete from app.live_token_usage where window_start < stamp - interval '2 days';
  return true;
end;
$$;
commit;

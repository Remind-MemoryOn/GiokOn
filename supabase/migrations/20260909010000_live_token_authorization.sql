-- R005: token issuance is authorized and metered before contacting Google.
begin;
create table app.live_token_limits (
  singleton boolean primary key default true check (singleton),
  user_minute integer not null check (user_minute between 1 and 100),
  user_day integer not null check (user_day between 1 and 1000),
  org_day integer not null check (org_day between 1 and 10000),
  project_day integer not null check (project_day between 1 and 100000)
);
insert into app.live_token_limits values (true, 3, 20, 200, 2000);
create table app.live_token_usage (
  scope text not null,
  subject uuid not null,
  window_start timestamptz not null,
  issued integer not null check (issued > 0),
  primary key (scope, subject, window_start)
);
revoke all on app.live_token_limits, app.live_token_usage from public, anon, authenticated;

create function public.reserve_live_token(p_session_id uuid)
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
  -- Mirror core CONSENT_VERSION; reject absent, revoked, old-version or foreign-org evidence.
  if exists (
    select 1 from unnest(array['sensitive_health_voice', 'cross_border_transfer', 'ai_processing']) required(kind)
    where not exists (
      select 1 from public.consents c where c.profile_id = target.profile_id
        and c.org_id = actor.org_id and c.consent_type::text = required.kind
        and c.granted and c.revoked_at is null and c.version = 'v1.0'
    )
  ) then
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
revoke all on function public.reserve_live_token(uuid) from public, anon;
grant execute on function public.reserve_live_token(uuid) to authenticated;
commit;

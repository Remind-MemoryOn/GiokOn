-- R007: only the initiating app's verifier can redeem a server callback once.
begin;
create table app.naver_mobile_handoffs (
  id uuid primary key,
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  auth_code text check (length(auth_code) between 1 and 2048),
  auth_state text check (length(auth_state) between 1 and 4096),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
revoke all on app.naver_mobile_handoffs from public, anon, authenticated;

create function public.store_naver_mobile_handoff(
  p_id uuid, p_challenge text, p_code text, p_state text, p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '10 minutes'
     or p_code is null or p_state is null then return false; end if;
  -- Bound anonymous login storage even before the provider rejects a bogus code.
  perform pg_advisory_xact_lock(hashtextextended('naver_mobile_handoffs', 0));
  delete from app.naver_mobile_handoffs where expires_at < now();
  if (select count(*) from app.naver_mobile_handoffs) >= 10000 then return false; end if;
  insert into app.naver_mobile_handoffs(id,challenge,auth_code,auth_state,expires_at)
    values(p_id,p_challenge,p_code,p_state,p_expires_at) on conflict(id) do nothing;
  return found;
end;
$$;
create function public.consume_naver_mobile_handoff(p_id uuid, p_challenge text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update app.naver_mobile_handoffs set consumed_at = now()
    where id = p_id and challenge = p_challenge and expires_at > now() and consumed_at is null
    returning jsonb_build_object('code', auth_code, 'state', auth_state) into result;
  if result is not null then
    update app.naver_mobile_handoffs set auth_code = null, auth_state = null where id = p_id;
  end if;
  return result;
end;
$$;
revoke all on function public.store_naver_mobile_handoff(uuid,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.consume_naver_mobile_handoff(uuid,text) from public, anon, authenticated;
grant execute on function public.store_naver_mobile_handoff(uuid,text,text,text,timestamptz) to service_role;
grant execute on function public.consume_naver_mobile_handoff(uuid,text) to service_role;
commit;

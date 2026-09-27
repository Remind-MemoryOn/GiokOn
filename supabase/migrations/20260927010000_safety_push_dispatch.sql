-- 파일럿 계획 C3·C4 (tasks T21.4·T21.9) — 위험 발화 알림 수신자 + 앱 푸시 발송 큐
--
-- ■ 흐름
--   중계가 위험 발화를 감지 → **즉시** safety_events INSERT(T21.4, 요양보호사 권한)
--   → (기존 트리거) notifications 행 → pg_cron 10초 → pg_net 으로 워커 push-dispatch
--   → claim(비밀값 + 잡기) → Expo Push(**고정 문구 — 어르신 성함·발화 금지**, 잠금화면에 보인다).
--
-- ■ 바꾸는 것
--   1) 안전 알림 수신자(사용자 결정 2026-09-27 "진행자 + 담당 배정자"):
--      기존 = 어르신의 활성 담당 배정 요양보호사만. 파일럿은 기관 단위·교대 근무라 담당 배정이 없는
--      어르신도 있다 → 실제로 어르신 곁에서 **세션을 진행한 사람**(sessions.user_id)을 더한다.
--      진행자는 같은 기관 돌봄팀일 때만(보호자·다른 기관 불가). 같은 사람이면 한 번만(기존 유니크).
--   2) 푸시 발송 큐 — notifications.pushed_at(D7)을 워커가 채운다. 안전 알림만 보낸다.
--      30분이 지난 알림은 보내지 않는다(스위치를 켤 때 쌓인 옛 알림이 한꺼번에 울리지 않게).
--      **최대 한 번** — 잡을 때 pushed_at 을 찍는다(재시도로 같은 위기 알림이 여러 번 울리지 않게).
--   3) 무효 토큰 회수(Expo DeviceNotRegistered) — 워커 전용.
--   4) 워커 설정·스케줄 — C4 일지 워커와 같은 방식(app.worker_config 비밀값 · 주소는 운영에서 한 번 설정).

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 안전 알림 수신자 = 담당 배정자 ∪ 세션 진행자
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.notify_safety_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title, body)
  select new.org_id, r.user_id, 'safety', new.profile_id, new.id, '안전 알림이 있어요', new.caregiver_alert
    from (
      select pc.caregiver_user_id as user_id
        from public.profile_caregivers pc
       where pc.profile_id = new.profile_id and pc.status = 'active'
      union
      select s.user_id
        from public.sessions s
       where s.id = new.session_id
         and app.is_org_care_member(s.user_id, new.org_id)
    ) r
   where r.user_id is not null
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function app.notify_safety_event() from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 푸시 발송 RPC — service_role 전용 + 워커 비밀값
-- ──────────────────────────────────────────────────────────────────────────
insert into app.worker_config (name) values ('push-dispatch') on conflict do nothing;

/** 보낼 안전 알림을 잡는다(잡는 즉시 pushed_at — 최대 한 번). 받는 사람의 활성 토큰을 함께 돌려준다. */
create or replace function public.claim_push_notifications(p_secret text, p_limit integer default 50)
returns table (notification_id uuid, user_id uuid, tokens text[])
language plpgsql
security definer
set search_path = public
as $$
declare n record;
begin
  perform app.verify_worker_secret('push-dispatch', p_secret);
  for n in
    select x.id, x.user_id from public.notifications x
     where x.pushed_at is null and x.kind = 'safety' and x.created_at > now() - interval '30 minutes'
     order by x.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 100))
     for update skip locked
  loop
    update public.notifications set pushed_at = now() where id = n.id;
    notification_id := n.id;
    user_id := n.user_id;
    tokens := array(select t.token from public.push_tokens t
                     where t.user_id = n.user_id and t.revoked_at is null
                     order by t.last_seen_at desc limit 10);
    return next;
  end loop;
end $$;

/** Expo 가 "기기에 앱이 없다"고 답한 토큰을 회수한다(다음부터 보내지 않는다). */
create or replace function public.revoke_dead_push_tokens(p_secret text, p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  perform app.verify_worker_secret('push-dispatch', p_secret);
  update public.push_tokens set revoked_at = now(), updated_at = now()
   where token = any(coalesce(p_tokens, '{}')) and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.claim_push_notifications(text, integer) from public, anon, authenticated;
revoke all on function public.revoke_dead_push_tokens(text, text[]) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(text, integer) to service_role;
grant execute on function public.revoke_dead_push_tokens(text, text[]) to service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 스케줄 — 보낼 알림이 있을 때만 워커를 부른다(위기 알림이라 10초 간격)
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.kick_push_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cfg app.worker_config%rowtype;
begin
  select * into cfg from app.worker_config where name = 'push-dispatch';
  if cfg.endpoint is null then
    return;
  end if;
  if not exists (select 1 from public.notifications
                  where pushed_at is null and kind = 'safety' and created_at > now() - interval '30 minutes') then
    return;
  end if;
  perform net.http_post(
    url := cfg.endpoint,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', cfg.secret),
    timeout_milliseconds := 10000);
end $$;
revoke all on function app.kick_push_dispatch() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'push-dispatch';
    perform cron.schedule('push-dispatch', '10 seconds', 'select app.kick_push_dispatch()');
  end if;
end $$;

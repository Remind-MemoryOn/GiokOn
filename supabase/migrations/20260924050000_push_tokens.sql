-- 파일럿 D7 · T21.8 — 푸시 토큰 저장소 + 알림 발송 표시.
--
-- 발송자는 트리거가 아니라 `notifications` 행 소비자(C4 `push-dispatch`)다(계획 결정 F). 이 파일은
-- 소비자가 읽을 **토큰**과 **발송 완료 표시(`pushed_at`)** 만 만든다.
--
-- 쓰기는 RPC 로만 한다. 한 기기를 교대 근무자가 이어 쓰면 같은 Expo 토큰의 주인이 바뀌어야 하는데,
-- 본인 행만 쓰는 RLS 로는 남의 행을 옮길 수 없고, 옮기지 않으면 **앞사람에게 가야 할 알림이 뒷사람
-- 기기로 간다**. 그래서 토큰은 전역 유일하고, 등록 RPC 가 주인을 호출자로 옮긴다.
begin;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /** 앱이 마지막으로 이 토큰을 확인한 시각 — 오래된 토큰 정리 기준(C4). */
  last_seen_at timestamptz not null default now(),
  /** 로그아웃·권한 해제 시 앱이 회수한다. NULL = 발송 대상. */
  revoked_at timestamptz,
  constraint push_tokens_token_key unique (token),
  constraint push_tokens_token_format check (char_length(token) <= 200 and token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$'),
  constraint push_tokens_platform_check check (platform in ('ios', 'android'))
);
create index if not exists idx_push_tokens_active_user on public.push_tokens(user_id) where revoked_at is null;

alter table public.push_tokens enable row level security;
-- 본인 행 조회만. INSERT/UPDATE/DELETE 정책 없음 = 아래 RPC(정의자 권한)만 쓴다.
create policy push_tokens_select_own on public.push_tokens for select using (user_id = auth.uid());
revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

/** 토큰 등록(또는 갱신). 같은 토큰이 다른 사용자에게 있으면 호출자로 옮긴다(기기 인계). */
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'PUSH_TOKEN_AUTH' using errcode = '42501';
  end if;
  -- 푸시는 돌봄팀 알림(위기·일지·원격 정지)용이다. 보호자·미합류 계정은 등록하지 않는다.
  if not app.is_care_team() then
    raise exception 'PUSH_TOKEN_ROLE' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) > 200 or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$' then
    raise exception 'PUSH_TOKEN_INVALID' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'PUSH_TOKEN_PLATFORM' using errcode = '22023';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = uid, platform = excluded.platform, revoked_at = null,
        last_seen_at = now(), updated_at = now();
end $$;

/** 토큰 회수 — 본인 토큰만. 없거나 남의 토큰이면 조용히 아무것도 하지 않는다(존재를 흘리지 않음). */
create or replace function public.revoke_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'PUSH_TOKEN_AUTH' using errcode = '42501';
  end if;
  update public.push_tokens
     set revoked_at = coalesce(revoked_at, now()), updated_at = now()
   where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
revoke all on function public.revoke_push_token(text) from public, anon;
grant execute on function public.revoke_push_token(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- notifications.pushed_at — 발송 워커가 채운다. 사용자는 바꿀 수 없다(스스로 재발송·억제 불가).
-- ──────────────────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists idx_notifications_push_pending on public.notifications(created_at) where pushed_at is null;

-- 기존 신원 불변 가드(R012)에 pushed_at 을 더한다. 워커(service_role)는 가드가 통과시킨다.
drop trigger if exists a_guard_record_identity on public.notifications;
create trigger a_guard_record_identity before update on public.notifications
  for each row execute function app.guard_record_identity('id','org_id','profile_id','user_id','kind','source_id','pushed_at');

commit;

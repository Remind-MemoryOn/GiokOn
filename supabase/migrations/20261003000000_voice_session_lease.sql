-- 기억온 — 음성 세션 점유를 DB 기준으로(T26.1 · 2026-10-03)
--
-- 왜: "같은 세션에 음성 연결 1개"(SESSION_BUSY)를 지금은 중계 프로세스 메모리(`inUse` Set)로만 막는다.
--     인스턴스가 2개 이상이거나 리비전 교체 중이면 서로의 메모리를 모르니 같은 세션이 두 번 연결될 수 있다
--     (모델 연결 2개 · 단계 전환·안전 기록 중복). 점유를 DB 한 곳에서 원자적으로 잡는다.
-- 어떻게:
--   · voice_session_leases — 세션당 1행. holder = 중계가 연결마다 만든 UUID, expires_at = 지금 + 15초.
--   · acquire_voice_lease — 비어 있거나 **만료됐거나** 같은 holder 일 때만 잡는다(INSERT … ON CONFLICT DO UPDATE WHERE —
--     동시 두 요청 중 하나만 성공). 세션 시작자 본인 + 처리 가능한(can_process_session) 세션만.
--   · renew_voice_lease — 중계 2초 폴마다 만료를 15초 뒤로. 다른 holder 가 가져갔으면 false → 중계가 연결을 닫는다.
--   · release_voice_lease — 연결을 닫을 때 자기 점유만 지운다.
--   · 프로세스가 죽어 해제하지 못한 점유는 **15초 뒤 만료**로 풀린다(그동안 재연결은 SESSION_BUSY).
-- 테이블은 RLS 를 켜고 정책을 두지 않는다 — 사용자는 아래 definer RPC 로만 닿는다(직접 조회·변경 불가).
-- 배포 순서: 이 마이그레이션 → 중계(새 중계는 RPC 가 없으면 모든 연결을 거절한다 — fail closed).

begin;

create table if not exists public.voice_session_leases (
  session_id  uuid primary key references public.sessions(id) on delete cascade,
  holder      uuid not null,
  user_id     uuid not null,
  acquired_at timestamptz not null default statement_timestamp(),
  expires_at  timestamptz not null
);
alter table public.voice_session_leases enable row level security;
revoke all on table public.voice_session_leases from public, anon, authenticated;

comment on table public.voice_session_leases is
  'T26.1 — 음성 세션 점유(세션당 연결 1개). 중계가 acquire/renew/release_voice_lease 로만 다룬다. 만료 15초.';

-- 점유 획득 — 세션 시작자(중계가 쓰는 JWT 의 주인)만. 성공하면 true, 다른 연결이 살아 있으면 false.
create or replace function public.acquire_voice_lease(p_session_id uuid, p_holder uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare s public.sessions%rowtype; n int;
begin
  if p_holder is null then
    raise exception 'VOICE_LEASE_HOLDER' using errcode = '22023';
  end if;
  select * into s from public.sessions where id = p_session_id;
  -- 다른 사용자·없는 세션·처리 불가 세션은 구분하지 않는다(존재를 흘리지 않는다).
  if s.id is null or s.user_id is distinct from auth.uid() or not public.can_process_session(p_session_id) then
    raise exception 'VOICE_LEASE_FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.voice_session_leases as l (session_id, holder, user_id, acquired_at, expires_at)
  values (p_session_id, p_holder, auth.uid(), statement_timestamp(), statement_timestamp() + interval '15 seconds')
  on conflict (session_id) do update
     set holder = excluded.holder, user_id = excluded.user_id,
         acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
   where l.expires_at <= statement_timestamp() or l.holder = excluded.holder;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- 점유 갱신 — 자기 점유일 때만. 이미 다른 연결이 가져갔으면 false(중계는 연결을 닫는다).
create or replace function public.renew_voice_lease(p_session_id uuid, p_holder uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.voice_session_leases
     set expires_at = statement_timestamp() + interval '15 seconds'
   where session_id = p_session_id and holder = p_holder and user_id = auth.uid();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- 점유 해제 — 자기 점유만 지운다(남의 점유·다른 연결의 점유는 그대로).
create or replace function public.release_voice_lease(p_session_id uuid, p_holder uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.voice_session_leases
   where session_id = p_session_id and holder = p_holder and user_id = auth.uid();
end $$;

revoke all on function public.acquire_voice_lease(uuid, uuid) from public, anon;
revoke all on function public.renew_voice_lease(uuid, uuid) from public, anon;
revoke all on function public.release_voice_lease(uuid, uuid) from public, anon;
grant execute on function public.acquire_voice_lease(uuid, uuid) to authenticated;
grant execute on function public.renew_voice_lease(uuid, uuid) to authenticated;
grant execute on function public.release_voice_lease(uuid, uuid) to authenticated;

commit;

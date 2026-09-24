-- 파일럿 계획 D6 (tasks T21.1 · T21.13) — 대화 단계 · 원격 제어 · 감독 개입 기록 · 감독자당 동시 4대
--
-- ■ 설계(파일럿 계획 §4 D·E, §9)
--   · 대화 단계는 sessions 컬럼이다 — 중계 메모리는 재시작에 사라지고, sessions 는 이미 realtime 에 있어
--     감독 화면(웹 W2)이 배선 없이 단계를 본다. **현재 단계는 서버가 정한다**(AI 자율 판단에 맡기지 않는다).
--   · 원격 제어는 DB 행 + Realtime — broadcast 는 RLS 를 타지 않고, "누가 언제 개입했나"가 제도 증빙이다.
--   · 중계의 2초 폴(can_process_session)을 session_tick 하나로 바꾼다 — 허용 여부·단계·목표 시간·일시정지·
--     종료 요청·서버 기준 경과 시간을 한 번에 받는다(새 타이머·소켓·인증 없음).
--   · 목표 시간 = coalesce(sessions.duration_minutes, org_settings.target_minutes), **10분 상한**(사용자 확정 2026-09-24).
--     새 목표 시간 컬럼은 만들지 않는다(duration_minutes 가 이미 그 값이다).
--
-- ■ 안전(파일럿 계획 §11)
--   · 위기 시 중계의 **즉시 close 는 그대로**다. 원격 일시정지는 감독 도구이지 위기 대응을 대체하지 않는다.
--   · 새 컬럼은 **RPC 로만** 바뀐다 — 클라이언트가 UPDATE 로 단계·일시정지를 고치면 증빙이 무의미해진다
--     (users.role 과 같은 방식: current_user 로 직접 쓰기를 판별하는 invoker 트리거).
--
-- ■ 감독자당 동시 4대(T21.13, 사용자 확정 2026-09-24)
--   세션이 active 가 되는 순간(insert 또는 planned→active) 같은 시작자(user_id)의 active 세션을 센다.
--   ⚠️ 앱이 비정상 종료돼 active 로 남은 세션(좀비)이 영원히 자리를 차지하지 않도록 **최근 30분 안에 시작한 것만** 센다
--   (세션 상한 10분 + 여유). 좀비 세션 자체를 닫는 일은 이 파일 범위 밖이다.

do $$ begin
  create type public.session_phase as enum ('intro', 'reminiscence', 'closing');
exception when duplicate_object then null;
end $$;

alter table public.sessions
  add column if not exists phase public.session_phase,
  add column if not exists phase_started_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references public.users(id) on delete set null,
  add column if not exists pause_reason text,
  add column if not exists control_request text,
  add column if not exists prompt_version text;

alter table public.sessions
  drop constraint if exists sessions_control_request_check,
  add constraint sessions_control_request_check check (control_request is null or control_request in ('pause', 'resume', 'end')),
  drop constraint if exists sessions_pause_pair_check,
  add constraint sessions_pause_pair_check check ((paused_at is null) = (paused_by is null)),
  drop constraint if exists sessions_pause_reason_check,
  add constraint sessions_pause_reason_check check (pause_reason is null or char_length(btrim(pause_reason)) between 1 and 200),
  drop constraint if exists sessions_prompt_version_check,
  add constraint sessions_prompt_version_check check (prompt_version is null or prompt_version ~ '^v[0-9]+\.[0-9]+$'),
  drop constraint if exists sessions_phase_pair_check,
  add constraint sessions_phase_pair_check check ((phase is null) = (phase_started_at is null));

-- ──────────────────────────────────────────────────────────────────────────
-- 감독 개입 기록
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.session_interventions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  profile_id uuid not null,
  org_id uuid not null,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  constraint session_interventions_session_fk foreign key (session_id, profile_id, org_id)
    references public.sessions(id, profile_id, org_id) on delete cascade,
  constraint session_interventions_action_check
    check (action in ('pause', 'resume', 'end', 'phase_advance'))
);
create index if not exists session_interventions_session_idx on public.session_interventions (session_id, created_at);

alter table public.session_interventions enable row level security;
revoke all on public.session_interventions from anon;
revoke insert, update, delete on public.session_interventions from authenticated;
drop policy if exists session_interventions_select_team on public.session_interventions;
create policy session_interventions_select_team on public.session_interventions for select
  using (org_id = app.current_org_id() and app.is_care_team());

-- ──────────────────────────────────────────────────────────────────────────
-- 새 컬럼 직접 쓰기 차단 — RPC(definer, current_user = 소유자)만 통과
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.protect_session_supervision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.phase is not null or new.phase_started_at is not null or new.paused_at is not null
       or new.paused_by is not null or new.pause_reason is not null or new.control_request is not null
       or new.prompt_version is not null then
      raise exception 'SESSION_SUPERVISION_RPC_ONLY' using errcode = '42501';
    end if;
  elsif new.phase is distinct from old.phase or new.phase_started_at is distinct from old.phase_started_at
     or new.paused_at is distinct from old.paused_at or new.paused_by is distinct from old.paused_by
     or new.pause_reason is distinct from old.pause_reason or new.control_request is distinct from old.control_request
     or new.prompt_version is distinct from old.prompt_version then
    raise exception 'SESSION_SUPERVISION_RPC_ONLY' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.protect_session_supervision() from public, anon, authenticated;
drop trigger if exists sessions_protect_supervision on public.sessions;
create trigger sessions_protect_supervision before insert or update on public.sessions
  for each row execute function app.protect_session_supervision();

-- ──────────────────────────────────────────────────────────────────────────
-- 감독자(시작자)당 동시 active 4대
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.enforce_supervisor_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if new.status <> 'active' or new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  -- 같은 시작자의 동시 시작을 직렬화한다(두 기기가 동시에 5번째가 되는 경쟁).
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 2413));
  select count(*) into n from public.sessions
   where user_id = new.user_id and status = 'active' and id <> new.id
     and started_at > now() - interval '30 minutes';
  if n >= 4 then
    raise exception 'SESSION_SUPERVISOR_LIMIT' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function app.enforce_supervisor_active_limit() from public, anon, authenticated;
drop trigger if exists sessions_supervisor_active_limit on public.sessions;
create trigger sessions_supervisor_active_limit before insert or update of status on public.sessions
  for each row execute function app.enforce_supervisor_active_limit();

-- ──────────────────────────────────────────────────────────────────────────
-- RPC
-- ──────────────────────────────────────────────────────────────────────────
-- 목표 시간(분) — 세션 설계 > 기관 설정 > 10, 서버 상한 10분.
create or replace function app.session_target_minutes(s public.sessions)
returns integer
language sql stable security definer
set search_path = public
as $$
  select least(10, greatest(1, coalesce(s.duration_minutes,
    (select target_minutes from public.org_settings where org_id = s.org_id), 10)));
$$;
revoke all on function app.session_target_minutes(public.sessions) from public, anon, authenticated;

-- 중계가 2초마다 부른다(사용자 JWT). 허용되지 않으면 allowed=false 만 돌려주고 다른 값은 싣지 않는다.
create or replace function public.session_tick(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.sessions%rowtype;
begin
  if not public.can_process_session(p_session_id) then
    return jsonb_build_object('allowed', false);
  end if;
  select * into s from public.sessions where id = p_session_id;
  return jsonb_build_object(
    'allowed', true,
    'phase', s.phase,
    'phase_elapsed_seconds', case when s.phase_started_at is null then null
      else floor(extract(epoch from (statement_timestamp() - s.phase_started_at)))::int end,
    'elapsed_seconds', floor(extract(epoch from (statement_timestamp() - s.started_at)))::int,
    'target_minutes', app.session_target_minutes(s),
    'paused', s.paused_at is not null,
    'end_requested', coalesce(s.control_request = 'end', false)
  );
end $$;

-- 단계 전환 — 세션 시작자(중계가 쓰는 JWT 의 주인)만. 앞으로만, 마무리는 어디서든.
create or replace function public.advance_session_phase(p_session_id uuid, p_phase public.session_phase, p_prompt_version text default null)
returns public.session_phase
language plpgsql
security definer
set search_path = public
as $$
declare s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.user_id is distinct from auth.uid() or not public.can_process_session(p_session_id) then
    raise exception 'SESSION_PHASE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_phase is null or s.phase = p_phase then
    return s.phase;
  end if;
  if not ((s.phase is null and p_phase = 'intro')
       or (s.phase = 'intro' and p_phase = 'reminiscence')
       or (s.phase is not null and p_phase = 'closing')
       or (s.phase is null and p_phase = 'closing')) then
    raise exception 'SESSION_PHASE_ORDER' using errcode = '22023';
  end if;
  if p_prompt_version is not null and p_prompt_version !~ '^v[0-9]+\.[0-9]+$' then
    raise exception 'SESSION_PROMPT_VERSION' using errcode = '22023';
  end if;
  update public.sessions
     set phase = p_phase, phase_started_at = statement_timestamp(),
         prompt_version = coalesce(p_prompt_version, prompt_version), updated_at = now()
   where id = s.id;
  insert into public.session_interventions (session_id, profile_id, org_id, actor_id, action, detail)
  values (s.id, s.profile_id, s.org_id, auth.uid(), 'phase_advance',
          jsonb_build_object('from', s.phase, 'to', p_phase));
  return p_phase;
end $$;

-- 원격 제어 — 같은 기관 돌봄팀(감독 화면). 진행 중(active) 세션만.
create or replace function public.request_session_control(p_session_id uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = p_session_id for update;
  -- 다른 기관·보호자에게는 세션이 없는 것처럼 — 존재를 흘리지 않는다.
  if s.id is null or s.org_id is distinct from app.current_org_id() or not app.is_care_team() then
    raise exception 'SESSION_CONTROL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_action is null or p_action not in ('pause', 'resume', 'end') then
    raise exception 'SESSION_CONTROL_ACTION' using errcode = '22023';
  end if;
  if s.status <> 'active' then
    raise exception 'SESSION_CONTROL_NOT_ACTIVE' using errcode = '22023';
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) not between 1 and 200 then
    raise exception 'SESSION_CONTROL_REASON' using errcode = '22023';
  end if;
  update public.sessions set
    paused_at = case p_action when 'pause' then coalesce(s.paused_at, statement_timestamp())
                              when 'resume' then null else s.paused_at end,
    paused_by = case p_action when 'pause' then coalesce(s.paused_by, auth.uid())
                              when 'resume' then null else s.paused_by end,
    pause_reason = case p_action when 'pause' then coalesce(nullif(btrim(p_reason), ''), s.pause_reason)
                                 when 'resume' then null else s.pause_reason end,
    control_request = p_action,
    updated_at = now()
  where id = s.id;
  insert into public.session_interventions (session_id, profile_id, org_id, actor_id, action, detail)
  values (s.id, s.profile_id, s.org_id, auth.uid(), p_action,
          case when p_reason is null then null else jsonb_build_object('reason', btrim(p_reason)) end);
end $$;

revoke all on function public.session_tick(uuid) from public, anon;
grant execute on function public.session_tick(uuid) to authenticated;
revoke all on function public.advance_session_phase(uuid, public.session_phase, text) from public, anon;
grant execute on function public.advance_session_phase(uuid, public.session_phase, text) to authenticated;
revoke all on function public.request_session_control(uuid, text, text) from public, anon;
grant execute on function public.request_session_control(uuid, text, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- Realtime(D9) — sessions 는 이미 있다. 개입 기록을 추가한다(순정 PG16 CI 에는 publication 이 없다).
-- ──────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.session_interventions;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

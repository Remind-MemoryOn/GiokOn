-- 기억온 — 세션 시작 무결성(파일럿 T25.11 · T25.18 · T25.19 — 2026-09-27 감사 P0-1 · 보류 ③④ 결정)
--
-- ① T25.11 설계자 ≠ 진행자: 웹에서 A 가 설계한 세션을 B 가 앱에서 시작하면 user_id 가 A 로 남아 중계 소유 검사·
--    단계 전환·감독 한도가 A 기준으로 판정됐다(B 의 대화 연결 실패). → user_id = **실제 진행자**, 설계자는 planned_by 에 보존.
--    시작은 RPC start_planned_session 하나가 권한·동의·한도를 확인하고 진행자 지정 + planned → active 를 원자적으로 한다.
--    기존 직접 UPDATE(planned → active) 경로는 구버전 앱을 위해 **아직 막지 않는다**(차단은 앱 전환 뒤 별도 마이그레이션).
-- ② T25.18 시작 시각 = 서버 시각: 실행 중 세션(active)의 started_at 은 DB 가 정한다(보낸 값 무시 · 이후 변경 불가).
--    종료 후 일괄 기록은 'recording' 으로 넣어 과거 시각을 남기되, recording 에서는 ended 로만 갈 수 있다(실행 불가).
-- ③ T25.19 어르신 1명당 실행 중 세션 1개(일시정지 포함 — 일시정지는 active 위의 paused_at): 트리거가 ELDER_SESSION_ACTIVE 로
--    알리고, 부분 유일 인덱스가 최종 보장한다. 오래 남은 세션도 조용히 덮어쓰지 않는다(감독 화면 원격 종료로 정리).
--
-- 운영 사전 확인(2026-09-28·29 읽기 전용): 실행 중 세션 0건 · 어르신별 중복 0건 · 설계에서 시작된 세션 0건(백필 없음).

-- ── ① 설계자 칸 ───────────────────────────────────────────────────────────────
alter table public.sessions
  add column if not exists planned_by uuid references public.users(id) on delete set null;
comment on column public.sessions.planned_by is
  '웹에서 이 세션을 설계한 직원(T25.11). user_id 는 실제 진행자다. 설계 없이 시작한 세션은 null.';

-- 아직 planned 인 행만 채운다(설계자가 확실) — 이미 시작·종료된 행은 실제 시작자 기록이 없어 그대로 둔다.
update public.sessions set planned_by = user_id where status = 'planned' and planned_by is null;

-- planned_by 도 정체성 칸이다 — 일반 UPDATE 로 바꿀 수 없다(R012 가드에 추가).
drop trigger if exists a_guard_record_identity on public.sessions;
create trigger a_guard_record_identity before update on public.sessions
  for each row execute function app.guard_record_identity('id', 'org_id', 'profile_id', 'user_id', 'planned_by');

-- ── ② 시작 시각·상태 전이 ─────────────────────────────────────────────────────
-- recording 은 아직 끝나지 않은 기록이다(ended_at 없음) — 마지막에 ended 로 바꿀 때 ended_at 을 채운다.
alter table public.sessions drop constraint if exists sessions_ended_at_check;
alter table public.sessions
  add constraint sessions_ended_at_check check (
    (status = 'planned'::session_status and ended_at is null)
    or (status = 'active'::session_status and ended_at is null)
    or (status = 'recording'::session_status and ended_at is null)
    or (status = 'ended'::session_status and ended_at is not null)
  );

create or replace function app.enforce_session_start_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- 서버 내부(RPC·운영자 SQL — authenticated/anon 이 아님)는 자기 권한 검사를 따른다.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 설계자는 설계(planned) 행을 만든 본인뿐이다(보낸 값 무시).
    new.planned_by := case when new.status = 'planned' then new.user_id end;
    -- 실행 중 세션의 시작 시각은 서버 시각(기기 시계 무시).
    if new.status = 'active' then
      new.started_at := statement_timestamp();
    end if;
    return new;
  end if;
  if old.status = 'recording' and new.status not in ('recording', 'ended') then
    raise exception 'SESSION_RECORDING_ONLY' using errcode = '42501';
  end if;
  if old.status = 'planned' and new.status = 'active' then
    -- 구버전 앱의 직접 전환 경로 — 시작 시각은 서버가 정한다(앱 전환 뒤 이 경로 자체를 막는다).
    new.started_at := statement_timestamp();
  elsif old.status = 'active' and new.started_at is distinct from old.started_at then
    raise exception 'SESSION_STARTED_AT_SERVER_ONLY' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.enforce_session_start_integrity() from public, anon, authenticated;
drop trigger if exists sessions_start_integrity on public.sessions;
create trigger sessions_start_integrity before insert or update on public.sessions
  for each row execute function app.enforce_session_start_integrity();

-- ── ③ 어르신 1명당 실행 중 세션 1개 ───────────────────────────────────────────
create or replace function app.enforce_one_active_per_elder()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  -- 같은 어르신의 동시 시작(두 기기)을 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 2415));
  if exists (select 1 from public.sessions
              where profile_id = new.profile_id and status = 'active' and id <> new.id) then
    raise exception 'ELDER_SESSION_ACTIVE' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function app.enforce_one_active_per_elder() from public, anon, authenticated;
drop trigger if exists sessions_one_active_per_elder on public.sessions;
create trigger sessions_one_active_per_elder before insert or update of status on public.sessions
  for each row execute function app.enforce_one_active_per_elder();

create unique index if not exists sessions_one_active_per_elder_idx
  on public.sessions (profile_id) where status = 'active';

-- ── ① 시작 RPC ────────────────────────────────────────────────────────────────
-- 같은 기관 돌봄팀 누구나 설계 세션을 시작할 수 있다(교대 대리 진행 — 즉석 세션 생성 규칙과 같다).
-- 오류: SESSION_START_FORBIDDEN(돌봄팀 아님·없는 행·다른 기관 — 존재 여부를 구분해 알리지 않는다) ·
--       SESSION_ALREADY_STARTED(planned 아님) · PROCESSING_CONSENT_REQUIRED · SESSION_SUPERVISOR_LIMIT · ELDER_SESSION_ACTIVE(트리거).
-- 같은 사람이 다시 부르면(응답 유실 재요청) 같은 값으로 성공한다.
create or replace function public.start_planned_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  s public.sessions%rowtype;
  started timestamptz;
begin
  if me is null or not app.is_care_team() then
    raise exception 'SESSION_START_FORBIDDEN' using errcode = '42501';
  end if;
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.org_id is distinct from app.current_org_id() then
    raise exception 'SESSION_START_FORBIDDEN' using errcode = '42501';
  end if;
  if s.status = 'active' and s.user_id = me and s.planned_by is not null then
    return jsonb_build_object('session_id', s.id, 'started_at', s.started_at);
  end if;
  if s.status <> 'planned' then
    raise exception 'SESSION_ALREADY_STARTED' using errcode = '55000';
  end if;
  update public.sessions
     set status = 'active', user_id = me, planned_by = coalesce(s.planned_by, s.user_id),
         started_at = statement_timestamp()
   where id = s.id
  returning started_at into started;
  return jsonb_build_object('session_id', s.id, 'started_at', started);
end $$;
revoke all on function public.start_planned_session(uuid) from public, anon;
grant execute on function public.start_planned_session(uuid) to authenticated;

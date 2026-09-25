-- 파일럿 계획 C4 (tasks T20.5·T20.6) — 프로그램 일지 초안 자동 생성 워커의 DB 쪽
--
-- ■ 흐름(사용자 확정 2026-09-25: "대화가 끝나자마자 AI 가 초안을 만든다 — 초안 생성 버튼은 두지 않는다")
--   세션 ended → (D5 트리거) generating 일지 + 생성 작업 → pg_cron 30초 → pg_net 으로 워커 호출
--   → 워커가 작업을 잡고(claim) → Gemini 초안 → finish(pending_review) / fail(백오프 재시도 → 6회째 failed).
--   사람이 누르는 것은 **실패한 일지의 "다시 생성"**(복구) 하나뿐이다.
--
-- ■ 무엇을 만드나
--   1) org_settings.ai_drafts_enabled — 기관별 AI 초안 사용 여부(기본 꺼짐). **플랫폼 운영자만** 켠다
--      (클라이언트는 기관 관리자라도 바꿀 수 없다 — 사용자 결정 1-C). session-report·워커가 함께 본다.
--   2) 세션 종료 트리거 분기 — AI 가 꺼진 기관은 작업을 만들지 않고 곧바로 확인 대기(빈 초안 = 직접 작성).
--   3) 워커 전용 RPC 3종(claim·finish·fail) — service_role 만 실행, 호출마다 DB 안의 워커 비밀값을 확인.
--   4) app.worker_config — 워커 주소·비밀값(비밀값은 여기서 난수로 만든다 → 수동 시크릿 설정 없음).
--   5) app.kick_journal_worker() + pg_cron 30초 — 할 일이 있을 때만 pg_net 으로 워커를 부른다.
--      pg_cron·pg_net 이 없는 환경(CI·로컬 PG)에서는 확장·스케줄을 건너뛴다(주소도 비어 있어 호출 안 함).
--
-- ■ 지키는 원칙
--   · 워커는 **확인 대기까지만** 쓴다 — 확정은 D5 가드가 서비스 계정에게 막는다(auth.uid() 없음).
--   · 사람이 먼저 쓴 칸은 덮어쓰지 않는다 · 이미 generating 이 아닌 일지(사람이 확인·확정)는 건드리지 않는다.
--   · 처리 동의가 없으면 대화 원문을 AI 로 보내지 않는다(빈 초안 + 안내).
--   · 운영 주소는 마이그레이션에 넣지 않는다 — 운영에서 worker_config.endpoint 를 한 번 설정한다.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 기관별 AI 초안 스위치 — 운영자 전용
-- ──────────────────────────────────────────────────────────────────────────
alter table public.org_settings add column if not exists ai_drafts_enabled boolean not null default false;
comment on column public.org_settings.ai_drafts_enabled is
  'AI 초안(일지 자동 초안·session-report) 사용 여부. 비용이 드는 기능이라 플랫폼 운영자만 켠다(클라이언트 변경 불가).';

create or replace function app.guard_org_ai_switch()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and new.ai_drafts_enabled)
    or (tg_op = 'UPDATE' and new.ai_drafts_enabled is distinct from old.ai_drafts_enabled)) then
    raise exception 'ORG_AI_SWITCH_OPERATOR_ONLY' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.guard_org_ai_switch() from public, anon, authenticated;
drop trigger if exists guard_org_ai_switch on public.org_settings;
create trigger guard_org_ai_switch before insert or update on public.org_settings
  for each row execute function app.guard_org_ai_switch();

-- 기관 AI 사용 여부(행이 없으면 꺼짐).
create or replace function app.org_ai_drafts_enabled(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select ai_drafts_enabled from public.org_settings where org_id = p_org), false);
$$;
revoke all on function app.org_ai_drafts_enabled(uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 세션 종료 트리거 — AI 가 꺼진 기관은 작업 없이 바로 확인 대기
-- ──────────────────────────────────────────────────────────────────────────
-- 20260924070000 판 그대로에 분기만 더했다(상태·작업 생성 두 곳).
create or replace function app.enqueue_program_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jid uuid;
  cfg public.org_settings%rowtype;
  ai boolean;
  started timestamp := (new.started_at at time zone 'Asia/Seoul');
  ended timestamp := (coalesce(new.ended_at, statement_timestamp()) at time zone 'Asia/Seoul');
begin
  if new.status <> 'ended' or (tg_op = 'UPDATE' and old.status = 'ended') then
    return null;
  end if;
  select * into cfg from public.org_settings where org_id = new.org_id;
  ai := coalesce(cfg.ai_drafts_enabled, false);
  insert into public.program_journals (org_id, profile_id, session_id, status, journal_date,
      operated_from, operated_to, program_type, location, facilitator_user_id, goal, tool_used, created_by)
  values (new.org_id, new.profile_id, new.id,
      case when ai then 'generating' else 'pending_review' end::public.program_journal_status,
      started::date,
      started::time(0),
      case when ended::date = started::date and ended::time(0) >= started::time(0) then ended::time(0) end,
      coalesce(cfg.default_program_type, '인지활동 - 회상훈련'), cfg.default_location,
      -- 진행자 = 세션을 시작·감독한 요양보호사(AI 아님). 돌봄팀이 아니면 비워 두고 확정 때 사람이 채운다.
      case when app.is_org_care_member(new.user_id, new.org_id) then new.user_id end,
      left(nullif(btrim(coalesce(new.goal, '')), ''), 2000), 'AI 대화 프로그램 보조', new.user_id)
  on conflict (session_id) do nothing
  returning id into jid;
  if jid is not null and ai then
    insert into public.journal_generation_jobs (journal_id, session_id, org_id)
    values (jid, new.id, new.org_id)
    on conflict (journal_id) do nothing;
  end if;
  return null;
end $$;
revoke all on function app.enqueue_program_journal() from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 워커 설정(주소·비밀값) — API 에 노출되지 않는 app 스키마
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists app.worker_config (
  name text primary key,
  -- 워커 Edge Function 주소. 비어 있으면 호출하지 않는다(CI·로컬·운영 설정 전).
  endpoint text,
  -- gen_random_uuid() 2개(각 122비트 CSPRNG) — pgcrypto 스키마 위치(로컬 public / Supabase extensions)와 무관.
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now(),
  constraint worker_config_endpoint_check check (endpoint is null or endpoint ~ '^https://[^\s]+$')
);
revoke all on app.worker_config from public, anon, authenticated;
insert into app.worker_config (name) values ('program-journal-draft') on conflict do nothing;

create or replace function app.verify_worker_secret(p_name text, p_secret text)
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_secret is null or not exists (
       select 1 from app.worker_config where name = p_name and secret = p_secret) then
    raise exception 'WORKER_UNAUTHORIZED' using errcode = '42501';
  end if;
end $$;
revoke all on function app.verify_worker_secret(text, text) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 워커 RPC — claim / finish / fail (service_role 전용 + 비밀값)
-- ──────────────────────────────────────────────────────────────────────────
-- 최대 시도 6회(계획: attempts>5 면 failed) · 백오프 30s → 1m → 2m → 4m → 5m(상한).
-- running 으로 5분 넘게 남은 작업(워커가 죽음)은 다시 잡을 수 있게 되돌린다.
create or replace function public.claim_journal_generation_jobs(p_secret text, p_limit integer default 3)
returns table (job_id uuid, journal_id uuid, session_id uuid, attempt integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
  jr public.program_journals%rowtype;
begin
  perform app.verify_worker_secret('program-journal-draft', p_secret);

  -- 멈춘 작업 회수(시도 횟수는 잡을 때 이미 셌다).
  update public.journal_generation_jobs g set status = 'queued', next_run_at = now(),
         last_error = '작업이 시간 안에 끝나지 않아 다시 시도합니다.'
   where g.status = 'running' and g.updated_at < now() - interval '5 minutes';

  for j in
    select g.* from public.journal_generation_jobs g
     where g.status = 'queued' and g.next_run_at <= now()
     order by g.next_run_at
     limit greatest(1, least(coalesce(p_limit, 3), 10))
     for update skip locked
  loop
    select * into jr from public.program_journals where id = j.journal_id for update;
    -- 사람이 이미 확인·확정했거나(generating 이 아님) 일지가 사라졌다 → 할 일 없음.
    if jr.id is null or jr.status <> 'generating' then
      update public.journal_generation_jobs set status = 'done', last_error = null where id = j.id;
      continue;
    end if;
    -- AI 꺼짐 · 처리 동의 없음 → 원문을 AI 로 보내지 않고 빈 초안으로 확인 대기.
    if not app.org_ai_drafts_enabled(jr.org_id) or not app.has_processing_consent(jr.profile_id) then
      update public.program_journals set status = 'pending_review', last_error =
          case when app.org_ai_drafts_enabled(jr.org_id)
            then 'AI 초안을 만들지 않았어요(대화 처리 동의 확인 필요). 직접 작성해 주세요.'
            else null end
       where id = jr.id;
      update public.journal_generation_jobs set status = 'done', last_error = null where id = j.id;
      continue;
    end if;
    update public.journal_generation_jobs set status = 'running', attempts = attempts + 1
     where id = j.id returning attempts into attempt;
    update public.program_journals set generation_attempts = least(attempt, 100) where id = jr.id;
    job_id := j.id; journal_id := j.journal_id; session_id := j.session_id;
    return next;
  end loop;
end $$;

create or replace function public.finish_journal_generation(p_secret text, p_job_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.journal_generation_jobs%rowtype;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  perform app.verify_worker_secret('program-journal-draft', p_secret);
  select * into g from public.journal_generation_jobs where id = p_job_id for update;
  if g.id is null or g.status <> 'running' then
    raise exception 'JOB_NOT_RUNNING' using errcode = '22023';
  end if;
  -- 사람이 먼저 쓴 칸은 그대로 둔다. 확인 대기로만 옮긴다(확정은 사람).
  update public.program_journals set
      activity_content = coalesce(nullif(btrim(activity_content), ''), nullif(btrim(f ->> 'activity_content'), '')),
      participant_response = coalesce(nullif(btrim(participant_response), ''), nullif(btrim(f ->> 'participant_response'), '')),
      opinion_collected = coalesce(nullif(btrim(opinion_collected), ''), nullif(btrim(f ->> 'opinion_collected'), '')),
      guardian_text = coalesce(nullif(btrim(guardian_text), ''), nullif(btrim(f ->> 'guardian_text'), '')),
      status = 'pending_review',
      draft_generated_at = now(),
      generation_attempts = least(g.attempts, 100),
      last_error = null
   where id = g.journal_id and status = 'generating';
  update public.journal_generation_jobs set status = 'done', last_error = null where id = g.id;
end $$;

create or replace function public.fail_journal_generation(p_secret text, p_job_id uuid, p_error text, p_retryable boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.journal_generation_jobs%rowtype;
  msg text := left(coalesce(nullif(btrim(p_error), ''), 'AI 초안을 만들지 못했어요.'), 500);
  final boolean;
begin
  perform app.verify_worker_secret('program-journal-draft', p_secret);
  select * into g from public.journal_generation_jobs where id = p_job_id for update;
  if g.id is null or g.status <> 'running' then
    raise exception 'JOB_NOT_RUNNING' using errcode = '22023';
  end if;
  final := not coalesce(p_retryable, false) or g.attempts >= 6;
  if final then
    update public.journal_generation_jobs set status = 'failed', last_error = msg where id = g.id;
    update public.program_journals set status = 'failed', last_error = msg,
           generation_attempts = least(g.attempts, 100)
     where id = g.journal_id and status = 'generating';
    return 'failed';
  end if;
  update public.journal_generation_jobs set status = 'queued', last_error = msg,
         next_run_at = now() + least(interval '30 seconds' * power(2, g.attempts - 1), interval '5 minutes')
   where id = g.id;
  update public.program_journals set last_error = msg, generation_attempts = least(g.attempts, 100)
   where id = g.journal_id and status = 'generating';
  return 'queued';
end $$;

revoke all on function public.claim_journal_generation_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.finish_journal_generation(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_journal_generation(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_journal_generation_jobs(text, integer) to service_role;
grant execute on function public.finish_journal_generation(text, uuid, jsonb) to service_role;
grant execute on function public.fail_journal_generation(text, uuid, text, boolean) to service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) 스케줄 — 할 일이 있을 때만 워커를 부른다
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.kick_journal_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cfg app.worker_config%rowtype;
begin
  select * into cfg from app.worker_config where name = 'program-journal-draft';
  if cfg.endpoint is null then
    return;
  end if;
  if not exists (select 1 from public.journal_generation_jobs
                  where (status = 'queued' and next_run_at <= now())
                     or (status = 'running' and updated_at < now() - interval '5 minutes')) then
    return;
  end if;
  -- 워커는 잡은 작업을 받자마자 202 로 답하고 백그라운드에서 처리한다.
  perform net.http_post(
    url := cfg.endpoint,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', cfg.secret),
    timeout_milliseconds := 10000);
end $$;
revoke all on function app.kick_journal_worker() from public, anon, authenticated;

-- pg_cron·pg_net 은 Supabase 에서만 켠다(CI·로컬 PG 에는 없다 — 없으면 건너뛴다).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'program-journal-draft';
    perform cron.schedule('program-journal-draft', '30 seconds', 'select app.kick_journal_worker()');
  end if;
end $$;

-- AI 초안 워커의 동의 철회·AI 스위치 재확인 (감사 2026-09-27 P1-3 · tasks T25.5)
--
-- ■ 무엇이 잘못됐나
--   claim_journal_generation_jobs 는 작업을 잡을 때만 처리 동의·기관 AI 스위치를 본다. 그 뒤 워커가
--   대화 기록 로드 → 외부 모델 호출(최대 45초) → finish_journal_generation 으로 저장하는 동안에는 다시 보지 않는다.
--   → 잡은 뒤 동의를 철회하거나 AI 를 끄면 ① 외부 모델로 새 요청이 나가고 ② 결과가 일지에 저장될 수 있었다.
--
-- ■ 무엇을 하나
--   · app.journal_generation_allowed(job) — 판정 하나: 작업이 running · 일지가 generating · 기관 AI 켜짐 · 처리 동의 있음.
--     판정 전에 **동의 변경과 같은 자문 잠금**(app.lock_processing_consent 의 키 = hashtextextended(profile_id, 1010))을 잡고,
--     기관 설정 행을 FOR SHARE 로 잡는다 → 진행 중인 철회·스위치 변경이 있으면 그것이 끝난 뒤의 값으로 판정한다(직렬화).
--   · public.check_journal_generation(secret, job) — 워커가 **외부 모델을 부르기 직전** 호출. 허용 안 되면 작업을 멈추고 false.
--   · finish_journal_generation — 저장 직전 같은 판정. 허용 안 되면 **결과를 버리고** 빈 초안(확인 대기)으로 둔다.
--   멈출 때 일지는 claim 과 같은 방식: 확인 대기 + (AI 켜져 있는데 동의가 없으면) 안내 문구. 사람이 쓴 칸은 건드리지 않는다.
--   ⚠️ 이미 외부로 보낸 요청을 되돌린다고 말하지 않는다 — 이후 전송·저장만 막는다.

create or replace function app.journal_generation_allowed(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.journal_generation_jobs%rowtype;
  jr public.program_journals%rowtype;
begin
  select * into g from public.journal_generation_jobs where id = p_job_id;
  if g.id is null or g.status <> 'running' then return false; end if;
  select * into jr from public.program_journals where id = g.journal_id;
  if jr.id is null or jr.status <> 'generating' then return false; end if;
  -- 동의 변경과 직렬화(같은 키) · 기관 설정 변경과 직렬화(행 공유 잠금) — 진행 중 변경이 있으면 끝난 값으로 본다.
  perform pg_advisory_xact_lock(hashtextextended(jr.profile_id::text, 1010));
  perform 1 from public.org_settings where org_id = jr.org_id for share;
  return app.org_ai_drafts_enabled(jr.org_id) and app.has_processing_consent(jr.profile_id);
end $$;
revoke all on function app.journal_generation_allowed(uuid) from public, anon, authenticated;

-- 허용 안 된 작업을 멈춘다 — 일지는 빈 초안 확인 대기(사람이 쓴 칸 보존), 작업은 done.
create or replace function app.stop_journal_generation(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.journal_generation_jobs%rowtype;
  jr public.program_journals%rowtype;
begin
  select * into g from public.journal_generation_jobs where id = p_job_id for update;
  if g.id is null then return; end if;
  select * into jr from public.program_journals where id = g.journal_id for update;
  if jr.id is not null and jr.status = 'generating' then
    update public.program_journals set status = 'pending_review', last_error =
        case when app.org_ai_drafts_enabled(jr.org_id)
          then 'AI 초안을 만들지 않았어요(대화 처리 동의 확인 필요). 직접 작성해 주세요.'
          else null end
     where id = jr.id;
  end if;
  update public.journal_generation_jobs set status = 'done', last_error = null where id = g.id;
end $$;
revoke all on function app.stop_journal_generation(uuid) from public, anon, authenticated;

-- 외부 모델 호출 직전 확인(워커 전용). true = 계속, false = 멈췄음(보내지 말 것).
create or replace function public.check_journal_generation(p_secret text, p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app.verify_worker_secret('program-journal-draft', p_secret);
  if app.journal_generation_allowed(p_job_id) then return true; end if;
  perform app.stop_journal_generation(p_job_id);
  return false;
end $$;
revoke all on function public.check_journal_generation(text, uuid) from public, anon, authenticated;
grant execute on function public.check_journal_generation(text, uuid) to service_role;

-- 저장 직전 재확인 — 허용 안 되면 결과를 버린다(본문은 20260925000000 과 같고 판정만 앞에 붙였다).
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
  -- T25.5: 모델 호출 사이에 동의가 철회됐거나 AI 가 꺼졌으면 결과를 저장하지 않는다.
  if not app.journal_generation_allowed(p_job_id) then
    perform app.stop_journal_generation(p_job_id);
    return;
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
revoke all on function public.finish_journal_generation(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_journal_generation(text, uuid, jsonb) to service_role;

-- 기억온 — 일지 초안 워커의 동의 철회·AI 스위치 재확인(T25.5, 20260930010000) 회귀
--
-- ⚠️ 처리 동의를 철회하므로 **러너의 맨 마지막**에 실행한다(뒤에 이 어르신의 동의에 기대는 테스트가 없어야 한다).
-- pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02)와 처리 동의가 있는 어르신 1명을 쓴다.
-- 지키는 것:
--   ① check_journal_generation — 워커(service_role) 전용 · 비밀값 필수
--   ② 잡은 뒤 AI 를 끄면: 모델 호출 전 확인이 false(작업 멈춤 · 빈 초안 확인 대기 · 안내 문구 없음)
--   ③ 잡은 뒤 AI 를 끄면: 모델 결과가 와도 저장하지 않는다
--   ④ 잡은 뒤 동의를 철회하면: 모델 결과를 저장하지 않고 동의 안내 문구로 확인 대기 · 사람이 쓴 칸은 보존
--   ⑤ 허용된 작업은 그대로 — 확인 true · 결과 저장

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table wc as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id and app.has_processing_consent(p.id) order by p.id limit 1) as p_ok,
       (select secret from app.worker_config where name = 'program-journal-draft') as secret
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';

-- 세션 종료 → generating 일지 + 작업 → 워커가 잡는다(running). 잡힌 작업 id 를 돌려준다.
create or replace function pg_temp.claimed_job() returns uuid language plpgsql as $$
declare sid uuid; jid uuid; job uuid;
begin
  insert into public.sessions (profile_id, user_id, org_id, status, started_at)
  values ((select p_ok from wc), 'a0000000-0000-0000-0000-000000000002', (select org from wc), 'active', now() - interval '9 minutes')
  returning id into sid;
  update public.sessions set status = 'ended', ended_at = now() where id = sid;
  select id into jid from public.program_journals where session_id = sid;
  update public.journal_generation_jobs set next_run_at = now() - interval '1 second' where journal_id = jid;
  perform public.claim_journal_generation_jobs((select secret from wc), 10);
  select id into job from public.journal_generation_jobs where journal_id = jid and status = 'running';
  assert job is not null, '작업이 running 으로 잡혀야 함';
  return job;
end $$;
create or replace function pg_temp.journal_of(p_job uuid) returns public.program_journals language sql as $$
  select j.* from public.program_journals j join public.journal_generation_jobs g on g.journal_id = j.id where g.id = p_job
$$;

-- 앞선 테스트가 남긴 대기 작업은 치운다(이 파일의 claim 이 엉뚱한 작업을 잡지 않게).
update public.journal_generation_jobs set status = 'done' where status in ('queued', 'running');

-- ① 권한
do $$
declare blocked boolean := false;
begin
  assert not has_function_privilege('authenticated', 'public.check_journal_generation(text, uuid)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.check_journal_generation(text, uuid)', 'EXECUTE'),
    '확인 RPC 는 클라이언트가 부를 수 없어야 함';
  assert has_function_privilege('service_role', 'public.check_journal_generation(text, uuid)', 'EXECUTE'),
    '확인 RPC 는 워커(service_role)가 부를 수 있어야 함';
  assert not has_function_privilege('authenticated', 'app.journal_generation_allowed(uuid)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'app.stop_journal_generation(uuid)', 'EXECUTE'),
    '내부 판정·멈춤 함수는 직접 부를 수 없어야 함';
  begin
    perform public.check_journal_generation('틀린비밀값', gen_random_uuid());
  exception when insufficient_privilege then blocked := sqlerrm = 'WORKER_UNAUTHORIZED';
  end;
  assert blocked, '비밀값이 틀리면 거부';
end $$;

update public.org_settings set ai_drafts_enabled = true where org_id = (select org from wc);

-- ⑤ 허용된 작업 — 확인 true · 결과 저장
do $$
declare job uuid := pg_temp.claimed_job(); j public.program_journals;
begin
  assert public.check_journal_generation((select secret from wc), job), '허용된 작업은 계속해야 함';
  perform public.finish_journal_generation((select secret from wc), job, '{"activity_content":"AI 초안 내용"}'::jsonb);
  j := pg_temp.journal_of(job);
  assert j.status = 'pending_review' and j.activity_content = 'AI 초안 내용', '허용된 작업의 결과는 저장돼야 함';
end $$;

-- ② 잡은 뒤 AI 끔 → 모델 호출 전 확인에서 멈춘다
do $$
declare job uuid := pg_temp.claimed_job(); j public.program_journals;
begin
  update public.org_settings set ai_drafts_enabled = false where org_id = (select org from wc);
  assert not public.check_journal_generation((select secret from wc), job), 'AI 가 꺼졌으면 모델을 부르면 안 됨';
  j := pg_temp.journal_of(job);
  assert j.status = 'pending_review' and j.activity_content is null and j.last_error is null,
    'AI 를 끈 경우 빈 초안 확인 대기(동의 안내 문구 없음)';
  assert (select status from public.journal_generation_jobs where id = job) = 'done', '작업은 끝나야 함';
  update public.org_settings set ai_drafts_enabled = true where org_id = (select org from wc);
end $$;

-- ③ 잡은 뒤(확인 통과 후) AI 끔 → 결과가 와도 저장하지 않는다
do $$
declare job uuid := pg_temp.claimed_job(); j public.program_journals;
begin
  assert public.check_journal_generation((select secret from wc), job);
  update public.org_settings set ai_drafts_enabled = false where org_id = (select org from wc);
  perform public.finish_journal_generation((select secret from wc), job, '{"activity_content":"버려야 할 초안"}'::jsonb);
  j := pg_temp.journal_of(job);
  assert j.activity_content is null and j.status = 'pending_review' and j.draft_generated_at is null,
    'AI 를 끈 뒤 도착한 결과는 저장되면 안 됨';
  assert (select status from public.journal_generation_jobs where id = job) = 'done';
  update public.org_settings set ai_drafts_enabled = true where org_id = (select org from wc);
end $$;

-- ④ 잡은 뒤 동의 철회 → 결과를 저장하지 않고 동의 안내 · 사람이 쓴 칸 보존
do $$
declare job uuid := pg_temp.claimed_job(); j public.program_journals;
begin
  assert public.check_journal_generation((select secret from wc), job);
  -- 요양보호사가 먼저 적어 둔 칸
  update public.program_journals set location = '프로그램실(사람)' where id = (pg_temp.journal_of(job)).id;
  update public.consents set revoked_at = now()
   where profile_id = (select p_ok from wc) and consent_type = 'ai_processing' and revoked_at is null;
  assert not app.has_processing_consent((select p_ok from wc)), '철회 뒤에는 처리 동의가 없어야 함';
  perform public.finish_journal_generation((select secret from wc), job,
    '{"activity_content":"철회 뒤 도착한 초안","guardian_text":"보호자 문장"}'::jsonb);
  j := pg_temp.journal_of(job);
  assert j.activity_content is null and j.guardian_text is null, '동의 철회 뒤 도착한 결과는 저장되면 안 됨';
  assert j.status = 'pending_review' and j.last_error like '%동의%', '동의 안내 문구와 함께 확인 대기';
  assert j.location = '프로그램실(사람)', '사람이 쓴 칸은 보존';
  assert (select status from public.journal_generation_jobs where id = job) = 'done';
end $$;

select 'journal worker consent recheck assertions passed';

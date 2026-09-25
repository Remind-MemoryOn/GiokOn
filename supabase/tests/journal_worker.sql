-- 기억온 — 일지 초안 자동 생성 워커(C4, 20260925000000) 회귀
--
-- legal_consents.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02)와
-- 그 기관의 어르신(처리 동의 있음 / 없음)을 쓴다.
-- 지키는 것:
--   ① AI 스위치 — 기본 꺼짐 · 클라이언트(기관 관리자 포함)는 켜고 끌 수 없다 · 꺼진 기관은 작업 없이 바로 확인 대기
--   ② 워커 RPC — service_role 만 실행 · 비밀값이 틀리면 거부
--   ③ claim → fail(백오프 30s…5m) → 6회째 failed → 사람의 "다시 생성" → claim → finish(사람이 쓴 칸 보존, 확인 대기까지만)
--   ④ 잡을 때 다시 확인 — 사람이 이미 확인한 일지 · AI 가 꺼진 기관 · 처리 동의 없음 → 원문을 AI 로 보내지 않는다
--   ⑤ 멈춘 작업 회수 · 스케줄 함수는 주소가 없으면 아무것도 하지 않는다

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table jw as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id and app.has_processing_consent(p.id) order by p.id limit 1) as p_ok,
       (select p.id from public.profiles p where p.org_id = u.org_id and not app.has_processing_consent(p.id) order by p.id limit 1) as p_no,
       (select secret from app.worker_config where name = 'program-journal-draft') as secret
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';
grant select on jw to authenticated;

-- 테스트용 종료 세션(슈퍼유저) — 끝나는 순간 트리거가 일지를 만든다.
create or replace function pg_temp.end_session(p_profile uuid) returns uuid language plpgsql as $$
declare sid uuid;
begin
  insert into public.sessions (profile_id, user_id, org_id, status, started_at)
  values (p_profile, 'a0000000-0000-0000-0000-000000000002', (select org from jw), 'active', now() - interval '12 minutes')
  returning id into sid;
  update public.sessions set status = 'ended', ended_at = now() where id = sid;
  return sid;
end $$;

-- ── ① AI 스위치 ─────────────────────────────────────────────────────────────
update public.org_settings set ai_drafts_enabled = false where org_id = (select org from jw);
do $$
declare blocked boolean := false; n int;
begin
  assert (select count(*) from public.org_settings o join public.organizations g on g.id = o.org_id
           where not o.ai_drafts_enabled) >= 1, 'AI 스위치 기본값은 꺼짐';
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', true);  -- 기관 관리자
  begin
    update public.org_settings set ai_drafts_enabled = true;
  exception when insufficient_privilege then blocked := sqlerrm = 'ORG_AI_SWITCH_OPERATOR_ONLY';
  end;
  assert blocked, '기관 관리자도 AI 스위치를 켤 수 없어야 함(운영자 전용)';
  update public.org_settings set default_location = '프로그램실';
  get diagnostics n = row_count;
  assert n = 1, '다른 설정 칸은 기관 관리자가 그대로 바꿀 수 있어야 함';
  reset role;
end $$;

-- 꺼진 기관: 세션 종료 → 작업 없이 곧바로 확인 대기(빈 초안 = 직접 작성)
do $$
declare sid uuid := pg_temp.end_session((select p_ok from jw)); j public.program_journals%rowtype;
begin
  select * into j from public.program_journals where session_id = sid;
  assert j.status = 'pending_review', 'AI 가 꺼진 기관의 일지는 바로 확인 대기여야 함';
  assert j.activity_content is null and j.draft_generated_at is null, '꺼진 기관은 초안 내용이 없어야 함';
  assert not exists (select 1 from public.journal_generation_jobs where journal_id = j.id), '꺼진 기관은 생성 작업이 없어야 함';
end $$;

-- ── ② 워커 RPC 권한 · 비밀값 ─────────────────────────────────────────────────
do $$
declare blocked boolean := false;
begin
  assert not has_function_privilege('authenticated', 'public.claim_journal_generation_jobs(text, integer)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.claim_journal_generation_jobs(text, integer)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.finish_journal_generation(text, uuid, jsonb)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.fail_journal_generation(text, uuid, text, boolean)', 'EXECUTE'),
    '워커 RPC 는 클라이언트가 실행할 수 없어야 함';
  assert has_function_privilege('service_role', 'public.claim_journal_generation_jobs(text, integer)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.finish_journal_generation(text, uuid, jsonb)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.fail_journal_generation(text, uuid, text, boolean)', 'EXECUTE'),
    '워커 RPC 는 service_role 이 실행할 수 있어야 함';
  assert not has_table_privilege('authenticated', 'app.worker_config', 'SELECT')
     and not has_table_privilege('service_role', 'app.worker_config', 'SELECT'),
    '워커 비밀값은 어떤 API 역할도 직접 읽을 수 없어야 함';
  assert (select length(secret) = 64 from app.worker_config where name = 'program-journal-draft'), '워커 비밀값은 64자 난수';
  begin
    perform public.claim_journal_generation_jobs('틀린비밀값', 3);
  exception when insufficient_privilege then blocked := sqlerrm = 'WORKER_UNAUTHORIZED';
  end;
  assert blocked, '비밀값이 틀리면 작업을 잡을 수 없어야 함';
  blocked := false;
  begin
    perform public.claim_journal_generation_jobs(null, 3);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, '비밀값이 없으면 작업을 잡을 수 없어야 함';
end $$;

-- ── ③ 켜진 기관: claim → 실패 백오프 → failed → 다시 생성 → finish ──────────────
update public.org_settings set ai_drafts_enabled = true where org_id = (select org from jw);
-- 앞선 파일이 남긴 대기 작업은 이 파일의 단언과 섞이지 않게 끝낸다.
update public.journal_generation_jobs set status = 'done' where status in ('queued', 'running');

create temp table jw_s as select pg_temp.end_session((select p_ok from jw)) as sid;
create temp table jw_j as select id as jid from public.program_journals where session_id = (select sid from jw_s);
grant select on jw_j to authenticated;

do $$
declare
  sec text := (select secret from jw);
  jid uuid := (select jid from jw_j);
  r record; n int; res text; nxt timestamptz; i int;
begin
  assert (select status from public.program_journals where id = jid) = 'generating', '켜진 기관은 generating 으로 생겨야 함';

  -- 첫 claim: running · 시도 1 · 일지 시도 횟수 동기
  select count(*) into n from public.claim_journal_generation_jobs(sec, 3) c where c.journal_id = jid;
  assert n = 1, '대기 작업을 잡아야 함';
  assert (select status = 'running' and attempts = 1 from public.journal_generation_jobs where journal_id = jid), '잡은 작업은 running · 시도 1';
  assert (select generation_attempts from public.program_journals where id = jid) = 1, '일지 시도 횟수도 1';
  select count(*) into n from public.claim_journal_generation_jobs(sec, 3);
  assert n = 0, '이미 잡힌 작업은 다시 잡히지 않아야 함';

  -- 재시도 가능한 실패 → 30초 뒤 · 일지는 generating 유지 + 오류 문구
  res := public.fail_journal_generation(sec, (select id from public.journal_generation_jobs where journal_id = jid), '대화 기록을 아직 읽지 못했어요.', true);
  assert res = 'queued', '재시도 가능한 실패는 다시 대기';
  select next_run_at into nxt from public.journal_generation_jobs where journal_id = jid;
  assert nxt between now() + interval '29 seconds' and now() + interval '31 seconds', '첫 실패 뒤 30초 백오프';
  assert (select status = 'generating' and last_error = '대화 기록을 아직 읽지 못했어요.' from public.program_journals where id = jid),
    '재시도 중 일지는 generating + 오류 문구';
  select count(*) into n from public.claim_journal_generation_jobs(sec, 3);
  assert n = 0, '백오프 시각 전에는 잡히지 않아야 함';

  -- 2~6회째: 백오프 1m·2m·4m·5m(상한) → 6회째 실패는 failed
  for i in 2..6 loop
    update public.journal_generation_jobs set next_run_at = now() where journal_id = jid;
    select count(*) into n from public.claim_journal_generation_jobs(sec, 3);
    assert n = 1, format('%s회째 claim', i);
    res := public.fail_journal_generation(sec, (select id from public.journal_generation_jobs where journal_id = jid), 'AI 응답이 없어요.', true);
    if i < 6 then
      assert res = 'queued', format('%s회째 실패는 다시 대기', i);
      select next_run_at into nxt from public.journal_generation_jobs where journal_id = jid;
      assert nxt between now() + least(interval '30 seconds' * power(2, i - 1), interval '5 minutes') - interval '1 second'
                     and now() + least(interval '30 seconds' * power(2, i - 1), interval '5 minutes') + interval '1 second',
        format('%s회째 백오프', i);
    else
      assert res = 'failed', '6회째 실패는 failed';
    end if;
  end loop;
  assert (select status = 'failed' and attempts = 6 from public.journal_generation_jobs where journal_id = jid), '작업 failed · 시도 6';
  assert (select status = 'failed' and generation_attempts = 6 and last_error = 'AI 응답이 없어요.' from public.program_journals where id = jid),
    '일지 failed · 시도 6 · 오류 문구';
end $$;

-- 재시도 불가 실패는 곧바로 failed(다른 일지로 확인)
do $$
declare sec text := (select secret from jw); sid uuid := pg_temp.end_session((select p_ok from jw)); jid uuid; res text;
begin
  select id into jid from public.program_journals where session_id = sid;
  perform public.claim_journal_generation_jobs(sec, 10);
  res := public.fail_journal_generation(sec, (select id from public.journal_generation_jobs where journal_id = jid), '대화가 너무 길어요.', false);
  assert res = 'failed' and (select status from public.program_journals where id = jid) = 'failed', '재시도 불가 실패는 1회에 failed';
end $$;

-- 사람의 "다시 생성" → 다시 대기(시도 0)
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
select public.retry_journal_generation((select jid from jw_j));
reset role;

do $$
declare sec text := (select secret from jw); jid uuid := (select jid from jw_j); n int; j public.program_journals%rowtype; blocked boolean := false;
begin
  assert (select status = 'queued' and attempts = 0 from public.journal_generation_jobs where journal_id = jid), '다시 생성 → 대기 · 시도 0';
  select count(*) into n from public.claim_journal_generation_jobs(sec, 3) c where c.journal_id = jid;
  assert n = 1, '다시 생성한 작업을 잡아야 함';
  -- 생성 중에 사람이 활동 내용을 먼저 적었다(generating 은 그대로)
  update public.program_journals set activity_content = '사람이 먼저 쓴 활동 내용' where id = jid;
  perform public.finish_journal_generation(sec, (select id from public.journal_generation_jobs where journal_id = jid),
    jsonb_build_object('activity_content', 'AI 활동 내용', 'participant_response', 'AI 반응',
                       'opinion_collected', '  ', 'guardian_text', '오늘 고향 이야기를 들려주셨어요.',
                       'overall_evaluation', 'AI 가 쓰면 안 되는 칸'));
  select * into j from public.program_journals where id = jid;
  assert j.status = 'pending_review', '완료하면 확인 대기(확정 아님)';
  assert j.activity_content = '사람이 먼저 쓴 활동 내용', '사람이 먼저 쓴 칸은 덮어쓰지 않아야 함';
  assert j.participant_response = 'AI 반응' and j.guardian_text = '오늘 고향 이야기를 들려주셨어요.', 'AI 초안 칸 채움';
  assert j.opinion_collected is null, '공백뿐인 값은 채우지 않음';
  assert j.overall_evaluation is null, '종합평가는 워커가 쓰지 않음';
  assert j.draft_generated_at is not null and j.last_error is null and j.generation_attempts = 1, '생성 시각·오류 정리·시도 횟수';
  assert j.finalized_at is null and j.guardian_text_approved_at is null, '확정·보호자 문장 승인은 사람 몫';
  assert (select status from public.journal_generation_jobs where journal_id = jid) = 'done', '작업 done';
  begin
    perform public.finish_journal_generation(sec, (select id from public.journal_generation_jobs where journal_id = jid), '{}'::jsonb);
  exception when invalid_parameter_value then blocked := sqlerrm = 'JOB_NOT_RUNNING';
  end;
  assert blocked, '끝난 작업은 다시 완료할 수 없어야 함';
end $$;

-- ── ④ 잡을 때 다시 확인 ───────────────────────────────────────────────────────
do $$
declare
  sec text := (select secret from jw); n int;
  s1 uuid; s2 uuid; j1 uuid; j2 uuid; j3 uuid;
begin
  -- 사람이 이미 확인 대기로 옮긴 일지 → 작업만 끝낸다
  s1 := pg_temp.end_session((select p_ok from jw));
  select id into j1 from public.program_journals where session_id = s1;
  update public.program_journals set status = 'pending_review', activity_content = '직접 작성' where id = j1;
  -- AI 를 켠 채로 만든 작업이 대기 중에 기관이 AI 를 끈다
  s2 := pg_temp.end_session((select p_ok from jw));
  select id into j2 from public.program_journals where session_id = s2;
  -- 처리 동의가 없는 어르신(수기 일지 + 작업을 슈퍼유저로 직접 만든다 — 세션은 동의 없이는 못 시작한다)
  insert into public.program_journals (org_id, profile_id, status) values ((select org from jw), (select p_no from jw), 'generating')
    returning id into j3;
  insert into public.journal_generation_jobs (journal_id, session_id, org_id)
    values (j3, gen_random_uuid(), (select org from jw));

  select count(*) into n from public.claim_journal_generation_jobs(sec, 10) c where c.journal_id in (j1, j3);
  assert n = 0, '확인 대기 일지·동의 없는 어르신은 AI 로 보내지 않아야 함';
  assert (select status from public.journal_generation_jobs where journal_id = j1) = 'done', '확인된 일지의 작업은 done';
  assert (select activity_content from public.program_journals where id = j1) = '직접 작성', '사람 내용은 그대로';
  assert (select status = 'pending_review' and last_error like 'AI 초안을 만들지 않았어요(대화 처리 동의 확인 필요)%'
            from public.program_journals where id = j3), '동의 없는 어르신은 빈 초안 + 안내';
  -- j2 는 위 claim 에서 이미 running — 되돌려서 AI 꺼짐 확인
  update public.journal_generation_jobs set status = 'queued', next_run_at = now() where journal_id = j2;
  update public.org_settings set ai_drafts_enabled = false where org_id = (select org from jw);
  select count(*) into n from public.claim_journal_generation_jobs(sec, 10) c where c.journal_id = j2;
  assert n = 0, 'AI 가 꺼진 기관의 작업은 AI 로 보내지 않아야 함';
  assert (select status = 'pending_review' and last_error is null from public.program_journals where id = j2), 'AI 꺼짐 → 빈 초안 확인 대기';
  assert (select status from public.journal_generation_jobs where journal_id = j2) = 'done', 'AI 꺼짐 → 작업 done';
  update public.org_settings set ai_drafts_enabled = true where org_id = (select org from jw);
end $$;

-- ── ⑤ 멈춘 작업 회수 · 스케줄 함수 ─────────────────────────────────────────────
do $$
declare sec text := (select secret from jw); sid uuid := pg_temp.end_session((select p_ok from jw)); jid uuid; n int; bad boolean := false;
begin
  select id into jid from public.program_journals where session_id = sid;
  perform public.claim_journal_generation_jobs(sec, 10);
  -- 워커가 죽었다: running 인 채로 6분 지남
  alter table public.journal_generation_jobs disable trigger set_journal_generation_jobs_updated_at;
  update public.journal_generation_jobs set updated_at = now() - interval '6 minutes' where journal_id = jid;
  alter table public.journal_generation_jobs enable trigger set_journal_generation_jobs_updated_at;
  select count(*) into n from public.claim_journal_generation_jobs(sec, 10) c where c.journal_id = jid;
  assert n = 1, '5분 넘게 멈춘 작업은 다시 잡혀야 함';
  assert (select attempts from public.journal_generation_jobs where journal_id = jid) = 2, '회수된 작업도 시도 횟수를 센다';

  -- 주소가 없으면 스케줄 함수는 아무것도 하지 않는다(CI·로컬 — pg_net 이 없어도 오류 없음)
  assert (select endpoint is null from app.worker_config where name = 'program-journal-draft'), '마이그레이션은 주소를 넣지 않는다';
  perform app.kick_journal_worker();
  begin
    update app.worker_config set endpoint = 'http://insecure.example/functions/v1/program-journal-draft' where name = 'program-journal-draft';
  exception when check_violation then bad := true;
  end;
  assert bad, '워커 주소는 https 만';
  assert not has_function_privilege('authenticated', 'app.kick_journal_worker()', 'EXECUTE'), '스케줄 함수는 클라이언트가 못 부른다';
end $$;

-- 뒷정리: 이 파일이 켠 스위치를 끈다
update public.org_settings set ai_drafts_enabled = false where org_id = (select org from jw);

select 'journal worker assertions passed' as result;

-- 파일럿 계획 D5 (tasks T20.1 · T20.2) — 요양일지 → 프로그램 일지(공단 서식)
--
-- ■ 무엇을 하나
--   1) care_journals · journal_photos **DROP**(데이터 포함 — 사용자 확정. 2026-09-24 운영 행 수 0).
--      사진 파일 버킷 `journal-photos` 와 그 Storage 정책(경로 `<profile_id>/…` 기준)은 그대로 재사용한다.
--   2) program_journals — 공단 서식 필드를 **개별 컬럼**으로(계획 결정 B). 상태 generating|pending_review|final|failed.
--      program_journal_photos · program_journal_revisions(확정 후 수정 이력) · journal_generation_jobs(초안 생성 큐).
--   3) 트리거 4종(계획 T20.2)
--      · 확정 가드 — `final` 은 **사람만**(auth.uid() 없으면 예외 → service_role 워커는 확정 불가) + 위임 권한
--        `journal_finalize` + 진행자(요양보호사, AI 아님) 필수. 확정은 되돌릴 수 없다.
--      · 이력 — 확정 뒤 공단 필드를 고치면 **사유 필수**, 누가·언제·무엇을 program_journal_revisions 에 남긴다.
--      · 세션 종료 enqueue — sessions 가 ended 가 되면 `generating` 일지 + 생성 작업을 만든다(워커 C4 가 소비).
--      · 공개 게이트 — 일지는 확정 + 보호자 문장 승인 뒤에만, 사진은 확정 일지의 것만 보호자에게 공개할 수 있다.
--   4) care_grade enum + profiles.care_grade(장기요양등급 — 1~5등급·인지지원등급, 선택값).
--   5) 보호자 열람은 **보호자 문장만**(계획 W4 — 공단 서식을 보호자에게 직접 노출하지 않는다):
--      program_journals 에 보호자 SELECT 정책을 두지 않고 get_my_shared_journals() RPC 로 필요한 칸만 준다.
--
-- ■ 지키는 원칙
--   · 워커가 쓰는 칸(generating/failed 상태·시도 횟수·오류)은 클라이언트가 못 바꾼다.
--   · 확정자·확정 시각·보호자 문장 승인자·승인 시각은 서버가 채운다(클라이언트 값 무시).
--   · 주간보호 출석 테이블은 만들지 않는다(ERP 영역) — 제공 여부는 delivered/non_delivery_reason 으로만.

-- ──────────────────────────────────────────────────────────────────────────
-- 0) 기존 요양일지 삭제
-- ──────────────────────────────────────────────────────────────────────────
-- 지워질 일지·사진을 가리키는 공개 행을 먼저 지운다(남기면 없는 항목을 가리키는 이력이 된다).
delete from public.guardian_shares where item_type in ('journal', 'photo');
drop table if exists public.journal_photos;
drop table if exists public.care_journals;
drop type if exists public.journal_source;
drop type if exists public.journal_status;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 타입
-- ──────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.program_journal_status as enum ('generating', 'pending_review', 'final', 'failed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.journal_non_delivery_reason as enum ('absent', 'unwell', 'refused', 'other');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.care_grade as enum ('grade_1', 'grade_2', 'grade_3', 'grade_4', 'grade_5', 'cognitive_support');
exception when duplicate_object then null;
end $$;

alter table public.profiles add column if not exists care_grade public.care_grade;
comment on column public.profiles.care_grade is '장기요양등급(없으면 미입력). 주간보호 기관 필수 여부는 화면(W8)이 안내한다.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2) program_journals
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.program_journals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null,
  -- 세션에서 자동 생성된 일지만 가진다. 수기(미제공 기록 등) 일지는 null.
  session_id uuid unique,
  status public.program_journal_status not null default 'pending_review',
  -- 공단 서식
  journal_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  operated_from time,
  operated_to time,
  program_type text not null default '인지활동 - 회상훈련',
  location text,
  facilitator_user_id uuid references public.users(id) on delete set null,
  participants text,
  goal text,
  activity_content text,
  participant_response text,
  opinion_collected text,
  overall_evaluation text,
  next_plan text,
  tool_used text,
  -- 주간보호 제공 여부
  delivered boolean not null default true,
  non_delivery_reason public.journal_non_delivery_reason,
  -- 보호자용 문장(보호자에게는 이것만 보인다)
  guardian_text text,
  guardian_text_approved_by uuid references public.users(id) on delete set null,
  guardian_text_approved_at timestamptz,
  -- 확정·생성
  finalized_by uuid references public.users(id) on delete set null,
  finalized_at timestamptz,
  draft_generated_at timestamptz,
  generation_attempts integer not null default 0,
  last_error text,
  -- 확정 후 수정 사유 — UPDATE 에 같이 실어 보내면 트리거가 이력으로 옮기고 비운다(행에 남지 않는다).
  edit_reason text,
  created_by uuid default auth.uid() references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_journals_profile_org_fk foreign key (profile_id, org_id)
    references public.profiles(id, org_id) on delete cascade,
  constraint program_journals_session_fk foreign key (session_id, profile_id, org_id)
    references public.sessions(id, profile_id, org_id) on delete cascade,
  constraint program_journals_time_check
    check (operated_from is null or operated_to is null or operated_to >= operated_from),
  constraint program_journals_delivery_check
    check ((delivered and non_delivery_reason is null) or (not delivered and non_delivery_reason is not null)),
  constraint program_journals_program_type_check check (char_length(btrim(program_type)) between 1 and 60),
  constraint program_journals_location_check check (location is null or char_length(location) <= 60),
  constraint program_journals_participants_check check (participants is null or char_length(participants) <= 200),
  constraint program_journals_goal_check check (goal is null or char_length(goal) <= 2000),
  constraint program_journals_content_check check (activity_content is null or char_length(activity_content) <= 5000),
  constraint program_journals_response_check check (participant_response is null or char_length(participant_response) <= 2000),
  constraint program_journals_opinion_check check (opinion_collected is null or char_length(opinion_collected) <= 2000),
  constraint program_journals_evaluation_check check (overall_evaluation is null or char_length(overall_evaluation) <= 2000),
  constraint program_journals_next_plan_check check (next_plan is null or char_length(next_plan) <= 2000),
  constraint program_journals_tool_check check (tool_used is null or char_length(tool_used) <= 60),
  constraint program_journals_guardian_text_check check (guardian_text is null or char_length(guardian_text) <= 1000),
  constraint program_journals_last_error_check check (last_error is null or char_length(last_error) <= 500),
  constraint program_journals_attempts_check check (generation_attempts between 0 and 100)
);
create index if not exists idx_program_journals_org_status on public.program_journals(org_id, status, journal_date desc);
create index if not exists idx_program_journals_profile_date on public.program_journals(profile_id, journal_date desc);

create trigger set_program_journals_updated_at before update on public.program_journals
  for each row execute function app.set_updated_at();
create trigger stamp_program_journals_org_id before insert on public.program_journals
  for each row execute function app.stamp_org_id();
create trigger audit_program_journals after insert or update or delete on public.program_journals
  for each row execute function app.write_audit_log();
-- 신원 고정(R012) — 기관·어르신·세션·작성자를 옮기지 못한다.
create trigger a_guard_record_identity before update on public.program_journals
  for each row execute function app.guard_record_identity('id','org_id','profile_id','session_id','created_by');

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 사진 · 수정 이력 · 생성 큐
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.program_journal_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  journal_id uuid not null references public.program_journals(id) on delete cascade,
  path text not null unique,
  caption text,
  sort smallint not null default 0,
  uploaded_by uuid default auth.uid() references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_journal_photos_path_check check (char_length(path) between 1 and 500),
  constraint program_journal_photos_caption_check check (caption is null or char_length(caption) <= 200),
  constraint program_journal_photos_sort_check check (sort between 0 and 20)
);
create index if not exists idx_program_journal_photos_journal on public.program_journal_photos(journal_id, sort, created_at);
create trigger set_program_journal_photos_updated_at before update on public.program_journal_photos
  for each row execute function app.set_updated_at();
create trigger stamp_program_journal_photos_org_id before insert on public.program_journal_photos
  for each row execute function app.stamp_org_id();
create trigger audit_program_journal_photos after insert or update or delete on public.program_journal_photos
  for each row execute function app.write_audit_log();
create trigger a_guard_record_identity before update on public.program_journal_photos
  for each row execute function app.guard_record_identity('id','org_id','journal_id','path');

create table if not exists public.program_journal_revisions (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.program_journals(id) on delete cascade,
  org_id uuid not null,
  profile_id uuid not null,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text not null,
  -- {"필드": {"from": 이전값, "to": 새값}}
  changes jsonb not null,
  constraint program_journal_revisions_reason_check check (char_length(btrim(reason)) between 1 and 200)
);
create index if not exists idx_program_journal_revisions_journal on public.program_journal_revisions(journal_id, changed_at);

create table if not exists public.journal_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null unique references public.program_journals(id) on delete cascade,
  session_id uuid not null,
  org_id uuid not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_generation_jobs_status_check check (status in ('queued', 'running', 'done', 'failed')),
  constraint journal_generation_jobs_attempts_check check (attempts between 0 and 100)
);
create index if not exists idx_journal_generation_jobs_due on public.journal_generation_jobs(next_run_at) where status = 'queued';
create trigger set_journal_generation_jobs_updated_at before update on public.journal_generation_jobs
  for each row execute function app.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 트리거 ① 확정 가드 ② 확정 후 수정 이력 (+ 워커 전용 칸 보호 · 보호자 문장 승인 스탬프)
-- ──────────────────────────────────────────────────────────────────────────
-- 이력 기록은 정의자 권한(이력 표에는 INSERT 정책이 없다). 가드 자체는 invoker 라야
-- current_user 로 "클라이언트 직접 쓰기"를 가를 수 있다(users.role 3중 잠금과 같은 방식).
create or replace function app.record_journal_revision(p_journal_id uuid, p_org_id uuid, p_profile_id uuid,
  p_reason text, p_changes jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.program_journal_revisions (journal_id, org_id, profile_id, changed_by, reason, changes)
  values (p_journal_id, p_org_id, p_profile_id, auth.uid(), btrim(p_reason), p_changes);
$$;
revoke all on function app.record_journal_revision(uuid, uuid, uuid, text, jsonb) from public, anon;
-- invoker 가드가 호출자 권한으로 부른다. app 스키마는 API(PostgREST)에 노출되지 않는다(is_care_team 과 같은 방식).
grant execute on function app.record_journal_revision(uuid, uuid, uuid, text, jsonb) to authenticated;

-- 진행자는 같은 기관 돌봄팀 구성원이어야 한다(AI·보호자·타 기관 불가).
create or replace function app.is_org_care_member(p_user uuid, p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.users
    where id = p_user and org_id = p_org and onboarded_at is not null
      and role in ('org_admin', 'caregiver', 'social_worker', 'center_director'));
$$;
revoke all on function app.is_org_care_member(uuid, uuid) from public, anon;
grant execute on function app.is_org_care_member(uuid, uuid) to authenticated;

create or replace function app.guard_program_journal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  client boolean := current_user in ('authenticated', 'anon');
  changes jsonb := '{}'::jsonb;
  f text;
  tracked constant text[] := array['journal_date','operated_from','operated_to','program_type','location',
    'facilitator_user_id','participants','goal','activity_content','participant_response','opinion_collected',
    'overall_evaluation','next_plan','tool_used','delivered','non_delivery_reason'];
  finalizing boolean;
begin
  -- 워커 전용 칸: 클라이언트는 생성 상태로 만들거나 시도 횟수·오류를 쓸 수 없다.
  if client then
    if tg_op = 'INSERT' then
      if new.status not in ('pending_review', 'final') or new.generation_attempts <> 0 or new.last_error is not null then
        raise exception 'JOURNAL_WORKER_FIELDS' using errcode = '42501';
      end if;
    else
      if (new.status in ('generating', 'failed') and new.status is distinct from old.status)
         or new.generation_attempts is distinct from old.generation_attempts
         or new.last_error is distinct from old.last_error then
        raise exception 'JOURNAL_WORKER_FIELDS' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 확정은 되돌릴 수 없다.
  if tg_op = 'UPDATE' and old.status = 'final' and new.status <> 'final' then
    raise exception 'JOURNAL_FINAL_LOCKED' using errcode = '42501';
  end if;

  -- 진행자: 같은 기관 돌봄팀만(바뀔 때마다 확인).
  if new.facilitator_user_id is not null
     and (tg_op = 'INSERT' or new.facilitator_user_id is distinct from old.facilitator_user_id)
     and not app.is_org_care_member(new.facilitator_user_id, new.org_id) then
    raise exception 'JOURNAL_FACILITATOR_INVALID' using errcode = '22023';
  end if;

  finalizing := new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final');
  if finalizing then
    -- ① 확정 가드 — 사람만(서비스 계정 워커는 auth.uid() 가 없다) · 위임 권한 · 진행자 · 활동 내용.
    if auth.uid() is null then
      raise exception 'JOURNAL_FINALIZE_HUMAN_ONLY' using errcode = '42501';
    end if;
    if not app.has_capability('journal_finalize') then
      raise exception 'JOURNAL_FINALIZE_FORBIDDEN' using errcode = '42501';
    end if;
    if new.facilitator_user_id is null then
      raise exception 'JOURNAL_FACILITATOR_REQUIRED' using errcode = '23514';
    end if;
    if new.delivered and nullif(btrim(coalesce(new.activity_content, '')), '') is null then
      raise exception 'JOURNAL_CONTENT_REQUIRED' using errcode = '23514';
    end if;
    new.finalized_by := auth.uid();
    new.finalized_at := statement_timestamp();
  elsif tg_op = 'INSERT' then
    new.finalized_by := null;
    new.finalized_at := null;
  else
    new.finalized_by := old.finalized_by;
    new.finalized_at := old.finalized_at;
  end if;

  -- ② 확정 후 수정 — 위임 권한 + 사유 필수, 바뀐 칸을 이력으로 남긴다.
  if tg_op = 'UPDATE' and old.status = 'final' then
    foreach f in array tracked loop
      if to_jsonb(new) -> f is distinct from to_jsonb(old) -> f then
        changes := changes || jsonb_build_object(f, jsonb_build_object('from', to_jsonb(old) -> f, 'to', to_jsonb(new) -> f));
      end if;
    end loop;
    if changes <> '{}'::jsonb then
      if auth.uid() is null then
        raise exception 'JOURNAL_FINALIZE_HUMAN_ONLY' using errcode = '42501';
      end if;
      if not app.has_capability('journal_finalize') then
        raise exception 'JOURNAL_EDIT_FORBIDDEN' using errcode = '42501';
      end if;
      if new.edit_reason is null or char_length(btrim(new.edit_reason)) not between 1 and 200 then
        raise exception 'JOURNAL_EDIT_REASON_REQUIRED' using errcode = '23514';
      end if;
      perform app.record_journal_revision(old.id, old.org_id, old.profile_id, new.edit_reason, changes);
    end if;
  end if;
  new.edit_reason := null;

  -- 보호자 문장 승인: 승인자·시각은 서버가 채운다(클라이언트 값 무시).
  --   · 문장만 바뀌고 승인 요청이 없으면 → 승인 해제(바뀐 문장은 다시 승인받아야 한다)
  --   · 승인 시각을 새로 보내면(비어 있다가 채움 · 다른 값) → 호출자·지금으로 승인
  --   · 승인 시각을 비우면 → 승인 해제
  --   · 그 밖에는 기존 승인을 그대로 둔다(승인자 칸 위조 불가)
  if tg_op = 'UPDATE' and new.guardian_text is distinct from old.guardian_text
     and new.guardian_text_approved_at is not distinct from old.guardian_text_approved_at then
    new.guardian_text_approved_by := null;
    new.guardian_text_approved_at := null;
  elsif new.guardian_text_approved_at is not null
     and (tg_op = 'INSERT' or new.guardian_text_approved_at is distinct from old.guardian_text_approved_at) then
    if auth.uid() is null then
      raise exception 'JOURNAL_GUARDIAN_APPROVE_HUMAN_ONLY' using errcode = '42501';
    end if;
    if nullif(btrim(coalesce(new.guardian_text, '')), '') is null then
      raise exception 'JOURNAL_GUARDIAN_TEXT_REQUIRED' using errcode = '23514';
    end if;
    new.guardian_text_approved_by := auth.uid();
    new.guardian_text_approved_at := statement_timestamp();
  elsif new.guardian_text_approved_at is null then
    new.guardian_text_approved_by := null;
  else
    new.guardian_text_approved_by := old.guardian_text_approved_by;
  end if;
  return new;
end $$;
revoke all on function app.guard_program_journal() from public, anon, authenticated;
-- 이름 순서: 신원 가드(a_…)가 먼저, 기관 채우기(stamp_…)가 가드보다 먼저 돈다(z_).
create trigger z_guard_program_journal before insert or update on public.program_journals
  for each row execute function app.guard_program_journal();

-- ──────────────────────────────────────────────────────────────────────────
-- 5) 트리거 ③ 세션 종료 → 일지 생성 대기열
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.enqueue_program_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jid uuid;
  cfg public.org_settings%rowtype;
  started timestamp := (new.started_at at time zone 'Asia/Seoul');
  ended timestamp := (coalesce(new.ended_at, statement_timestamp()) at time zone 'Asia/Seoul');
begin
  if new.status <> 'ended' or (tg_op = 'UPDATE' and old.status = 'ended') then
    return null;
  end if;
  select * into cfg from public.org_settings where org_id = new.org_id;
  insert into public.program_journals (org_id, profile_id, session_id, status, journal_date,
      operated_from, operated_to, program_type, location, facilitator_user_id, goal, tool_used, created_by)
  values (new.org_id, new.profile_id, new.id, 'generating', started::date,
      started::time(0),
      case when ended::date = started::date and ended::time(0) >= started::time(0) then ended::time(0) end,
      coalesce(cfg.default_program_type, '인지활동 - 회상훈련'), cfg.default_location,
      -- 진행자 = 세션을 시작·감독한 요양보호사(AI 아님). 돌봄팀이 아니면 비워 두고 확정 때 사람이 채운다.
      case when app.is_org_care_member(new.user_id, new.org_id) then new.user_id end,
      left(nullif(btrim(coalesce(new.goal, '')), ''), 2000), 'AI 대화 프로그램 보조', new.user_id)
  on conflict (session_id) do nothing
  returning id into jid;
  if jid is not null then
    insert into public.journal_generation_jobs (journal_id, session_id, org_id)
    values (jid, new.id, new.org_id)
    on conflict (journal_id) do nothing;
  end if;
  return null;
end $$;
revoke all on function app.enqueue_program_journal() from public, anon, authenticated;
drop trigger if exists sessions_enqueue_program_journal on public.sessions;
create trigger sessions_enqueue_program_journal after insert or update of status on public.sessions
  for each row execute function app.enqueue_program_journal();

-- 생성 실패 재시도(웹 W1) — 같은 기관 돌봄팀. 실패한 세션 일지만.
create or replace function public.retry_journal_generation(p_journal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare j public.program_journals%rowtype;
begin
  select * into j from public.program_journals where id = p_journal_id for update;
  if j.id is null or j.org_id is distinct from app.current_org_id() or not app.is_care_team() then
    raise exception 'JOURNAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if j.session_id is null then
    raise exception 'JOURNAL_RETRY_NO_SESSION' using errcode = '22023';
  end if;
  if j.status <> 'failed' then
    raise exception 'JOURNAL_RETRY_NOT_FAILED' using errcode = '22023';
  end if;
  update public.program_journals set status = 'generating', generation_attempts = 0, last_error = null
   where id = j.id;
  insert into public.journal_generation_jobs (journal_id, session_id, org_id)
  values (j.id, j.session_id, j.org_id)
  on conflict (journal_id) do update set status = 'queued', attempts = 0, next_run_at = now(), last_error = null;
end $$;
revoke all on function public.retry_journal_generation(uuid) from public, anon;
grant execute on function public.retry_journal_generation(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 6) 트리거 ④ 공개 게이트 — 기존 공개 항목 검사(app.check_share_item_owner)를 새 테이블로 바꾸며 확장
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.check_share_item_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  j public.program_journals%rowtype;
begin
  case new.item_type
    when 'journal' then
      select * into j from public.program_journals where id = new.item_id;
      owner_id := j.profile_id;
      if j.id is not null and new.revoked_at is null
         and (j.status <> 'final' or j.guardian_text_approved_at is null) then
        -- 보호자에게는 확정 + 승인된 보호자 문장만 간다.
        raise exception 'SHARE_JOURNAL_NOT_READY' using errcode = 'check_violation';
      end if;
    when 'analysis', 'session_summary' then
      select profile_id into owner_id from public.session_analyses where id = new.item_id;
    when 'photo' then
      select pj.* into j
        from public.program_journal_photos ph
        join public.program_journals pj on pj.id = ph.journal_id
       where ph.id = new.item_id;
      owner_id := j.profile_id;
      if j.id is not null and new.revoked_at is null and j.status <> 'final' then
        raise exception 'SHARE_JOURNAL_NOT_READY' using errcode = 'check_violation';
      end if;
    else
      return new;
  end case;

  if owner_id is null then
    raise exception '공개하려는 항목(%: %)이 존재하지 않습니다.', new.item_type, new.item_id
      using errcode = 'foreign_key_violation';
  end if;
  if owner_id <> new.profile_id then
    raise exception '다른 어르신의 기록은 공개할 수 없습니다.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function app.check_share_item_owner() from public;

-- 보호자 열람 — 공개된 확정 일지의 **보호자 문장만**. 공단 서식 칸은 보호자에게 가지 않는다.
create or replace function public.get_my_shared_journals()
returns table (id uuid, profile_id uuid, journal_date date, operated_from time, operated_to time,
  guardian_text text, finalized_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.profile_id, j.journal_date, j.operated_from, j.operated_to, j.guardian_text, j.finalized_at
    from public.program_journals j
   where j.status = 'final' and j.guardian_text_approved_at is not null
     and app.is_shared_to_me('journal', j.id)
   order by j.journal_date desc, j.finalized_at desc;
$$;
revoke all on function public.get_my_shared_journals() from public, anon;
grant execute on function public.get_my_shared_journals() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 7) RLS
-- ──────────────────────────────────────────────────────────────────────────
alter table public.program_journals enable row level security;
alter table public.program_journal_photos enable row level security;
alter table public.program_journal_revisions enable row level security;
alter table public.journal_generation_jobs enable row level security;
revoke all on public.program_journals from anon;
revoke all on public.program_journal_photos from anon;
revoke all on public.program_journal_revisions from anon;
revoke all on public.journal_generation_jobs from anon, authenticated;
revoke insert, update, delete on public.program_journal_revisions from authenticated;

-- 일지: 같은 기관 돌봄팀이 읽고 쓴다(교대 근무). 확정은 트리거가 위임 권한으로 막는다.
create policy program_journals_select_team on public.program_journals for select
  using (org_id = app.current_org_id() and app.is_care_team());
create policy program_journals_insert_team on public.program_journals for insert
  with check (org_id = app.current_org_id() and app.is_care_team() and created_by = auth.uid());
create policy program_journals_update_team on public.program_journals for update
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id() and app.is_care_team());
-- 삭제: 확정 전 **수기** 일지만, 만든 사람 또는 관리 역할. 세션 일지는 지우지 않는다(생성 파이프라인의 기록).
create policy program_journals_delete_draft on public.program_journals for delete
  using (org_id = app.current_org_id() and app.is_care_team() and status <> 'final' and session_id is null
         and (created_by = auth.uid() or app.is_org_manager()));

-- 사진: 같은 기관 돌봄팀. 보호자는 사진 단위 공개로만. 확정 일지의 사진은 뺄 수 없다.
create policy program_journal_photos_select_team on public.program_journal_photos for select
  using ((org_id = app.current_org_id() and app.is_care_team()) or app.is_shared_to_me('photo', id));
create policy program_journal_photos_insert_team on public.program_journal_photos for insert
  with check (org_id = app.current_org_id() and app.is_care_team() and uploaded_by = auth.uid()
    and exists (select 1 from public.program_journals j where j.id = journal_id and j.org_id = app.current_org_id()));
create policy program_journal_photos_update_team on public.program_journal_photos for update
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id() and app.is_care_team());
create policy program_journal_photos_delete_draft on public.program_journal_photos for delete
  using (org_id = app.current_org_id() and app.is_care_team()
    and exists (select 1 from public.program_journals j where j.id = journal_id and j.status <> 'final'));

create policy program_journal_revisions_select_team on public.program_journal_revisions for select
  using (org_id = app.current_org_id() and app.is_care_team());

-- ──────────────────────────────────────────────────────────────────────────
-- 8) Realtime(D9) — 생성 중 → 확인 대기 전환을 웹이 바로 보게. 순정 PG16 CI 에는 publication 이 없다.
-- ──────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.program_journals;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.program_journal_photos;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 기억온 — 전사 문맥 분류기 직원 확인 일시정지: 스키마 (CTX-CLS-S6 · 설계 docs/plans/2026-11-15-ctx-cls-s6-db-design.md)
--
-- 규칙(assessUtterance)은 그대로 두고 분류기를 더한다(OR). 규칙은 안 걸렸는데 분류기만 위기·고통으로 판단하면
-- 중계가 "직원 확인 일시정지"를 건다(사용자 확정 D3). 이 파일은 그 기록에 필요한 칸만 만든다(함수는 다음 파일).
--
-- ① sessions.pause_origin — 일시정지 출처('staff'|'system'). 시스템 정지는 직원 id(paused_by)를 넣지 않는다(기획 §14.1).
--    기존 짝 제약 (paused_at is null) = (paused_by is null) 을 출처별 짝으로 바꾼다. 기존 정지 행은 'staff' 로 보정.
-- ② session_interventions.action 에 'system_review_pause'(actor_id 없음 — 누가 눌렀나가 아니라 시스템 원인).
-- ③ safety_events 감지 경로·판정 묶음 버전(detected_by 'rule'|'classifier'). 기존 행·기존 중계는 기본값 'rule'.
--    사용자(authenticated)의 직접 INSERT 는 'rule' 만 — 분류기 사건은 service_role RPC 로만 생긴다.
--    판정 불변 가드에 새 칸을 더한다(기록 뒤 바꿀 수 없음).
-- ④ classifier_observations — "계속 + 기록"(분류기가 과거·인용·관용 등으로 보고 대화를 이어 간 판단, 분류기 단독 마무리)
--    원문 없이 판정만(사용자 확정 2026-11-15). 같은 기관 돌봄팀 읽기 · 쓰기는 service_role RPC 만.
-- 모두 check 제약이라 enum add value 가 없다. 기존 중계·앱과 호환(새 칸 기본값 · 기존 칸 의미 불변).

begin;

-- ① 일시정지 출처 ─────────────────────────────────────────────────────────
alter table public.sessions add column if not exists pause_origin text;
update public.sessions set pause_origin = 'staff' where paused_at is not null and pause_origin is null;
alter table public.sessions
  drop constraint if exists sessions_pause_origin_check,
  add constraint sessions_pause_origin_check check (pause_origin is null or pause_origin in ('staff', 'system')),
  drop constraint if exists sessions_pause_pair_check,
  -- case 로 쓴다 — or 로 쓰면 pause_origin 이 null 일 때 식 전체가 unknown 이 되어 CHECK 를 통과한다(회귀가 잡음).
  add constraint sessions_pause_pair_check check (
    case when paused_at is null then paused_by is null and pause_origin is null
         when pause_origin = 'staff' then paused_by is not null
         when pause_origin = 'system' then paused_by is null
         else false end);

-- 감독 칸 직접 쓰기 차단(20260924040000)에 pause_origin 을 더한다 — RPC(definer)만 통과.
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
       or new.prompt_version is not null or new.pause_origin is not null then
      raise exception 'SESSION_SUPERVISION_RPC_ONLY' using errcode = '42501';
    end if;
  elsif new.phase is distinct from old.phase or new.phase_started_at is distinct from old.phase_started_at
     or new.paused_at is distinct from old.paused_at or new.paused_by is distinct from old.paused_by
     or new.pause_reason is distinct from old.pause_reason or new.control_request is distinct from old.control_request
     or new.prompt_version is distinct from old.prompt_version or new.pause_origin is distinct from old.pause_origin then
    raise exception 'SESSION_SUPERVISION_RPC_ONLY' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.protect_session_supervision() from public, anon, authenticated;

-- ② 개입 기록 — 시스템 원인 ─────────────────────────────────────────────────
alter table public.session_interventions drop constraint if exists session_interventions_action_check;
alter table public.session_interventions add constraint session_interventions_action_check
  check (action in ('pause', 'resume', 'end', 'phase_advance', 'elder_closing', 'system_review_pause'));

-- ③ 안전 사건 감지 경로 ───────────────────────────────────────────────────
alter table public.safety_events
  add column if not exists detected_by text not null default 'rule',
  add column if not exists detection_reason text,
  add column if not exists classifier_model_version text,
  add column if not exists policy_version text;
alter table public.safety_events
  drop constraint if exists safety_events_detection_check,
  add constraint safety_events_detection_check check (
    (detected_by = 'rule' and detection_reason is null and classifier_model_version is null and policy_version is null)
    or (detected_by = 'classifier'
        and detection_reason in ('classifier_unavailable', 'classifier_crisis_direct', 'classifier_distress_direct',
                                 'classifier_ambiguous', 'classifier_out_of_scope', 'classifier_self_harm_context')
        and policy_version is not null and char_length(policy_version) between 1 and 100
        and (classifier_model_version is null or char_length(classifier_model_version) between 1 and 100)));

-- 사용자 직접 INSERT 는 규칙 사건만(분류기 사건은 중계 전용 자격의 service_role RPC 로만 — D7).
alter policy safety_events_insert_scope on public.safety_events
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team() and detected_by = 'rule');

-- 판정 불변(20260928020000)에 감지 경로·버전을 더한다.
create or replace function app.guard_safety_event_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.level is distinct from old.level
     or new.categories is distinct from old.categories
     or new.caregiver_alert is distinct from old.caregiver_alert
     or new.detected_by is distinct from old.detected_by
     or new.detection_reason is distinct from old.detection_reason
     or new.classifier_model_version is distinct from old.classifier_model_version
     or new.policy_version is distinct from old.policy_version then
    raise exception 'SAFETY_EVENT_VERDICT_IMMUTABLE' using errcode = '42501';
  end if;
  if new.excerpt is distinct from old.excerpt or new.matched_terms is distinct from old.matched_terms then
    if coalesce(old.excerpt, '') <> '' or cardinality(old.matched_terms) > 0 then
      raise exception 'SAFETY_EVIDENCE_IMMUTABLE' using errcode = '42501';
    end if;
    if old.user_id is distinct from auth.uid() then
      raise exception 'SAFETY_EVIDENCE_NOT_RECORDER' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.guard_safety_event_evidence() from public;

-- ④ 분류기 관찰 기록(원문 없음) ─────────────────────────────────────────────
create table if not exists public.classifier_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  profile_id uuid not null,
  session_id uuid not null,
  turn_id text not null,
  input_revision integer not null,
  reason text not null,
  action text not null,
  categories text[] not null default '{}',
  model_version text not null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  constraint classifier_observations_session_fk foreign key (session_id, profile_id, org_id)
    references public.sessions(id, profile_id, org_id) on delete cascade,
  constraint classifier_observations_turn_unique unique (session_id, turn_id, input_revision),
  constraint classifier_observations_turn_check check (char_length(turn_id) between 1 and 100 and input_revision >= 0),
  constraint classifier_observations_reason_check check (
    (reason = 'classifier_context_logged' and action in ('continue', 'elder_closing'))
    or (reason = 'classifier_closing' and action = 'elder_closing')),
  constraint classifier_observations_categories_check
    check (categories <@ array['self_harm', 'medical_emergency', 'abuse']::text[]),
  constraint classifier_observations_version_check
    check (char_length(model_version) between 1 and 100 and char_length(policy_version) between 1 and 100)
);
create index if not exists classifier_observations_session_idx on public.classifier_observations (session_id, created_at);
create index if not exists classifier_observations_org_idx on public.classifier_observations (org_id, created_at desc);

alter table public.classifier_observations enable row level security;
revoke all on public.classifier_observations from anon;
revoke insert, update, delete, truncate on public.classifier_observations from authenticated;
drop policy if exists classifier_observations_select_team on public.classifier_observations;
create policy classifier_observations_select_team on public.classifier_observations for select
  using (org_id = app.current_org_id() and app.is_care_team());

commit;

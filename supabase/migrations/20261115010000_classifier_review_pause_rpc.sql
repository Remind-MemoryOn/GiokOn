-- 기억온 — 전사 문맥 분류기 직원 확인 일시정지: 함수 (CTX-CLS-S6 · 설계 docs/plans/2026-11-15-ctx-cls-s6-db-design.md)
--
-- ① public.system_pause_for_review — 분류기 단독 적중 → 안전 사건 + 시스템 일시정지 + 개입 기록(한 트랜잭션).
--    **service_role 전용**. 호출자는 Edge relay-review-pause 하나뿐이다: 그 함수가 중계 전용 비밀(x-relay-secret =
--    VOICE_RELAY_SECRET)과 직원 JWT 를 검사한 뒤 부른다(사용자 확정 Q9). 비밀은 DB 에 두지 않는다.
--    연결 증명(사용자 확정 2026-11-15 ④): 그 세션의 **살아 있는 점유(T26.1)** holder 와 직원이 일치해야 한다 —
--    비밀이 새어도 다른 세션을 멈출 수 없다. 사건 id 는 중계가 만든다 → 재시도해도 사건·개입이 늘지 않는다.
-- ② public.record_classifier_observation — "계속 + 기록"(원문 없음). 같은 자격·같은 연결 증명.
-- ③ request_session_control — 직원 정지 = 출처 'staff'(시스템 정지 위에 눌러도 출처 유지), 재개 = 출처 비움.
-- ④ session_tick — pause_origin 을 함께 돌려준다(기존 칸 불변 — 구버전 중계는 무시).
--
-- 알림 문구(사용자 확정 2026-11-15 ③ · 문구 2026-11-22 R7): caregiver_alert = 공통 문구 + 줄바꿈 + "멈춘 이유: <범주·이유>".
-- 공통 문구 = "대화 중 확인이 필요한 말씀이 있어 대화를 잠시 멈췄어요. 확인해주세요." — 전화번호 등 대응 자원·'진단 아님' 문구는 넣지 않는다.
-- 멈춘 지점의 발화는 excerpt 한 곳에만 둔다(알림 행에 복사하지 않는다 — 앱·웹 화면이 그 아래에 붙여 보인다).
-- 규칙 사건 문구(core buildCaregiverAlert)는 바꾸지 않는다.

begin;

-- 범주 이름 · 공통 문구(서버가 고른다 — 중계가 문구를 보내지 않는다).
create or replace function app.classifier_caregiver_alert(p_reason text, p_categories text[])
returns text
language sql immutable
set search_path = public
as $$
  select '대화 중 확인이 필요한 말씀이 있어 대화를 잠시 멈췄어요. 확인해주세요.' || E'\n' || '멈춘 이유: ' || coalesce(
           nullif(array_to_string(array(
             select case c when 'self_harm' then '자해 관련' when 'medical_emergency' then '신체 응급 관련'
                           when 'abuse' then '학대 관련' end
               from unnest(array['self_harm', 'medical_emergency', 'abuse']) c
              where c = any(coalesce(p_categories, '{}'))), ' · '), ''),
           case p_reason
             when 'classifier_distress_direct' then '견디기 어려운 고통 호소'
             when 'classifier_ambiguous' then '해석이 어려운 말씀'
             when 'classifier_out_of_scope' then '어르신 목소리가 아닐 수 있는 소리'
             when 'classifier_unavailable' then '자동 확인을 마치지 못함'
             else '확인 필요' end);
$$;
revoke all on function app.classifier_caregiver_alert(text, text[]) from public, anon, authenticated;

-- 연결 증명 — 살아 있는 점유의 holder 와 직원이 일치하고, 그 직원이 세션 기관의 돌봄팀이어야 한다.
create or replace function app.require_live_relay_lease(p_session_id uuid, p_lease_holder uuid, p_requested_by uuid, p_org uuid)
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if p_session_id is null or p_lease_holder is null or p_requested_by is null
     or not exists (select 1 from public.voice_session_leases l
                     where l.session_id = p_session_id and l.holder = p_lease_holder
                       and l.user_id = p_requested_by and l.expires_at > statement_timestamp())
     or not app.is_org_care_member(p_requested_by, p_org) then
    raise exception 'SYSTEM_PAUSE_FORBIDDEN' using errcode = '42501';
  end if;
end $$;
revoke all on function app.require_live_relay_lease(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ① 시스템 원인 일시정지 ──────────────────────────────────────────────────
create or replace function public.system_pause_for_review(
  p_session_id uuid, p_lease_holder uuid, p_requested_by uuid, p_event_id uuid,
  p_reason text, p_categories text[], p_excerpt text, p_model_version text, p_policy_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  cats text[] := coalesce(p_categories, '{}');
  ev public.safety_events%rowtype;
  state text;
  inserted int;
begin
  if p_event_id is null then
    raise exception 'SYSTEM_PAUSE_EVENT' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('classifier_unavailable', 'classifier_crisis_direct', 'classifier_distress_direct',
                                          'classifier_ambiguous', 'classifier_out_of_scope', 'classifier_self_harm_context') then
    raise exception 'SYSTEM_PAUSE_REASON' using errcode = '22023';
  end if;
  if not (cats <@ array['self_harm', 'medical_emergency', 'abuse']::text[])
     or (p_reason = 'classifier_crisis_direct' and cardinality(cats) = 0)
     or (p_reason = 'classifier_self_harm_context' and not ('self_harm' = any(cats))) then
    raise exception 'SYSTEM_PAUSE_CATEGORIES' using errcode = '22023';
  end if;

  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null then
    raise exception 'SYSTEM_PAUSE_FORBIDDEN' using errcode = '42501';
  end if;
  perform app.require_live_relay_lease(s.id, p_lease_holder, p_requested_by, s.org_id);

  -- 안전 사건 — 세션 상태와 무관하게 먼저 남긴다(근거 보존). 같은 id 재시도는 그대로 둔다.
  insert into public.safety_events (id, org_id, user_id, profile_id, session_id, level, categories, matched_terms,
                                    excerpt, caregiver_alert, detected_by, detection_reason,
                                    classifier_model_version, policy_version)
  values (p_event_id, s.org_id, s.user_id, s.profile_id, s.id,
          case when cardinality(cats) > 0 then 'crisis' else 'watch' end::public.safety_event_level,
          array(select c from unnest(array['self_harm', 'medical_emergency', 'abuse']) c where c = any(cats)),
          '{}', nullif(btrim(p_excerpt), ''), app.classifier_caregiver_alert(p_reason, cats),
          'classifier', p_reason, nullif(btrim(p_model_version), ''), p_policy_version)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  select * into ev from public.safety_events where id = p_event_id;
  if ev.session_id is distinct from s.id or ev.detected_by <> 'classifier' then
    raise exception 'SYSTEM_PAUSE_EVENT_CONFLICT' using errcode = '23505';
  end if;
  -- 같은 사건 id 의 재시도 — 첫 호출이 이미 처리했다(같은 트랜잭션에서 정지·개입까지). 아무것도 바꾸지 않는다:
  -- 그 사이 직원이 재개했다면 늦은 재시도가 다시 멈추게 해서는 안 된다.
  if inserted = 0 then
    return jsonb_build_object('safety_event_id', p_event_id, 'state', 'duplicate');
  end if;

  -- 처리 동의 철회는 진행 중 세션을 즉시 끝낸다(stop_unconsented_sessions) — 여기서는 'active 아님'으로 사건만 남는다.
  if s.status <> 'active' then
    state := 'not_active';
  elsif s.paused_at is not null then
    state := 'already_paused';
  else
    update public.sessions set
      paused_at = statement_timestamp(), paused_by = null, pause_origin = 'system', pause_reason = null,
      control_request = 'pause', updated_at = now()
    where id = s.id;
    state := 'paused';
  end if;

  if state = 'paused' then
    insert into public.session_interventions (session_id, profile_id, org_id, actor_id, action, detail)
    values (s.id, s.profile_id, s.org_id, null, 'system_review_pause',
            jsonb_build_object('event_id', p_event_id, 'reason', p_reason, 'policy_version', p_policy_version,
                               'model_version', nullif(btrim(p_model_version), ''), 'via_user', p_requested_by));
  end if;

  return jsonb_build_object('safety_event_id', p_event_id, 'state', state);
end $$;
revoke all on function public.system_pause_for_review(uuid, uuid, uuid, uuid, text, text[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.system_pause_for_review(uuid, uuid, uuid, uuid, text, text[], text, text, text)
  to service_role;

-- ② 분류기 관찰 기록(원문 없음) ─────────────────────────────────────────────
create or replace function public.record_classifier_observation(
  p_session_id uuid, p_lease_holder uuid, p_requested_by uuid, p_turn_id text, p_input_revision integer,
  p_reason text, p_action text, p_categories text[], p_model_version text, p_policy_version text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare s public.sessions%rowtype; n int;
begin
  select * into s from public.sessions where id = p_session_id;
  if s.id is null then
    raise exception 'SYSTEM_PAUSE_FORBIDDEN' using errcode = '42501';
  end if;
  perform app.require_live_relay_lease(s.id, p_lease_holder, p_requested_by, s.org_id);
  insert into public.classifier_observations (org_id, profile_id, session_id, turn_id, input_revision, reason, action,
                                              categories, model_version, policy_version)
  values (s.org_id, s.profile_id, s.id, p_turn_id, p_input_revision, p_reason, p_action,
          coalesce(p_categories, '{}'), p_model_version, p_policy_version)
  on conflict (session_id, turn_id, input_revision) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.record_classifier_observation(uuid, uuid, uuid, text, integer, text, text, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.record_classifier_observation(uuid, uuid, uuid, text, integer, text, text, text[], text, text)
  to service_role;

-- ③ 직원 원격 제어 — 출처 칸 ─────────────────────────────────────────────────
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
    -- 이미 멈춘 세션(직원·시스템)에 다시 '일시정지'를 눌러도 처음 출처·시각·사람을 그대로 둔다.
    paused_at = case p_action when 'pause' then coalesce(s.paused_at, statement_timestamp())
                              when 'resume' then null else s.paused_at end,
    paused_by = case p_action when 'pause' then case when s.paused_at is null then auth.uid() else s.paused_by end
                              when 'resume' then null else s.paused_by end,
    pause_origin = case p_action when 'pause' then coalesce(s.pause_origin, 'staff')
                                 when 'resume' then null else s.pause_origin end,
    pause_reason = case p_action when 'pause' then coalesce(nullif(btrim(p_reason), ''), s.pause_reason)
                                 when 'resume' then null else s.pause_reason end,
    control_request = p_action,
    updated_at = now()
  where id = s.id;
  insert into public.session_interventions (session_id, profile_id, org_id, actor_id, action, detail)
  values (s.id, s.profile_id, s.org_id, auth.uid(), p_action,
          case when p_reason is null then null else jsonb_build_object('reason', btrim(p_reason)) end);
end $$;
revoke all on function public.request_session_control(uuid, text, text) from public, anon;
grant execute on function public.request_session_control(uuid, text, text) to authenticated;

-- ④ 중계 2초 폴 — 출처를 함께 ────────────────────────────────────────────────
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
    'pause_origin', s.pause_origin,
    'end_requested', coalesce(s.control_request = 'end', false)
  );
end $$;
revoke all on function public.session_tick(uuid) from public, anon;
grant execute on function public.session_tick(uuid) to authenticated;

commit;

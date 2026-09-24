-- 파일럿 계획 D4 (tasks T22.3) — 접근 모델 전환: 요양보호사별 배정 격리 → 기관 단위 + 역할
--
-- ■ 왜
--   교대근무라 오후 담당자가 오전 담당자의 세션 기록을 봐야 한다. 20260722100000 이 9테이블을
--   "배정된 요양보호사 또는 org_admin" 으로 묶어 두어 그게 불가능했다.
--
-- ■ 무엇이 바뀌나(사용자 결정 2026-09-24 포함)
--   · 9테이블(profiles·chronicle_entries·sessions·session_logs·session_analyses·safety_events·
--     care_journals·guardian_shares·consents) SELECT/UPDATE: `org_id = current_org_id() and app.is_care_team()`.
--     restrictive UPDATE 목표 범위 정책 4개도 같은 술어로(안 바꾸면 돌봄팀 UPDATE 가 거기서 막힌다).
--   · INSERT: **대화 기록(sessions·session_logs·session_analyses·safety_events)·연대기(chronicle_entries)** 도
--     돌봄팀 전원으로 연다 — 교대 근무자가 담당이 아닌 어르신과도 대화를 진행한다(결정 ①).
--     ⚠️ **동의(consents)·보호자 공개(guardian_shares) INSERT 는 배정·관리자 기준을 유지**한다(민감).
--   · 대화 처리 권한 can_process_profile · reserve_live_token: 역할 = 돌봄팀 4종(결정 ②), 배정 검사 제거.
--   · users 조회: 본인 + 같은 기관 **관리 역할(org_admin·center_director)** — 센터장도 역할 부여·합류 승인을 한다.
--
-- ■ 바뀌지 않는 것
--   · DELETE 정책 전부(배정·관리자 기준 유지 — 교대근무가 요구하는 것은 열람·기록이지 삭제가 아니다).
--   · 보호자 브랜치(공유 열람·연결 어르신 열람) — 술어를 그대로 복사했다.
--   · elder_codes(보호자 연결 코드 — 민감) · messages(동결) · journal_photos 쓰기(작성자·관리자).
--   · app.is_assigned_caregiver() — 지우지 않는다. "내 담당" 표시·알림 대상이 쓴다.
--   · 동의 가드(require_processing_consent)·식별 고정(R012)·감사 트리거.
--
-- ALTER POLICY 로 **식만** 바꾼다 — 대상 롤·permissive/restrictive 속성이 그대로 남는다.

-- ── profiles ─────────────────────────────────────────────────────────────
alter policy profiles_select_scope on public.profiles
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy profiles_update_scope on public.profiles
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id());
alter policy profiles_insert_scope on public.profiles
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team());

-- ── chronicle_entries ───────────────────────────────────────────────────
-- ⚠️ INSERT 에서 배정 검사를 빼면 "기록의 기관 = 어르신의 기관" 을 보장하던 장치가 사라진다 —
-- org_id 는 stamp_org_id 가 **호출자 기관**으로 채우고, 어르신 FK 는 profile_id 단독이었다.
-- 그대로 두면 같은 기관 돌봄팀이 **다른 기관 어르신**(profile_id 만 알면)에 연대기를 붙일 수 있다
-- (2026-09-24 파일럿 회귀가 잡았다). 대화 테이블 4종(sessions·logs·analyses·safety_events)은 이미
-- (profile_id, org_id) 복합 FK 가 있어 안전하다 — chronicle_entries 에도 같은 FK 를 건다.
-- 기존 행은 배정(같은 기관) 검사를 거쳐 들어왔으므로 불일치가 없어야 한다. 있다면 VALIDATE 가 실패해 드러난다.
alter table public.chronicle_entries
  add constraint chronicle_entries_profile_org_fk foreign key (profile_id, org_id)
  references public.profiles(id, org_id) on delete cascade not valid;
alter table public.chronicle_entries validate constraint chronicle_entries_profile_org_fk;

alter policy chronicle_entries_select_scope on public.chronicle_entries
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy chronicle_entries_update_scope on public.chronicle_entries
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id());
alter policy chronicle_entries_insert_scope on public.chronicle_entries
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team());

-- ── sessions ────────────────────────────────────────────────────────────
alter policy sessions_select_scope on public.sessions
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy sessions_update_scope on public.sessions
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id());
alter policy sessions_update_target_scope on public.sessions
  using (true)
  with check (org_id = app.current_org_id() and app.is_care_team());
alter policy sessions_insert_scope on public.sessions
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team());

-- ── session_logs ────────────────────────────────────────────────────────
alter policy session_logs_select_scope on public.session_logs
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy session_logs_update_scope on public.session_logs
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id());
alter policy session_logs_update_target_scope on public.session_logs
  using (true)
  with check (org_id = app.current_org_id() and app.is_care_team());
alter policy session_logs_insert_scope on public.session_logs
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team());

-- ── session_analyses ────────────────────────────────────────────────────
alter policy session_analyses_select_org on public.session_analyses
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy session_analyses_update_org on public.session_analyses
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id());
alter policy session_analyses_update_target_scope on public.session_analyses
  using (true)
  with check (org_id = app.current_org_id() and app.is_care_team());
alter policy session_analyses_insert_scope on public.session_analyses
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team());

-- ── safety_events ───────────────────────────────────────────────────────
alter policy safety_events_select_org on public.safety_events
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy safety_events_update_org on public.safety_events
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id() and (acknowledged_by is null or acknowledged_by = auth.uid()));
alter policy safety_events_update_target_scope on public.safety_events
  using (true)
  with check (org_id = app.current_org_id() and app.is_care_team());
alter policy safety_events_insert_scope on public.safety_events
  with check (user_id = auth.uid() and org_id = app.current_org_id() and app.is_care_team());

-- ── care_journals (D5 에서 program_journals 로 대체 예정 — 그때까지 읽기·수정만 기관 단위) ──
alter policy care_journals_select_org on public.care_journals
  using (org_id = app.current_org_id() and app.is_care_team());
alter policy care_journals_update_scope on public.care_journals
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id());

-- ── guardian_shares — 보호자 브랜치 그대로, INSERT 는 배정·관리자 유지(결정 ①) ──
alter policy guardian_shares_select_scope on public.guardian_shares
  using ((org_id = app.current_org_id() and app.is_care_team())
         or (revoked_at is null and app.is_linked_guardian(profile_id)));
alter policy guardian_shares_update_scope on public.guardian_shares
  using (org_id = app.current_org_id() and app.is_care_team())
  with check (org_id = app.current_org_id() and (revoked_by is null or revoked_by = auth.uid()));

-- ── consents — 본인·관리자 분기 그대로, 어르신 동의 열람·철회는 돌봄팀. INSERT 는 배정·관리자 유지(결정 ①) ──
alter policy consents_select_scope on public.consents
  using (user_id = auth.uid()
         or (org_id = app.current_org_id() and app.is_org_admin())
         or (profile_id is not null and org_id = app.current_org_id() and app.is_care_team()));
alter policy consents_update_scope on public.consents
  using (user_id = auth.uid()
         or (org_id = app.current_org_id() and app.is_org_admin())
         or (profile_id is not null and org_id = app.current_org_id() and app.is_care_team()))
  with check (((profile_id is null) and (user_id = auth.uid())
               and (consent_type = any (array['privacy_required'::consent_type, 'marketing_optional'::consent_type])))
              or (org_id = app.current_org_id()));

-- ── users — 센터장도 구성원을 본다(역할 부여·합류 승인) ────────────────────
alter policy users_select_scope on public.users
  using (id = auth.uid() or (org_id = app.current_org_id() and app.is_org_manager()));

-- ──────────────────────────────────────────────────────────────────────────
-- 대화 처리 권한 — 돌봄팀 4종 역할 · 배정 검사 제거(결정 ①②). 동의 검사는 그대로.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.can_process_profile(p_profile_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u join public.profiles p on p.org_id = u.org_id
    where u.id = auth.uid() and u.onboarded_at is not null and p.id = p_profile_id
      and u.role in ('caregiver', 'org_admin', 'social_worker', 'center_director')
  ) and app.has_processing_consent(p_profile_id);
$$;

create or replace function public.reserve_live_token(p_session_id uuid)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare
  actor public.users%rowtype;
  target public.sessions%rowtype;
  limits app.live_token_limits%rowtype;
  bucket record;
  stamp timestamptz := statement_timestamp();
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.onboarded_at is null or actor.org_id is null
     or actor.role not in ('caregiver', 'org_admin', 'social_worker', 'center_director') then
    raise exception 'LIVE_TOKEN_FORBIDDEN' using errcode = '42501';
  end if;
  select * into target from public.sessions where id = p_session_id;
  if target.id is null or target.org_id <> actor.org_id or target.status <> 'active'
     or not exists (select 1 from public.profiles p
       where p.id = target.profile_id and p.org_id = actor.org_id) then
    raise exception 'LIVE_TOKEN_FORBIDDEN' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.profile_id::text, 1010));
  if not exists(select 1 from public.sessions where id = target.id and status = 'active')
    or not app.has_processing_consent(target.profile_id) then
    raise exception 'LIVE_TOKEN_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  select * into strict limits from app.live_token_limits where singleton;
  -- Every caller locks in this same order. ON CONFLICT's conditional increment is
  -- atomic across Edge instances; an exception rolls back ALL increments in this call.
  for bucket in
    select * from (values
      (1, 'project_day', '00000000-0000-0000-0000-000000000000'::uuid, date_trunc('day', stamp, 'Asia/Seoul'), limits.project_day),
      (2, 'org_day', actor.org_id, date_trunc('day', stamp, 'Asia/Seoul'), limits.org_day),
      (3, 'user_day', actor.id, date_trunc('day', stamp, 'Asia/Seoul'), limits.user_day),
      (4, 'user_minute', actor.id, date_trunc('minute', stamp), limits.user_minute)
    ) b(priority, scope, subject, window_start, maximum) order by priority
  loop
    insert into app.live_token_usage as usage (scope, subject, window_start, issued)
      values (bucket.scope, bucket.subject, bucket.window_start, 1)
    on conflict (scope, subject, window_start) do update set issued = usage.issued + 1
      where usage.issued < bucket.maximum;
    if not found then
      raise exception 'LIVE_TOKEN_LIMIT' using errcode = 'P0001';
    end if;
  end loop;
  delete from app.live_token_usage where window_start < stamp - interval '2 days';
  return true;
end;
$$;

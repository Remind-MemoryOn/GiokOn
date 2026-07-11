-- MemoryOn(기억온) v1 — 안전 이벤트(위기 에스컬레이션) 영속화 (M12.1, Phase I)
--
-- 배경: 위기(자살·자해/응급/학대) 감지는 "사람에게 도달"해야 완성이다. 대화
-- 파이프라인이 감지한 위기·관찰(watch) 이벤트를 저장해 요양보호사/기관 관리자가
-- 확인(acknowledge)하도록 한다. excerpt(발화 일부)는 민감정보이므로 RLS로 보호하고
-- 돌봄 목적 범위에서만 저장한다(120자 제한 — 코드 레이어 강제).
--
-- RLS 설계 노트(의도적 예외): 다른 테이블은 "본인 + 관리자"만 조회하지만, 안전
-- 이벤트는 **같은 기관 구성원 전체**가 조회한다 — 담당 요양보호사가 부재중일 때
-- 교대 근무자가 위기를 볼 수 있어야 하며, 어르신 안전이 접근 최소화보다 우선한다.
--
-- append-only. 조직/RBAC(20260703120000)·감사로그(20260703130000) 이후 적용.

do $$
begin
  create type public.safety_event_level as enum ('watch', 'crisis');
exception when duplicate_object then null;
end $$;

create table if not exists public.safety_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,      -- 세션 진행 요양보호사(계정 삭제 후에도 이벤트 보존)
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  level public.safety_event_level not null,
  categories text[] not null default '{}',                          -- self_harm | medical_emergency | abuse
  matched_terms text[] not null default '{}',
  excerpt text,                                                     -- 발화 앞부분(맥락 확인용, 민감)
  caregiver_alert text not null,                                    -- 표시된 알림 문구(대응 자원 포함)
  acknowledged_at timestamptz,                                      -- 사람 확인 시각
  acknowledged_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint safety_events_excerpt_check
    check (excerpt is null or char_length(excerpt) <= 200),
  constraint safety_events_alert_check
    check (char_length(btrim(caregiver_alert)) between 1 and 500),
  constraint safety_events_ack_pair_check
    check (
      (acknowledged_at is null and acknowledged_by is null)
      or (acknowledged_at is not null and acknowledged_by is not null)
    )
);

create index if not exists idx_safety_events_org_created
  on public.safety_events(org_id, created_at desc);
create index if not exists idx_safety_events_profile
  on public.safety_events(profile_id, created_at desc);
-- 미확인 이벤트 대시보드 조회용.
create index if not exists idx_safety_events_unacknowledged
  on public.safety_events(org_id, created_at desc)
  where acknowledged_at is null;

create trigger set_safety_events_updated_at
before update on public.safety_events
for each row execute function app.set_updated_at();

create trigger stamp_safety_events_org_id
before insert on public.safety_events
for each row execute function app.stamp_org_id();

create trigger audit_safety_events
after insert or update or delete on public.safety_events
for each row execute function app.write_audit_log();

alter table public.safety_events enable row level security;

-- 조회: 같은 기관 구성원 전체(위 설계 노트 — 어르신 안전 우선).
create policy safety_events_select_org
on public.safety_events
for select
using (org_id = app.current_org_id());

-- 기록: 본인 세션 이벤트만(서버사이드 Edge Function은 service_role로 org_id 명시).
create policy safety_events_insert_scope
on public.safety_events
for insert
with check (user_id = auth.uid() and org_id = app.current_org_id());

-- 확인(acknowledge): 같은 기관 구성원. 확인자는 본인으로만 기록 가능.
create policy safety_events_update_org
on public.safety_events
for update
using (org_id = app.current_org_id())
with check (
  org_id = app.current_org_id()
  and (acknowledged_by is null or acknowledged_by = auth.uid())
);

-- 삭제 정책 없음(deny by default): 안전 이벤트 이력은 임의 삭제할 수 없다.

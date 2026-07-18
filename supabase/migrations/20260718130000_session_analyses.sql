-- MemoryOn(기억온) — 세션 자동 분석 영속화 (T16.1 / M16.1 / Phase W3)
--
-- 앱이 대화 종료 시 core/analysis.analyzeSession() 결과(SessionAnalysis JSON)를
-- 저장하고, 웹 분석 페이지(SCR-W07)·대시보드가 Realtime 으로 즉시 반영한다.
--
-- ⚠️ 비의료 락다운: analysis 는 관찰 지표(참여·응답률·발화량·주제 반응)만 담는다
-- (효능·향상 판정 아님 — core/analysis 가 산출 강제, docs/compliance.md §3).
-- RLS: 조직 범위 + guardian 배제 — 보호자는 공개 커밋(guardian_shares) 경유만.
-- append-only. guardian_links(20260718120000) 이후 적용.

create table if not exists public.session_analyses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,   -- 세션 진행 요양보호사
  analysis jsonb not null,                                       -- core SessionAnalysis
  version text not null,                                         -- ANALYSIS_VERSION 추적
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint session_analyses_session_unique unique (session_id),
  constraint session_analyses_version_check
    check (char_length(btrim(version)) between 1 and 20)
);

create index if not exists idx_session_analyses_org
  on public.session_analyses(org_id, created_at desc);
create index if not exists idx_session_analyses_profile
  on public.session_analyses(profile_id, created_at desc);

create trigger set_session_analyses_updated_at
before update on public.session_analyses
for each row execute function app.set_updated_at();

create trigger stamp_session_analyses_org_id
before insert on public.session_analyses
for each row execute function app.stamp_org_id();

create trigger audit_session_analyses
after insert or update or delete on public.session_analyses
for each row execute function app.write_audit_log();

alter table public.session_analyses enable row level security;

-- 조회: 기관 돌봄 구성원(비 guardian) — 교대 공유. 보호자는 커밋 경유만.
create policy session_analyses_select_org
on public.session_analyses
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 기록: 세션 진행자 본인(앱이 종료 시 insert).
create policy session_analyses_insert_scope
on public.session_analyses
for insert
with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 갱신(재분석 upsert): 기관 돌봄 구성원(비 guardian).
create policy session_analyses_update_org
on public.session_analyses
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
)
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 삭제 정책 없음(deny by default): 분석 이력은 세션 삭제에 cascade 로만 정리.

-- Realtime: 앱 대화 종료 → 웹 분석 페이지·대시보드 즉시 반영(T-E3).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.session_analyses;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

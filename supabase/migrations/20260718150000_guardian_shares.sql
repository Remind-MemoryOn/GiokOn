-- MemoryOn(기억온) — 보호자 공개 커밋 (T17.2 / M17.2 / Phase W5)
--
-- 요양보호사가 "오늘 공개할 항목"을 체크리스트로 선별 공개(커밋)하면, 그 항목만
-- 보호자에게 노출된다(SCR-W08 → SCR-W09). 철회 가능·감사 기록(F-26).
-- 보호자 열람 경로: guardian_shares(미철회) + 승인된 연결(profile_guardians)
-- → 대상 원본(care_journals/session_analyses)에 guardian 전용 SELECT 정책을
-- 이 마이그레이션에서 추가한다(서버 강제 — 클라이언트 필터 금지, F-29).
-- append-only. care_journals(20260718140000) 이후 적용.

do $$
begin
  create type public.share_item_type as enum ('journal', 'analysis', 'session_summary', 'report');
exception when duplicate_object then null;
end $$;

create table if not exists public.guardian_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_type public.share_item_type not null,
  item_id uuid not null,
  note text,
  shared_by uuid references public.users(id) on delete set null,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guardian_shares_note_check
    check (note is null or char_length(note) <= 500)
);

-- 같은 항목의 활성 공개는 1건만(철회 후 재공개 가능).
create unique index if not exists idx_guardian_shares_active_unique
  on public.guardian_shares(profile_id, item_type, item_id)
  where revoked_at is null;

create index if not exists idx_guardian_shares_org
  on public.guardian_shares(org_id, shared_at desc);
create index if not exists idx_guardian_shares_profile
  on public.guardian_shares(profile_id, shared_at desc);

create trigger set_guardian_shares_updated_at
before update on public.guardian_shares
for each row execute function app.set_updated_at();

create trigger stamp_guardian_shares_org_id
before insert on public.guardian_shares
for each row execute function app.stamp_org_id();

create trigger audit_guardian_shares
after insert or update or delete on public.guardian_shares
for each row execute function app.write_audit_log();

alter table public.guardian_shares enable row level security;

-- 조회: 돌봄 구성원=기관 전체(관리 화면) / 보호자=승인된 연결 + 미철회만.
create policy guardian_shares_select_scope
on public.guardian_shares
for select
using (
  (org_id = app.current_org_id() and app.current_org_role() <> 'guardian')
  or (revoked_at is null and app.is_linked_guardian(profile_id))
);

-- 공개(커밋): 기관 돌봄 구성원, 본인 명의.
create policy guardian_shares_insert_scope
on public.guardian_shares
for insert
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (shared_by is null or shared_by = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.org_id = app.current_org_id()
  )
);

-- 철회: 기관 돌봄 구성원. 철회자는 본인으로만 기록.
create policy guardian_shares_update_scope
on public.guardian_shares
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
)
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (revoked_by is null or revoked_by = auth.uid())
);

-- 삭제 정책 없음(deny by default): 공개 이력은 철회로만 종료(감사 추적).

-- ──────────────────────────────────────────────────────────────────────────
-- 보호자의 원본 열람 경로: 공개 커밋(미철회) + 승인된 연결일 때만 해당 원본
-- SELECT 허용. security definer 로 RLS 재귀를 피한다.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function app.is_shared_to_me(p_item_type public.share_item_type, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_shares s
    join public.profile_guardians pg
      on pg.profile_id = s.profile_id
     and pg.guardian_user_id = auth.uid()
     and pg.status = 'approved'
    where s.item_type = p_item_type
      and s.item_id = p_item_id
      and s.revoked_at is null
  );
$$;

-- 공개된 일지: 보호자 열람 허용(그 외 일지는 여전히 차단).
create policy care_journals_select_shared_guardian
on public.care_journals
for select
using (app.is_shared_to_me('journal', id));

-- 공개된 세션 분석: 보호자 열람 허용.
create policy session_analyses_select_shared_guardian
on public.session_analyses
for select
using (app.is_shared_to_me('analysis', id));

-- Realtime: 공개/철회가 보호자 화면에 즉시 반영(T-E3).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.guardian_shares;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

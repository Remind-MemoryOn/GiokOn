-- MemoryOn(기억온) — 어르신 영속 코드 + 요양보호사 배정(데이터 연속성) 재설계
-- (2026-07-22, 사용자 확정: 배정 모델 A · 같은 기관 한정 · 읽기+쓰기 완전 연속 · QR 제거)
--
-- 배경/문제: 기존엔 어르신(profiles)이 생성 요양보호사 user_id 에 단일 소유로
-- 하드바인딩되고(초기 스키마), 자식(연대기·세션·로그)이 복합 FK (profile_id,user_id)
-- 로 그 user_id 에 결속됐다. 코어 RLS 는 "본인 user_id 또는 org_admin"만 허용해,
-- 담당 요양보호사가 바뀌거나 추가되면 새 담당자는 그 어르신을 조회조차 못 하고
-- 자기 uid 로 새 어르신을 만들 수밖에 없어 연대기·세션·보호자 연결까지 끊겼다.
--
-- 해결: 소유(user_id)는 "최초 생성 actor"로 의미를 낮추고(불변·nullable), "배정"을
-- 추가한다.
--   1) elder_codes: 어르신별 영속·비소진 코드(보호자 미열람 — 별도 테이블).
--   2) profile_caregivers: 어르신↔요양보호사 배정(다대다). 코드로 self-claim.
--   3) 자식 복합 FK 완화(profile_id/session_id 단독 + user_id nullable actor·SET NULL)
--      → 새 담당자가 기존 어르신에 새 기록까지 쓸 수 있음(쓰기 연속성).
--   4) 코어+파생 9테이블 RLS 를 "배정된 요양보호사 또는 org_admin"으로 재작성
--      (같은 기관 org_id 격리 유지 — 타 기관 이관은 범위 밖).
--   5) profiles.user_id CASCADE → SET NULL(계정 삭제 시 어르신 데이터 보존).
--   6) 보호자 연결: redeem(1회성 소진) → link_guardian_by_elder_code(영속·멱등).
-- append-only. guardian_shares(20260718150000) 이후 적용.

-- ══════════════════════════════════════════════════════════════════════════
-- 1) profile_caregivers — 어르신↔요양보호사 배정(다대다·연속성)
-- ══════════════════════════════════════════════════════════════════════════

do $$
begin
  create type public.caregiver_assignment_status as enum ('active', 'removed');
exception when duplicate_object then null;
end $$;

create table if not exists public.profile_caregivers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  caregiver_user_id uuid not null references public.users(id) on delete cascade,
  status public.caregiver_assignment_status not null default 'active',
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_caregivers_unique unique (profile_id, caregiver_user_id),
  constraint profile_caregivers_removed_check
    check (status <> 'removed' or removed_at is not null)
);

create index if not exists idx_profile_caregivers_caregiver
  on public.profile_caregivers(caregiver_user_id, status);
create index if not exists idx_profile_caregivers_profile
  on public.profile_caregivers(profile_id, status);
create index if not exists idx_profile_caregivers_org
  on public.profile_caregivers(org_id, created_at desc);

create trigger set_profile_caregivers_updated_at
before update on public.profile_caregivers
for each row execute function app.set_updated_at();

create trigger audit_profile_caregivers
after insert or update or delete on public.profile_caregivers
for each row execute function app.write_audit_log();

alter table public.profile_caregivers enable row level security;

-- 조회: 같은 기관 돌봄 구성원(비 guardian)은 기관 배정 현황을 볼 수 있다(관리 UI).
create policy profile_caregivers_select_org
on public.profile_caregivers
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 배정 생성/변경은 claim_elder_by_code(정의자) 경유 + org_admin 직접 관리.
create policy profile_caregivers_insert_admin
on public.profile_caregivers
for insert
with check (
  org_id = app.current_org_id()
  and app.is_org_admin()
);

create policy profile_caregivers_update_scope
on public.profile_caregivers
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_org_admin() or caregiver_user_id = auth.uid())
)
with check (org_id = app.current_org_id());

-- ══════════════════════════════════════════════════════════════════════════
-- 2) 배정 판정 헬퍼 (RLS 재귀 방지 — security definer). elder_codes/코어 RLS 가 사용.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function app.is_assigned_caregiver(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_caregivers
    where profile_id = p_profile_id
      and caregiver_user_id = auth.uid()
      and status = 'active'
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3) elder_codes — 어르신별 영속 코드 (보호자 미열람)
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.elder_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null unique,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint elder_codes_code_check check (char_length(btrim(code)) between 6 and 32)
);

create index if not exists idx_elder_codes_org on public.elder_codes(org_id);

create trigger set_elder_codes_updated_at
before update on public.elder_codes
for each row execute function app.set_updated_at();

create trigger audit_elder_codes
after insert or update or delete on public.elder_codes
for each row execute function app.write_audit_log();

alter table public.elder_codes enable row level security;

-- 조회: 배정된 요양보호사 또는 org_admin(같은 기관, 비 guardian). 보호자는 코드를
-- link RPC 입력으로만 사용(직접 조회 불가 — 권한 상승 경로 차단).
create policy elder_codes_select_scope
on public.elder_codes
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

-- 회전(rotate): 배정 요양보호사/관리자. 생성은 트리거(정의자) 경유.
create policy elder_codes_update_scope
on public.elder_codes
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
)
with check (org_id = app.current_org_id());

-- ══════════════════════════════════════════════════════════════════════════
-- 4) 자식 복합 FK 완화(쓰기 연속성) + profiles.user_id 보존
-- ══════════════════════════════════════════════════════════════════════════
-- 순서: 자식 FK 먼저 제거 → 지원용 unique 제거 → 단독 FK/actor FK 재구성.

alter table public.session_logs drop constraint if exists session_logs_session_profile_user_fk;
alter table public.sessions drop constraint if exists sessions_profile_user_fk;
alter table public.chronicle_entries drop constraint if exists chronicle_entries_profile_user_fk;

alter table public.sessions drop constraint if exists sessions_id_profile_id_user_id_unique;
alter table public.profiles drop constraint if exists profiles_id_user_id_unique;

-- chronicle_entries: profile_id 단독 FK + user_id nullable actor(SET NULL)
alter table public.chronicle_entries alter column user_id drop not null;
alter table public.chronicle_entries
  add constraint chronicle_entries_profile_fk
  foreign key (profile_id) references public.profiles(id) on delete cascade;
alter table public.chronicle_entries
  add constraint chronicle_entries_user_fk
  foreign key (user_id) references public.users(id) on delete set null;

-- sessions: profile_id 단독 FK + user_id nullable actor
alter table public.sessions alter column user_id drop not null;
alter table public.sessions
  add constraint sessions_profile_fk
  foreign key (profile_id) references public.profiles(id) on delete cascade;
alter table public.sessions
  add constraint sessions_user_fk
  foreign key (user_id) references public.users(id) on delete set null;
-- session_logs 단독 FK 를 위해 sessions.id(PK) 참조로 충분.

-- session_logs: session_id 단독 FK + user_id nullable actor
alter table public.session_logs alter column user_id drop not null;
alter table public.session_logs
  add constraint session_logs_session_fk
  foreign key (session_id) references public.sessions(id) on delete cascade;
alter table public.session_logs
  add constraint session_logs_user_fk
  foreign key (user_id) references public.users(id) on delete set null;

-- profiles.user_id: 최초 생성 actor 로 재정의 — nullable + CASCADE→SET NULL
-- (요양보호사 계정 삭제 시 어르신·기록 보존; 배정은 profile_caregivers 로 유지).
alter table public.profiles drop constraint if exists profiles_user_id_fkey;
alter table public.profiles alter column user_id drop not null;
alter table public.profiles
  add constraint profiles_user_id_fkey
  foreign key (user_id) references public.users(id) on delete set null;

-- ══════════════════════════════════════════════════════════════════════════
-- 5) 신규 어르신 부트스트랩 트리거 + 기존 데이터 백필
-- ══════════════════════════════════════════════════════════════════════════
-- 어르신 생성 시: 영속 코드 자동 발급 + 생성자를 담당으로 자동 배정.

create or replace function app.bootstrap_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try int := 0;
begin
  loop
    v_code := app.generate_invite_code();
    begin
      insert into public.elder_codes (org_id, profile_id, code)
        values (new.org_id, new.id, v_code);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 6 then raise exception '어르신 코드 생성 실패(중복)'; end if;
    end;
  end loop;

  if new.user_id is not null then
    insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id, assigned_by)
      values (new.org_id, new.id, new.user_id, new.user_id)
      on conflict (profile_id, caregiver_user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger bootstrap_profile_after_insert
after insert on public.profiles
for each row execute function app.bootstrap_profile();

-- 기존 어르신 백필(코드 + 생성자 배정).
do $$
declare
  r record;
  v_code text;
  v_try int;
begin
  for r in select id, org_id, user_id from public.profiles loop
    if not exists (select 1 from public.elder_codes where profile_id = r.id) then
      v_try := 0;
      loop
        v_code := app.generate_invite_code();
        begin
          insert into public.elder_codes (org_id, profile_id, code)
            values (r.org_id, r.id, v_code);
          exit;
        exception when unique_violation then
          v_try := v_try + 1;
          if v_try > 6 then raise exception '백필 코드 생성 실패'; end if;
        end;
      end loop;
    end if;
    if r.user_id is not null then
      insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id, assigned_by)
        values (r.org_id, r.id, r.user_id, r.user_id)
        on conflict (profile_id, caregiver_user_id) do nothing;
    end if;
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6) RLS 재작성 — 코어 4테이블 + 파생 5테이블을 "배정 기반"으로
-- ══════════════════════════════════════════════════════════════════════════
-- 공통 술어(요양보호사 측): org_id 격리 + 비 guardian + (배정 or org_admin).
-- 보호자 측 정책(profiles_select_guardian_linked / *_select_shared_guardian /
-- guardian_shares 보호자 브랜치)은 유지.

-- ── profiles ──
drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(id) or app.is_org_admin())
);

drop policy if exists profiles_insert_scope on public.profiles;
create policy profiles_insert_scope on public.profiles for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

drop policy if exists profiles_update_scope on public.profiles;
create policy profiles_update_scope on public.profiles for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(id) or app.is_org_admin())
) with check (org_id = app.current_org_id());

drop policy if exists profiles_delete_scope on public.profiles;
create policy profiles_delete_scope on public.profiles for delete using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(id) or app.is_org_admin())
);

-- ── chronicle_entries ──
drop policy if exists chronicle_entries_select_scope on public.chronicle_entries;
create policy chronicle_entries_select_scope on public.chronicle_entries for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists chronicle_entries_insert_scope on public.chronicle_entries;
create policy chronicle_entries_insert_scope on public.chronicle_entries for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists chronicle_entries_update_scope on public.chronicle_entries;
create policy chronicle_entries_update_scope on public.chronicle_entries for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (org_id = app.current_org_id());

drop policy if exists chronicle_entries_delete_scope on public.chronicle_entries;
create policy chronicle_entries_delete_scope on public.chronicle_entries for delete using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

-- ── sessions ──
drop policy if exists sessions_select_scope on public.sessions;
create policy sessions_select_scope on public.sessions for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists sessions_insert_scope on public.sessions;
create policy sessions_insert_scope on public.sessions for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists sessions_update_scope on public.sessions;
create policy sessions_update_scope on public.sessions for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (org_id = app.current_org_id());

drop policy if exists sessions_delete_scope on public.sessions;
create policy sessions_delete_scope on public.sessions for delete using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

-- ── session_logs ──
drop policy if exists session_logs_select_scope on public.session_logs;
create policy session_logs_select_scope on public.session_logs for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists session_logs_insert_scope on public.session_logs;
create policy session_logs_insert_scope on public.session_logs for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists session_logs_update_scope on public.session_logs;
create policy session_logs_update_scope on public.session_logs for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (org_id = app.current_org_id());

drop policy if exists session_logs_delete_scope on public.session_logs;
create policy session_logs_delete_scope on public.session_logs for delete using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

-- ── session_analyses (기존 org 전체 → 배정 기반) ──
drop policy if exists session_analyses_select_org on public.session_analyses;
create policy session_analyses_select_org on public.session_analyses for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists session_analyses_insert_scope on public.session_analyses;
create policy session_analyses_insert_scope on public.session_analyses for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists session_analyses_update_org on public.session_analyses;
create policy session_analyses_update_org on public.session_analyses for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (org_id = app.current_org_id());

-- ── care_journals (기존 org 전체 → 배정 기반) ──
drop policy if exists care_journals_select_org on public.care_journals;
create policy care_journals_select_org on public.care_journals for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists care_journals_insert_scope on public.care_journals;
create policy care_journals_insert_scope on public.care_journals for insert with check (
  author_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists care_journals_update_scope on public.care_journals;
create policy care_journals_update_scope on public.care_journals for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (
  org_id = app.current_org_id()
);

drop policy if exists care_journals_delete_draft on public.care_journals;
create policy care_journals_delete_draft on public.care_journals for delete using (
  author_id = auth.uid()
  and status = 'draft'
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- ── guardian_shares (요양보호사 브랜치만 배정 기반으로; 보호자 브랜치 유지) ──
drop policy if exists guardian_shares_select_scope on public.guardian_shares;
create policy guardian_shares_select_scope on public.guardian_shares for select using (
  (org_id = app.current_org_id()
    and app.current_org_role() <> 'guardian'
    and (app.is_assigned_caregiver(profile_id) or app.is_org_admin()))
  or (revoked_at is null and app.is_linked_guardian(profile_id))
);

drop policy if exists guardian_shares_insert_scope on public.guardian_shares;
create policy guardian_shares_insert_scope on public.guardian_shares for insert with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (shared_by is null or shared_by = auth.uid())
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists guardian_shares_update_scope on public.guardian_shares;
create policy guardian_shares_update_scope on public.guardian_shares for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (
  org_id = app.current_org_id()
  and (revoked_by is null or revoked_by = auth.uid())
);

-- ── safety_events (교대 공유 → 어르신 케어팀[배정+admin]; guardian 배제 유지) ──
drop policy if exists safety_events_select_org on public.safety_events;
create policy safety_events_select_org on public.safety_events for select using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists safety_events_insert_scope on public.safety_events;
create policy safety_events_insert_scope on public.safety_events for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and app.is_assigned_caregiver(profile_id)
);

drop policy if exists safety_events_update_org on public.safety_events;
create policy safety_events_update_org on public.safety_events for update using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (app.is_assigned_caregiver(profile_id) or app.is_org_admin())
) with check (
  org_id = app.current_org_id()
  and (acknowledged_by is null or acknowledged_by = auth.uid())
);

-- ── consents (본인 수집분 + 배정 어르신 동의 연속성) ──
drop policy if exists consents_select_scope on public.consents;
create policy consents_select_scope on public.consents for select using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
  or (profile_id is not null
      and org_id = app.current_org_id()
      and app.current_org_role() <> 'guardian'
      and app.is_assigned_caregiver(profile_id))
);

drop policy if exists consents_insert_scope on public.consents;
create policy consents_insert_scope on public.consents for insert with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (profile_id is null or app.is_assigned_caregiver(profile_id) or app.is_org_admin())
);

drop policy if exists consents_update_scope on public.consents;
create policy consents_update_scope on public.consents for update using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
  or (profile_id is not null
      and org_id = app.current_org_id()
      and app.current_org_role() <> 'guardian'
      and app.is_assigned_caregiver(profile_id))
) with check (
  org_id = app.current_org_id()
);

-- ══════════════════════════════════════════════════════════════════════════
-- 7) RPC — 요양보호사 self-claim + 보호자 링크(영속 코드 기반) + 온보딩 개정
-- ══════════════════════════════════════════════════════════════════════════

-- 요양보호사: 어르신 코드로 담당 배정(같은 기관·멱등). 기존 어르신·전 이력 인계.
create or replace function public.claim_elder_by_code(p_code text)
returns public.profile_caregivers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
  v_code public.elder_codes;
  v_row public.profile_caregivers;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;
  select * into v_user from public.users where id = v_uid;
  if not found then
    raise exception '가입 정보를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_user.role = 'guardian' then
    raise exception '요양보호사 계정만 어르신을 담당으로 추가할 수 있습니다' using errcode = 'P0001';
  end if;
  if v_user.org_id is null then
    raise exception '온보딩을 먼저 완료해 주세요' using errcode = 'P0001';
  end if;

  select * into v_code from public.elder_codes where code = upper(btrim(p_code));
  if not found then
    raise exception '유효하지 않은 어르신 코드입니다' using errcode = 'P0002';
  end if;
  if v_code.org_id <> v_user.org_id then
    raise exception '다른 기관의 어르신 코드입니다. 같은 기관 안에서만 담당으로 추가할 수 있습니다'
      using errcode = 'P0001';
  end if;

  insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id, assigned_by, status)
    values (v_code.org_id, v_code.profile_id, v_uid, v_uid, 'active')
  on conflict (profile_id, caregiver_user_id)
    do update set status = 'active', removed_at = null, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.claim_elder_by_code(text) from public;
grant execute on function public.claim_elder_by_code(text) to authenticated;

-- 보호자: 어르신 영속 코드로 연결(비소진·멱등). redeem_guardian_invite 대체.
create or replace function public.link_guardian_by_elder_code(p_code text)
returns public.profile_guardians
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
  v_code public.elder_codes;
  v_link public.profile_guardians;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;
  select * into v_user from public.users where id = v_uid for update;
  if not found then
    raise exception '가입 정보를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_user.role <> 'guardian' then
    raise exception '보호자 계정만 어르신 코드로 연결할 수 있습니다' using errcode = 'P0001';
  end if;

  select * into v_code from public.elder_codes where code = upper(btrim(p_code));
  if not found then
    raise exception '유효하지 않은 어르신 코드입니다' using errcode = 'P0002';
  end if;

  -- MVP: 보호자 1계정 ↔ 1기관. 첫 연결 기관으로 합류, 타 기관 코드는 거부.
  if v_user.org_id is null then
    update public.users set org_id = v_code.org_id where id = v_uid;
  elsif v_user.org_id <> v_code.org_id then
    raise exception '다른 기관의 어르신 코드입니다. 기관당 한 계정만 연결할 수 있습니다'
      using errcode = 'P0001';
  end if;

  select * into v_link
    from public.profile_guardians
    where profile_id = v_code.profile_id and guardian_user_id = v_uid
    for update;

  if found then
    if v_link.status = 'approved' then
      raise exception '이미 연결된 어르신입니다' using errcode = 'P0001';
    elsif v_link.status = 'pending' then
      raise exception '이미 승인 대기 중인 연결입니다' using errcode = 'P0001';
    else
      update public.profile_guardians
        set status = 'pending', approved_by = null, approved_at = null, revoked_at = null
        where id = v_link.id
        returning * into v_link;
    end if;
  else
    insert into public.profile_guardians (org_id, profile_id, guardian_user_id, status)
      values (v_code.org_id, v_code.profile_id, v_uid, 'pending')
      returning * into v_link;
  end if;

  return v_link;
end;
$$;

revoke execute on function public.link_guardian_by_elder_code(text) from public;
grant execute on function public.link_guardian_by_elder_code(text) to authenticated;

-- 온보딩: 보호자 코드 인자를 영속 코드로 전환(redeem → link).
-- 기존 함수는 인자명(p_invite_code)이 달라 create or replace 로 개명 불가 → 재생성.
drop function if exists public.complete_onboarding(text, text, text, text, text);
create or replace function public.complete_onboarding(
  p_name text,
  p_phone text,
  p_role text,
  p_org_name text default null,
  p_elder_code text default null
) returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  select * into v_user from public.users where id = v_uid for update;
  if not found then
    raise exception '가입 정보를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_user.onboarded_at is not null then
    raise exception '이미 온보딩을 완료한 계정입니다' using errcode = 'P0001';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception '이름을 입력해 주세요' using errcode = '22000';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception '전화번호를 입력해 주세요' using errcode = '22000';
  end if;

  if p_role = 'caregiver' then
    if nullif(btrim(p_org_name), '') is null then
      raise exception '기관명을 입력해 주세요' using errcode = '22000';
    end if;
    insert into public.organizations (name)
      values (left(btrim(p_org_name), 100))
      returning id into v_org_id;
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          org_id = v_org_id, role = 'org_admin', onboarded_at = now()
      where id = v_uid;

  elsif p_role = 'guardian' then
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          role = 'guardian', onboarded_at = now()
      where id = v_uid;
    if nullif(btrim(p_elder_code), '') is not null then
      perform public.link_guardian_by_elder_code(p_elder_code);
    end if;

  else
    raise exception '역할은 caregiver 또는 guardian 이어야 합니다' using errcode = '22000';
  end if;

  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;

revoke execute on function public.complete_onboarding(text, text, text, text, text) from public;
grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated;

-- 구 redeem_guardian_invite / guardian_invites 발급은 폐기(영속 코드로 대체).
-- 테이블·함수는 감사 이력 보존을 위해 남겨두되 UI/데이터층에서 사용하지 않는다.

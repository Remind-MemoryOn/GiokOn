-- MemoryOn(기억온) v1 — 조직(멀티테넌시)·RBAC 선반영 + 조직 단위 RLS 확장
-- (M14.1 · M10.4 / Phase G)
--
-- 배경: 비즈니스 모델이 "기관(요양원·복지관) SaaS 구독"이므로, 데이터 소유를
-- 개인 요양보호사 계정이 아니라 **기관(테넌트)** 에 귀속시켜야 한다. 요양보호사가
-- 퇴사/이동해도 어르신 데이터는 기관에 남고, 기관 관리자는 소속 데이터를 관리·집계
-- 할 수 있어야 한다. 정부/기관 납품 시 "기관 단위 데이터 소유·격리·관리자 권한"은
-- 사실상 필수 요건이다. (PLAN.md §8, 결정 A — 사용자 승인)
--
-- 본 마이그레이션은 append-only 로 초기 스키마(20260521131723) + Auth 전환
-- (20260624090000) 위에서 동작한다. 변경 요지:
--   1. organizations(기관=테넌트) 테이블 + org_role enum(RBAC).
--   2. users 에 org_id + role 추가. 데이터 테이블(profiles/chronicle_entries/
--      sessions/session_logs)에 org_id 비정규화(테넌트 격리 기준 컬럼).
--   3. 가입 트리거 확장: 회원가입 시 기본 기관 자동 생성 + 가입자를 org_admin 으로.
--   4. 기존 데이터 백필(사용자별 기관 생성·데이터 org_id 채움) 후 NOT NULL 확정.
--   5. RLS 를 "본인 + 같은 기관(역할 범위)" 로 확장. 다른 기관은 절대 접근 불가.
--   6. INSERT 시 org_id 자동 스탬프 트리거(기존 데이터 레이어 무변경 호환).
--
-- 참고: Edge Function(service_role) 삽입은 auth.uid() 가 없으므로 org_id 를 명시
-- 지정해야 한다(스탬프 트리거는 인증 사용자 컨텍스트에서만 동작).

-- ──────────────────────────────────────────────────────────────────────────
-- 1) organizations(기관 = 테넌트) + 역할 enum
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  create type public.org_role as enum ('org_admin', 'caregiver', 'guardian');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_name_check
    check (char_length(btrim(name)) between 1 and 100)
);

create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function app.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 2) users 에 org_id + role, 데이터 테이블에 org_id(테넌트 격리 컬럼)
-- ──────────────────────────────────────────────────────────────────────────
-- 우선 NULL 허용으로 추가 → 백필 → NOT NULL 확정(무중단 순서).

alter table public.users
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists role public.org_role not null default 'caregiver';

alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.chronicle_entries
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.sessions
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.session_logs
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 컨텍스트 헬퍼(현재 사용자의 기관·역할). RLS 재귀 방지를 위해 security definer
--    로 users 를 우회 조회. search_path 고정.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function app.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid();
$$;

create or replace function app.current_org_role()
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function app.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.users where id = auth.uid()) = 'org_admin',
    false
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 가입 트리거 확장: 기본 기관 자동 생성 + 가입자를 org_admin 으로
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  display_name text;
begin
  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1)
  );

  -- 가입 시 기본 기관 자동 생성(org_name 메타데이터가 있으면 사용).
  insert into public.organizations (name)
  values (
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'org_name'), ''),
      display_name || '의 기관'
    )
  )
  returning id into new_org_id;

  insert into public.users (id, name, email, org_id, role)
  values (new.id, display_name, new.email, new_org_id, 'org_admin')
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) 기존 데이터 백필: 사용자별 기관 생성 → 사용자·데이터 org_id 채움
-- ──────────────────────────────────────────────────────────────────────────

do $$
declare
  u record;
  new_org uuid;
begin
  for u in select id, name from public.users where org_id is null loop
    insert into public.organizations (name)
    values (coalesce(nullif(btrim(u.name), ''), '기관') || '의 기관')
    returning id into new_org;

    update public.users
      set org_id = new_org, role = 'org_admin'
      where id = u.id;
  end loop;
end $$;

update public.profiles p
  set org_id = u.org_id
  from public.users u
  where p.user_id = u.id and p.org_id is null;

update public.chronicle_entries c
  set org_id = u.org_id
  from public.users u
  where c.user_id = u.id and c.org_id is null;

update public.sessions s
  set org_id = u.org_id
  from public.users u
  where s.user_id = u.id and s.org_id is null;

update public.session_logs l
  set org_id = u.org_id
  from public.users u
  where l.user_id = u.id and l.org_id is null;

-- 백필 완료 → NOT NULL 확정.
alter table public.users            alter column org_id set not null;
alter table public.profiles         alter column org_id set not null;
alter table public.chronicle_entries alter column org_id set not null;
alter table public.sessions         alter column org_id set not null;
alter table public.session_logs     alter column org_id set not null;

-- ──────────────────────────────────────────────────────────────────────────
-- 6) org_id 자동 스탬프(INSERT). 기존 데이터 레이어(org_id 미지정) 무변경 호환.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function app.stamp_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null then
    new.org_id := app.current_org_id();
  end if;
  return new;
end;
$$;

create trigger stamp_profiles_org_id
before insert on public.profiles
for each row execute function app.stamp_org_id();

create trigger stamp_chronicle_entries_org_id
before insert on public.chronicle_entries
for each row execute function app.stamp_org_id();

create trigger stamp_sessions_org_id
before insert on public.sessions
for each row execute function app.stamp_org_id();

create trigger stamp_session_logs_org_id
before insert on public.session_logs
for each row execute function app.stamp_org_id();

-- ──────────────────────────────────────────────────────────────────────────
-- 7) 인덱스(기관 단위 조회·관리자 집계 대비)
-- ──────────────────────────────────────────────────────────────────────────

create index if not exists idx_users_org_id on public.users(org_id);
create index if not exists idx_profiles_org_id on public.profiles(org_id, created_at desc);
create index if not exists idx_chronicle_entries_org_id on public.chronicle_entries(org_id);
create index if not exists idx_sessions_org_id on public.sessions(org_id, started_at desc);
create index if not exists idx_session_logs_org_id on public.session_logs(org_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 8) RLS: "본인 + 같은 기관(역할 범위)" 로 확장. 다른 기관 접근 불가.
--    원칙(최소권한): caregiver=본인 데이터, org_admin=소속 기관 전체.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.organizations enable row level security;

-- organizations: 소속 기관만 조회, 관리자만 수정. 생성/삭제는 트리거(정의자) 경유.
create policy organizations_select_member
on public.organizations
for select
using (id = app.current_org_id());

create policy organizations_update_admin
on public.organizations
for update
using (id = app.current_org_id() and app.is_org_admin())
with check (id = app.current_org_id() and app.is_org_admin());

-- users: 본인 + (관리자면) 같은 기관 구성원.
drop policy if exists users_select_own on public.users;
drop policy if exists users_update_own on public.users;

create policy users_select_scope
on public.users
for select
using (
  id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

create policy users_update_scope
on public.users
for update
using (
  id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (id = auth.uid() or app.is_org_admin())
);

-- profiles
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_scope
on public.profiles
for select
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

create policy profiles_insert_scope
on public.profiles
for insert
with check (user_id = auth.uid() and org_id = app.current_org_id());

create policy profiles_update_scope
on public.profiles
for update
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (user_id = auth.uid() or app.is_org_admin())
);

create policy profiles_delete_scope
on public.profiles
for delete
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

-- chronicle_entries
drop policy if exists chronicle_entries_select_own on public.chronicle_entries;
drop policy if exists chronicle_entries_insert_own on public.chronicle_entries;
drop policy if exists chronicle_entries_update_own on public.chronicle_entries;
drop policy if exists chronicle_entries_delete_own on public.chronicle_entries;

create policy chronicle_entries_select_scope
on public.chronicle_entries
for select
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

create policy chronicle_entries_insert_scope
on public.chronicle_entries
for insert
with check (user_id = auth.uid() and org_id = app.current_org_id());

create policy chronicle_entries_update_scope
on public.chronicle_entries
for update
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (user_id = auth.uid() or app.is_org_admin())
);

create policy chronicle_entries_delete_scope
on public.chronicle_entries
for delete
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

-- sessions
drop policy if exists sessions_select_own on public.sessions;
drop policy if exists sessions_insert_own on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;

create policy sessions_select_scope
on public.sessions
for select
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

create policy sessions_insert_scope
on public.sessions
for insert
with check (user_id = auth.uid() and org_id = app.current_org_id());

create policy sessions_update_scope
on public.sessions
for update
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (user_id = auth.uid() or app.is_org_admin())
);

create policy sessions_delete_scope
on public.sessions
for delete
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

-- session_logs
drop policy if exists session_logs_select_own on public.session_logs;
drop policy if exists session_logs_insert_own on public.session_logs;
drop policy if exists session_logs_update_own on public.session_logs;
drop policy if exists session_logs_delete_own on public.session_logs;

create policy session_logs_select_scope
on public.session_logs
for select
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

create policy session_logs_insert_scope
on public.session_logs
for insert
with check (user_id = auth.uid() and org_id = app.current_org_id());

create policy session_logs_update_scope
on public.session_logs
for update
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (user_id = auth.uid() or app.is_org_admin())
);

create policy session_logs_delete_scope
on public.session_logs
for delete
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

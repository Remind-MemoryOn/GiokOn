-- MemoryOn(기억온) v1 — Supabase Auth 전환 + RLS auth.uid() 재작성 (M3.1, M3.2)
--
-- 배경: 초기 스키마(20260521131723_initial_schema)는 Firebase Auth를 정체성으로,
-- RLS를 app.current_user_id()(= 세션변수 app.user_id)로 작성했다. PLAN.md 결정
-- (2026-06-22)에 따라 정체성을 Supabase Auth로 전환한다. 코드 인증이 아직 목업이라
-- firebase_uid 폐기로 인한 데이터 손실은 없다.
--
-- 본 마이그레이션은 초기 스키마 위에서 동작한다(append-only). 변경 요지:
--   1. public.users.id ↔ auth.users(id) 1:1 연결, firebase_uid 제거.
--   2. auth.users INSERT 시 public.users row 자동 부트스트랩 트리거.
--   3. 모든 RLS 정책을 app.current_user_id() → auth.uid()로 재작성.
--   4. 레거시 app.current_user_id() 함수 제거.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) users ↔ auth.users 연결
-- ──────────────────────────────────────────────────────────────────────────

-- firebase_uid 인덱스·컬럼 제거.
drop index if exists public.idx_users_firebase_uid;
alter table public.users drop constraint if exists users_firebase_uid_check;
alter table public.users drop column if exists firebase_uid;

-- id는 더 이상 자체 생성하지 않는다(= auth.uid()). auth.users(id)에 종속시킨다.
alter table public.users alter column id drop default;
alter table public.users
  add constraint users_id_auth_users_fk
  foreign key (id) references auth.users(id) on delete cascade;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 가입 트리거: auth.users → public.users 부트스트랩
-- ──────────────────────────────────────────────────────────────────────────
-- 회원가입 시 메타데이터(name)를 raw_user_meta_data에서 읽어 users row를 만든다.
-- 이름이 없으면 이메일 로컬파트로 임시 채운다(NOT NULL 충족). security definer로
-- RLS를 우회해 삽입한다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────
-- 3) RLS 재작성: app.current_user_id() → auth.uid()
-- ──────────────────────────────────────────────────────────────────────────

-- users
drop policy if exists users_select_own on public.users;
drop policy if exists users_update_own on public.users;

create policy users_select_own
on public.users
for select
using (id = auth.uid());

create policy users_update_own
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid());

-- profiles
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own
on public.profiles
for select
using (user_id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
with check (user_id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy profiles_delete_own
on public.profiles
for delete
using (user_id = auth.uid());

-- chronicle_entries
drop policy if exists chronicle_entries_select_own on public.chronicle_entries;
drop policy if exists chronicle_entries_insert_own on public.chronicle_entries;
drop policy if exists chronicle_entries_update_own on public.chronicle_entries;
drop policy if exists chronicle_entries_delete_own on public.chronicle_entries;

create policy chronicle_entries_select_own
on public.chronicle_entries
for select
using (user_id = auth.uid());

create policy chronicle_entries_insert_own
on public.chronicle_entries
for insert
with check (user_id = auth.uid());

create policy chronicle_entries_update_own
on public.chronicle_entries
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy chronicle_entries_delete_own
on public.chronicle_entries
for delete
using (user_id = auth.uid());

-- sessions
drop policy if exists sessions_select_own on public.sessions;
drop policy if exists sessions_insert_own on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;

create policy sessions_select_own
on public.sessions
for select
using (user_id = auth.uid());

create policy sessions_insert_own
on public.sessions
for insert
with check (user_id = auth.uid());

create policy sessions_update_own
on public.sessions
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy sessions_delete_own
on public.sessions
for delete
using (user_id = auth.uid());

-- session_logs
drop policy if exists session_logs_select_own on public.session_logs;
drop policy if exists session_logs_insert_own on public.session_logs;
drop policy if exists session_logs_update_own on public.session_logs;
drop policy if exists session_logs_delete_own on public.session_logs;

create policy session_logs_select_own
on public.session_logs
for select
using (user_id = auth.uid());

create policy session_logs_insert_own
on public.session_logs
for insert
with check (user_id = auth.uid());

create policy session_logs_update_own
on public.session_logs
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy session_logs_delete_own
on public.session_logs
for delete
using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 레거시 정체성 함수 제거
-- ──────────────────────────────────────────────────────────────────────────
-- app.text_array_within / app.set_updated_at 는 계속 사용하므로 app 스키마는 유지.
drop function if exists app.current_user_id();

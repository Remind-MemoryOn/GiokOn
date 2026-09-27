-- MemoryOn(기억온) — 테스트용 Supabase 심(shim)
--
-- 실 Supabase 에는 auth 스키마·auth.users·auth.uid() 와 authenticated 롤이 실재한다.
-- 로컬/CI 의 순정 PostgreSQL 에는 없으므로, 마이그레이션·RLS 테스트를 돌리기 전에
-- 최소 형태로 만들어 준다. auth.uid() 는 테스트에서 set test.uid 로 주입한다.
-- ⚠️ 테스트 전용. 실 프로젝트에는 적용하지 않는다.

create schema if not exists auth;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

-- 실 Supabase 의 auth.role() = JWT 의 role 클레임('authenticated'·'anon'·'service_role').
-- ⚠️ 없으면 이걸 쓰는 트리거(app.protect_site_admin_flag)가 undefined_function 으로
-- 죽는데, 그 예외를 잡는 테스트가 '차단됨'으로 오인해 통과한다(2026-09-08 발견).
-- ⚠️ auth.role() 은 **JWT 클레임**이라 current_user 와 무관하다 —
-- SECURITY DEFINER 함수 안에서도 'authenticated' 그대로다. 이걸 current_user 에
-- 연결하면 definer 트리거 안에서 'service_role' 로 보여 보호가 통째로 뚫린다.
-- 그래서 주입된 test.uid(= 로그인 요청) 유무로만 판별한다.
create or replace function auth.role() returns text
  language sql stable as $$
  select coalesce(
    nullif(current_setting('test.role', true), ''),
    case when nullif(current_setting('test.uid', true), '') is not null
         then 'authenticated' else 'service_role' end
  );
$$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

-- Supabase 의 미인증(로그인 전) 롤. 일부 로그인 전 RPC(예: find_login_email)가
-- anon 에 grant 되므로 로컬 회귀에서도 실재해야 한다.
do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

-- 실 Supabase 는 프로젝트 생성 시 public 스키마 테이블 권한을 authenticated 에 준다
-- (RLS 가 실제 게이트이고, 권한은 열려 있는 전제). 하네스가 이를 흉내내지 않으면
-- **"권한을 회수했다" 와 "애초에 없었다" 를 구분할 수 없다** — 그러면 마이그레이션의
-- 컬럼 권한 회수(users 1차 방어)가 통째로 사라져도 테스트가 그대로 통과한다
-- (2026-09-09 변이 테스트로 발견). 이후 마이그레이션이 만드는 테이블에 자동 부여되도록
-- 기본 권한을 걸어 둔다.
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;

-- 실 Supabase Storage 의 최소 형태(storage.buckets · storage.objects, RLS 켜짐).
-- ⚠️ 이게 없으면 사진 버킷 정책을 만드는 마이그레이션이 `storage 스키마 없음` 분기로 **정책을 통째로 건너뛰어**
--    회귀가 정책을 한 번도 검사하지 못한다 — 그 공백 때문에 정책이 `profiles.name` 에 잘못 묶인 결함이
--    운영까지 갔다(감사 2026-09-27 · T25.1). 정책이 쓰는 열(bucket_id·name)과 소유자·시각만 둔다.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

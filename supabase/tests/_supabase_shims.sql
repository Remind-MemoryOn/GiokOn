-- MemoryOn(기억온) — 테스트용 Supabase 심(shim)
--
-- 실 Supabase 에는 auth 스키마·auth.users·auth.uid() 와 authenticated 롤이 실재한다.
-- 로컬/CI 의 순정 PostgreSQL 에는 없으므로, 마이그레이션·RLS 테스트를 돌리기 전에
-- 최소 형태로 만들어 준다. auth.uid() 는 테스트에서 set test.uid 로 주입한다.
-- ⚠️ 테스트 전용. 실 프로젝트에는 적용하지 않는다.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
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

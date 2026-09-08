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

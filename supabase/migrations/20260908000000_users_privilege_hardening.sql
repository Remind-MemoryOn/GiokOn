-- MemoryOn(기억온) — users 권한 컬럼 셀프 승격 차단 (2026-09-08, 사용자 발견)
--
-- ■ 취약점
-- `users_update_scope`(20260703120000_organizations_rbac.sql)의 WITH CHECK 가
--   org_id = app.current_org_id() and (id = auth.uid() or app.is_org_admin())
-- 뿐이라 **role 컬럼을 아무도 제약하지 않는다.** 따라서 publishable(anon) 키와
-- 본인 JWT 만 있으면 누구나:
--     update public.users set role = 'org_admin' where id = auth.uid();
-- 가 USING·WITH CHECK 를 모두 통과한다. 요양보호사는 물론 **보호자 계정도** 기관
-- 관리자가 되어 기관 전체 어르신 기록·구성원·organizations 를 읽고 쓸 수 있다.
--
-- ■ 이미 안전한 것(중복 방어 불필요)
--   · is_site_admin — 20260902000000_inquiries.sql 의 users_protect_site_admin 트리거.
--   · org_id        — WITH CHECK 의 `org_id = app.current_org_id()` 가 사실상 고정한다.
--                     app.current_org_id() 는 stable 이라 UPDATE 중에도 **변경 전** 값을
--                     읽으므로 new.org_id = old.org_id 를 강제하는 셈이다.
--   · INSERT        — users 에 insert 정책이 없다(가입은 handle_new_user 트리거 전용).
-- 즉 구멍은 **role 한 컬럼**이다.
--
-- ■ 방어를 3중으로 둔다. 순서가 곧 강도다.
--   1차 컬럼 권한 — 권한 검사는 **RLS·트리거보다 먼저** 돈다. 정책을 잘못 고쳐도
--        여기서 막힌다. 허용 목록 방식이라 users 에 컬럼이 추가돼도 기본이 '쓰기 불가'다.
--   2차 트리거   — SECURITY DEFINER 함수의 실수까지 잡고, 오류 메시지를 사람이 읽게 한다.
--   3차 정책     — 의도를 정책 본문에 남긴다(읽는 사람이 규칙을 알 수 있게).
--
-- ⚠️ 트리거는 auth.role() 이 아니라 **current_user** 로 판별한다.
--    auth.role() 은 JWT 클레임이라 SECURITY DEFINER 함수 안에서도 'authenticated' 다.
--    complete_onboarding 은 **호출자 본인의 role 을 org_admin/guardian 으로 바꾸므로**,
--    기존 protect_site_admin_flag 처럼 auth.role() 로 판별하면 **온보딩이 통째로 막힌다**.
--    current_user 는 SECURITY DEFINER 안에서 함수 소유자(postgres)가 되어 정확히 갈린다.

-- ──────────────────────────────────────────────────────────────────────────
-- 1차) 컬럼 단위 쓰기 권한 — 허용 목록
-- ──────────────────────────────────────────────────────────────────────────
-- PostgreSQL 은 테이블 단위 UPDATE 권한이 있으면 컬럼 단위 REVOKE 를 무시한다.
-- 따라서 테이블 권한을 먼저 회수하고 필요한 컬럼만 다시 부여한다.
revoke update on public.users from authenticated;
revoke update on public.users from anon;

-- 클라이언트가 users 에 직접 쓰는 것은 표시 이름뿐이다(useUpdateMyName).
-- 나머지(role·org_id·is_site_admin·email·phone·onboarded_at)는 전부 RPC 경유다.
grant update (name) on public.users to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2차) 권한 컬럼 변경 차단 트리거
-- ──────────────────────────────────────────────────────────────────────────
-- ⚠️ **security invoker(기본값)** 여야 한다. security definer 로 두면 함수 안에서
-- current_user 가 항상 소유자(postgres)가 되어 아래 가드가 매번 조기 반환하고
-- 보호가 통째로 무력화된다(2026-09-08 회귀 테스트가 잡아낸 실수).
-- 판별에 필요한 조회는 app.is_org_admin() 등 definer 헬퍼가 대신 해 준다.
create or replace function app.protect_user_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- PostgREST 로 직접 들어온 쓰기만 검사한다. SECURITY DEFINER RPC 안에서는
  -- current_user 가 함수 소유자(postgres)라 여기서 걸리지 않는다
  -- (complete_onboarding 은 호출자 본인의 role 을 정상적으로 바꾼다).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.role is distinct from old.role then
    -- 본인 역할은 어떤 경우에도 직접 바꿀 수 없다(셀프 승격 차단).
    -- 기관 관리자가 **다른** 구성원의 역할을 바꾸는 것은 정상 기능이라 허용한다.
    if new.id = auth.uid() then
      raise exception '본인의 역할은 변경할 수 없습니다' using errcode = '42501';
    end if;
    if not app.is_org_admin() or old.org_id is distinct from app.current_org_id() then
      raise exception '역할을 변경할 권한이 없습니다' using errcode = '42501';
    end if;
  end if;

  if new.org_id is distinct from old.org_id then
    raise exception '소속 기관은 직접 변경할 수 없습니다' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists users_protect_privileges on public.users;
create trigger users_protect_privileges
  before update on public.users
  for each row execute function app.protect_user_privileges();

-- ──────────────────────────────────────────────────────────────────────────
-- 3차) RLS WITH CHECK 에 role 고정을 명시
-- ──────────────────────────────────────────────────────────────────────────
-- app.current_org_role() 은 security definer 라 users 를 다시 읽어도 RLS 재귀가 없다.
-- (정책 안에서 public.users 를 직접 subquery 하면 "infinite recursion detected" 가 난다.)
drop policy if exists users_update_scope on public.users;

create policy users_update_scope
on public.users
for update
using (
  id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (
    -- 본인 수정: 역할을 그대로 유지해야 한다.
    (id = auth.uid() and role = app.current_org_role())
    -- 기관 관리자가 같은 기관 구성원을 수정.
    or app.is_org_admin()
  )
);

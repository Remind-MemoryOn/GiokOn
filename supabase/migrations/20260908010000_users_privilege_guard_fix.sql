-- 20260908000000을 이미 적용한 환경에도 방어 보강을 전달한다.
-- current_user 판별 트리거를 DEFINER로 배포한 경우 반드시 INVOKER로 복구한다.
alter function app.protect_user_privileges() security invoker;

-- 관리자 분기는 다른 사람에게만 적용한다. 본인 role 고정 조건을 우회하지 않는다.
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
    (id = auth.uid() and role = app.current_org_role())
    or (id <> auth.uid() and app.is_org_admin())
  )
);

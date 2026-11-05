-- 구성원 내보내기 — 퇴사·이직(2026-11-05 사용자 결정: ① 관리자가 내보내기)
--
-- ■ 문제
--   기관에서 나가는 경로가 없었다. 요양보호사가 L요양원을 그만둬도 users.org_id 가 그대로라
--   **L 기관 전체 어르신 기록을 계속 볼 수 있었고**, 다른 기관(R)에 합류할 수도 없었다
--   (request_org_join 은 org_id 가 없는 계정만 받는다).
--
-- ■ 방식
--   public.remove_org_member(대상) — 기관 관리자·센터장만(역할 변경 set_member_role 과 같은 권한).
--     · 본인은 내보낼 수 없다(마지막 관리자가 스스로 나가 기관이 관리자 없이 남는 것도 이것으로 막힌다).
--     · 대상이 없거나 다른 기관이면 같은 코드(MEMBER_REMOVE_FORBIDDEN) — 다른 기관 사용자의 존재를 흘리지 않는다.
--     · 보호자는 대상이 아니다(보호자 연결은 어르신 단위의 별도 경로).
--     · 기관 관리자는 기관 관리자만 내보낼 수 있다(센터장이 관리자를 내보내지 못하게) · 마지막 관리자는 내보낼 수 없다.
--   내보내면(한 트랜잭션):
--     1) users.org_id = NULL · role = 'caregiver' → 기관 단위 RLS 가 그 기관 기록을 즉시 끊는다.
--        다음 화면은 기존 '합류 대기'(초대 코드 입력)다 — 새 기관(R) 초대 코드로 합류를 요청할 수 있다.
--     2) 그 기관의 담당 어르신 배정(profile_caregivers)을 removed 로.
--     3) 그 기관에서 받은 알림(notifications)을 지운다 — 알림 읽기 정책은 본인 여부만 보므로(user_id = auth.uid())
--        남겨 두면 어르신 이름이 든 알림 제목을 계속 읽는다.
--     4) audit_log.
--   남는 것: 그 사람이 남긴 세션·일지 등 기록은 기관 소유라 그 기관에 그대로 있다(본인은 더 못 본다).
--   ⚠️ 본인이 보낸 보호자 메시지 본문은 messages 읽기 정책(sender_user_id = auth.uid())으로 계속 보인다 —
--      보호자 쪽 읽기와 얽힌 정책이라 이번 범위에서 바꾸지 않는다(자기가 쓴 글만, 다른 사람 글은 아님).

create or replace function public.remove_org_member(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  target public.users%rowtype;
  n_assignments int;
  n_notifications int;
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.org_id is null or actor.onboarded_at is null
     or actor.role not in ('org_admin', 'center_director') then
    raise exception 'MEMBER_REMOVE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_target is null then
    raise exception 'MEMBER_REMOVE_INVALID' using errcode = '22023';
  end if;
  if p_target = actor.id then
    raise exception 'MEMBER_REMOVE_SELF' using errcode = '42501';
  end if;

  -- 역할 변경과 같은 잠금 — 두 관리자가 서로를 동시에 내보내 관리자가 0명이 되는 경쟁을 막는다.
  perform pg_advisory_xact_lock(hashtextextended(actor.org_id::text, 2409));

  select * into target from public.users where id = p_target for update;
  if target.id is null or target.org_id is distinct from actor.org_id or target.onboarded_at is null then
    raise exception 'MEMBER_REMOVE_FORBIDDEN' using errcode = '42501';
  end if;
  if target.role = 'guardian' then
    raise exception 'MEMBER_REMOVE_GUARDIAN' using errcode = '42501';
  end if;
  if target.role = 'org_admin' then
    if actor.role <> 'org_admin' then
      raise exception 'MEMBER_REMOVE_ADMIN' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.users where org_id = actor.org_id and role = 'org_admin' and id <> target.id
    ) then
      raise exception 'MEMBER_REMOVE_LAST_ADMIN' using errcode = '42501';
    end if;
  end if;

  update public.users set org_id = null, role = 'caregiver', updated_at = now() where id = target.id;

  update public.profile_caregivers
     set status = 'removed', removed_at = now(), updated_at = now()
   where caregiver_user_id = target.id and org_id = actor.org_id and status <> 'removed';
  get diagnostics n_assignments = row_count;

  delete from public.notifications where user_id = target.id and org_id = actor.org_id;
  get diagnostics n_notifications = row_count;

  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (actor.id, actor.org_id, 'remove_org_member', 'users', target.id::text,
          jsonb_build_object('role', target.role, 'assignments_removed', n_assignments,
                             'notifications_removed', n_notifications));
end $$;

revoke all on function public.remove_org_member(uuid) from public, anon;
grant execute on function public.remove_org_member(uuid) to authenticated;

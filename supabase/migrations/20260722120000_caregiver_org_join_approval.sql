-- MemoryOn(기억온) — 요양보호사 기관 합류(승인형) + 자가승인 차단
-- (2026-07-22, 사용자 확정 방향: 관리자 승인형 자가합류)
--
-- 신규 요양보호사가 어르신 코드로 "기존 기관에 합류"할 수 있게 하되, 코드만으로
-- 즉시 권한을 얻지 못하도록 **승인 게이트**를 둔다(보호자 연결과 대칭).
--   1) 온보딩(caregiver): 기관명 → 새 기관(org_admin) / 어르신 코드 → 기존 기관
--      합류(role=caregiver, org_id 확정, 배정은 status='pending').
--   2) 승인: 그 어르신의 활성 담당 또는 org_admin 이 approve_caregiver_assignment 로
--      pending → active. 본인은 자기 배정을 승인할 수 없다.
--   3) 자가승인 차단: profile_caregivers UPDATE 정책을 조여, 본인 행은 'removed'
--      (탈퇴)로만 바꿀 수 있고 'active' 로는 못 바꾼다(직접 update 우회 방지).
--   4) claim_elder_by_code: 이미 활성 담당(또는 admin)만 같은 기관의 다른 어르신을
--      즉시 인계할 수 있게 가드 추가(pending 상태의 자가 승격 방지).
-- pending 행은 is_assigned_caregiver(status='active' 만 인정)에 걸리지 않으므로
-- 승인 전에는 어르신·연대기·세션·분석·일지 어떤 것도 볼 수 없다. append-only.

-- ══════════════════════════════════════════════════════════════════════════
-- 1) 본인 배정 self-select — 승인 대기 상태를 본인이 확인(org_id 확정 전에도).
-- ══════════════════════════════════════════════════════════════════════════
create policy profile_caregivers_select_self
on public.profile_caregivers
for select
using (caregiver_user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════════
-- 2) UPDATE 정책 강화 — 자가승인 차단(본인은 'removed' 로만).
-- ══════════════════════════════════════════════════════════════════════════
drop policy if exists profile_caregivers_update_scope on public.profile_caregivers;
create policy profile_caregivers_update_scope
on public.profile_caregivers
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (
    app.is_org_admin()
    or app.is_assigned_caregiver(profile_id)   -- 그 어르신의 활성 담당
    or caregiver_user_id = auth.uid()          -- 본인(탈퇴용)
  )
)
with check (
  org_id = app.current_org_id()
  and (
    app.is_org_admin()
    or app.is_assigned_caregiver(profile_id)
    -- 본인 행은 탈퇴(removed)로만 변경 가능 — 자기 자신을 active 로 승격 불가.
    or (caregiver_user_id = auth.uid() and status = 'removed')
  )
);

-- ══════════════════════════════════════════════════════════════════════════
-- 3) 배정 승인 RPC — 관리자/활성 담당이 pending → active.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.approve_caregiver_assignment(p_id uuid)
returns public.profile_caregivers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profile_caregivers;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  select * into v_row from public.profile_caregivers where id = p_id;
  if not found then
    raise exception '배정 요청을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  -- 권한: 같은 기관 · 비 guardian · (org_admin 또는 그 어르신의 활성 담당).
  if not (
    v_row.org_id = app.current_org_id()
    and app.current_org_role() <> 'guardian'
    and (app.is_org_admin() or app.is_assigned_caregiver(v_row.profile_id))
  ) then
    raise exception '이 배정을 승인할 권한이 없습니다' using errcode = '42501';
  end if;

  -- 본인 배정 자가승인 금지(pending 이라 is_assigned_caregiver 로도 못 오지만 명시).
  if v_row.caregiver_user_id = v_uid then
    raise exception '본인 배정은 스스로 승인할 수 없습니다' using errcode = 'P0001';
  end if;

  update public.profile_caregivers
    set status = 'active', assigned_by = v_uid, removed_at = null, updated_at = now()
    where id = p_id and status = 'pending'
    returning * into v_row;
  if not found then
    raise exception '이미 처리된 배정 요청입니다' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.approve_caregiver_assignment(uuid) from public;
grant execute on function public.approve_caregiver_assignment(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 4) claim_elder_by_code 개정 — 활성 담당/관리자만 다른 어르신 즉시 인계.
-- ══════════════════════════════════════════════════════════════════════════
-- (미승인 상태의 요양보호사가 claim 으로 스스로 권한을 획득하는 우회를 차단.)
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

  -- 활성 담당(또는 org_admin)만 즉시 인계 가능. 신규 합류자는 온보딩 승인 경로로.
  if not (
    app.is_org_admin()
    or exists (
      select 1 from public.profile_caregivers
      where caregiver_user_id = v_uid
        and org_id = v_user.org_id
        and status = 'active'
    )
  ) then
    raise exception '아직 승인된 담당이 아니어서 다른 어르신을 추가할 수 없습니다. 관리자 승인 후 이용해 주세요'
      using errcode = 'P0001';
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

-- ══════════════════════════════════════════════════════════════════════════
-- 5) complete_onboarding 개정 — caregiver: 기관명(새 기관) 또는 어르신 코드(합류).
-- ══════════════════════════════════════════════════════════════════════════
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
  v_code public.elder_codes;
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
    if nullif(btrim(p_elder_code), '') is not null then
      -- 기존 기관 합류(승인 대기). 어르신 코드로 기관 확정 + pending 배정.
      select * into v_code from public.elder_codes where code = upper(btrim(p_elder_code));
      if not found then
        raise exception '유효하지 않은 어르신 코드입니다' using errcode = 'P0002';
      end if;
      update public.users
        set name = left(btrim(p_name), 50), phone = btrim(p_phone),
            org_id = v_code.org_id, role = 'caregiver', onboarded_at = now()
        where id = v_uid;
      insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id, status)
        values (v_code.org_id, v_code.profile_id, v_uid, 'pending')
      on conflict (profile_id, caregiver_user_id) do nothing;

    elsif nullif(btrim(p_org_name), '') is not null then
      -- 새 기관 생성(기관 관리자).
      insert into public.organizations (name)
        values (left(btrim(p_org_name), 100))
        returning id into v_org_id;
      update public.users
        set name = left(btrim(p_name), 50), phone = btrim(p_phone),
            org_id = v_org_id, role = 'org_admin', onboarded_at = now()
        where id = v_uid;

    else
      raise exception '기관명을 입력하거나(새 기관) 어르신 코드로 합류해 주세요' using errcode = '22000';
    end if;

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

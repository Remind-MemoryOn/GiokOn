-- 기관은 운영자만 만든다 — 요양보호사 온보딩은 초대 코드로만 합류(A안, 사용자 확정 2026-09-25)
--
-- 왜: 온보딩에서 기관명을 입력하면 입력할 때마다 기관을 새로 만들었다. 같은 기관 사람 둘이 각자 '선문대학교'를 입력해
--     서로 다른 기관 두 개가 생겼고, 기관 단위 열람이라 서로의 어르신 기록을 볼 수 없었다(운영에서 병합으로 정리).
-- 무엇:
--   1) app.provision_org(name) — 운영자 전용. 기관을 만들고 **관리자 초대 코드**(auto_approve, 1회용)를 돌려준다.
--      app.issue_admin_code(org_id) — 기존 기관에 관리자 코드를 다시 발급(만료·추가 관리자).
--   2) 관리자 코드로 가입하면 승인 없이 바로 그 기관의 org_admin 이 된다(빈 기관에는 승인해 줄 사람이 없다).
--      보통 초대 코드(직원)는 지금처럼 관리자·센터장 승인.
--   3) complete_onboarding: 요양보호사가 초대 코드 없이(또는 기관명으로) 가입하면 ORG_INVITE_REQUIRED.
-- 운영자 사용법: select * from app.provision_org('기관 이름');  → admin_code 를 기관 담당자에게 전달.
-- ⚠️ 두 함수는 anon·authenticated 에게 열지 않는다(SQL 편집기 = postgres 로만).

alter table public.org_invites add column if not exists auto_approve boolean not null default false;
alter table public.org_invites alter column created_by drop not null;
alter table public.org_invites drop constraint if exists org_invites_role_check;
alter table public.org_invites add constraint org_invites_role_check check (
  role in ('caregiver', 'social_worker', 'center_director') or (auto_approve and role = 'org_admin'));
alter table public.org_invites drop constraint if exists org_invites_creator_check;
alter table public.org_invites add constraint org_invites_creator_check check (created_by is not null or auto_approve);

alter table public.org_join_requests drop constraint if exists org_join_requests_role_check;
alter table public.org_join_requests add constraint org_join_requests_role_check check (
  requested_role in ('caregiver', 'social_worker', 'center_director', 'org_admin'));
-- 운영자 코드로 바로 합류한 요청은 결정한 사람이 없다(decided_by NULL 인 approved 허용).
alter table public.org_join_requests drop constraint if exists org_join_requests_decision_check;
alter table public.org_join_requests add constraint org_join_requests_decision_check check (
  (status = 'pending' and decided_at is null and decided_by is null)
  or (status = 'cancelled' and decided_at is not null)
  or (status = 'approved' and decided_at is not null)
  or (status = 'rejected' and decided_at is not null and decided_by is not null));

create or replace function app.issue_admin_code(p_org_id uuid, p_valid_days integer default 14)
returns public.org_invites
language plpgsql
security definer
set search_path = public
as $$
declare invite public.org_invites%rowtype; attempt int := 0;
begin
  if not exists (select 1 from public.organizations where id = p_org_id) then
    raise exception 'ORG_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 30 then
    raise exception 'ORG_INVITE_EXPIRY' using errcode = '22023';
  end if;
  loop
    attempt := attempt + 1;
    begin
      insert into public.org_invites (org_id, code, role, created_by, expires_at, auto_approve)
      values (p_org_id, app.generate_invite_code(), 'org_admin', null, now() + make_interval(days => p_valid_days), true)
      returning * into invite;
      exit;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (null, p_org_id, 'org_admin_code_issue', 'org_invites', invite.id::text,
          jsonb_build_object('expires_at', invite.expires_at));
  return invite;
end $$;
revoke all on function app.issue_admin_code(uuid, integer) from public, anon, authenticated;

create or replace function app.provision_org(p_name text, p_valid_days integer default 14)
returns table (org_id uuid, admin_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; invite public.org_invites%rowtype;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'ORG_NAME_REQUIRED' using errcode = '22023';
  end if;
  insert into public.organizations (name) values (left(btrim(p_name), 100)) returning id into v_org;
  invite := app.issue_admin_code(v_org, p_valid_days);
  return query select v_org, invite.code, invite.expires_at;
end $$;
revoke all on function app.provision_org(text, integer) from public, anon, authenticated;

-- 합류 요청: 운영자 관리자 코드면 승인 없이 바로 합류하고 코드는 1회용으로 닫는다.
create or replace function app.enqueue_org_join(p_user uuid, p_code text, p_name text)
returns public.org_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.org_invites%rowtype;
  request public.org_join_requests%rowtype;
begin
  -- 만료·회수·없는 코드는 같은 오류 — 어떤 코드가 실재하는지 흘리지 않는다.
  select * into invite from public.org_invites
   where code = upper(btrim(p_code)) and revoked_at is null and expires_at > now()
   for update;
  if invite.id is null then
    raise exception 'ORG_INVITE_INVALID' using errcode = '22023';
  end if;
  begin
    insert into public.org_join_requests (org_id, user_id, invite_id, requested_role, requester_name)
    values (invite.org_id, p_user, invite.id, invite.role, left(btrim(p_name), 50))
    returning * into request;
  exception when unique_violation then
    raise exception 'ORG_JOIN_PENDING' using errcode = '23505';
  end;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (p_user, invite.org_id, 'org_join_request', 'org_join_requests', request.id::text,
          jsonb_build_object('invite_id', invite.id, 'role', invite.role));

  if invite.auto_approve then
    update public.users set org_id = invite.org_id, role = invite.role, updated_at = now()
     where id = p_user and org_id is null and role <> 'guardian';
    if not found then
      raise exception 'ORG_JOIN_STALE' using errcode = '22023';
    end if;
    update public.org_join_requests set status = 'approved', decided_at = now()
     where id = request.id
     returning * into request;
    update public.org_invites set revoked_at = now(), revoked_by = p_user where id = invite.id;
    insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
    values (p_user, invite.org_id, 'org_join_auto_approve', 'org_join_requests', request.id::text,
            jsonb_build_object('invite_id', invite.id, 'role', invite.role));
  end if;
  return request;
end $$;
revoke all on function app.enqueue_org_join(uuid, text, text) from public, anon, authenticated;

create or replace function public.complete_onboarding(
  p_name text,
  p_phone text,
  p_role text,
  p_org_name text default null,
  p_elder_code text default null,
  p_consents text[] default null,
  p_consent_version text default null,
  p_social_acknowledged boolean default null,
  p_invite_code text default null
) returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
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

  if p_consent_version is distinct from 'v1.0'
    or p_social_acknowledged is distinct from true
    or p_consents is null or not ('privacy_required' = any(p_consents))
    or exists(select 1 from unnest(p_consents) c where c is null or c not in ('terms_required','privacy_required','marketing_optional')) then
    raise exception '현재 개인정보 동의와 소셜 정보 제공 확인이 필요합니다' using errcode = '22000';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception '이름을 입력해 주세요' using errcode = '22000';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception '전화번호를 입력해 주세요' using errcode = '22000';
  end if;

  if p_role = 'caregiver' then
    -- A안(2026-09-25): 요양보호사는 **초대 코드로만** 합류한다. 기관은 운영자가 만든다(app.provision_org) —
    -- 기관명을 입력해 새 기관을 만들던 경로는 같은 이름의 기관이 여러 개 생기게 했다(운영: '선문대학교' 2개).
    if nullif(btrim(p_invite_code), '') is null then
      raise exception 'ORG_INVITE_REQUIRED' using errcode = '22023';
    end if;
    if nullif(btrim(p_org_name), '') is not null then
      raise exception 'ORG_INVITE_REQUIRED' using errcode = '22023';
    end if;
    -- 가입은 끝내되 기관·역할은 합류가 정한다: 보통 코드는 승인 전까지 org_id NULL, 운영자 관리자 코드는 바로 합류.
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          role = 'caregiver', onboarded_at = now()
      where id = v_uid;
    perform app.enqueue_org_join(v_uid, p_invite_code, btrim(p_name));

  elsif p_role = 'guardian' then
    if nullif(btrim(p_invite_code), '') is not null then
      raise exception '보호자는 기관 초대 코드로 합류할 수 없습니다' using errcode = '22000';
    end if;
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

  -- Account evidence must also exist for a guardian with no organization.
  insert into public.consents
    (user_id, consent_type, granted, version, subject_type, capacity, basis)
  select v_uid, t.x::public.consent_type, true, p_consent_version, 'self', 'capable',
    case when t.x = 'terms_required' then '온보딩: 이용약관 동의'
         else '온보딩: 개인정보 수집·이용 동의 및 소셜 계정 정보 제공 확인' end
  from (select distinct unnest(p_consents) x) t;
  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;
revoke all on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean,text) from public, anon;
grant execute on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean,text) to authenticated;

-- R011: authenticated clients may withdraw, but never rewrite consent evidence.
begin;

create function app.stamp_consent_evidence()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if new.version is distinct from 'v1.0' or new.revoked_at is not null then
    raise exception 'CURRENT_CONSENT_REQUIRED' using errcode = '22000';
  end if;
  new.granted_at := statement_timestamp();
  new.created_at := statement_timestamp();
  new.updated_at := statement_timestamp();
  return new;
end $$;
revoke all on function app.stamp_consent_evidence() from public, anon, authenticated;
create trigger stamp_consent_evidence before insert on public.consents
  for each row execute function app.stamp_consent_evidence();

create function app.guard_consent_evidence_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  -- Trusted retention/administrative transactions remain possible and audited.
  -- SECURITY INVOKER is essential: a definer would always take this branch.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if (to_jsonb(new) - array['granted','revoked_at','updated_at'])
    is distinct from (to_jsonb(old) - array['granted','revoked_at','updated_at']) then
    raise exception 'CONSENT_EVIDENCE_IMMUTABLE' using errcode = '42501';
  end if;
  if old.revoked_at is not null or not old.granted then
    if new.granted is distinct from old.granted or new.revoked_at is distinct from old.revoked_at then
      raise exception 'CONSENT_WITHDRAWAL_IMMUTABLE' using errcode = '42501';
    end if;
  elsif not new.granted or new.revoked_at is not null then
    new.granted := false;
    new.revoked_at := statement_timestamp();
  end if;
  return new;
end $$;
revoke all on function app.guard_consent_evidence_update() from public, anon, authenticated;
create trigger guard_consent_evidence_update before update on public.consents
  for each row execute function app.guard_consent_evidence_update();

revoke update on public.consents from authenticated;
grant update(granted, revoked_at) on public.consents to authenticated;

alter table public.consents alter column org_id drop not null;

-- Account consent belongs to its owner even before joining an organization.
drop policy consents_insert_scope on public.consents;
create policy consents_insert_scope on public.consents for insert with check (
  user_id = auth.uid() and (
    (profile_id is null and consent_type in ('privacy_required','marketing_optional')
      and org_id is not distinct from app.current_org_id())
    or (profile_id is not null and org_id = app.current_org_id()
      and app.current_org_role() <> 'guardian'
      and (app.is_assigned_caregiver(profile_id) or app.is_org_admin()))
  )
);
drop policy consents_update_scope on public.consents;
create policy consents_update_scope on public.consents for update using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
  or (profile_id is not null and org_id = app.current_org_id()
      and app.current_org_role() <> 'guardian' and app.is_assigned_caregiver(profile_id))
) with check (
  (profile_id is null and user_id = auth.uid() and consent_type in ('privacy_required','marketing_optional'))
  or org_id = app.current_org_id()
);

-- Remove the old signature: omitted evidence must never select a permissive overload.
drop function public.complete_onboarding(text,text,text,text,text,text[]);
create or replace function public.complete_onboarding(
  p_name text,
  p_phone text,
  p_role text,
  p_org_name text default null,
  p_elder_code text default null,
  p_consents text[] default null,
  p_consent_version text default null,
  p_social_acknowledged boolean default null
) returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
  v_org_id uuid;
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
    or exists(select 1 from unnest(p_consents) c where c is null or c not in ('privacy_required','marketing_optional')) then
    raise exception '현재 개인정보 동의와 소셜 정보 제공 확인이 필요합니다' using errcode = '22000';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception '이름을 입력해 주세요' using errcode = '22000';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception '전화번호를 입력해 주세요' using errcode = '22000';
  end if;

  if p_role = 'caregiver' then
    -- 요양보호사 = 소속 기관명 입력 → 기관 생성 + 기관 관리자.
    if nullif(btrim(p_org_name), '') is null then
      raise exception '소속 기관명을 입력해 주세요' using errcode = '22000';
    end if;
    insert into public.organizations (name)
      values (left(btrim(p_org_name), 100))
      returning id into v_org_id;
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          org_id = v_org_id, role = 'org_admin', onboarded_at = now()
      where id = v_uid;

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

  -- Account evidence must also exist for a guardian with no organization.
  insert into public.consents
    (user_id, consent_type, granted, version, subject_type, capacity, basis)
  select v_uid, t.x::public.consent_type, true, p_consent_version, 'self', 'capable',
    '온보딩: 개인정보 수집·이용 동의 및 소셜 계정 정보 제공 확인'
  from (select distinct unnest(p_consents) x) t;
  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;
revoke all on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean) from public, anon;
grant execute on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

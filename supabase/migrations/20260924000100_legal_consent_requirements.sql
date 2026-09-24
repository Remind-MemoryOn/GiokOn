begin;

drop policy consents_insert_scope on public.consents;
create policy consents_insert_scope on public.consents for insert with check (
  user_id = auth.uid() and (
    (profile_id is null and consent_type in ('terms_required','privacy_required','marketing_optional')
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
  (profile_id is null and user_id = auth.uid() and consent_type in ('terms_required','privacy_required','marketing_optional'))
  or org_id = app.current_org_id()
);

create or replace function app.has_processing_consent(p_profile_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists(select 1 from public.profiles where id = p_profile_id)
    and not exists (
      select 1 from unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) required(kind)
      where not exists (
        select 1 from public.consents c join public.profiles p on p.id = c.profile_id
        where c.profile_id = p_profile_id and c.org_id = p.org_id
          and c.consent_type::text = required.kind and c.version = 'v1.0'
          and c.granted and c.revoked_at is null and c.granted_at <= statement_timestamp()
          and (
            (c.subject_type = 'self' and c.capacity = 'capable')
            or (c.subject_type = 'legal_representative' and c.capacity in ('incapable','limited')
              and nullif(btrim(c.guardian_name),'') is not null
              and nullif(btrim(c.guardian_relation),'') is not null)
            or (c.subject_type = 'guardian' and c.capacity = 'unknown'
              and nullif(btrim(c.guardian_name),'') is not null
              and nullif(btrim(c.guardian_relation),'') is not null
              and nullif(btrim(c.basis),'') is not null)
          )
      )
    );
$$;

create or replace function public.complete_onboarding(
  p_name text, p_phone text, p_role text, p_org_name text default null,
  p_elder_code text default null, p_consents text[] default null,
  p_consent_version text default null, p_social_acknowledged boolean default null
) returns public.users
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_user public.users; v_org_id uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다' using errcode = '28000'; end if;
  select * into v_user from public.users where id = v_uid for update;
  if not found then raise exception '가입 정보를 찾을 수 없습니다' using errcode = 'P0002'; end if;
  if v_user.onboarded_at is not null then raise exception '이미 온보딩을 완료한 계정입니다' using errcode = 'P0001'; end if;
  if p_consent_version is distinct from 'v1.0'
    or p_social_acknowledged is distinct from true
    or p_consents is null
    or not ('terms_required' = any(p_consents))
    or not ('privacy_required' = any(p_consents))
    or exists(select 1 from unnest(p_consents) c where c is null or c not in ('terms_required','privacy_required','marketing_optional')) then
    raise exception '현재 이용약관과 개인정보 수집·이용 동의가 필요합니다' using errcode = '22000';
  end if;
  if nullif(btrim(p_name), '') is null then raise exception '이름을 입력해 주세요' using errcode = '22000'; end if;
  if nullif(btrim(p_phone), '') is null then raise exception '전화번호를 입력해 주세요' using errcode = '22000'; end if;
  if p_role = 'caregiver' then
    if nullif(btrim(p_org_name), '') is null then raise exception '소속 기관명을 입력해 주세요' using errcode = '22000'; end if;
    insert into public.organizations (name) values (left(btrim(p_org_name), 100)) returning id into v_org_id;
    update public.users set name = left(btrim(p_name), 50), phone = btrim(p_phone), org_id = v_org_id,
      role = 'org_admin', onboarded_at = now() where id = v_uid;
  elsif p_role = 'guardian' then
    update public.users set name = left(btrim(p_name), 50), phone = btrim(p_phone), role = 'guardian', onboarded_at = now() where id = v_uid;
    if nullif(btrim(p_elder_code), '') is not null then perform public.link_guardian_by_elder_code(p_elder_code); end if;
  else raise exception '역할은 caregiver 또는 guardian 이어야 합니다' using errcode = '22000';
  end if;
  insert into public.consents (user_id, consent_type, granted, version, subject_type, capacity, basis)
  select v_uid, t.x::public.consent_type, true, p_consent_version, 'self', 'capable',
    case when t.x = 'terms_required' then '온보딩: 이용약관 동의' else '온보딩: 회원 개인정보 수집·이용 동의' end
  from (select distinct unnest(p_consents) x) t;
  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;
revoke all on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean) from public, anon;
grant execute on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

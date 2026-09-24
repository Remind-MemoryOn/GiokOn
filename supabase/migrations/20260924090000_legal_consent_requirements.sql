-- 법률 문서 확정본(2026-09-24) — 새 동의 종류(20260924080000)를 정책·함수에 반영한다.
--
-- jinwoo 브랜치 원안(20260924000100)에서 바꾼 점:
-- ① 번호를 main 의 파일럿 마이그레이션 뒤로 옮겼다. 원안은 앞 순서라 뒤의 20260924020000(org_join)이
--    complete_onboarding 을, 20260924030000(org_scoped_rls)이 consents_update_scope 를 다시 만들며
--    terms_required 를 지웠다 → 전부 적용하면 웹 신규 가입이 모두 실패했다.
--    그래서 여기서는 **main 의 최신 정의를 그대로 가져와** terms_required 만 더한다
--    (초대 코드 합류 p_invite_code · 돌봄팀 is_care_team 기준 유지).
-- ② complete_onboarding 은 terms_required 를 **받아들이되 아직 필수로 요구하지 않는다.**
--    DB 와 웹 배포는 동시에 바뀌지 않는다 — 필수로 두면 "마이그레이션 → 웹" 사이에는 옛 웹이,
--    "웹 → 마이그레이션" 사이에는 새 웹이 가입에 실패한다. 웹 화면은 이미 필수 체크를 요구한다.
--    웹 배포 뒤 DB 필수화는 후속 마이그레이션으로 한다.
-- ③ has_processing_consent 에 elder_privacy_required 를 필수로 더하되, **이 마이그레이션 적용 시점에
--    이미 등록돼 있던 어르신은 예외**로 둔다(app.elder_privacy_grandfathered). 원안대로면 이 동의가
--    없는 기존 어르신 전원이 세션을 시작할 수 없었다. 과거 동의를 새로 만들어 넣지는 않는다(R011
--    동의 증거는 지어내지 않는다) — 예외 대상은 동의가 **있는 척하지 않고**, 화면에는 미동의로 보인다.
--    새로 등록하는 어르신은 4종이 모두 있어야 세션을 시작한다.

-- ── ③ 기존 어르신 예외 목록 ────────────────────────────────────────────────
create table app.elder_privacy_grandfathered (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  recorded_at timestamptz not null default now()
);
comment on table app.elder_privacy_grandfathered is
  '20260924090000 적용 시점에 이미 등록돼 있던 어르신 — elder_privacy_required 도입 전 등록분이라 세션 동의 판정에서 이 항목만 면제한다. 행을 추가하지 않는다.';
insert into app.elder_privacy_grandfathered (profile_id)
  select id from public.profiles;
revoke all on app.elder_privacy_grandfathered from public, anon, authenticated;

create or replace function app.has_processing_consent(p_profile_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists(select 1 from public.profiles where id = p_profile_id)
    and not exists (
      select 1 from unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) required(kind)
      where not (required.kind = 'elder_privacy_required'
                 and exists (select 1 from app.elder_privacy_grandfathered g where g.profile_id = p_profile_id))
        and not exists (
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
revoke all on function app.has_processing_consent(uuid) from public, anon, authenticated;

-- ── 계정 동의 목록에 terms_required 추가(나머지는 현재 정의 그대로) ─────────────
-- INSERT: 20260910010000 판(어르신 동의 INSERT = 배정·관리자 유지, 결정 ①)
alter policy consents_insert_scope on public.consents
  with check (
    user_id = auth.uid() and (
      (profile_id is null and consent_type in ('terms_required','privacy_required','marketing_optional')
        and org_id is not distinct from app.current_org_id())
      or (profile_id is not null and org_id = app.current_org_id()
        and app.current_org_role() <> 'guardian'
        and (app.is_assigned_caregiver(profile_id) or app.is_org_admin()))
    )
  );
-- UPDATE: 20260924030000 판(어르신 동의 열람·철회 = 돌봄팀)
alter policy consents_update_scope on public.consents
  using (user_id = auth.uid()
         or (org_id = app.current_org_id() and app.is_org_admin())
         or (profile_id is not null and org_id = app.current_org_id() and app.is_care_team()))
  with check (((profile_id is null) and (user_id = auth.uid())
               and (consent_type = any (array['terms_required'::consent_type, 'privacy_required'::consent_type, 'marketing_optional'::consent_type])))
              or (org_id = app.current_org_id()));

-- ── 온보딩: 20260924020000 판 + terms_required 허용(필수화는 후속 — ② 참고) ─────
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
    or exists(select 1 from unnest(p_consents) c where c is null or c not in ('terms_required','privacy_required','marketing_optional')) then
    raise exception '현재 개인정보 동의와 소셜 정보 제공 확인이 필요합니다' using errcode = '22000';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception '이름을 입력해 주세요' using errcode = '22000';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception '전화번호를 입력해 주세요' using errcode = '22000';
  end if;

  if p_role = 'caregiver' and nullif(btrim(p_invite_code), '') is not null then
    -- 초대 코드로 합류: 가입은 끝내되 기관·역할은 **승인 전까지 정하지 않는다**(org_id NULL = 데이터 0건).
    if nullif(btrim(p_org_name), '') is not null then
      raise exception '새 기관 만들기와 초대 코드 합류 중 하나만 선택해 주세요' using errcode = '22000';
    end if;
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          role = 'caregiver', onboarded_at = now()
      where id = v_uid;
    perform app.enqueue_org_join(v_uid, p_invite_code, btrim(p_name));

  elsif p_role = 'caregiver' then
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

notify pgrst, 'reload schema';

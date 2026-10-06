-- 기억온 — 동의서 현행 버전 단일화(파일럿 T24.4 · DB 계획 D10)
--
-- 지금은 현행 동의서 버전 'v1.0' 이 SQL 함수 3곳에 글자로 박혀 있어, 동의서를 개정하면 한 곳만 바뀌고 나머지가
-- 옛 버전을 요구하는 드리프트가 생긴다(처리 동의 판정·동의 증거 삽입·온보딩). → 함수 하나가 현행 버전을 말하고 셋이 그것을 부른다.
--
-- 위치가 app 이 아니라 public 인 이유: app.stamp_consent_evidence 는 current_user 판별이 필요해 **security invoker** 트리거이고,
-- 운영에서 authenticated 에게 app 스키마 USAGE 가 없다(AGENTS.md · supabase/tests/prod_privileges.sql) — invoker 본문이 app.* 를
-- 이름으로 부르면 동의 저장이 'permission denied for schema app' 로 깨진다. 값은 공개해도 되는 상수(동의 화면에 이미 표시)다.
--
-- 앱·웹은 core CONSENT_VERSION 을 보낸다. 두 값이 어긋나면 온보딩·동의 저장이 거절되므로(조용히 틀리지 않는다),
-- core 테스트가 이 함수의 최신 정의와 CONSENT_VERSION 이 같은지 확인한다(packages/core/src/consent.test.ts).
-- 개정 절차: 새 마이그레이션에서 이 함수만 바꾸고 core CONSENT_VERSION 을 같은 값으로 — 옛 버전 동의는 그 순간 현행이 아니다.

create or replace function public.current_consent_version()
returns text
language sql
stable
set search_path = ''
as $$ select 'v1.0'::text $$;
comment on function public.current_consent_version() is
  '현행 동의서 버전(T24.4) — 처리 동의 판정·동의 증거 삽입·온보딩이 모두 이 값을 쓴다. core CONSENT_VERSION 과 같아야 한다.';
revoke all on function public.current_consent_version() from public;
grant execute on function public.current_consent_version() to anon, authenticated, service_role;

-- 아래 셋은 본문이 기존과 같고 버전 글자만 함수 호출로 바뀐다(권한·소유는 create or replace 가 유지한다).

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
          and c.consent_type::text = required.kind and c.version = public.current_consent_version()
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

create or replace function app.stamp_consent_evidence()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if new.version is distinct from public.current_consent_version() or new.revoked_at is not null then
    raise exception 'CURRENT_CONSENT_REQUIRED' using errcode = '22000';
  end if;
  new.granted_at := statement_timestamp();
  new.created_at := statement_timestamp();
  new.updated_at := statement_timestamp();
  return new;
end $$;

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

  if p_consent_version is distinct from public.current_consent_version()
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

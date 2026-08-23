-- MemoryOn(기억온) — 온보딩 시 **계정 필수 동의**를 consents 에 기록 (C2, 2026-08-23)
--
-- 배경: 웹 온보딩의 필수 체크박스(개인정보 수집·이용 등)가 UI 게이트로만 존재하고
-- 저장되지 않았다. PIPA 동의 이력 보존 요건상 "언제·무엇을·몇 버전으로" 동의했는지
-- 근거가 남아야 하므로, complete_onboarding 이 동의 목록을 함께 받아 적재한다.
--
-- 설계:
--   - p_consents 는 **선택** 인자(text[])다. 전달하지 않으면 기존 동작 그대로(하위호환).
--   - 값은 consent_type enum 유효 목록으로 **화이트리스트 필터**한다(모르는 값은 무시).
--   - subject='self' · capacity='capable' — 본인이 자기 계정 데이터에 대한 동의.
--     (어르신 개인 데이터 동의가 아니므로 profile_id 는 비워 둔다.)
--   - ⚠️ consents.org_id 는 NOT NULL(org 스탬프 트리거)이라 **org 가 있는 계정만 기록**.
--     무소속 보호자 가입은 이 경로에서 기록되지 않는다 — 첫 어르신 연결 시점 수집 또는
--     org-less 동의 지원(후속 결정 사항)으로 풀어야 한다.
--   - version 은 core CONSENT_CATALOG 의 'v1.0' 문자열과 일치(SoT 드리프트 방지).
-- append-only.

create or replace function public.complete_onboarding(
  p_name text,
  p_phone text,
  p_role text,
  p_org_name text default null,
  p_elder_code text default null,
  p_consents text[] default null
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

  -- ── 계정 필수 동의 적재(org 가 있는 계정 한정 — consents.org_id NOT NULL 제약) ──
  if p_consents is not null and array_length(p_consents, 1) > 0
     and (select org_id from public.users where id = v_uid) is not null then
    insert into public.consents
      (user_id, consent_type, granted, version, subject_type, capacity, basis)
    select
      v_uid,
      t.x::public.consent_type,
      true,
      'v1.0',
      'self',
      'capable',
      '온보딩 시 계정 필수 동의'
    from unnest(p_consents) as t(x)
    where t.x::text = any (array[
      'privacy_required',
      'sensitive_health_voice',
      'cross_border_transfer',
      'ai_processing',
      'marketing_optional'
    ]);
  end if;

  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;

-- 구 5인자 시그니처는 새 시그니처(마지막 인자 기본값)와 **별개 함수**로 남는다 → 정리.
drop function if exists public.complete_onboarding(text, text, text, text, text);

revoke execute on function public.complete_onboarding(text, text, text, text, text, text[]) from public;
grant execute on function public.complete_onboarding(text, text, text, text, text, text[]) to authenticated;

notify pgrst, 'reload schema';

-- MemoryOn(기억온) — 온보딩 개정: 요양보호사는 "소속 기관명" 입력으로 단순화
-- (2026-07-25, 사용자 요청: 어르신 코드는 보호자용 개념 — 요양보호사는 기관명 입력)
--
-- 배경: 20260722120000 에서 요양보호사가 어르신 코드로 "기존 기관 합류(pending)"
-- 하도록 했으나, 실제 UI 검토 결과 "어르신 코드"는 보호자 연결용 개념이라 요양보호사
-- 온보딩에 부적절. 요양보호사는 본인 소속 기관명을 입력하도록 되돌린다(새 기관 생성 +
-- org_admin). 보호자 브랜치(어르신 코드 연결)는 그대로 유지.
--
-- 주의: 여러 요양보호사의 "같은 기관 합류"(데이터 연속성)는 이 단순화로 온보딩에서
-- 제공되지 않는다(추후 기관 초대 코드 등 별도 메커니즘 — go-live 런북/PLAN 참고).
-- 배정·승인(approve_caregiver_assignment)·claim·rotate 함수는 잔존하나 온보딩 경로는
-- 사용하지 않는다. append-only.

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

  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;

revoke execute on function public.complete_onboarding(text, text, text, text, text) from public;
grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated;

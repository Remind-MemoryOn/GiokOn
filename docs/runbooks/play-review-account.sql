-- Play 심사 계정 준비(초안 · 아직 실행하지 않음 · 운영 DB 쓰기 — 사용자 승인 2026-11-27)
--
-- 0) 사용자: Supabase 대시보드 → Authentication → Users → "Add user" → "Create new user"
--    (이메일 = 심사용 주소, 비밀번호 = 사용자가 직접 정함, "Auto Confirm User" 켬).
--    비밀번호가 대화·저장소에 남지 않는다. 가입 트리거가 public.users 행을 만든다.
-- 1) '<REVIEW_EMAIL>' 두 곳을 그 주소로 바꿔 실행한다(대시보드 SQL = postgres — 보호 트리거는 PostgREST 쓰기만 검사).
--    만드는 것: 심사 전용 기관 1 · 그 계정 = 기관 관리자·온보딩 완료 · 가상 어르신 1 · 필수 동의 4종(v1.0 · 본인 · 의사능력 있음).
--    실존 인물 정보 없음. 기관 AI 초안 스위치는 켜지 않는다.
do $$
declare
  v_email text := '<REVIEW_EMAIL>';
  v_uid uuid;
  v_org uuid;
  v_elder uuid;
begin
  select id into v_uid from public.users where lower(email) = lower(v_email);
  if v_uid is null then raise exception '계정이 없습니다 — 대시보드에서 먼저 Add user'; end if;
  if exists (select 1 from public.users where id = v_uid and org_id is not null) then
    raise exception '이미 기관에 소속된 계정입니다 — 심사 전용 새 계정을 쓰세요';
  end if;

  insert into public.organizations(name) values ('Play 심사용 기관(가상)') returning id into v_org;

  update public.users
     set org_id = v_org, role = 'org_admin', onboarded_at = now(),
         name = coalesce(nullif(btrim(name), ''), 'Play 심사자')
   where id = v_uid;

  insert into public.profiles(user_id, org_id, name, birth_year, gender, hometown, job, hobbies, note)
  values (v_uid, v_org, '김가상', 1942, 'female', '강원 춘천(가상)', '초등학교 교사(가상)', '노래 부르기, 화초 가꾸기',
          'Google Play 심사용 가상 인물 — 실존 인물 아님')
  returning id into v_elder;

  insert into public.consents(org_id, user_id, profile_id, consent_type, granted, version, subject_type, capacity, granted_at)
  select v_org, v_uid, v_elder, k::public.consent_type, true, public.current_consent_version(),
         'self', 'capable', now()
    from unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) k;
end $$;

-- 2) 확인: role=org_admin · onboarded=true · elder=김가상 · can_start=true
select u.email, u.role, u.onboarded_at is not null as onboarded, o.name as org,
       p.name as elder, app.has_processing_consent(p.id) as can_start
  from public.users u
  join public.organizations o on o.id = u.org_id
  join public.profiles p on p.org_id = u.org_id
 where lower(u.email) = lower('<REVIEW_EMAIL>');

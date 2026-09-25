-- 기억온 — 법률 문서 동의(20260924080000·090000) 회귀
--
-- pilot_access.sql 뒤에 실행된다(run-rls-regression.sh). 그 파일의 기관 PA 관리자(a...01)를 쓴다.
-- 지키는 것:
--   ① 신규 가입: terms_required 를 보내도 가입된다(원안은 뒤 마이그레이션에 덮여 전부 실패했다)
--      · 배포 전환기: terms_required 없이 보내는 옛 웹도 가입된다 · 목록 밖 종류는 여전히 거부
--   ② 새 어르신: 기존 3종만으로는 세션 처리 불가 → elder_privacy_required 까지 있어야 가능
--   ③ 기존 어르신(적용 시점 등록분, app.elder_privacy_grandfathered): 3종만으로 계속 처리 가능
--      — 동의를 지어내지 않는다(예외 대상에도 elder_privacy_required 행은 생기지 않는다)

\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'legal-new@x.kr', '{"name":"약관가입자"}'),
  ('c0000000-0000-0000-0000-000000000002', 'legal-old@x.kr', '{"name":"옛웹가입자"}'),
  ('c0000000-0000-0000-0000-000000000003', 'legal-bad@x.kr', '{"name":"잘못된가입자"}');

-- ① 가입
set role authenticated;
do $$
declare blocked boolean := false;
begin
  perform set_config('test.uid', 'c0000000-0000-0000-0000-000000000001', true);
  perform public.complete_onboarding('약관가입자', '010-1000-0001', 'caregiver', null, null, array['terms_required','privacy_required'], 'v1.0', true, public.test_admin_code('약관요양원'));

  perform set_config('test.uid', 'c0000000-0000-0000-0000-000000000002', true);
  perform public.complete_onboarding('옛웹가입자', '010-1000-0002', 'caregiver', null, null, array['privacy_required'], 'v1.0', true, public.test_admin_code('옛웹요양원'));

  perform set_config('test.uid', 'c0000000-0000-0000-0000-000000000003', true);
  begin
    perform public.complete_onboarding('잘못된가입자', '010-1000-0003', 'caregiver', null, null, array['terms_required','privacy_required','ai_processing'], 'v1.0', true, public.test_admin_code('잘못요양원'));
  exception when others then blocked := true;
  end;
  assert blocked, '계정 동의 목록 밖의 종류(ai_processing)는 온보딩에서 거부돼야 함';
end $$;
reset role;
do $$
begin
  assert (select onboarded_at from public.users where id = 'c0000000-0000-0000-0000-000000000001') is not null,
    'terms_required 를 보낸 신규 가입이 완료돼야 함';
  assert exists (select 1 from public.consents where user_id = 'c0000000-0000-0000-0000-000000000001'
                 and consent_type = 'terms_required' and granted and profile_id is null
                 and basis = '온보딩: 이용약관 동의'), '이용약관 동의 증거가 남아야 함';
  assert (select onboarded_at from public.users where id = 'c0000000-0000-0000-0000-000000000002') is not null,
    '배포 전환기: terms_required 없이 보내는 옛 웹도 가입돼야 함';
  assert (select onboarded_at from public.users where id = 'c0000000-0000-0000-0000-000000000003') is null,
    '거부된 가입은 완료되지 않아야 함';
end $$;

-- 본인 이용약관 동의는 본인이 철회할 수 있다(계정 동의 UPDATE 정책)
set role authenticated;
set test.uid = 'c0000000-0000-0000-0000-000000000001';
update public.consents set revoked_at = now()
  where consent_type = 'terms_required' and user_id = auth.uid();
reset role;
do $$
begin
  assert (select revoked_at from public.consents where user_id = 'c0000000-0000-0000-0000-000000000001'
          and consent_type = 'terms_required') is not null, '본인은 이용약관 동의를 철회할 수 있어야 함';
end $$;

-- ② 새 어르신 · ③ 기존 어르신
create temp table legal_p (new_p uuid, old_p uuid);
grant select, insert, update on legal_p to authenticated;
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
do $$
declare np uuid; op uuid;
begin
  insert into public.profiles (user_id, name, birth_year) values (auth.uid(), '새어르신', 1941) returning id into np;
  insert into public.profiles (user_id, name, birth_year) values (auth.uid(), '기존어르신', 1938) returning id into op;
  insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
    select p, app.current_org_id(), auth.uid(), t::public.consent_type, true, 'v1.0', 'capable'
    from unnest(array[np, op]) p cross join unnest(array['sensitive_health_voice','cross_border_transfer','ai_processing']) t;
  insert into legal_p values (np, op);
end $$;
reset role;
-- 기존 어르신 = 마이그레이션 적용 시점에 있었던 행(여기서는 슈퍼유저가 그 상태를 재현한다)
insert into app.elder_privacy_grandfathered (profile_id) select old_p from legal_p;

set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
do $$
declare np uuid := (select new_p from legal_p); op uuid := (select old_p from legal_p);
begin
  assert not public.can_process_profile(np), '새 어르신은 어르신 개인정보 동의 없이 처리되면 안 됨';
  assert public.can_process_profile(op), '기존 어르신은 3종 동의로 계속 처리돼야 함(세션 전면 차단 회귀 방지)';
  insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
    values (np, app.current_org_id(), auth.uid(), 'elder_privacy_required', true, 'v1.0', 'capable');
  assert public.can_process_profile(np), '4종이 모두 있으면 새 어르신도 처리돼야 함';
  -- 예외는 elder_privacy_required 하나뿐이다 — 기존 어르신도 나머지 동의를 철회하면 막힌다
  update public.consents set revoked_at = now()
    where profile_id = op and consent_type = 'ai_processing';
  assert not public.can_process_profile(op), '기존 어르신 예외가 다른 필수 동의까지 면제하면 안 됨';
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.consents c join legal_p on c.profile_id = legal_p.old_p
                     where c.consent_type = 'elder_privacy_required'),
    '기존 어르신 예외는 동의 증거를 만들지 않아야 함';
  assert not has_table_privilege('authenticated', 'app.elder_privacy_grandfathered', 'insert'),
    '사용자는 예외 목록에 행을 넣을 수 없어야 함';
end $$;

select 'legal consent assertions passed' as result;

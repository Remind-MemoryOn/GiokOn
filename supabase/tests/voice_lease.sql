-- 기억온 — 음성 세션 점유(T26.1, 20261003000000) 회귀
--
-- session_start.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a01 · 요양보호사 a02)와 다른 기관 a05 를 쓴다.
-- 이 파일은 자기 어르신·세션을 새로 만들고 끝에 세션을 종료한다.
-- 지키는 것:
--   ① 한 세션에 점유는 하나 — 같은 holder 재획득은 성공, 다른 holder 는 살아 있는 동안 실패
--   ② 갱신은 자기 점유만 · 해제는 자기 점유만(남의 해제는 효과 없음) · 해제 뒤 다른 holder 획득 가능
--   ③ 만료(15초)된 점유는 다른 holder 가 가져가고, 옛 holder 의 갱신은 false(중계가 닫는다)
--   ④ 세션 시작자 본인만 획득 — 같은 기관 다른 직원·다른 기관·없는 세션·종료된 세션은 VOICE_LEASE_FORBIDDEN(구분 없음)
--   ⑤ 사용자는 점유 테이블을 직접 읽거나 쓰지 못한다 · anon 은 RPC 실행 불가

\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.expect_err(p_uid text, p_sql text, p_code text)
returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, true);
  begin
    execute p_sql;
    got := null;
  exception when others then got := sqlerrm;
  end;
  if got is distinct from p_code then
    raise exception '% (by %) 기대 %, 실제 %', p_sql, p_uid, coalesce(p_code, '성공'), coalesce(got, '성공');
  end if;
end $$;

-- 어르신(처리 동의) + 요양보호사 a02 의 실행 중 세션
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
insert into public.profiles (user_id, name, birth_year) values ('a0000000-0000-0000-0000-000000000001', '점유어르신', 1941);
insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
  select p.id, p.org_id, 'a0000000-0000-0000-0000-000000000001', t::public.consent_type, true, 'v1.0', 'capable'
    from public.profiles p
    cross join unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) t
   where p.name = '점유어르신';
set test.uid = 'a0000000-0000-0000-0000-000000000002';
insert into public.sessions (profile_id, user_id, status)
  select id, auth.uid(), 'active' from public.profiles where name = '점유어르신';
reset role;
set test.uid = '';
create temp table vl as
select (select s.id from public.sessions s join public.profiles p on p.id = s.profile_id where p.name = '점유어르신') sid,
       '11111111-0000-4000-8000-000000000001'::uuid h1,
       '11111111-0000-4000-8000-000000000002'::uuid h2,
       '11111111-0000-4000-8000-000000000003'::uuid h3;
grant select on vl to authenticated;
do $$ begin assert (select sid from vl) is not null, '점유 시험 세션이 만들어져야 한다'; end $$;

-- ① 한 세션에 점유 하나
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert public.acquire_voice_lease((select sid from vl), (select h1 from vl)) = true, 'h1 첫 획득 성공';
  assert public.acquire_voice_lease((select sid from vl), (select h1 from vl)) = true, '같은 holder 재획득은 성공';
  assert public.acquire_voice_lease((select sid from vl), (select h2 from vl)) = false, '살아 있는 점유가 있으면 다른 holder 는 실패';
-- ② 갱신·해제는 자기 점유만
  assert public.renew_voice_lease((select sid from vl), (select h1 from vl)) = true, 'h1 갱신 성공';
  assert public.renew_voice_lease((select sid from vl), (select h2 from vl)) = false, 'h2 는 남의 점유를 갱신하지 못한다';
  perform public.release_voice_lease((select sid from vl), (select h2 from vl));
  assert public.acquire_voice_lease((select sid from vl), (select h2 from vl)) = false, '남의 해제는 효과 없음 — h1 점유 유지';
  perform public.release_voice_lease((select sid from vl), (select h1 from vl));
  assert public.acquire_voice_lease((select sid from vl), (select h2 from vl)) = true, '해제 뒤에는 다른 holder 가 획득';
  assert public.renew_voice_lease((select sid from vl), (select h1 from vl)) = false, '해제된 옛 holder 의 갱신은 false';
end $$;
reset role;

-- ③ 만료 — 15초를 기다리는 대신 슈퍼유저로 만료 시각을 과거로 돌린다(h2 프로세스가 죽은 상황)
update public.voice_session_leases set expires_at = now() - interval '1 second' where session_id = (select sid from vl);
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert public.acquire_voice_lease((select sid from vl), (select h3 from vl)) = true, '만료된 점유는 다른 holder 가 가져간다';
  assert public.renew_voice_lease((select sid from vl), (select h2 from vl)) = false, '빼앗긴 옛 holder 의 갱신은 false';
  assert public.renew_voice_lease((select sid from vl), (select h3 from vl)) = true, '새 holder 갱신 성공';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.voice_session_leases where session_id = (select sid from vl)) = 1, '세션당 점유 1행';
  assert (select expires_at > now() and expires_at <= now() + interval '16 seconds' from public.voice_session_leases
           where session_id = (select sid from vl)), '만료는 지금부터 15초';
end $$;

-- ④ 세션 시작자 본인만 — 다른 직원·다른 기관·없는 세션은 구분 없이 거절. 남의 갱신·해제는 효과 없음.
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000001',
  format('select public.acquire_voice_lease(%L, %L)', (select sid from vl), gen_random_uuid()), 'VOICE_LEASE_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000005',
  format('select public.acquire_voice_lease(%L, %L)', (select sid from vl), gen_random_uuid()), 'VOICE_LEASE_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.acquire_voice_lease(%L, %L)', gen_random_uuid(), gen_random_uuid()), 'VOICE_LEASE_FORBIDDEN');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.acquire_voice_lease(%L, null)', (select sid from vl)), 'VOICE_LEASE_HOLDER');
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
do $$
begin
  assert public.renew_voice_lease((select sid from vl), (select h3 from vl)) = false, '다른 직원은 holder 를 알아도 갱신 못 함';
  perform public.release_voice_lease((select sid from vl), (select h3 from vl));
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.voice_session_leases where session_id = (select sid from vl) and holder = (select h3 from vl)),
    '다른 직원의 해제는 효과 없음';
end $$;

-- ⑤ 직접 접근 불가 — 1차(권한 회수)는 _grants.sql 이 넓은 테스트 권한을 주기 전에 검사한다.
--    여기서는 2차(RLS — 정책 없음): 권한이 있어도 행이 보이지 않고 쓰지 못한다. anon 은 RPC 실행 불가.
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert (select count(*) from public.voice_session_leases) = 0, '자기 점유라도 직접 조회로는 보이지 않는다';
end $$;
reset role;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('set local role authenticated; insert into public.voice_session_leases (session_id, holder, user_id, expires_at) values (%L, %L, auth.uid(), now() + interval ''1 day'')',
         (select sid from vl), gen_random_uuid()),
  'new row violates row-level security policy for table "voice_session_leases"');
do $$
begin
  assert not has_function_privilege('anon', 'public.acquire_voice_lease(uuid, uuid)', 'execute'), 'anon 획득 실행 불가';
  assert not has_function_privilege('anon', 'public.renew_voice_lease(uuid, uuid)', 'execute'), 'anon 갱신 실행 불가';
  assert not has_function_privilege('anon', 'public.release_voice_lease(uuid, uuid)', 'execute'), 'anon 해제 실행 불가';
end $$;

-- ④ 종료된 세션은 새로 잡지 못한다(남은 점유 행도 종료 뒤엔 새 holder 에게 의미 없다)
update public.sessions set status = 'ended', ended_at = now(), duration_seconds = 60 where id = (select sid from vl);
update public.voice_session_leases set expires_at = now() - interval '1 second' where session_id = (select sid from vl);
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('select public.acquire_voice_lease(%L, %L)', (select sid from vl), gen_random_uuid()), 'VOICE_LEASE_FORBIDDEN');

\echo 'voice_lease: OK'

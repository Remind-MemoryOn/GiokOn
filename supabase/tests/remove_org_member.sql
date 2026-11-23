-- MemoryOn(기억온) — 구성원 내보내기(20261105000000) 회귀 · 이직(L → R) 흐름
-- rls_regression 의 사용자(관리자 A 1111 · 관리자 B 2222(다른 기관) · 요양보호사 C 3333(기관 A, C어르신 담당))를 쓴다.
-- 트랜잭션 안에서만 쓰고 되돌린다.
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
-- 운영 권한 그대로: authenticated 에게 app 스키마 USAGE 가 없다.
revoke usage on schema app from authenticated;

-- 추가 구성원(기관 A): 센터장 D 7777 · 두 번째 관리자 E 8888.
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'rm-d@x.kr', '{"name":"기관A센터장"}'),
  ('88888888-8888-8888-8888-888888888888', 'rm-e@x.kr', '{"name":"기관A관리자2"}');
update public.users
   set org_id = (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111'),
       role = case id when '77777777-7777-7777-7777-777777777777' then 'center_director'::public.org_role
                      else 'org_admin'::public.org_role end,
       onboarded_at = now()
 where id in ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');

create temp table rm as
select (select org_id from public.users where id = '11111111-1111-1111-1111-111111111111') as org_a,
       (select org_id from public.users where id = '22222222-2222-2222-2222-222222222222') as org_b,
       (select id from public.profiles where name = 'C어르신') as pid_c,
       null::text as code_b;
grant select, update on rm to authenticated;

-- 요양보호사 C 가 기관 A 에서 받은 알림(어르신 이름이 든 제목).
insert into public.notifications (org_id, user_id, kind, profile_id, title)
select org_a, '33333333-3333-3333-3333-333333333333', 'safety', pid_c, 'C어르신 안전 알림' from rm;

do $$ begin
  assert (select pid_c from rm) is not null, 'fixture: C어르신';
  assert exists (select 1 from public.profile_caregivers where caregiver_user_id = '33333333-3333-3333-3333-333333333333'
    and org_id = (select org_a from rm) and status = 'active'), 'fixture: C 담당 배정';
end $$;

-- 실패하면 오류 식별자, 통과하면 'ok'.
create function pg_temp.rm_try(p_uid text, p_target text)
returns text language plpgsql as $$
begin
  perform set_config('test.uid', p_uid, true);
  begin
    perform public.remove_org_member(p_target::uuid);
  exception when others then return sqlerrm;
  end;
  return 'ok';
end $$;

set role authenticated;

-- ── 막혀야 하는 경우 ──
do $$ begin
  assert pg_temp.rm_try('33333333-3333-3333-3333-333333333333', '88888888-8888-8888-8888-888888888888') = 'MEMBER_REMOVE_FORBIDDEN',
    '요양보호사는 내보낼 수 없다';
  assert pg_temp.rm_try('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111') = 'MEMBER_REMOVE_SELF',
    '본인은 내보낼 수 없다';
  assert pg_temp.rm_try('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333') = 'MEMBER_REMOVE_FORBIDDEN',
    '다른 기관 관리자는 내보낼 수 없다(존재를 흘리지 않는 같은 코드)';
  assert pg_temp.rm_try('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999') = 'MEMBER_REMOVE_FORBIDDEN',
    '없는 사용자도 같은 코드';
  assert pg_temp.rm_try('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111') = 'MEMBER_REMOVE_ADMIN',
    '센터장은 기관 관리자를 내보낼 수 없다';
  assert pg_temp.rm_try('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555') in ('MEMBER_REMOVE_GUARDIAN', 'MEMBER_REMOVE_FORBIDDEN'),
    '보호자는 대상이 아니다';
end $$;

-- 직접 쓰기로 소속을 비우는 우회는 여전히 막힌다(컬럼 권한).
do $$ declare blocked boolean := false; begin
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
  begin update public.users set org_id = null where id = auth.uid();
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, '본인이 직접 소속을 비울 수 없어야 함';
end $$;

-- ── 관리자는 다른 관리자를 내보낼 수 있다(관리자 대상은 관리자만 · 본인 제외라 내보내는 쪽 관리자가 늘 남는다.
--    MEMBER_REMOVE_LAST_ADMIN 은 동시 실행 경쟁에 대비한 이중 잠금이다) ──
do $$ begin
  assert pg_temp.rm_try('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888') = 'ok',
    '관리자는 다른 관리자를 내보낼 수 있다';
end $$;

-- ── 이직: 기관 A 관리자가 요양보호사 C 를 내보낸다 ──
do $$ begin
  assert pg_temp.rm_try('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') = 'ok', '관리자 A → C 내보내기';
end $$;

reset role;
do $$ begin
  assert (select org_id from public.users where id = '33333333-3333-3333-3333-333333333333') is null, 'C 의 소속이 비어야 함';
  assert (select role from public.users where id = '33333333-3333-3333-3333-333333333333') = 'caregiver', 'C 는 요양보호사로';
  assert not exists (select 1 from public.profile_caregivers where caregiver_user_id = '33333333-3333-3333-3333-333333333333'
    and org_id = (select org_a from rm) and status <> 'removed'), '기관 A 담당 배정이 모두 해제돼야 함';
  assert not exists (select 1 from public.notifications where user_id = '33333333-3333-3333-3333-333333333333'
    and org_id = (select org_a from rm)), '기관 A 알림이 지워져야 함';
  assert exists (select 1 from public.audit_log where action = 'remove_org_member'
    and record_id = '33333333-3333-3333-3333-333333333333' and actor_id = '11111111-1111-1111-1111-111111111111'), '감사 기록';
end $$;

-- 내보낸 뒤 C 는 기관 A 기록을 하나도 못 본다.
set role authenticated;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  assert (select count(*) from public.profiles) = 0, '내보낸 뒤 어르신 0건';
  assert (select count(*) from public.sessions) = 0, '내보낸 뒤 세션 0건';
  assert (select count(*) from public.notifications) = 0, '내보낸 뒤 알림 0건';
  assert (select count(*) from public.organizations) = 0, '내보낸 뒤 기관 0건';
end $$;

-- 기관 B 관리자가 초대 코드를 발급 → C 가 합류 요청 → 승인 → C 는 기관 B 기록만 본다.
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
update rm set code_b = (select code from public.create_org_invite('caregiver'));
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$ declare r public.org_join_requests%rowtype; begin
  r := public.request_org_join((select code_b from rm));
  assert r.status = 'pending' and r.org_id = (select org_b from rm), '새 기관 B 로 합류 요청';
end $$;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select public.approve_org_join((select id from public.org_join_requests
  where user_id = '33333333-3333-3333-3333-333333333333' and status = 'pending'));
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  assert (select org_id from public.users where id = auth.uid()) = (select org_b from rm), 'C 가 기관 B 소속';
  assert exists (select 1 from public.profiles where name = 'B어르신'), '기관 B 어르신은 보인다';
  assert not exists (select 1 from public.profiles where name in ('A어르신', 'C어르신')), '기관 A 어르신은 안 보인다';
end $$;

reset role;
rollback;
\echo 'remove_org_member: PASS'

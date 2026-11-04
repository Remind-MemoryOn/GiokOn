-- MemoryOn(기억온) — 보호자 메시지 양방향(20261104000000) 회귀
-- rls_regression 의 사용자·어르신(C어르신 · 요양보호사 C 3333 담당 · 보호자 H 5555 승인 · 보호자 G 4444 미연결)을 쓴다.
-- 트랜잭션 안에서만 쓰고 되돌린다.
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
-- 운영 권한 그대로: authenticated 에게 app 스키마 USAGE 가 없다(정책 술어·트리거는 OID 로 묶여야 한다).
revoke usage on schema app from authenticated;

create temp table mt as
select (select id from public.profiles where name = 'C어르신') as pid;
grant select on mt to authenticated;

create function pg_temp.mt_blocked(p_uid text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('test.uid', p_uid, true);
  begin execute p_sql; exception when insufficient_privilege or check_violation then return true; end;
  return false;
end $$;

do $$ begin
  assert (select pid from mt) is not null, 'fixture: C어르신';
  assert exists (select 1 from public.profile_caregivers where profile_id = (select pid from mt)
    and caregiver_user_id = '33333333-3333-3333-3333-333333333333' and status = 'active'), 'fixture: 담당 C';
  assert exists (select 1 from public.profile_guardians where profile_id = (select pid from mt)
    and guardian_user_id = '55555555-5555-5555-5555-555555555555' and status = 'approved'), 'fixture: 승인 보호자 H';
end $$;

set role authenticated;

-- 보호자 H 의 메시지(기존 경로 — sender_role 기본값 guardian · 받는 사람 없음).
select set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
insert into public.messages (profile_id, sender_user_id, body)
  select pid, '55555555-5555-5555-5555-555555555555', '오늘 어머니 컨디션은 어떠셨나요?' from mt;

-- 보호자는 받는 사람을 지정하거나 요양보호사로 위장할 수 없다.
do $$ begin
  assert pg_temp.mt_blocked('55555555-5555-5555-5555-555555555555', format(
    'insert into public.messages (profile_id, sender_user_id, body, recipient_user_id) values (%L, %L, %L, %L)',
    (select pid from mt), '55555555-5555-5555-5555-555555555555', '받는 사람 지정',
    '33333333-3333-3333-3333-333333333333')), '보호자는 받는 사람을 지정할 수 없어야 함';
  assert pg_temp.mt_blocked('55555555-5555-5555-5555-555555555555', format(
    'insert into public.messages (profile_id, sender_user_id, body, sender_role, recipient_user_id) values (%L, %L, %L, %L, %L)',
    (select pid from mt), '55555555-5555-5555-5555-555555555555', '요양보호사 위장', 'caregiver',
    '55555555-5555-5555-5555-555555555555')), '보호자는 요양보호사 답장을 보낼 수 없어야 함';
end $$;

-- 담당 요양보호사 C 의 답장 → 승인 보호자 H.
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
insert into public.messages (profile_id, sender_user_id, body, sender_role, recipient_user_id)
  select pid, '33333333-3333-3333-3333-333333333333', '네, 식사도 잘 하시고 산책도 하셨어요.', 'caregiver',
         '55555555-5555-5555-5555-555555555555' from mt;

do $$ begin
  -- 받는 사람 없는 요양보호사 메시지 · 미연결 보호자에게 답장 · 남의 이름으로 답장: 거절.
  assert pg_temp.mt_blocked('33333333-3333-3333-3333-333333333333', format(
    'insert into public.messages (profile_id, sender_user_id, body, sender_role) values (%L, %L, %L, %L)',
    (select pid from mt), '33333333-3333-3333-3333-333333333333', '받는 사람 없음', 'caregiver')),
    '받는 사람 없는 요양보호사 메시지는 거절';
  assert pg_temp.mt_blocked('33333333-3333-3333-3333-333333333333', format(
    'insert into public.messages (profile_id, sender_user_id, body, sender_role, recipient_user_id) values (%L, %L, %L, %L, %L)',
    (select pid from mt), '33333333-3333-3333-3333-333333333333', '미연결 보호자에게', 'caregiver',
    '44444444-4444-4444-4444-444444444444')), '연결되지 않은 보호자에게는 답장할 수 없어야 함';
  assert pg_temp.mt_blocked('33333333-3333-3333-3333-333333333333', format(
    'insert into public.messages (profile_id, sender_user_id, body, sender_role, recipient_user_id) values (%L, %L, %L, %L, %L)',
    (select pid from mt), '11111111-1111-1111-1111-111111111111', '남의 이름으로', 'caregiver',
    '55555555-5555-5555-5555-555555555555')), '보낸 사람을 위조할 수 없어야 함';
  -- 배정되지 않은 기관 관리자 A 는 답장할 수 없다(읽기 범위와 같다).
  assert pg_temp.mt_blocked('11111111-1111-1111-1111-111111111111', format(
    'insert into public.messages (profile_id, sender_user_id, body, sender_role, recipient_user_id) values (%L, %L, %L, %L, %L)',
    (select pid from mt), '11111111-1111-1111-1111-111111111111', '관리자 답장', 'caregiver',
    '55555555-5555-5555-5555-555555555555')), '배정되지 않은 직원은 답장할 수 없어야 함';
  -- 보호자 G(미연결)도 요양보호사 답장 경로로 쓸 수 없다.
  assert pg_temp.mt_blocked('44444444-4444-4444-4444-444444444444', format(
    'insert into public.messages (profile_id, sender_user_id, body, sender_role, recipient_user_id) values (%L, %L, %L, %L, %L)',
    (select pid from mt), '44444444-4444-4444-4444-444444444444', '보호자 답장', 'caregiver',
    '55555555-5555-5555-5555-555555555555')), '보호자는 답장 경로로 쓸 수 없어야 함';
end $$;

-- 읽기: H 는 자기 메시지 + 자기에게 온 답장, 담당 C 는 둘 다, G·관리자 A 는 0.
select set_config('test.uid', '55555555-5555-5555-5555-555555555555', true);
do $$ begin
  assert (select count(*) from public.messages where profile_id = (select pid from mt)
    and body in ('오늘 어머니 컨디션은 어떠셨나요?', '네, 식사도 잘 하시고 산책도 하셨어요.')) = 2,
    '보호자는 보낸 메시지와 받은 답장을 함께 봐야 함';
  assert (select count(*) from public.notifications where kind = 'message'
    and user_id = '55555555-5555-5555-5555-555555555555' and title = '요양보호사가 답장을 보냈어요') = 1,
    '답장은 받는 보호자에게 알림 1건';
end $$;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  assert (select count(*) from public.messages where profile_id = (select pid from mt)
    and body in ('오늘 어머니 컨디션은 어떠셨나요?', '네, 식사도 잘 하시고 산책도 하셨어요.')) = 2,
    '담당 요양보호사는 스레드 전체를 봐야 함';
  assert not exists (select 1 from public.notifications where user_id = '33333333-3333-3333-3333-333333333333'
    and title = '요양보호사가 답장을 보냈어요'), '자기 답장으로 요양보호사에게 알림이 가면 안 됨';
end $$;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$ begin
  assert (select count(*) from public.messages) = 0, '미연결 보호자에게는 보이면 안 됨';
end $$;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  assert (select count(*) from public.messages where profile_id = (select pid from mt)) = 0,
    '배정되지 않은 기관 관리자에게는 보이면 안 됨';
end $$;

-- append-only 유지: 답장도 고치거나 지울 수 없다.
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
declare n int;
begin
  update public.messages set body = '고침' where sender_role = 'caregiver';
  get diagnostics n = row_count;
  assert n = 0, '답장은 수정할 수 없어야 함';
  delete from public.messages where sender_role = 'caregiver';
  get diagnostics n = row_count;
  assert n = 0, '답장은 삭제할 수 없어야 함';
end $$;

reset role;
select 'messages two-way assertions passed';
rollback;

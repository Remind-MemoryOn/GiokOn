-- 기억온 — 위험 발화 알림 수신자 · 푸시 발송 큐(T21.4·T21.9, 20260927010000) 회귀
--
-- journal_worker.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02 · 직원 a...03 ·
-- 보호자 a...04)와 그 기관의 처리 동의가 있는 어르신을 쓴다.
-- 지키는 것:
--   ① 수신자 = 담당 배정자 ∪ 세션 진행자(같은 기관 돌봄팀만) · 같은 사람은 한 번 · 배정이 없어도 진행자는 받는다
--   ② 중계 경로(요양보호사 권한 INSERT)로 기록한 위험 발화가 곧바로 알림이 된다
--   ③ 푸시 큐 — 비밀값·service_role 전용 · 안전 알림만 · 30분 지난 알림 제외 · 최대 한 번 · 회수된 토큰 제외 · 무효 토큰 회수
--   ④ 사용자는 pushed_at 을 못 바꾼다(재발송·억제 불가) · 스케줄 함수는 주소가 없으면 아무것도 하지 않는다

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table sp as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id and app.has_processing_consent(p.id) order by p.id limit 1) as p_ok,
       (select secret from app.worker_config where name = 'push-dispatch') as secret
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';
grant select on sp to authenticated;

-- 진행 중 세션(슈퍼유저로 시작 — 요양보호사 a02 가 진행자)
create temp table sp_s as
with ins as (
  insert into public.sessions (profile_id, user_id, org_id, status, started_at)
  values ((select p_ok from sp), 'a0000000-0000-0000-0000-000000000002', (select org from sp), 'active', now() - interval '3 minutes')
  returning id)
select id as sid from ins;
grant select on sp_s to authenticated;

-- ── ① 수신자 ─────────────────────────────────────────────────────────────────
-- 이 어르신의 담당 배정을 비운 상태에서 시작한다(파일럿 = 배정 없는 어르신도 있다).
update public.profile_caregivers set status = 'removed', removed_at = now()
 where profile_id = (select p_ok from sp) and status = 'active';

-- ② 중계 경로: 요양보호사 권한으로 위험 발화 기록 → 진행자에게 알림
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
create temp table sp_e1 as
with ins as (
  insert into public.safety_events (profile_id, session_id, user_id, level, categories, matched_terms, excerpt, caregiver_alert)
  values ((select p_ok from sp), (select sid from sp_s), auth.uid(), 'crisis', array['self_harm'], array['죽고싶'],
          '요즘은 그냥 죽고 싶어요', '위기 신호가 감지됐어요. 어르신 곁에서 상태를 확인해 주세요. (109)')
  returning id)
select id as eid from ins;
reset role;
do $$
begin
  assert (select array_agg(user_id order by user_id) from public.notifications where source_id = (select eid from sp_e1))
       = array['a0000000-0000-0000-0000-000000000002']::uuid[],
    '담당 배정이 없어도 세션 진행자는 안전 알림을 받아야 함';
  assert (select kind = 'safety' and title = '안전 알림이 있어요' and pushed_at is null
            from public.notifications where source_id = (select eid from sp_e1)), '안전 알림 행 · 아직 발송 전';
end $$;

-- 담당 배정자(a03) + 진행자(a02) → 둘 다 · 배정자가 진행자와 같으면 한 번
insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id, status)
values ((select org from sp), (select p_ok from sp), 'a0000000-0000-0000-0000-000000000003', 'active')
on conflict (profile_id, caregiver_user_id) do update set status = 'active', removed_at = null;
insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id, status)
values ((select org from sp), (select p_ok from sp), 'a0000000-0000-0000-0000-000000000002', 'active')
on conflict (profile_id, caregiver_user_id) do update set status = 'active', removed_at = null;
create temp table sp_e2 as
with ins as (
  insert into public.safety_events (profile_id, session_id, user_id, org_id, level, categories, matched_terms, excerpt, caregiver_alert)
  values ((select p_ok from sp), (select sid from sp_s), 'a0000000-0000-0000-0000-000000000002', (select org from sp),
          'watch', '{}', array['너무힘들'], '너무 힘들어요', '어르신이 힘들다고 하셨어요. 상태를 확인해 주세요.')
  returning id)
select id as eid from ins;
-- 세션 없는 이벤트(수기 기록 등) → 배정자만(a02 는 배정을 풀어 진행자 규칙만 남긴 상태에서 본다)
update public.profile_caregivers set status = 'removed', removed_at = now()
 where profile_id = (select p_ok from sp) and caregiver_user_id = 'a0000000-0000-0000-0000-000000000002';
create temp table sp_e3 as
with ins as (
  insert into public.safety_events (profile_id, session_id, user_id, org_id, level, categories, matched_terms, excerpt, caregiver_alert)
  values ((select p_ok from sp), null, 'a0000000-0000-0000-0000-000000000002', (select org from sp),
          'watch', '{}', array['아파'], '아파요', '어르신이 아프다고 하셨어요.')
  returning id)
select id as eid from ins;
-- 진행자가 돌봄팀이 아니면(보호자로 바뀐 계정) 진행자는 받지 않는다
update public.users set role = 'guardian' where id = 'a0000000-0000-0000-0000-000000000002';
create temp table sp_e4 as
with ins as (
  insert into public.safety_events (profile_id, session_id, user_id, org_id, level, categories, matched_terms, excerpt, caregiver_alert)
  values ((select p_ok from sp), (select sid from sp_s), 'a0000000-0000-0000-0000-000000000002', (select org from sp),
          'watch', '{}', array['힘들'], '힘들어', '확인해 주세요.')
  returning id)
select id as eid from ins;
update public.users set role = 'caregiver' where id = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert (select array_agg(user_id order by user_id) from public.notifications where source_id = (select eid from sp_e2))
       = array['a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003']::uuid[],
    '담당 배정자와 진행자 모두, 같은 사람은 한 번';
  assert (select array_agg(user_id) from public.notifications where source_id = (select eid from sp_e3))
       = array['a0000000-0000-0000-0000-000000000003']::uuid[],
    '세션이 없는 이벤트는 담당 배정자만';
  assert (select array_agg(user_id) from public.notifications where source_id = (select eid from sp_e4))
       = array['a0000000-0000-0000-0000-000000000003']::uuid[],
    '돌봄팀이 아닌 진행자에게는 보내지 않음';
end $$;

-- ── ③ 푸시 큐 ────────────────────────────────────────────────────────────────
-- 토큰: a02 활성 2개(하나는 곧 무효) · 회수된 1개 / a03 없음
insert into public.push_tokens (user_id, token, platform, revoked_at, last_seen_at) values
  ('a0000000-0000-0000-0000-000000000002', 'ExponentPushToken[sp-live-aaaaaaaa]', 'android', null, now()),
  ('a0000000-0000-0000-0000-000000000002', 'ExponentPushToken[sp-dead-bbbbbbbb]', 'ios', null, now() - interval '1 day'),
  ('a0000000-0000-0000-0000-000000000002', 'ExponentPushToken[sp-gone-cccccccc]', 'ios', now(), now());
-- 앞 파일들이 남긴 대기 알림은 이 파일의 단언과 섞이지 않게 발송 처리한다.
update public.notifications set pushed_at = now()
 where pushed_at is null and source_id not in (select eid from sp_e1 union all select eid from sp_e2
                                               union all select eid from sp_e3 union all select eid from sp_e4);
-- 30분 넘은 안전 알림 · 안전이 아닌 알림 — 보내지 않는다
insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title, created_at)
values ((select org from sp), 'a0000000-0000-0000-0000-000000000002', 'safety', (select p_ok from sp), gen_random_uuid(), '옛 알림', now() - interval '31 minutes'),
       ((select org from sp), 'a0000000-0000-0000-0000-000000000002', 'share_viewed', (select p_ok from sp), gen_random_uuid(), '공개 확인', now());

do $$
declare
  sec text := (select secret from sp);
  blocked boolean := false;
  r record; n int; toks text[];
begin
  assert not has_function_privilege('authenticated', 'public.claim_push_notifications(text, integer)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.claim_push_notifications(text, integer)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.revoke_dead_push_tokens(text, text[])', 'EXECUTE'),
    '푸시 RPC 는 클라이언트가 실행할 수 없어야 함';
  assert has_function_privilege('service_role', 'public.claim_push_notifications(text, integer)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.revoke_dead_push_tokens(text, text[])', 'EXECUTE'),
    '푸시 RPC 는 service_role 이 실행할 수 있어야 함';
  assert sec is not null and sec <> (select secret from app.worker_config where name = 'program-journal-draft'),
    '푸시 워커는 일지 워커와 다른 비밀값';
  begin
    perform public.claim_push_notifications((select secret from app.worker_config where name = 'program-journal-draft'), 50);
  exception when insufficient_privilege then blocked := sqlerrm = 'WORKER_UNAUTHORIZED';
  end;
  assert blocked, '다른 워커의 비밀값으로는 푸시 알림을 잡을 수 없어야 함';

  select count(*) into n from public.claim_push_notifications(sec, 50);
  assert n = 5, format('보낼 안전 알림 5건(e1·e2 두 명·e3·e4)이어야 함: %s', n);
  select tokens into toks from public.notifications x
    join lateral (select array(select t.token from public.push_tokens t where t.user_id = x.user_id and t.revoked_at is null
                               order by t.last_seen_at desc) as tokens) q on true
   where x.source_id = (select eid from sp_e1);
  assert toks = array['ExponentPushToken[sp-live-aaaaaaaa]', 'ExponentPushToken[sp-dead-bbbbbbbb]'], '회수된 토큰 제외 · 최근 순';
  assert (select count(*) from public.notifications where pushed_at is null and kind = 'safety'
            and created_at > now() - interval '30 minutes') = 0, '잡은 알림은 pushed_at 이 찍힘';
  select count(*) into n from public.claim_push_notifications(sec, 50);
  assert n = 0, '한 번 잡은 알림은 다시 잡히지 않음(최대 한 번)';
  assert (select pushed_at is null from public.notifications where title = '옛 알림'), '30분 넘은 알림은 보내지 않음';
  assert (select pushed_at is null from public.notifications where title = '공개 확인'), '안전이 아닌 알림은 보내지 않음';

  assert public.revoke_dead_push_tokens(sec, array['ExponentPushToken[sp-dead-bbbbbbbb]', 'ExponentPushToken[없는토큰]']) = 1,
    '무효 토큰 1개 회수';
  assert (select revoked_at is not null from public.push_tokens where token = 'ExponentPushToken[sp-dead-bbbbbbbb]'), '회수됨';
  assert (select revoked_at is null from public.push_tokens where token = 'ExponentPushToken[sp-live-aaaaaaaa]'), '다른 토큰은 그대로';
end $$;

-- claim 이 돌려주는 토큰 목록 자체도 본다(새 알림 1건)
do $$
declare sec text := (select secret from sp); toks text[]; n int;
begin
  insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title)
  values ((select org from sp), 'a0000000-0000-0000-0000-000000000002', 'safety', (select p_ok from sp), gen_random_uuid(), '새 알림');
  select c.tokens into toks from public.claim_push_notifications(sec, 50) c;
  assert toks = array['ExponentPushToken[sp-live-aaaaaaaa]'], format('claim 은 받는 사람의 활성 토큰만 돌려줌: %s', toks);
end $$;

-- ── ④ 사용자 변경 불가 · 스케줄 ────────────────────────────────────────────────
do $$
declare blocked boolean := false;
begin
  set role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  begin
    update public.notifications set pushed_at = null where source_id = (select eid from sp_e1);
  exception when insufficient_privilege then blocked := sqlerrm = 'RECORD_IDENTITY_IMMUTABLE';
  end;
  reset role;
  assert blocked, '사용자는 pushed_at 을 되돌려 재발송시킬 수 없어야 함';
  assert (select endpoint is null from app.worker_config where name = 'push-dispatch'), '마이그레이션은 주소를 넣지 않는다';
  perform app.kick_push_dispatch();
  assert not has_function_privilege('authenticated', 'app.kick_push_dispatch()', 'EXECUTE'), '스케줄 함수는 클라이언트가 못 부른다';
end $$;

-- 뒷정리: 이 파일이 만든 진행 중 세션을 끝낸다(동시 진행 상한에 남지 않게)
update public.sessions set status = 'ended', ended_at = now() where id = (select sid from sp_s);

select 'safety push assertions passed' as result;

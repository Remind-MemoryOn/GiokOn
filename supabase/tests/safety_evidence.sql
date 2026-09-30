-- 기억온 — 안전 이벤트 판정·근거 보호(T25.17, 20260928020000) 회귀
--
-- safety_push.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02 · 직원 a...03)를 쓴다.
-- 지키는 것:
--   ① 앱 대체 기록(발췌 없음)을 같은 id 로 먼저 넣으면, 중계 재시도는 '없을 때만 넣기'로 중복 없이 끝나고
--      기록한 본인이 비어 있는 근거 칸을 한 번 채울 수 있다
--   ② 채워진 근거는 본인도 다시 못 바꾸고 못 지운다 · 다른 직원은 빈 근거도 못 채운다
--   ③ 판정(수준·분류·문구)은 누구도 바꿀 수 없다 · 확인 시각 갱신은 그대로 된다

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table se as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id and app.has_processing_consent(p.id) order by p.id limit 1) as p_ok,
       gen_random_uuid() as eid
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';
grant select on se to authenticated;

-- ① 앱 대체 기록: 요양보호사 a02 가 사건 id 로 수준·분류만(발췌 없음) 넣는다
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
insert into public.safety_events (id, profile_id, user_id, level, categories, matched_terms, excerpt, caregiver_alert)
values ((select eid from se), (select p_ok from se), auth.uid(), 'crisis', array['self_harm'], '{}', '', '위기 안내')
on conflict (id) do nothing;
-- 같은 id 로 다시 넣어도(중계 재시도) 사건은 1건 — 오류 없이 끝난다
insert into public.safety_events (id, profile_id, user_id, level, categories, matched_terms, excerpt, caregiver_alert)
values ((select eid from se), (select p_ok from se), auth.uid(), 'crisis', array['self_harm'], array['죽고싶'], '죽고 싶어요', '위기 안내')
on conflict (id) do nothing;
reset role;
do $$ begin
  assert (select count(*) from public.safety_events where id = (select eid from se)) = 1, '같은 id 는 1건';
  assert (select excerpt = '' and cardinality(matched_terms) = 0 from public.safety_events where id = (select eid from se)),
    '먼저 들어간 대체 기록이 남는다(근거는 비어 있음)';
end $$;

-- ② 다른 직원(a03)은 빈 근거를 채울 수 없다
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
do $$ begin
  begin
    update public.safety_events set excerpt = '남이 채움' where id = (select eid from se);
    raise exception 'unreachable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 기록한 본인(a02 = 중계와 같은 사용자 권한)은 비어 있는 근거를 한 번 채운다
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
update public.safety_events set excerpt = '요즘은 그냥 죽고 싶어요', matched_terms = array['죽고싶']
 where id = (select eid from se) and coalesce(excerpt, '') = '';
-- 채워진 뒤에는 조건부 채우기가 0건이다(재시도가 또 와도 덮어쓰지 않는다)
update public.safety_events set excerpt = '다른 내용'
 where id = (select eid from se) and coalesce(excerpt, '') = '';
-- 조건 없이 덮어쓰기·지우기도 거절
do $$ begin
  begin
    update public.safety_events set excerpt = '덮어씀' where id = (select eid from se);
    raise exception 'unreachable';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.safety_events set excerpt = '', matched_terms = '{}' where id = (select eid from se);
    raise exception 'unreachable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ③ 판정은 누구도 못 바꾼다(기록한 본인·관리자 모두)
do $$ begin
  begin
    update public.safety_events set level = 'watch' where id = (select eid from se);
    raise exception 'unreachable';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.safety_events set categories = '{}' where id = (select eid from se);
    raise exception 'unreachable';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
do $$ begin
  begin
    update public.safety_events set caregiver_alert = '바꾼 문구' where id = (select eid from se);
    raise exception 'unreachable';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 확인 시각 갱신은 된다
update public.safety_events set acknowledged_at = now(), acknowledged_by = auth.uid() where id = (select eid from se);
reset role;

do $$ begin
  assert (select excerpt = '요즘은 그냥 죽고 싶어요' and matched_terms = array['죽고싶'] and level = 'crisis'
                 and categories = array['self_harm'] and caregiver_alert = '위기 안내' and acknowledged_at is not null
            from public.safety_events where id = (select eid from se)),
    '근거는 한 번 채워진 값 · 판정 불변 · 확인 시각 반영';
end $$;

-- 서버 내부(auth.uid() 없음)는 막지 않는다(운영자 정정)
select set_config('test.uid', '', false);
update public.safety_events set excerpt = '운영자 정정' where id = (select eid from se);

select 'safety evidence assertions passed' as result;

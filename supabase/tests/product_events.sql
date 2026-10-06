-- 기억온 — 제품 이벤트(T24.2 · 20261006010000) 회귀
--
-- pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02)를 쓴다. **운영 권한 그대로**(authenticated 에게 app 스키마
-- USAGE 없음)로 돌리려고 트랜잭션 안에서 회수하고 끝에 되돌린다(prod_privileges.sql 과 같은 방식).
-- 지키는 것:
--   ① 검토 중 사람이 고친 칸 → 칸 이름만 1건(값·발화 없음) · AI 초안 여부 · 행위자 = 고친 사람
--   ② 바뀐 칸이 없는 저장 · 워커(사람 아님)의 쓰기 · 확정 후 수정(이력 테이블 담당) → 기록하지 않음
--   ③ 확정과 같은 요청에서 고친 칸은 기록 · 확정 자체(칸 변화 없음)는 기록하지 않음(시각은 일지 행에 있다)
--   ④ 클라이언트는 이벤트를 읽지도 쓰지도 못하고 삽입 함수도 부르지 못한다 · 모르는 이벤트 이름은 거절

\set ON_ERROR_STOP on
set client_min_messages = warning;

begin;
revoke usage on schema app from authenticated;

create temp table pe on commit drop as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id order by p.id limit 1) as pid
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';
grant select on pe to authenticated;

-- 픽스처(슈퍼유저 — 사람 요청이 아니다): AI 초안이 채워진 확인 대기 일지 · 사람이 직접 만든 확인 대기 일지
create temp table pe_j on commit drop as
with ai as (
  insert into public.program_journals (profile_id, org_id, status, activity_content, goal, facilitator_user_id, draft_generated_at)
  values ((select pid from pe), (select org from pe), 'pending_review', 'AI 초안 활동 내용', 'AI 초안 목표', 'a0000000-0000-0000-0000-000000000002', now() - interval '5 minutes')
  returning id),
manual as (
  insert into public.program_journals (profile_id, org_id, status, activity_content, facilitator_user_id)
  values ((select pid from pe), (select org from pe), 'pending_review', '직접 작성', 'a0000000-0000-0000-0000-000000000002')
  returning id)
select (select id from ai) as ai_id, (select id from manual) as manual_id;
grant select on pe_j to authenticated;

-- 워커의 쓰기(사람 아님 — auth.uid() 없음)는 수정이 아니다
update public.program_journals set participant_response = '워커가 채운 반응' where id = (select ai_id from pe_j);

do $$
declare e public.product_events%rowtype; n int; blocked text;
begin
  assert (select count(*) from public.product_events where subject_id in ((select ai_id from pe_j), (select manual_id from pe_j))) = 0,
    '② 워커(사람 아님)의 쓰기는 기록하지 않아야 함';

  set local role authenticated;
  -- ① 요양보호사 a02 가 AI 초안의 두 칸을 고친다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  update public.program_journals set goal = '고친 목표', activity_content = '고친 활동 내용' where id = (select ai_id from pe_j);
  -- ② 바뀐 칸 없는 저장
  update public.program_journals set goal = '고친 목표' where id = (select ai_id from pe_j);
  -- 사람이 직접 만든 일지를 고친다(AI 초안 아님)
  update public.program_journals set location = '1층 프로그램실' where id = (select manual_id from pe_j);

  -- ④ 클라이언트는 읽기·쓰기 불가 · 삽입 함수 호출 불가. 테이블 권한 회수는 _grants.sql 이 마이그레이션 직후 확인한다
  --    (이 하네스는 그 뒤 테스트 편의로 권한을 다시 준다) — 여기서는 그 아래 방어선인 RLS(정책 없음)를 본다.
  blocked := null;
  begin
    select count(*) into n from public.product_events;
    if n = 0 then blocked := 'hidden'; end if;
  exception when insufficient_privilege then blocked := 'denied';
  end;
  assert blocked in ('hidden', 'denied'), '④ 클라이언트에게 제품 이벤트가 보이면 안 됨';
  blocked := null;
  begin
    insert into public.product_events (org_id, event_key) values ((select org from pe), 'journal_draft_edited');
  exception when insufficient_privilege then blocked := 'denied';
  end;
  assert blocked = 'denied', '④ 클라이언트는 제품 이벤트를 쓸 수 없어야 함';
  blocked := null;
  begin
    perform app.record_product_event((select org from pe), 'journal_draft_edited', null, '{}'::jsonb);
  exception when insufficient_privilege then blocked := 'denied';
  end;
  assert blocked = 'denied', '④ 클라이언트는 삽입 함수를 부를 수 없어야 함';

  -- ③ 관리자 a01 이 한 칸을 고치면서 확정한다 → 고친 칸 1건 · 확정 자체는 기록하지 않는다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', true);
  update public.program_journals set next_plan = '다음 계획', status = 'final' where id = (select ai_id from pe_j);
  -- ② 확정 후 수정은 이력 테이블이 맡는다(제품 이벤트 아님)
  update public.program_journals set location = '2층', edit_reason = '장소 정정' where id = (select ai_id from pe_j);
  -- 칸 변화 없는 확정
  update public.program_journals set status = 'final' where id = (select manual_id from pe_j);
  reset role;

  -- 검증(슈퍼유저)
  select count(*) into n from public.product_events where subject_id = (select ai_id from pe_j);
  assert n = 2, '① AI 초안 일지: 요양보호사 수정 1건 + 확정 요청의 수정 1건이어야 함 — 실제 ' || n;
  select * into e from public.product_events
   where subject_id = (select ai_id from pe_j) and actor_user_id = 'a0000000-0000-0000-0000-000000000002';
  assert e.event_key = 'journal_draft_edited' and e.org_id = (select org from pe), '① 이벤트 이름·기관';
  assert e.payload = '{"fields": ["activity_content", "goal"], "ai_draft": true}'::jsonb,
    '① 칸 이름(정렬)과 AI 초안 여부만 담아야 함 — 실제 ' || e.payload::text;
  assert e.payload::text !~ '고친', '① 값(내용)이 이벤트에 들어가면 안 됨';
  assert (select payload -> 'fields' from public.product_events
           where subject_id = (select ai_id from pe_j) and actor_user_id = 'a0000000-0000-0000-0000-000000000001') = '["next_plan"]'::jsonb,
    '③ 확정과 같은 요청에서 고친 칸만 기록해야 함(status·확정 칸 제외)';
  assert (select payload from public.product_events where subject_id = (select manual_id from pe_j))
           = '{"fields": ["location"], "ai_draft": false}'::jsonb,
    '① 사람이 직접 만든 일지는 ai_draft=false · 확정만 한 요청은 기록하지 않아야 함';

  -- ④ 모르는 이벤트 이름은 거절
  blocked := null;
  begin
    perform app.record_product_event((select org from pe), 'screen_viewed', null, '{}'::jsonb);
  exception when check_violation then blocked := 'rejected';
  end;
  assert blocked = 'rejected', '④ 정해지지 않은 이벤트 이름은 거절해야 함';
end $$;

select 'product event assertions passed';
rollback;

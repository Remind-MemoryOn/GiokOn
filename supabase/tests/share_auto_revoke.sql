-- 기억온 — 공개 후 내용 변경 → 자동 공개 해제(T25.12, 20260930030000) 회귀
--
-- journal_worker_consent.sql(동의 철회) **앞**에 실행한다 — 분석 수정은 처리 동의가 있어야 한다.
-- pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02 · 보호자 a...04)와 처리 동의가 있는 어르신을 쓴다.
-- 보호자에게 보이는 내용(마이그레이션 머리말과 같다):
--   analysis 공개 = 분석 전체('version' 키 제외) + 그 세션 원문(내용·원문·화자·순서·주제·음성 주소, 줄 추가·삭제)
--   session_summary 공개 = 요약 문장 + 첫 주제
-- 지키는 것: ① 같은 내용 재저장·기술 키만 바뀜 → 유지 ② 분석 내용 변경 → analysis 공개만 해제(요약은 유지)
--   ③ 요약 변경 → 둘 다 해제 ④ 원문 변경·추가·음성 교체 → analysis 공개 해제 · 원문 기술 칸(발화 길이 등)·음성 만료 삭제 → 유지
--   ⑤ 해제는 같은 트랜잭션 · 사유 content_changed · 보호자에게 즉시 닫힘 · 명시적 재공개하면 다시 보임
--   ⑥ 공개 철회 권한(T25.4)이 없는 직원이 고쳐도 자동 해제는 된다 · 클라이언트는 사유를 쓸 수 없다

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table sa as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id and app.has_processing_consent(p.id) order by p.id limit 1) as pid
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';
grant select on sa to authenticated;

-- 보호자 a04 를 이 어르신에 승인 연결 · 공개 철회 권한은 기본(요양보호사 없음)으로 — ⑥ 을 보려고
delete from public.profile_guardians where profile_id = (select pid from sa) and guardian_user_id = 'a0000000-0000-0000-0000-000000000004';
insert into public.profile_guardians (org_id, profile_id, guardian_user_id, status, approved_by, approved_at)
values ((select org from sa), (select pid from sa), 'a0000000-0000-0000-0000-000000000004', 'approved',
        'a0000000-0000-0000-0000-000000000001', now());
insert into public.org_capabilities (org_id, capability, allowed_roles)
values ((select org from sa), 'share_revoke', array['org_admin','social_worker','center_director']::public.org_role[])
on conflict (org_id, capability) do update set allowed_roles = excluded.allowed_roles;

-- 끝난 세션 + 원문 2줄 + 분석(슈퍼유저) · 분석 공개 + 요약 공개
create temp table sa_x as
with s as (
  insert into public.sessions (profile_id, user_id, org_id, status, started_at, ended_at)
  values ((select pid from sa), 'a0000000-0000-0000-0000-000000000002', (select org from sa), 'ended', now() - interval '12 minutes', now())
  returning id)
select id as sid from s;
insert into public.session_logs (session_id, profile_id, user_id, org_id, turn_index, role, content)
select (select sid from sa_x), (select pid from sa), 'a0000000-0000-0000-0000-000000000002', (select org from sa), t.i, t.r::public.session_log_role, t.c
  from (values (1, 'ai', '고향이 어디세요?'), (2, 'user', '전주요.')) t(i, r, c);
insert into public.session_analyses (profile_id, org_id, session_id, analysis, version)
values ((select pid from sa), (select org from sa), (select sid from sa_x),
        '{"version":"a1","summary":"전주 이야기를 하셨다.","topicsEngaged":["고향"],"metrics":{"turns":2}}', 'test');
alter table sa_x add column aid uuid;
update sa_x set aid = (select id from public.session_analyses where session_id = (select sid from sa_x));
grant select on sa_x to authenticated;

create or replace function pg_temp.share(p_type text) returns uuid language sql as $$
  insert into public.guardian_shares (profile_id, org_id, item_type, item_id)
  values ((select pid from sa), (select org from sa), p_type::public.share_item_type, (select aid from sa_x)) returning id
$$;
create or replace function pg_temp.active(p_type text) returns boolean language sql as $$
  select exists (select 1 from public.guardian_shares where item_id = (select aid from sa_x) and item_type = p_type::public.share_item_type and revoked_at is null)
$$;
select pg_temp.share('analysis'), pg_temp.share('session_summary');

-- 보호자 시야 확인용
create or replace function pg_temp.guardian_sees() returns table (analyses int, summaries int, logs int) language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', true);
  return query select (select count(*)::int from public.session_analyses where id = (select aid from sa_x)),
                      (select count(*)::int from public.get_my_shared_summaries() g where g.id = (select aid from sa_x)),
                      (select count(*)::int from public.session_logs where session_id = (select sid from sa_x));
  reset role;
end $$;
do $$ declare g record; begin
  select * into g from pg_temp.guardian_sees();
  assert g.analyses = 1 and g.summaries = 1 and g.logs = 2, '공개 직후 보호자는 분석·요약·원문을 본다';
end $$;

-- ① 같은 내용 재저장 · 기술 키만 바뀜 → 유지 (요양보호사 a02 가 직접 UPDATE)
do $$ begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  update public.session_analyses set analysis = analysis where id = (select aid from sa_x);
  update public.session_analyses set analysis = jsonb_set(analysis, '{version}', '"a2"') where id = (select aid from sa_x);
  update public.session_logs set duration_ms = coalesce(duration_ms, 0) + 1 where session_id = (select sid from sa_x);
  reset role;
  assert pg_temp.active('analysis') and pg_temp.active('session_summary'), '같은 내용·기술 칸 변경은 공개를 유지해야 함';
end $$;

-- ② 분석 내용(요약 밖) 변경 → analysis 공개만 해제 · ⑥ 철회 권한 없는 요양보호사가 고쳐도 해제
do $$ declare g record; r record; begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  update public.session_analyses set analysis = jsonb_set(analysis, '{metrics,turns}', '3') where id = (select aid from sa_x);
  reset role;
  assert not pg_temp.active('analysis'), '분석 내용이 바뀌면 analysis 공개는 해제돼야 함';
  assert pg_temp.active('session_summary'), '요약·첫 주제가 그대로면 요약 공개는 유지';
  select revoke_reason, revoked_by into r from public.guardian_shares
   where item_id = (select aid from sa_x) and item_type = 'analysis' order by created_at desc limit 1;
  assert r.revoke_reason = 'content_changed' and r.revoked_by is null, '자동 해제는 사유 content_changed · 사람 없음';
  select * into g from pg_temp.guardian_sees();
  assert g.analyses = 0 and g.logs = 0 and g.summaries = 1, '해제 즉시 보호자에게 분석·원문이 닫혀야 함(요약은 유지)';
end $$;

-- ⑤ 명시적 재공개 → 새 내용이 보인다
select pg_temp.share('analysis');
do $$ declare g record; begin
  select * into g from pg_temp.guardian_sees();
  assert g.analyses = 1 and g.logs = 2, '재공개하면 새 내용이 다시 보여야 함';
end $$;

-- ③ 요약 변경 → 둘 다 해제
do $$ begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  update public.session_analyses set analysis = jsonb_set(analysis, '{summary}', '"전주 시장 이야기를 하셨다."') where id = (select aid from sa_x);
  reset role;
  assert not pg_temp.active('analysis') and not pg_temp.active('session_summary'), '요약이 바뀌면 두 공개 모두 해제';
end $$;

-- ④ 원문 변경 · 원문 추가 → analysis 공개 해제
select pg_temp.share('analysis'), pg_temp.share('session_summary');
do $$ begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  update public.session_logs set content = '전주예요.' where session_id = (select sid from sa_x) and turn_index = 2;
  reset role;
  assert not pg_temp.active('analysis'), '원문이 바뀌면 analysis 공개 해제';
  assert pg_temp.active('session_summary'), '요약 공개는 원문을 열지 않으므로 유지';
end $$;
select pg_temp.share('analysis');
insert into public.session_logs (session_id, profile_id, user_id, org_id, turn_index, role, content)
values ((select sid from sa_x), (select pid from sa), 'a0000000-0000-0000-0000-000000000002', (select org from sa), 3, 'ai', '고맙습니다.');
do $$ begin
  assert not pg_temp.active('analysis'), '원문 줄이 추가되면 analysis 공개 해제';
end $$;

-- ④ 음성: 새 음성이 붙거나 교체되면 해제 · 보존기한 만료로 지우는 것(→ null)은 유지
select pg_temp.share('analysis');
update public.session_logs set audio_url = 'audio/a.m4a' where session_id = (select sid from sa_x) and turn_index = 2;
do $$ begin assert not pg_temp.active('analysis'), '음성이 새로 붙으면 analysis 공개 해제'; end $$;
select pg_temp.share('analysis');
update public.session_logs set audio_url = null where session_id = (select sid from sa_x) and turn_index = 2;
do $$ begin assert pg_temp.active('analysis'), '음성 만료 삭제(→ null)는 공개를 유지해야 함'; end $$;
update public.session_logs set audio_url = 'audio/b.m4a' where session_id = (select sid from sa_x) and turn_index = 2;
do $$ begin assert not pg_temp.active('analysis'), '음성이 교체되면 analysis 공개 해제'; end $$;

-- ⑥ 클라이언트는 해제 사유를 쓸 수 없다 · 사람이 누른 철회는 사유가 비어 있다
select pg_temp.share('analysis');
do $$ declare blocked text; begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', true);  -- 관리자(철회 권한 있음)
  begin
    update public.guardian_shares set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'content_changed'
     where item_id = (select aid from sa_x) and item_type = 'analysis' and revoked_at is null;
  exception when insufficient_privilege then blocked := sqlerrm;
  end;
  assert blocked = 'SHARE_REVOKE_REASON_SYSTEM_ONLY', '클라이언트가 자동 해제 사유를 쓰면 거부: ' || coalesce(blocked, '허용됨');
  update public.guardian_shares set revoked_at = now(), revoked_by = auth.uid()
   where item_id = (select aid from sa_x) and item_type = 'analysis' and revoked_at is null;
  reset role;
  assert (select revoke_reason is null from public.guardian_shares
           where item_id = (select aid from sa_x) and item_type = 'analysis' order by revoked_at desc limit 1),
    '사람이 누른 철회는 사유가 비어 있어야 함';
  assert coalesce(current_setting('app.share_auto_revoke', true), '') <> 'on', '자동 해제 표시는 끝나면 꺼져 있어야 함';
end $$;

select 'share auto revoke assertions passed';

-- 기억온 — 전사 문맥 분류기 직원 확인 일시정지(CTX-CLS-S6, 20261115000000·20261115010000) 회귀
--
-- elder_closing.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a01 · 요양보호사 a02)와 다른 기관 a05 를 쓴다.
-- 이 파일은 자기 어르신·세션을 만들고 끝에 세션을 종료한다.
-- 지키는 것(설계안 §7):
--   ① service_role 만 실행 — authenticated·anon 불가
--   ② 연결 증명 — 점유 없음·만료·holder 다름·직원 다름이면 SYSTEM_PAUSE_FORBIDDEN, 아무것도 남지 않음
--   ③ 정상 → 사건 1건(detected_by=classifier · user_id=진행자 · 범주 → crisis · 문구 = 공통 문구 + 멈춘 이유 · 전화번호·진단 문구 없음)
--          + 정지(pause_origin=system · paused_by 없음) + 개입 1건(actor 없음) + 진행자에게 알림 행(다른 기관 0건)
--   ④ 같은 사건 id 재호출 → 늘지 않음 · 직원 재개 뒤 늦은 재시도가 다시 멈추지 않음 · 다른 세션의 사건 id 를 쓰면 충돌
--   ⑤ 이미 직원이 멈춘 세션 → 사건은 남고 출처는 staff 유지
--   ⑥ active 아닌 세션 → 사건만, 정지 없음 · 처리 동의 철회 → 세션이 끝나 있어 사건만
--   ⑦ 짝 제약 — system 인데 paused_by 있음 / staff 인데 없음 거절
--   ⑧ 직원 resume → 출처 비움 · 다른 기관 resume 거절 · 시스템 정지 위 직원 pause 는 출처 유지
--   ⑨ 분류기 사건 판정 칸은 사용자 요청으로 바꿀 수 없다 · 사용자는 분류기 사건을 직접 INSERT 할 수 없다
--   ⑩ 입력 검증(reason·categories)
--   ⑪ session_tick 이 pause_origin 을 돌려준다
--   ⑫ 관찰 기록 — 같은 자격·연결 증명 · 원문 칸 없음 · 같은 턴 한 번 · 같은 기관 돌봄팀만 읽기 · 직접 쓰기 불가

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

-- 어르신(처리 동의) + 요양보호사 a02 의 실행 중 세션 두 개(어르신 둘)
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
insert into public.profiles (user_id, name, birth_year) values
  ('a0000000-0000-0000-0000-000000000001', '분류기어르신', 1939),
  ('a0000000-0000-0000-0000-000000000001', '분류기어르신2', 1938);
insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, capacity)
  select p.id, p.org_id, 'a0000000-0000-0000-0000-000000000001', t::public.consent_type, true, 'v1.0', 'capable'
    from public.profiles p
    cross join unnest(array['elder_privacy_required','sensitive_health_voice','cross_border_transfer','ai_processing']) t
   where p.name in ('분류기어르신', '분류기어르신2');
set test.uid = 'a0000000-0000-0000-0000-000000000002';
insert into public.sessions (profile_id, user_id, status)
  select id, auth.uid(), 'active' from public.profiles where name in ('분류기어르신', '분류기어르신2');
reset role;
set test.uid = '';
create temp table rp as
select (select s.id from public.sessions s join public.profiles p on p.id = s.profile_id where p.name = '분류기어르신') sid,
       (select s.id from public.sessions s join public.profiles p on p.id = s.profile_id where p.name = '분류기어르신2') sid2,
       '22222222-0000-4000-8000-000000000001'::uuid h1,
       '22222222-0000-4000-8000-000000000002'::uuid h2,
       '33333333-0000-4000-8000-000000000001'::uuid e1,
       '33333333-0000-4000-8000-000000000002'::uuid e2,
       '33333333-0000-4000-8000-000000000003'::uuid e3,
       '33333333-0000-4000-8000-000000000004'::uuid e4;
grant select on rp to authenticated, service_role;
do $$ begin assert (select sid from rp) is not null and (select sid2 from rp) is not null, '시험 세션 둘'; end $$;

-- 점유 — 세션1 은 h1, 세션2 는 h2 (a02 가 연결)
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert public.acquire_voice_lease((select sid from rp), (select h1 from rp)), '세션1 점유';
  assert public.acquire_voice_lease((select sid2 from rp), (select h2 from rp)), '세션2 점유';
end $$;
reset role;
set test.uid = '';

-- 호출 문자열(service_role 로 실행)
create or replace function pg_temp.pause_sql(p_sid uuid, p_holder uuid, p_user text, p_event uuid,
  p_reason text default 'classifier_crisis_direct', p_cats text default '{medical_emergency}')
returns text language sql as $$
  select format('set local role service_role; select public.system_pause_for_review(%L, %L, %L, %L, %L, %L, %L, %L, %L)',
                p_sid, p_holder, p_user, p_event, p_reason, p_cats, '숨이 턱턱 막혀서 말을 못 하겠어', 'm-test', 'p-test')
$$;

-- ① 권한
do $$
begin
  assert has_function_privilege('service_role', 'public.system_pause_for_review(uuid,uuid,uuid,uuid,text,text[],text,text,text)', 'EXECUTE'), 'service_role 실행';
  assert not has_function_privilege('authenticated', 'public.system_pause_for_review(uuid,uuid,uuid,uuid,text,text[],text,text,text)', 'EXECUTE'), 'authenticated 불가';
  assert not has_function_privilege('anon', 'public.system_pause_for_review(uuid,uuid,uuid,uuid,text,text[],text,text,text)', 'EXECUTE'), 'anon 불가';
  assert not has_function_privilege('authenticated', 'public.record_classifier_observation(uuid,uuid,uuid,text,integer,text,text,text[],text,text)', 'EXECUTE'), '관찰 기록 authenticated 불가';
  assert not has_function_privilege('authenticated', 'app.require_live_relay_lease(uuid,uuid,uuid,uuid)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'app.classifier_caregiver_alert(text,text[])', 'EXECUTE'), '내부 함수 비공개';
end $$;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  replace(pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)),
          'set local role service_role', 'set local role authenticated'),
  'permission denied for function system_pause_for_review');

-- ② 연결 증명
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h2 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');  -- 다른 세션의 holder
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000001', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');  -- 다른 직원
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000005', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');  -- 다른 기관
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), null, 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');
select pg_temp.expect_err('', pg_temp.pause_sql(gen_random_uuid(), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');  -- 없는 세션
-- 점유가 맞아도 그 사람이 세션 기관의 돌봄팀이 아니면 거절(예: 보호자 a04 의 점유로 위장)
update public.voice_session_leases set user_id = 'a0000000-0000-0000-0000-000000000004' where session_id = (select sid from rp);
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000004', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');
update public.voice_session_leases set user_id = 'a0000000-0000-0000-0000-000000000002' where session_id = (select sid from rp);
update public.voice_session_leases set expires_at = now() - interval '1 second' where session_id = (select sid from rp);
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), 'SYSTEM_PAUSE_FORBIDDEN');  -- 만료
update public.voice_session_leases set expires_at = now() + interval '15 seconds' where session_id = (select sid from rp);
do $$
begin
  assert not exists (select 1 from public.safety_events where id = (select e1 from rp)), '거절이면 사건 없음';
  assert (select paused_at is null from public.sessions where id = (select sid from rp)), '거절이면 정지 없음';
  assert not exists (select 1 from public.session_interventions where session_id = (select sid from rp) and action = 'system_review_pause'), '거절이면 개입 없음';
end $$;

-- ⑩ 입력 검증
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp), 'classifier_context_logged', '{}'), 'SYSTEM_PAUSE_REASON');
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp), 'classifier_crisis_direct', '{}'), 'SYSTEM_PAUSE_CATEGORIES');
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp), 'classifier_self_harm_context', '{abuse}'), 'SYSTEM_PAUSE_CATEGORIES');
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp), 'classifier_ambiguous', '{fire}'), 'SYSTEM_PAUSE_CATEGORIES');

-- ③ 정상
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), null);
do $$
declare ev public.safety_events%rowtype; s public.sessions%rowtype;
begin
  select * into ev from public.safety_events where id = (select e1 from rp);
  assert ev.detected_by = 'classifier' and ev.detection_reason = 'classifier_crisis_direct'
     and ev.policy_version = 'p-test' and ev.classifier_model_version = 'm-test', '분류기 사건 · 판정 묶음 버전';
  assert ev.user_id = 'a0000000-0000-0000-0000-000000000002', '사건의 user_id 는 세션 진행자';
  assert ev.level = 'crisis' and ev.categories = '{medical_emergency}', '위기 범주가 있으면 crisis(규칙과 같은 대응)';
  assert ev.caregiver_alert = '대화 중 확인이 필요한 말씀이 있어 대화를 잠시 멈췄어요. 확인해주세요.' || E'\n' || '멈춘 이유: 신체 응급 관련',
    '문구 = 공통 문구 + 멈춘 이유(사용자 확정 R7)';
  assert position('진단' in ev.caregiver_alert) = 0, '진단 아님 문구 없음(사용자 확정 R7)';
  assert ev.caregiver_alert !~ '[0-9]{3}', '전화번호 등 대응 자원 없음(사용자 확정)';
  assert position('숨이' in ev.caregiver_alert) = 0, '발화는 문구에 넣지 않는다(발췌 칸 한 곳에만)';
  assert ev.excerpt = '숨이 턱턱 막혀서 말을 못 하겠어', '발화는 발췌 칸에';
  select * into s from public.sessions where id = (select sid from rp);
  assert s.paused_at is not null and s.pause_origin = 'system' and s.paused_by is null and s.control_request = 'pause', '시스템 정지';
  assert (select count(*) from public.session_interventions where session_id = s.id and action = 'system_review_pause' and actor_id is null
            and detail->>'event_id' = (select e1 from rp)::text and detail->>'via_user' = 'a0000000-0000-0000-0000-000000000002') = 1,
    '개입 1건 · actor 없음 · 연결 계정은 detail 에';
  assert exists (select 1 from public.notifications where source_id = ev.id and kind = 'safety' and user_id = 'a0000000-0000-0000-0000-000000000002'),
    '진행자에게 안전 알림 행(기존 트리거 → 푸시 큐)';
  assert not exists (select 1 from public.notifications where source_id = ev.id and user_id = 'a0000000-0000-0000-0000-000000000005'),
    '다른 기관 사람에게는 알림 없음';
  assert position('숨이' in (select body from public.notifications where source_id = ev.id limit 1)) = 0, '알림 행에 발화 원문 없음';
end $$;

-- ④ 멱등 · 충돌
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), null);
do $$
begin
  assert (select count(*) from public.safety_events where id = (select e1 from rp)) = 1, '같은 id 재호출 — 사건 1건';
  assert (select count(*) from public.session_interventions where session_id = (select sid from rp) and action = 'system_review_pause') = 1, '개입 1건';
end $$;
select pg_temp.expect_err('', pg_temp.pause_sql((select sid2 from rp), (select h2 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), 'SYSTEM_PAUSE_EVENT_CONFLICT');

-- ⑪ session_tick
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$
begin
  assert (public.session_tick((select sid from rp)))->>'pause_origin' = 'system', 'tick 이 출처를 돌려준다';
  assert ((public.session_tick((select sid from rp)))->>'paused')::boolean, '기존 paused 칸 유지';
  assert (public.session_tick((select sid2 from rp))) ? 'pause_origin' and (public.session_tick((select sid2 from rp)))->'pause_origin' = 'null'::jsonb, '멈추지 않은 세션은 null';
end $$;
reset role;
set test.uid = '';

-- ⑧ 시스템 정지 위 직원 pause → 출처 유지 · 다른 기관 resume 거절 · 직원 resume → 비움
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000001',
  format('set local role authenticated; select public.request_session_control(%L, %L, null)', (select sid from rp), 'pause'), null);
do $$ begin assert (select pause_origin = 'system' and paused_by is null from public.sessions where id = (select sid from rp)), '시스템 정지 위 직원 pause — 출처 유지'; end $$;
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000005',
  format('set local role authenticated; select public.request_session_control(%L, %L, null)', (select sid from rp), 'resume'), 'SESSION_CONTROL_NOT_FOUND');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000001',
  format('set local role authenticated; select public.request_session_control(%L, %L, null)', (select sid from rp), 'resume'), null);
do $$ begin assert (select paused_at is null and pause_origin is null and paused_by is null from public.sessions where id = (select sid from rp)), '재개 — 출처 비움'; end $$;
-- ④ 직원 재개 뒤 같은 사건 id 의 늦은 재시도 → 다시 멈추지 않는다
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e1 from rp)), null);
do $$
begin
  assert (select paused_at is null and pause_origin is null from public.sessions where id = (select sid from rp)), '늦은 재시도가 재개된 세션을 다시 멈추면 안 된다';
  assert (select count(*) from public.session_interventions where session_id = (select sid from rp) and action = 'system_review_pause') = 1, '개입도 늘지 않는다';
end $$;

-- ⑤ 직원이 먼저 멈춘 세션 → 사건은 남고 출처 staff 유지
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000001',
  format('set local role authenticated; select public.request_session_control(%L, %L, %L)', (select sid2 from rp), 'pause', '쉬는 시간'), null);
select pg_temp.expect_err('', pg_temp.pause_sql((select sid2 from rp), (select h2 from rp), 'a0000000-0000-0000-0000-000000000002', (select e2 from rp), 'classifier_ambiguous', '{}'), null);
do $$
begin
  assert (select pause_origin = 'staff' and paused_by = 'a0000000-0000-0000-0000-000000000001' from public.sessions where id = (select sid2 from rp)), '출처 staff 유지';
  assert (select level = 'watch' and caregiver_alert like '%' || E'\n' || '멈춘 이유: 해석이 어려운 말씀' from public.safety_events where id = (select e2 from rp)), '범주 없으면 watch · 이유 이름';
  assert not exists (select 1 from public.session_interventions where session_id = (select sid2 from rp) and action = 'system_review_pause'), '실제 정지가 아니면 개입 없음';
end $$;

-- ⑦ 짝 제약
do $$
begin
  begin
    update public.sessions set paused_by = 'a0000000-0000-0000-0000-000000000001', pause_origin = 'system' where id = (select sid2 from rp);
    raise exception 'system 인데 paused_by 가 있으면 거절돼야 한다';
  exception when check_violation then null;
  end;
  begin
    update public.sessions set paused_by = null where id = (select sid2 from rp);
    raise exception 'staff 인데 paused_by 가 없으면 거절돼야 한다';
  exception when check_violation then null;
  end;
  begin
    update public.sessions set pause_origin = null where id = (select sid2 from rp);
    raise exception '멈춤인데 출처가 없으면 거절돼야 한다';
  exception when check_violation then null;
  end;
end $$;
-- 사용자는 출처 칸을 직접 바꿀 수 없다
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('set local role authenticated; update public.sessions set pause_origin = %L where id = %L', 'system', (select sid2 from rp)),
  'SESSION_SUPERVISION_RPC_ONLY');

-- ⑨ 판정 불변 · 직접 INSERT 불가
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('set local role authenticated; update public.safety_events set detected_by = %L, detection_reason = null, policy_version = null, classifier_model_version = null where id = %L', 'rule', (select e1 from rp)),
  'SAFETY_EVENT_VERDICT_IMMUTABLE');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format('set local role authenticated; update public.safety_events set policy_version = %L where id = %L', 'p-other', (select e1 from rp)),
  'SAFETY_EVENT_VERDICT_IMMUTABLE');
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format($q$set local role authenticated; insert into public.safety_events (org_id, user_id, profile_id, session_id, level, categories, caregiver_alert, detected_by, detection_reason, policy_version)
          select org_id, auth.uid(), profile_id, id, 'watch', '{}', '위조', 'classifier', 'classifier_ambiguous', 'p' from public.sessions where id = %L$q$, (select sid from rp)),
  'new row violates row-level security policy for table "safety_events"');
-- 규칙 사건 직접 INSERT(기존 중계 경로)는 그대로 된다
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format($q$set local role authenticated; insert into public.safety_events (org_id, user_id, profile_id, session_id, level, categories, caregiver_alert)
          select org_id, auth.uid(), profile_id, id, 'watch', '{}', '규칙 사건' from public.sessions where id = %L$q$, (select sid from rp)),
  null);

-- ⑫ 관찰 기록
create or replace function pg_temp.obs_sql(p_holder uuid, p_user text, p_turn text, p_reason text default 'classifier_context_logged', p_action text default 'continue')
returns text language sql as $$
  select format('set local role service_role; select public.record_classifier_observation(%L, %L, %L, %L, 1, %L, %L, %L, %L, %L)',
                (select sid from rp), p_holder, p_user, p_turn, p_reason, p_action, '{medical_emergency}', 'm-test', 'p-test')
$$;
select pg_temp.expect_err('', pg_temp.obs_sql((select h2 from rp), 'a0000000-0000-0000-0000-000000000002', 't1'), 'SYSTEM_PAUSE_FORBIDDEN');
select pg_temp.expect_err('', pg_temp.obs_sql((select h1 from rp), 'a0000000-0000-0000-0000-000000000002', 't1'), null);
select pg_temp.expect_err('', pg_temp.obs_sql((select h1 from rp), 'a0000000-0000-0000-0000-000000000002', 't1'), null);  -- 같은 턴 두 번째(무시)
select pg_temp.expect_err('', pg_temp.obs_sql((select h1 from rp), 'a0000000-0000-0000-0000-000000000002', 't2', 'classifier_closing', 'continue'),
  'new row for relation "classifier_observations" violates check constraint "classifier_observations_reason_check"');
do $$
begin
  assert (select count(*) from public.classifier_observations where session_id = (select sid from rp)) = 1, '같은 턴은 한 번';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'classifier_observations'
                      and column_name in ('excerpt', 'text', 'utterance', 'transcript')), '원문 칸 없음';
  assert not has_table_privilege('anon', 'public.classifier_observations', 'SELECT'), 'anon 읽기 불가';
end $$;
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.classifier_observations where session_id = (select sid from rp)) = 1, '같은 기관 돌봄팀은 읽는다'; end $$;
set test.uid = 'a0000000-0000-0000-0000-000000000005';
do $$ begin assert (select count(*) from public.classifier_observations where session_id = (select sid from rp)) = 0, '다른 기관은 못 읽는다'; end $$;
reset role;
set test.uid = '';
select pg_temp.expect_err('a0000000-0000-0000-0000-000000000002',
  format($q$set local role authenticated; insert into public.classifier_observations (org_id, profile_id, session_id, turn_id, input_revision, reason, action, model_version, policy_version)
          select org_id, profile_id, id, 'tx', 1, 'classifier_closing', 'elder_closing', 'm', 'p' from public.sessions where id = %L$q$, (select sid from rp)),
  'new row violates row-level security policy for table "classifier_observations"');

-- ⑥ active 아닌 세션 → 사건만
update public.sessions set status = 'ended', ended_at = now(), duration_seconds = 60 where id = (select sid from rp);
select pg_temp.expect_err('', pg_temp.pause_sql((select sid from rp), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e3 from rp), 'classifier_unavailable', '{}'), null);
do $$
begin
  assert exists (select 1 from public.safety_events where id = (select e3 from rp) and detection_reason = 'classifier_unavailable'
                  and classifier_model_version = 'm-test' and caregiver_alert like '%' || E'\n' || '멈춘 이유: 자동 확인을 마치지 못함'), '끝난 세션 — 사건은 남는다';
  assert (select paused_at is null from public.sessions where id = (select sid from rp)), '끝난 세션 — 정지 없음';
end $$;

-- ⑥ 처리 동의 철회 → 세션이 끝나 있다(stop_unconsented_sessions) → 사건만 남고 정지 없음
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
insert into public.sessions (profile_id, user_id, status)
  select id, auth.uid(), 'active' from public.profiles where name = '분류기어르신';
reset role;
set test.uid = '';
create temp table rp3 as
select s.id sid3 from public.sessions s join public.profiles p on p.id = s.profile_id where p.name = '분류기어르신' and s.status = 'active';
grant select on rp3 to authenticated, service_role;
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000002';
do $$ begin assert public.acquire_voice_lease((select sid3 from rp3), (select h1 from rp)), '세션3 점유'; end $$;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
update public.consents set revoked_at = now()
 where profile_id = (select id from public.profiles where name = '분류기어르신') and consent_type = 'ai_processing' and revoked_at is null;
reset role;
set test.uid = '';
do $$ begin assert not app.has_processing_consent((select id from public.profiles where name = '분류기어르신')), '전제: 처리 동의 철회'; end $$;
select pg_temp.expect_err('', pg_temp.pause_sql((select sid3 from rp3), (select h1 from rp), 'a0000000-0000-0000-0000-000000000002', (select e4 from rp)), null);
do $$
begin
  assert (select status = 'ended' from public.sessions where id = (select sid3 from rp3)), '전제: 동의 철회가 세션을 끝냈다';
  assert exists (select 1 from public.safety_events where id = (select e4 from rp)), '동의 철회 세션 — 사건은 남는다';
  assert (select paused_at is null from public.sessions where id = (select sid3 from rp3)), '동의 철회 세션 — 정지 없음';
end $$;

-- 정리 — 세션2 종료
update public.sessions set status = 'ended', ended_at = now(), duration_seconds = 60, paused_at = null, paused_by = null,
                           pause_origin = null where id = (select sid2 from rp);

\echo 'system_review_pause: OK'

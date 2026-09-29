-- 기억온 — 운영 권한 그대로의 사용자 경로 회귀(T25.4 선행 · 2026-09-30)
--
-- 운영에서 authenticated 는 app 스키마 USAGE 가 **없다**(nspacl 비어 있음). 이 하네스(_grants.sql)는 테스트 편의상
-- USAGE 를 주기 때문에, invoker 트리거 본문이 app.* 를 이름으로 부르는 결함이 로컬에서 드러나지 않았다
-- (프로그램 일지 저장·확정이 운영에서 'permission denied for schema app' — 20260930015000 이 고침).
-- 이 파일은 **트랜잭션 안에서 그 USAGE 를 회수해 운영과 같게 만든 뒤** 실제 사용자 경로를 돌리고, 끝에 되돌린다.
-- 지키는 것:
--   ① 구조: 트리거로 쓰이는 invoker 함수는 본문에서 app.* 를 부르지 않는다(허용 목록 제외)
--   ② 일지: 요양보호사 저장(진행자 포함) · 관리자 확정 · 확정 후 사유와 함께 수정(이력) — 운영 권한에서 성공

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ① 구조 가드 — 허용: app.protect_user_privileges(역할·기관 변경 분기만 app.* — 운영은 컬럼 권한이 먼저 막고,
--    그 분기에 닿아도 권한 오류로 **닫힌 채 실패**한다. current_user 판별이 필요해 invoker 여야 한다 — rls_regression (h)).
do $$
declare offenders text;
begin
  select string_agg(distinct n.nspname || '.' || p.proname, ', ') into offenders
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where not t.tgisinternal and not p.prosecdef and p.prosrc ~ 'app\.'
     and n.nspname || '.' || p.proname not in ('app.protect_user_privileges');
  assert offenders is null,
    'invoker 트리거가 app.* 를 부르면 운영(app USAGE 없음)에서 권한 오류가 난다 — definer 로 나눌 것: ' || offenders;
end $$;

begin;
revoke usage on schema app from authenticated;

create temp table pp on commit drop as
select u.org_id as org,
       (select p.id from public.profiles p where p.org_id = u.org_id order by p.id limit 1) as pid
  from public.users u where u.id = 'a0000000-0000-0000-0000-000000000001';
grant select on pp to authenticated;

-- ② 일지 — 요양보호사 a02 가 진행자(본인)로 저장 → 관리자 a01 확정 → 관리자 a01 사유와 함께 수정
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
insert into public.program_journals (profile_id, activity_content, facilitator_user_id, program_type)
  values ((select pid from pp), '운영 권한 경로 확인', 'a0000000-0000-0000-0000-000000000002', '회상');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', true);
update public.program_journals set status = 'final' where activity_content = '운영 권한 경로 확인';
update public.program_journals set location = '1층', edit_reason = '장소 추가' where activity_content = '운영 권한 경로 확인';
reset role;
do $$ begin
  assert (select status = 'final' and location = '1층' and finalized_by = 'a0000000-0000-0000-0000-000000000001'
            from public.program_journals where activity_content = '운영 권한 경로 확인'),
    '운영 권한에서 일지 저장·확정·확정 후 수정이 되어야 함';
  assert exists (select 1 from public.program_journal_revisions r join public.program_journals j on j.id = r.journal_id
                  where j.activity_content = '운영 권한 경로 확인'), '확정 후 수정 이력이 남아야 함';
end $$;

select 'prod privilege path assertions passed';
rollback;

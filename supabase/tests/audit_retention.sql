-- 기억온 — 감사 로그 보관·파기(T25.8, 20260930000000) 회귀
--
-- 지키는 것: ① 파기 함수는 클라이언트 역할이 부를 수 없다(보관 기간을 인자로 받는 삭제 함수)
--   ② 기본 보관 2년 — 2년 넘은 기록만 지우고 그 안의 기록은 남긴다
--   ③ pg_cron 이 있는 환경이면 주간 작업이 한국 새벽(토 18:00 UTC)으로 정확히 1개 등록돼 있다
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$
begin
  assert not has_function_privilege('authenticated', 'app.purge_audit_log(interval)', 'EXECUTE'),
    '파기 함수는 authenticated 가 부를 수 없어야 함(T25.8)';
  assert not has_function_privilege('anon', 'app.purge_audit_log(interval)', 'EXECUTE'),
    '파기 함수는 anon 이 부를 수 없어야 함(T25.8)';
end $$;

-- ② 2년 경계 — 슈퍼유저로 직접 넣고 지운다
insert into public.audit_log (actor_id, org_id, action, table_name, record_id, occurred_at) values
  (null, null, 'insert', 't25_8_old', 'old', now() - interval '2 years 1 day'),
  (null, null, 'insert', 't25_8_new', 'new', now() - interval '2 years' + interval '1 day');
do $$
declare n int;
begin
  n := app.purge_audit_log();
  assert n >= 1, '2년 넘은 기록은 지워져야 함';
  assert not exists (select 1 from public.audit_log where table_name = 't25_8_old'), '2년 넘은 기록이 남음';
  assert exists (select 1 from public.audit_log where table_name = 't25_8_new'), '2년 안의 기록은 남아야 함';
end $$;
delete from public.audit_log where table_name like 't25_8_%';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    assert (select count(*) from cron.job where jobname = 'purge-audit-log' and schedule = '0 18 * * 6'
              and command = 'select app.purge_audit_log()') = 1,
      '주간 파기 작업이 한 번(토 18:00 UTC = 일 03:00 KST) 등록돼야 함';
  end if;
end $$;

select 'audit retention assertions passed';

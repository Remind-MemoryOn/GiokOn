-- 감사 로그 파기 예약 재등록 (감사 2026-09-27 · tasks T25.8)
--
-- ■ 무엇이 잘못됐나
--   20260703130000_audit_log.sql 은 "pg_cron 이 **이미 있을 때만**" 주간 파기(purge-audit-log)를 등록했다.
--   그 마이그레이션이 운영에 적용될 때는 pg_cron 이 없었고, pg_cron 은 나중(20260925000000 일지 워커)에 켜졌다 →
--   운영 cron 목록에 파기 작업이 없다(워커 2개뿐 — 2026-09-30 읽기 확인). 2년 보관 약속(docs/compliance.md)이 실행되지 않는다.
--   · 함수 app.purge_audit_log(retain) 의 실행 권한이 PUBLIC 그대로였다(ACL 없음). 지금은 authenticated·anon 에게
--     app 스키마 USAGE 가 없어 부를 수 없지만, 보관 기간을 인자로 받는 **삭제 함수**라 권한을 한 겹만 믿지 않는다.
--
-- ■ 무엇을 하나
--   1) 실행 권한 회수(PUBLIC·anon·authenticated) — cron(postgres)만 부른다.
--   2) pg_cron 이 있으면 주간 작업을 **멱등으로** 다시 등록한다(있으면 지우고 같은 이름으로).
--      시각: 매주 일요일 03:00 한국 시간 = 토요일 18:00 UTC('0 18 * * 6'). pg_cron 은 UTC 로 돈다.
--      (원래 '0 3 * * 0' 은 UTC 라 한국 낮 12시였다 — 사용량이 적은 한국 새벽으로 옮긴다.)
--   보관 기간(2년)·함수 본문은 바꾸지 않는다.
-- 급하지 않다: 운영의 가장 오래된 기록이 2026-07-27 이라 첫 삭제 대상은 2028-07 이후다.

revoke all on function app.purge_audit_log(interval) from public, anon, authenticated;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return; -- CI·로컬 순정 PostgreSQL — 예약 대상이 없다.
  end if;
  if exists (select 1 from cron.job where jobname = 'purge-audit-log') then
    perform cron.unschedule('purge-audit-log');
  end if;
  perform cron.schedule('purge-audit-log', '0 18 * * 6', 'select app.purge_audit_log()');
end
$cron$;

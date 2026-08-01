-- MemoryOn(기억온) — Realtime publication에 safety_events 추가 (라이브 검증에서 발견)
--
-- 앱/웹의 useGiokonRealtime 는 기본 구독 대상(DEFAULT_TABLES)에 safety_events 를
-- 포함하지만, publication 에는 누락돼 있어 위기/관찰 알림이 실시간으로 전파되지
-- 않았다(저장·조회는 정상, 실시간 푸시만 누락). postgres_changes 는 RLS 를 준수하므로
-- (safety_events 의 guardian 배제 정책 유지) 안전하게 추가한다.
--
-- 로컬/CI(순정 PostgreSQL)에는 publication 이 없을 수 있으므로 없으면 생성하고,
-- 실 Supabase 에는 이미 존재하므로 add table 만 수행한다(중복은 무시). append-only.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.safety_events;
    exception when duplicate_object then null;
    end;
  else
    create publication supabase_realtime for table public.safety_events;
  end if;
end $$;

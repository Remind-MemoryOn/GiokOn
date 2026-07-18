-- MemoryOn(기억온) — Realtime publication 등록 (T-E3 / Phase W2)
--
-- 앱에서 세션이 생성·종료되면 웹 대시보드가 즉시 반영되도록 sessions 변경을
-- Supabase Realtime(postgres_changes)으로 내보낸다. postgres_changes 는 RLS 를
-- 준수한다(권한 밖 행 미전달). session_analyses(W3)·guardian_shares(W5)는 각
-- 테이블 생성 마이그레이션에서 publication 에 추가한다.
--
-- 로컬/CI(순정 PostgreSQL)에는 supabase_realtime publication 이 없으므로
-- 없으면 생성한다(실 Supabase 에는 이미 존재 → add table 만 수행).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.sessions;
    exception when duplicate_object then null;
    end;
  else
    create publication supabase_realtime for table public.sessions;
  end if;
end $$;

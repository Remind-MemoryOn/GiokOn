-- 앱↔DB 동기화 감사 후속 (2026-08-18)
--
-- 앱이 DB 를 쓰는 방식과 스키마 사이의 남은 간극을 메운다.
--   1) session_logs (session_id, turn_index) 유니크
--      앱이 대화를 **진행 중에** 턴 단위로 기록하도록 바뀌면서, 네트워크 재시도가
--      같은 턴을 두 번 넣을 수 있게 됐다. 유니크가 있어야 upsert 로 멱등하게 쓴다.
--   2) Realtime publication 확장 — profiles · chronicle_entries · session_logs
--      웹에서 고친 어르신 정보·연대기가 앱에 반영될 경로가 없었고(앱은 복귀 시
--      재조회로만 따라잡았다), 진행 중 대화를 웹에서 지켜볼 수도 없었다.
--   3) profiles.memories 제거
--      앱·웹 어디도 읽거나 쓰지 않는다(주요 기억은 chronicle_entries 에 topic
--      '주요 기억' 으로 저장한다 — 항목별 id 가 있어야 수정·삭제가 된다).
--      라이브에 값이 든 행은 0건임을 확인하고 제거한다.
--   4) journal-photos 삭제·교체 정책
--      elder-photos 에는 update/delete 정책이 있는데 journal-photos 에는 없어서,
--      어르신을 삭제해도 요양일지 사진만 Storage 에 남았다. 파기가 가능해야 한다.
--
-- ⚠️ 파기 순서 주의(코드 쪽 규약): Storage 정책은 경로 첫 구간(<profile_id>)으로
--    public.profiles 를 조회해 기관을 확인한다. 따라서 프로필 행을 먼저 지우면
--    그 어르신의 파일을 **더 이상 지울 수 없다**. 반드시 Storage 를 먼저 비운다.

-- ── 1) 턴 멱등 기록용 유니크 ────────────────────────────────────────────────
do $$
begin
  alter table public.session_logs
    add constraint session_logs_session_turn_unique unique (session_id, turn_index);
exception when duplicate_table or duplicate_object then null;
end $$;

-- ── 2) Realtime publication 확장 ────────────────────────────────────────────
-- 로컬/CI(순정 PostgreSQL)에는 supabase_realtime publication 이 없으므로 있을 때만.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.profiles;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.chronicle_entries;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.session_logs;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ── 3) 미사용 컬럼 제거 ─────────────────────────────────────────────────────
alter table public.profiles drop column if exists memories;

-- ── 4) journal-photos 교체·삭제 정책 ────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    begin
      create policy journal_photos_update_org
      on storage.objects for update
      using (
        bucket_id = 'journal-photos'
        and app.current_org_role() <> 'guardian'
        and exists (
          select 1 from public.profiles p
          where p.id::text = split_part(name, '/', 1)
            and p.org_id = app.current_org_id()
        )
      );
    exception when duplicate_object then null;
    end;

    begin
      create policy journal_photos_delete_org
      on storage.objects for delete
      using (
        bucket_id = 'journal-photos'
        and app.current_org_role() <> 'guardian'
        and exists (
          select 1 from public.profiles p
          where p.id::text = split_part(name, '/', 1)
            and p.org_id = app.current_org_id()
        )
      );
    exception when duplicate_object then null;
    end;
  end if;
end $$;

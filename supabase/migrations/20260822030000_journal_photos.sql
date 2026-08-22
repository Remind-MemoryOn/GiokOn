-- MemoryOn(기억온) — 요양일지 사진 여러 장 (신규 웹 디자인 205:1039 / 221:1196 / 55:2035)
--
-- 왜: 새 디자인은 일지 작성에서 **사진을 여러 장** 첨부하고(221:1196 슬롯 4칸),
--     보호자 화면은 그 사진들을 날짜순 갤러리로 본다("관련 사진 (3장)", 55:2035).
--     기존 `care_journals.photo_path` 는 **한 장**만 담아 이 화면들을 만들 수 없다.
--
-- 규약
--   - 파일은 기존 private 버킷 `journal-photos` 를 그대로 쓴다(정책 이미 있음).
--     경로는 `<profile_id>/<uuid>.<ext>` — Storage 정책이 첫 구간으로 기관을 확인한다.
--   - `care_journals.photo_path` 는 **남겨 둔다**(앱·기존 행이 쓰고 있다). 새 코드는
--     이 표를 쓰고, 첫 장을 photo_path 에도 함께 넣어 구 화면과 호환한다.
--   - ⚠️ 파기 순서: 행을 지우기 전에 Storage 파일을 먼저 지운다(정책이 profiles 를
--     경로로 조회하므로 프로필이 사라지면 파일을 못 지운다 — 20260818000000 참고).

create table if not exists public.journal_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  journal_id uuid not null references public.care_journals(id) on delete cascade,
  path text not null,
  caption text,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journal_photos_path_check
    check (char_length(btrim(path)) between 1 and 500),
  constraint journal_photos_caption_check
    check (caption is null or char_length(caption) between 1 and 200),
  -- 시안은 4칸이지만 실무에서 늘 수 있어 여유를 둔다. 음수·과다 첨부만 막는다.
  constraint journal_photos_sort_check check (sort between 0 and 20)
);

do $$
begin
  alter table public.journal_photos
    add constraint journal_photos_path_unique unique (path);
exception when duplicate_table or duplicate_object then null;
end $$;

create index if not exists idx_journal_photos_journal
  on public.journal_photos(journal_id, sort, created_at);

create trigger set_journal_photos_updated_at
before update on public.journal_photos
for each row execute function app.set_updated_at();

create trigger stamp_journal_photos_org_id
before insert on public.journal_photos
for each row execute function app.stamp_org_id();

create trigger audit_journal_photos
after insert or update or delete on public.journal_photos
for each row execute function app.write_audit_log();

alter table public.journal_photos enable row level security;

-- 조회: 일지와 같은 기준(기관 돌봄 구성원, 보호자는 공개 커밋 경유만).
create policy journal_photos_select_org
on public.journal_photos
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 첨부: 그 일지를 쓸 수 있는 사람만(작성자 본인 또는 기관 관리자).
create policy journal_photos_insert_scope
on public.journal_photos
for insert
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and exists (
    select 1 from public.care_journals j
    where j.id = journal_id
      and j.org_id = app.current_org_id()
      and (j.author_id = auth.uid() or app.is_org_admin())
  )
);

create policy journal_photos_update_scope
on public.journal_photos
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and exists (
    select 1 from public.care_journals j
    where j.id = journal_id
      and (j.author_id = auth.uid() or app.is_org_admin())
  )
)
with check (org_id = app.current_org_id());

-- 삭제: 초안(draft) 일지의 사진만. 확정 일지는 기록물이라 첨부를 뺄 수 없다
-- (care_journals_delete_draft 와 같은 기준).
create policy journal_photos_delete_draft
on public.journal_photos
for delete
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and exists (
    select 1 from public.care_journals j
    where j.id = journal_id
      and j.status = 'draft'
      and (j.author_id = auth.uid() or app.is_org_admin())
  )
);

-- Realtime — 웹에서 올린 사진이 다른 화면·앱에 바로 보이게(있을 때만).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.journal_photos;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

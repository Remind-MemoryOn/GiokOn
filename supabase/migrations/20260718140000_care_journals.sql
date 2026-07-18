-- MemoryOn(기억온) — 요양일지 (T19.1 / M19.1 / Phase W4 — 현직자 1순위 요청)
--
-- 수기 일지를 사진 업로드 / 직접 타이핑 / 구어(음성) 입력 3경로로 작성하고,
-- AI 초안은 항상 요양보호사 확인 후 저장한다(SCR-W06). 공개는 커밋
-- (guardian_shares, 후속) 경유만 — 보호자 직접 접근 불가.
--
-- ⚠️ 민감정보 취급: 일지에는 건강 관련 내용이 포함될 수 있다 — 민감정보 동의
-- 범위에 포섭, 사진 원본은 private Storage(journal-photos), 보관·파기 정책 적용
-- (docs/compliance.md §5). append-only.

do $$
begin
  create type public.journal_source as enum ('photo', 'voice', 'typed', 'ai_draft');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.journal_status as enum ('draft', 'final');
exception when duplicate_object then null;
end $$;

create table if not exists public.care_journals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  journal_date date not null default current_date,
  content text not null,
  source public.journal_source not null default 'typed',
  photo_path text,                                   -- Storage journal-photos 내 경로
  status public.journal_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint care_journals_content_check
    check (char_length(btrim(content)) between 1 and 5000),
  constraint care_journals_photo_path_check
    check (photo_path is null or char_length(photo_path) between 1 and 500)
);

create index if not exists idx_care_journals_org_date
  on public.care_journals(org_id, journal_date desc);
create index if not exists idx_care_journals_profile_date
  on public.care_journals(profile_id, journal_date desc);

create trigger set_care_journals_updated_at
before update on public.care_journals
for each row execute function app.set_updated_at();

create trigger stamp_care_journals_org_id
before insert on public.care_journals
for each row execute function app.stamp_org_id();

create trigger audit_care_journals
after insert or update or delete on public.care_journals
for each row execute function app.write_audit_log();

alter table public.care_journals enable row level security;

-- 조회: 기관 돌봄 구성원(비 guardian). 보호자는 공개 커밋 경유만(직접 접근 불가).
create policy care_journals_select_org
on public.care_journals
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 작성: 본인 명의만.
create policy care_journals_insert_scope
on public.care_journals
for insert
with check (
  author_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 수정(초안 보완·확정): 작성자 본인 또는 기관 관리자.
create policy care_journals_update_scope
on public.care_journals
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (author_id = auth.uid() or app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 삭제: 작성자 본인의 초안(draft)만. 확정(final) 일지는 기록물 — 삭제 불가.
create policy care_journals_delete_draft
on public.care_journals
for delete
using (
  author_id = auth.uid()
  and status = 'draft'
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- ──────────────────────────────────────────────────────────────────────────
-- Storage: 일지 사진 버킷(journal-photos, private) — 실 Supabase 에서만 적용
-- (로컬/CI 순정 PostgreSQL 에는 storage 스키마가 없어 건너뛴다.)
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
      values ('journal-photos', 'journal-photos', false)
      on conflict (id) do nothing;

    -- 업로드·조회: 기관 돌봄 구성원(비 guardian). 경로 규약: <profile_id>/<파일명>
    begin
      create policy journal_photos_select_org
      on storage.objects for select
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
      create policy journal_photos_insert_org
      on storage.objects for insert
      with check (
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

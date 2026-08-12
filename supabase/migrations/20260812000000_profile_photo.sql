-- MemoryOn(기억온) — 어르신 사진 (profiles.photo_path + Storage elder-photos)
-- (2026-08-12, Figma 재적용: 어르신 프로필 폼·메인 카드에 사진이 포함되어 스키마 보강)
--
-- 배경: Figma 원본의 어르신 프로필 폼에는 사진 업로드 필드가 있고, 메인 화면 카드도
-- 원형 사진을 쓴다. v1 스키마에 사진 컬럼이 없어 이니셜 아바타로 대체하고 있었다.
-- 사용자 결정(2026-08-12)으로 디자인을 100% 구현하기 위해 컬럼과 버킷을 추가한다.
--
-- 명명·구조는 요양일지 사진(care_journals.photo_path / journal-photos)과 동일 관례:
--   · DB 에는 **Storage 경로**만 저장(공개 URL 아님 — 버킷은 private, 조회는 signed URL).
--   · 경로 규약: <profile_id>/<uuid>.<ext> → Storage RLS 가 기관 소속을 검증한다.
--   · 어르신 얼굴 사진은 민감정보로 취급(보관·파기 정책 — docs/compliance.md §5).
-- append-only.

alter table public.profiles
  add column if not exists photo_path text;

do $$
begin
  alter table public.profiles
    add constraint profiles_photo_path_check
    check (photo_path is null or char_length(photo_path) between 1 and 500);
exception when duplicate_object then null;
end $$;

comment on column public.profiles.photo_path is
  'Storage elder-photos 내 경로(<profile_id>/<uuid>.<ext>). private 버킷 — 조회는 signed URL.';

-- ──────────────────────────────────────────────────────────────────────────
-- Storage: 어르신 사진 버킷(elder-photos, private) — 실 Supabase 에서만 적용
-- (로컬/CI 순정 PostgreSQL 에는 storage 스키마가 없어 건너뛴다.)
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
      values ('elder-photos', 'elder-photos', false)
      on conflict (id) do nothing;

    -- 조회: 같은 기관의 돌봄 구성원(보호자 배제). 경로 규약 <profile_id>/<파일명>
    begin
      create policy elder_photos_select_org
      on storage.objects for select
      using (
        bucket_id = 'elder-photos'
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
      create policy elder_photos_insert_org
      on storage.objects for insert
      with check (
        bucket_id = 'elder-photos'
        and app.current_org_role() <> 'guardian'
        and exists (
          select 1 from public.profiles p
          where p.id::text = split_part(name, '/', 1)
            and p.org_id = app.current_org_id()
        )
      );
    exception when duplicate_object then null;
    end;

    -- 사진 교체(덮어쓰기)·삭제: 같은 기관 돌봄 구성원.
    begin
      create policy elder_photos_update_org
      on storage.objects for update
      using (
        bucket_id = 'elder-photos'
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
      create policy elder_photos_delete_org
      on storage.objects for delete
      using (
        bucket_id = 'elder-photos'
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

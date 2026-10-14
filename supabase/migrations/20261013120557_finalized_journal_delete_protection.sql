-- 확정 일지 보존: 상위 세션/어르신 DELETE 의 FK cascade 는 RLS 를 우회한다.
-- Storage 객체도 사진 메타데이터의 DELETE 정책과 별개로 확정 기록을 보호한다.
-- 승인된 postgres/service_role 파기와 미확정 기록 정리는 그대로 허용한다.

begin;

create or replace function app.guard_finalized_journal_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- FK cascade 안의 current_user 는 테이블 소유자(postgres)가 될 수 있다.
  -- SET ROLE 의 원래 API 역할은 role 설정에 남으므로 함께 검사한다.
  if old.status = 'final'
     and (current_user in ('authenticated', 'anon')
          or current_setting('role', true) in ('authenticated', 'anon')) then
    raise exception 'JOURNAL_FINAL_DELETE_FORBIDDEN' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function app.guard_finalized_journal_delete() from public, anon, authenticated;

create trigger guard_finalized_journal_delete before delete on public.program_journals
  for each row execute function app.guard_finalized_journal_delete();

create or replace function app.journal_photo_is_mutable(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.program_journal_photos ph
      join public.program_journals j on j.id = ph.journal_id
     where ph.path = p_object_name
       and ph.org_id = app.current_org_id()
       and (j.status = 'final' or exists (
         select 1 from public.guardian_shares s
          where s.item_type = 'photo' and s.item_id = ph.id and s.revoked_at is null
       ))
  );
$$;
revoke all on function app.journal_photo_is_mutable(text) from public, anon;
grant execute on function app.journal_photo_is_mutable(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  alter policy journal_photos_update_org on storage.objects
    using (bucket_id = 'journal-photos' and app.storage_path_in_my_org(objects.name)
      and app.journal_photo_is_mutable(objects.name))
    with check (bucket_id = 'journal-photos' and app.storage_path_in_my_org(objects.name)
      and app.journal_photo_is_mutable(objects.name));
  alter policy journal_photos_delete_org on storage.objects
    using (bucket_id = 'journal-photos' and app.storage_path_in_my_org(objects.name)
      and app.journal_photo_is_mutable(objects.name));
end $$;

commit;

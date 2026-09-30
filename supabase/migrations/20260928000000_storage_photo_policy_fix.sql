-- Storage 사진 정책 교정 (감사 2026-09-27 · tasks T25.1)
--
-- ■ 무엇이 잘못됐나
--   elder-photos·journal-photos 의 정책 8개(20260718140000 · 20260812000000 · 20260818000000)가
--       exists (select 1 from public.profiles p where p.id::text = split_part(name, '/', 1) ...)
--   로 쓰였다. 하위 질의 안의 `name` 은 SQL 이름 해석 규칙상 **가장 안쪽 범위의 profiles.name** 에 묶인다
--   (운영에 컴파일된 정책도 `split_part(p.name, …)`). 그래서
--     ① 정상 요청은 전부 거부된다 — 어르신 이름이 자기 UUID 인 경우가 없으니 exists 가 거짓(운영 사진 버킷 객체 0개).
--     ② 반대로 같은 기관 어르신 한 명의 이름을 그 어르신의 UUID 문자열로 바꾸면 exists 가 **경로와 무관하게 참**이 되어
--        두 버킷의 **모든 기관 파일**을 읽고·쓰고·지울 수 있다(36자는 이름 길이 제약을 통과한다).
--   로컬·CI 회귀는 storage 스키마가 없어 이 정책을 아예 만들지 않았으므로 잡지 못했다.
--
-- ■ 어떻게 고치나
--   경로 판정을 **인자로 경로를 받는 함수** app.storage_path_in_my_org(object_name) 하나로 모은다.
--   함수 인자는 이름이 다르므로(p_object_name) 같은 종류의 이름 충돌이 다시 생길 수 없다.
--   8개 정책을 모두 다시 만들고, UPDATE 는 USING(옛 경로)·WITH CHECK(새 경로)를 **둘 다** 검사해
--   경로를 다른 기관 어르신 폴더로 옮기는 것도 막는다.
--
-- ■ 지키는 것(의미는 그대로)
--   · 경로 규약 `<profile_id>/<파일명>` — 첫 구간의 어르신이 **내 기관** 소속이어야 한다.
--   · 보호자는 두 버킷에 직접 접근하지 못한다(보호자 공개는 별도 경로).
--   · 돌봄팀 판정은 기존 `current_org_role() <> 'guardian'` 대신 역할을 명시한 `app.is_care_team()`
--     (기관 없는 가입자·앞으로 늘어날 역할이 자동으로 통과하지 않게 — 20260924010000 과 같은 기준).
--   · 순서 규약(파일 → 프로필 행 삭제, packages/data/src/storage.ts)은 그대로 — 행이 없으면 판정이 거짓이다.

create or replace function app.storage_path_in_my_org(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.is_care_team()
     and exists (
       select 1
         from public.profiles p
        where p.id::text = split_part(p_object_name, '/', 1)
          and p.org_id = app.current_org_id()
     );
$$;

comment on function app.storage_path_in_my_org(text) is
  'Storage 경로 `<profile_id>/<파일명>` 의 어르신이 호출자 기관 소속이고 호출자가 돌봄팀인가. elder-photos·journal-photos 정책 전용(T25.1).';

revoke all on function app.storage_path_in_my_org(text) from public, anon;
grant execute on function app.storage_path_in_my_org(text) to authenticated;

do $$
declare
  b record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return; -- 순정 PostgreSQL(스텁 없는 로컬) — 정책 대상이 없다.
  end if;

  for b in select * from (values ('elder-photos', 'elder_photos'), ('journal-photos', 'journal_photos')) as v(bucket, prefix)
  loop
    execute format('drop policy if exists %I on storage.objects', b.prefix || '_select_org');
    execute format('drop policy if exists %I on storage.objects', b.prefix || '_insert_org');
    execute format('drop policy if exists %I on storage.objects', b.prefix || '_update_org');
    execute format('drop policy if exists %I on storage.objects', b.prefix || '_delete_org');

    -- `objects.name` 은 정책 대상 행(storage.objects)의 경로다 — 함수 인자로 넘겨 이름 충돌을 원천 차단.
    execute format(
      'create policy %I on storage.objects for select using (bucket_id = %L and app.storage_path_in_my_org(objects.name))',
      b.prefix || '_select_org', b.bucket);
    execute format(
      'create policy %I on storage.objects for insert with check (bucket_id = %L and app.storage_path_in_my_org(objects.name))',
      b.prefix || '_insert_org', b.bucket);
    execute format(
      'create policy %I on storage.objects for update using (bucket_id = %L and app.storage_path_in_my_org(objects.name)) '
      || 'with check (bucket_id = %L and app.storage_path_in_my_org(objects.name))',
      b.prefix || '_update_org', b.bucket, b.bucket);
    execute format(
      'create policy %I on storage.objects for delete using (bucket_id = %L and app.storage_path_in_my_org(objects.name))',
      b.prefix || '_delete_org', b.bucket);
  end loop;
end $$;

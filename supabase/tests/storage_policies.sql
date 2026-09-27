-- 기억온 — Storage 사진 정책 회귀(T25.1, 20260928000000)
--
-- safety_push.sql 뒤에 실행된다. pilot_access.sql 의 기관 PA(관리자 a...01 · 요양보호사 a...02 · 보호자 a...04)와
-- 기관 PB(관리자 a...05)를 쓴다. storage 스키마는 _supabase_shims.sql 의 최소 스텁이다.
-- 지키는 것(elder-photos · journal-photos 두 버킷 모두):
--   ① 정상 이름의 어르신 — 자기 기관 돌봄팀은 조회·추가·수정·삭제가 된다(교정 전에는 전부 거부됐다)
--   ② 다른 기관은 조회 0건 · 추가 거부 · 수정/삭제 0건
--   ③ 보호자는 자기 기관 파일도 직접 접근 불가
--   ④ 어르신 이름을 자기 UUID 로 바꿔도 다른 기관 파일이 열리지 않는다(교정 전 우회 경로)
--   ⑤ 경로를 다른 기관 어르신 폴더로 옮기는 수정은 거부된다
--   ⑥ 정책 8개가 모두 경로 함수를 쓰고, 어느 정책도 profiles.name 에 묶이지 않는다

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ⑥ 정책 정의
do $$
begin
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname ~ '^(elder|journal)_photos_(select|insert|update|delete)_org$') = 8,
    '사진 버킷 정책은 8개여야 함';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and (coalesce(qual, '') ~ 'p\.name' or coalesce(with_check, '') ~ 'p\.name')),
    'Storage 정책이 profiles.name 에 묶이면 안 됨(T25.1)';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname ~ '_photos_' and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'storage_path_in_my_org') = 8,
    '사진 버킷 정책 8개가 모두 경로 함수를 써야 함';
  assert (select with_check ~ 'storage_path_in_my_org' from pg_policies
           where schemaname = 'storage' and policyname = 'elder_photos_update_org'),
    '수정 정책은 새 경로도 검사해야 함(WITH CHECK)';
  assert not has_function_privilege('anon', 'app.storage_path_in_my_org(text)', 'EXECUTE'),
    '경로 함수는 anon 이 부를 수 없어야 함';
end $$;

-- 픽스처: PA·PB 어르신(정상 이름) — 슈퍼유저로 만든다
create temp table st as
select (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001') as pa,
       (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000005') as pb;
insert into public.profiles (id, org_id, user_id, name, birth_year) values
  ('5a000000-0000-0000-0000-00000000000a', (select pa from st), 'a0000000-0000-0000-0000-000000000001', '사진어르신', 1940),
  ('5b000000-0000-0000-0000-00000000000b', (select pb from st), 'a0000000-0000-0000-0000-000000000005', '비기관어르신', 1941);
grant select on st to authenticated;

do $$
declare
  bucket text;
  pa_file text;
  n int;
  blocked boolean;
begin
  foreach bucket in array array['elder-photos', 'journal-photos'] loop
    pa_file := '5a000000-0000-0000-0000-00000000000a/' || bucket || '-1.jpg';

    -- ① PA 요양보호사 — 추가·조회·수정·삭제
    set local role authenticated;
    perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
    insert into storage.objects (bucket_id, name) values (bucket, pa_file);
    assert (select count(*) from storage.objects where bucket_id = bucket and name = pa_file) = 1,
      bucket || ': 자기 기관 돌봄팀은 정상 이름 어르신 파일을 볼 수 있어야 함';
    update storage.objects set name = pa_file || '.v2' where bucket_id = bucket and name = pa_file;
    get diagnostics n = row_count;
    assert n = 1, bucket || ': 자기 기관 파일 교체(같은 어르신 폴더)는 되어야 함';
    update storage.objects set name = pa_file where bucket_id = bucket and name = pa_file || '.v2';

    -- ⑤ 다른 기관 어르신 폴더로 옮기기 — 거부
    blocked := false;
    begin
      update storage.objects set name = '5b000000-0000-0000-0000-00000000000b/moved.jpg'
       where bucket_id = bucket and name = pa_file;
    exception when insufficient_privilege then blocked := true;
    end;
    assert blocked, bucket || ': 다른 기관 어르신 폴더로 옮기는 수정은 거부돼야 함';

    -- ② PB 관리자 — 조회 0 · 추가 거부 · 수정/삭제 0
    perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000005', true);
    assert (select count(*) from storage.objects where bucket_id = bucket) = 0,
      bucket || ': 다른 기관 파일은 보이면 안 됨';
    blocked := false;
    begin
      insert into storage.objects (bucket_id, name) values (bucket, '5a000000-0000-0000-0000-00000000000a/intrude.jpg');
    exception when insufficient_privilege then blocked := true;
    end;
    assert blocked, bucket || ': 다른 기관 어르신 폴더에 추가하면 거부돼야 함';
    update storage.objects set name = name || '.x' where bucket_id = bucket;
    get diagnostics n = row_count;
    assert n = 0, bucket || ': 다른 기관 파일은 수정되면 안 됨';
    delete from storage.objects where bucket_id = bucket;
    get diagnostics n = row_count;
    assert n = 0, bucket || ': 다른 기관 파일은 지워지면 안 됨';

    -- ③ PA 보호자 — 직접 접근 불가
    perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', true);
    assert (select count(*) from storage.objects where bucket_id = bucket) = 0,
      bucket || ': 보호자는 사진 버킷을 직접 볼 수 없어야 함';
    blocked := false;
    begin
      insert into storage.objects (bucket_id, name) values (bucket, '5a000000-0000-0000-0000-00000000000a/guard.jpg');
    exception when insufficient_privilege then blocked := true;
    end;
    assert blocked, bucket || ': 보호자는 사진을 올릴 수 없어야 함';
    reset role;
  end loop;
end $$;

-- ④ 교정 전 우회 경로 — PB 어르신 이름을 자기 UUID 로 바꿔도 PA 파일은 열리지 않는다
update public.profiles set name = id::text where id = '5b000000-0000-0000-0000-00000000000b';
do $$
declare
  n int;
  blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000005', true);
  assert (select count(*) from storage.objects where bucket_id in ('elder-photos', 'journal-photos')) = 0,
    'UUID 이름 어르신이 있어도 다른 기관 파일이 보이면 안 됨(교정 전 우회)';
  delete from storage.objects where bucket_id in ('elder-photos', 'journal-photos');
  get diagnostics n = row_count;
  assert n = 0, 'UUID 이름 어르신이 있어도 다른 기관 파일을 지우면 안 됨';
  begin
    insert into storage.objects (bucket_id, name) values ('elder-photos', '5a000000-0000-0000-0000-00000000000a/uuid-name.jpg');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'UUID 이름 어르신이 있어도 다른 기관 폴더에 올리면 거부돼야 함';

  -- UUID 이름이어도 자기 기관 어르신 파일은 정상 동작
  insert into storage.objects (bucket_id, name) values ('elder-photos', '5b000000-0000-0000-0000-00000000000b/own.jpg');
  assert (select count(*) from storage.objects where bucket_id = 'elder-photos') = 1,
    'UUID 이름 어르신도 자기 기관 파일은 보여야 함';

  -- ① 삭제: PA 요양보호사는 자기 기관 파일을 지울 수 있다
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  delete from storage.objects where bucket_id in ('elder-photos', 'journal-photos');
  get diagnostics n = row_count;
  assert n = 2, '자기 기관 파일(두 버킷)은 지울 수 있어야 함';
  reset role;
end $$;

-- 정리
delete from storage.objects;
delete from public.profiles where id in ('5a000000-0000-0000-0000-00000000000a', '5b000000-0000-0000-0000-00000000000b');

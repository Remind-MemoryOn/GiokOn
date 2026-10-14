-- 확정 일지: 상위 세션/프로필 삭제와 Storage 교체·삭제도 확정 기록을 지울 수 없다.
-- pilot_access.sql 픽스처를 재사용한다. 트랜잭션 밖 데이터는 바꾸지 않는다.
-- 변이: 최종 일지 DELETE 가드 또는 journal-photos UPDATE/DELETE 제한을 지우면 실패해야 한다.
\set ON_ERROR_STOP on
set client_min_messages = warning;

begin;
-- 운영과 같은 권한(app 스키마 USAGE 없음)에서도 정확한 보호 오류여야 한다.
revoke usage on schema app from authenticated;
set test.uid = '';

create temp table final_integrity_fixture as
select gen_random_uuid() as profile_id, gen_random_uuid() as session_id,
       gen_random_uuid() as photo_id, gen_random_uuid() as unshared_photo_id, gen_random_uuid() as draft_profile_id,
       gen_random_uuid() as draft_session_id, gen_random_uuid() as draft_photo_id,
       gen_random_uuid() as foreign_profile_id, gen_random_uuid() as foreign_journal_id,
       (select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001') as org_id;
grant select on final_integrity_fixture to authenticated;

-- 비용이 드는 워커를 만들지 않고 종료 → 확인 대기 → 사람 확정 경로를 사용한다.
update public.org_settings set ai_drafts_enabled = false
 where org_id = (select org_id from final_integrity_fixture);
insert into public.profiles (id, org_id, user_id, name, birth_year)
select profile_id, org_id, 'a0000000-0000-0000-0000-000000000002', '확정기록 검증 어르신', 1940
  from final_integrity_fixture;
insert into public.profiles (id, org_id, user_id, name, birth_year)
select draft_profile_id, org_id, 'a0000000-0000-0000-0000-000000000002', '초안정리 검증 어르신', 1940
  from final_integrity_fixture;
insert into public.profile_caregivers (org_id, profile_id, caregiver_user_id)
select f.org_id, pid, 'a0000000-0000-0000-0000-000000000002'
  from final_integrity_fixture f
  cross join lateral unnest(array[f.profile_id, f.draft_profile_id]) pid
on conflict (profile_id, caregiver_user_id) do nothing;
insert into public.consents (profile_id, org_id, user_id, consent_type, granted, version, subject_type, capacity)
select pid, f.org_id, 'a0000000-0000-0000-0000-000000000002', kind::public.consent_type,
       true, public.current_consent_version(), 'self', 'capable'
  from final_integrity_fixture f
  cross join lateral unnest(array[f.profile_id, f.draft_profile_id]) pid
  cross join unnest(array['elder_privacy_required', 'sensitive_health_voice', 'cross_border_transfer', 'ai_processing']) kind;
insert into public.sessions (id, org_id, profile_id, user_id, status, started_at, ended_at)
select session_id, org_id, profile_id, 'a0000000-0000-0000-0000-000000000002', 'ended', now(), now()
  from final_integrity_fixture;
insert into public.sessions (id, org_id, profile_id, user_id, status, started_at, ended_at)
select draft_session_id, org_id, draft_profile_id, 'a0000000-0000-0000-0000-000000000002', 'ended', now(), now()
  from final_integrity_fixture;
-- 다른 기관 메타데이터의 임의 경로가 우리 기관 Storage 를 잠그면 안 된다.
insert into public.profiles (id, org_id, user_id, name, birth_year)
select foreign_profile_id, u.org_id, u.id, '타기관 검증 어르신', 1940
  from final_integrity_fixture f cross join public.users u
 where u.id = 'a0000000-0000-0000-0000-000000000005';
insert into public.program_journals (id, profile_id, org_id, facilitator_user_id, activity_content)
select foreign_journal_id, foreign_profile_id, u.org_id, u.id, '다른 기관의 확정 기록'
  from final_integrity_fixture f cross join public.users u
 where u.id = 'a0000000-0000-0000-0000-000000000005';
set local role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000005';
update public.program_journals set status = 'final'
 where id = (select foreign_journal_id from final_integrity_fixture);
insert into public.program_journal_photos (journal_id, path)
select foreign_journal_id, draft_profile_id::text || '/cross-org-target.jpg' from final_integrity_fixture;
reset role;

set local role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
update public.program_journals set activity_content = '옛 동네 이야기를 나누었다.', status = 'final'
 where session_id = (select session_id from final_integrity_fixture);
update public.program_journals set activity_content = '옛 동네와 학교 이야기를 나누었다.', edit_reason = '확인 후 내용 보완'
 where session_id = (select session_id from final_integrity_fixture);
insert into public.program_journal_photos (id, journal_id, path)
select f.photo_id, j.id, f.profile_id::text || '/final.jpg'
  from final_integrity_fixture f join public.program_journals j on j.session_id = f.session_id;
insert into public.program_journal_photos (id, journal_id, path)
select f.unshared_photo_id, j.id, f.profile_id::text || '/unshared.jpg'
  from final_integrity_fixture f join public.program_journals j on j.session_id = f.session_id;
reset role;
insert into public.guardian_shares (profile_id, item_type, item_id, shared_by)
select profile_id, 'photo', photo_id, 'a0000000-0000-0000-0000-000000000001'
  from final_integrity_fixture;
set local role authenticated;
insert into public.program_journal_photos (id, journal_id, path)
select f.draft_photo_id, j.id, f.draft_profile_id::text || '/draft.jpg'
  from final_integrity_fixture f join public.program_journals j on j.session_id = f.draft_session_id;
insert into storage.objects (bucket_id, name)
select 'journal-photos', profile_id::text || '/final.jpg' from final_integrity_fixture
union all
select 'journal-photos', profile_id::text || '/unshared.jpg' from final_integrity_fixture
union all
select 'journal-photos', draft_profile_id::text || '/draft.jpg' from final_integrity_fixture;
insert into storage.objects (bucket_id, name)
select 'journal-photos', draft_profile_id::text || '/cross-org-target.jpg' from final_integrity_fixture;
reset role;

-- RLS 가 DELETE 를 허용하는 배정 요양보호사와 관리자 모두 상위 삭제로 우회할 수 없다.
do $$
declare
  actor uuid;
  f final_integrity_fixture%rowtype;
  blocked boolean;
begin
  select * into f from final_integrity_fixture;
  assert exists (select 1 from public.program_journals where session_id = f.session_id and status = 'final'),
    '픽스처는 실제로 확정된 세션 일지여야 함';
  assert (select count(*) from public.program_journal_revisions r join public.program_journals j on j.id = r.journal_id
           where j.session_id = f.session_id) = 1, '픽스처는 사람의 실제 수정 이력을 가져야 함';
  foreach actor in array array['a0000000-0000-0000-0000-000000000002'::uuid,
                              'a0000000-0000-0000-0000-000000000001'::uuid] loop
    set local role authenticated;
    perform set_config('test.uid', actor::text, true);
    blocked := false;
    begin
      delete from public.sessions where id = f.session_id;
    exception when insufficient_privilege then
      assert sqlerrm = 'JOURNAL_FINAL_DELETE_FORBIDDEN', '세션 삭제는 확정 일지 보호 때문에 거절돼야 함';
      blocked := true;
    end;
    assert blocked, '세션 삭제의 FK cascade 가 확정 일지를 지워서는 안 됨';
    blocked := false;
    begin
      delete from public.profiles where id = f.profile_id;
    exception when insufficient_privilege then
      assert sqlerrm = 'JOURNAL_FINAL_DELETE_FORBIDDEN', '프로필 삭제는 확정 일지 보호 때문에 거절돼야 함';
      blocked := true;
    end;
    assert blocked, '프로필 삭제의 FK cascade 가 확정 일지를 지워서는 안 됨';
    reset role;
  end loop;
  assert exists (select 1 from public.sessions where id = f.session_id), '거절된 삭제는 세션도 유지해야 함';
  assert exists (select 1 from public.profiles where id = f.profile_id), '거절된 삭제는 프로필도 유지해야 함';
  assert (select count(*) from public.program_journal_revisions r join public.program_journals j on j.id = r.journal_id
           where j.session_id = f.session_id) = 1, '거절된 cascade 는 확정 후 수정 이력을 보존해야 함';
  assert exists (select 1 from public.program_journal_photos where id = f.photo_id), '거절된 cascade 는 확정 첨부도 보존해야 함';
end $$;

-- Storage API 는 메타데이터 표 DELETE 가드와 별개다. 확정·공개된 객체 자체도 잠근다.
do $$
declare
  f final_integrity_fixture%rowtype;
  n int;
  filename text;
  blocked boolean := false;
begin
  select * into f from final_integrity_fixture;
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  foreach filename in array array['final.jpg', 'unshared.jpg'] loop
    update storage.objects set owner = 'a0000000-0000-0000-0000-000000000002'
     where bucket_id = 'journal-photos' and name = f.profile_id::text || '/' || filename;
    get diagnostics n = row_count;
    assert n = 0, '공개 여부와 무관하게 확정 사진 객체를 덮어쓸 수 없어야 함';
    update storage.objects set name = f.profile_id::text || '/renamed.jpg'
     where bucket_id = 'journal-photos' and name = f.profile_id::text || '/' || filename;
    get diagnostics n = row_count;
    assert n = 0, '확정 사진 객체를 다른 경로로 옮길 수 없어야 함';
    delete from storage.objects where bucket_id = 'journal-photos' and name = f.profile_id::text || '/' || filename;
    get diagnostics n = row_count;
    assert n = 0, '확정 사진 객체를 삭제할 수 없어야 함';
  end loop;
  begin
    update storage.objects set name = f.profile_id::text || '/final.jpg'
     where bucket_id = 'journal-photos' and name = f.draft_profile_id::text || '/draft.jpg';
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, '미확정 객체를 확정 사진 경로로 옮기는 것도 거부돼야 함(WITH CHECK)';
  reset role;
  assert exists (select 1 from storage.objects where bucket_id = 'journal-photos' and name = f.profile_id::text || '/final.jpg'
                and owner is null), '거절된 요청 뒤 원래 사진 객체가 유지돼야 함';
  assert exists (select 1 from public.guardian_shares where item_type = 'photo' and item_id = f.photo_id and revoked_at is null),
    '거절된 요청은 기존 공개 상태를 바꾸지 않아야 함';
end $$;

-- 정상 초안 사진 교체·정리와 미확정 세션 삭제는 계속 된다.
do $$
declare f final_integrity_fixture%rowtype; n int;
begin
  select * into f from final_integrity_fixture;
  set local role authenticated;
  perform set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', true);
  delete from storage.objects where bucket_id = 'journal-photos'
   and name = f.draft_profile_id::text || '/cross-org-target.jpg';
  get diagnostics n = row_count;
  assert n = 1, '다른 기관의 임의 사진 경로가 내 기관 객체의 삭제를 막으면 안 됨';
  update storage.objects set owner = 'a0000000-0000-0000-0000-000000000002'
   where bucket_id = 'journal-photos' and name = f.draft_profile_id::text || '/draft.jpg';
  get diagnostics n = row_count;
  assert n = 1, '미확정 사진 객체 교체는 유지돼야 함';
  delete from storage.objects where bucket_id = 'journal-photos' and name = f.draft_profile_id::text || '/draft.jpg';
  get diagnostics n = row_count;
  assert n = 1, '미확정 사진 객체 정리는 유지돼야 함';
  delete from public.program_journal_photos where id = f.draft_photo_id;
  get diagnostics n = row_count;
  assert n = 1, '미확정 사진 메타데이터 정리는 유지돼야 함';
  delete from public.sessions where id = f.draft_session_id;
  get diagnostics n = row_count;
  assert n = 1, '확정 일지가 없는 세션 삭제는 유지돼야 함';
  reset role;
end $$;

-- 운영자의 승인된 파기 경로는 막지 않는다(authenticated 요청이 아닌 postgres 역할).
-- test.uid 를 남겨도 SET ROLE 을 해제한 운영자 삭제를 사용자 요청으로 오인하지 않아야 한다.
delete from storage.objects where bucket_id = 'journal-photos'
 and name = (select profile_id::text || '/final.jpg' from final_integrity_fixture);
delete from public.profiles where id = (select profile_id from final_integrity_fixture);
do $$
begin
  assert not exists (select 1 from public.program_journals where session_id = (select session_id from final_integrity_fixture)),
    '승인된 운영자 파기는 확정 일지 cascade 를 실행할 수 있어야 함';
  assert not exists (select 1 from public.program_journal_photos where id = (select photo_id from final_integrity_fixture)),
    '승인된 운영자 파기는 첨부 메타데이터도 정리할 수 있어야 함';
end $$;
rollback;

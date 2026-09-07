-- W-2d · 공개 항목이 정말 그 어르신의 것인지 서버가 확인한다
--
-- 문제: `guardian_shares` 는 `(profile_id, item_type, item_id)` 를 그대로 받는다.
-- INSERT 정책이 보는 것은 `app.is_assigned_caregiver(profile_id)` 뿐이라
--   profile_id = 어르신A · item_id = **어르신B 의 일지**
-- 조합을 막을 것이 없었다. 그러면 A 의 보호자가 B 의 기록을 열람하게 된다
-- (`app.is_shared_to_me` 는 `s.profile_id` 로만 연결을 확인하므로 그대로 통과한다).
-- 손으로 잘못 눌러도, API 를 직접 두드려도 같은 결과다 → **DB 에서 막는다.**
--
-- 정합성 검사이지 권한 검사가 아니다(권한은 RLS 가 계속 본다).

create or replace function app.check_share_item_owner()
returns trigger
language plpgsql
security definer               -- 남의 어르신 행이라 RLS 로는 보이지 않는다. 존재 여부를
set search_path = public       -- 확인하려면 정책을 우회해 조회해야 한다.
as $$
declare
  owner_id uuid;
begin
  case new.item_type
    when 'journal' then
      select profile_id into owner_id from public.care_journals where id = new.item_id;
    when 'analysis', 'session_summary' then
      select profile_id into owner_id from public.session_analyses where id = new.item_id;
    when 'photo' then
      select j.profile_id into owner_id
        from public.journal_photos ph
        join public.care_journals j on j.id = ph.journal_id
       where ph.id = new.item_id;
    else
      -- 'report' 는 아직 대응 표가 없다(enum 에만 있고 쓰이지 않는다).
      -- 표가 생기면 여기에 분기를 더한다 — 그때까지는 검사할 대상이 없다.
      return new;
  end case;

  if owner_id is null then
    raise exception '공개하려는 항목(%: %)이 존재하지 않습니다.', new.item_type, new.item_id
      using errcode = 'foreign_key_violation';
  end if;
  if owner_id <> new.profile_id then
    raise exception '다른 어르신의 기록은 공개할 수 없습니다.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function app.check_share_item_owner() from public;

comment on function app.check_share_item_owner() is
  '공개 항목이 guardian_shares.profile_id 의 것인지 확인한다(어르신 교차 공개 차단).';

drop trigger if exists check_guardian_share_item_owner on public.guardian_shares;
create trigger check_guardian_share_item_owner
before insert or update of profile_id, item_type, item_id on public.guardian_shares
for each row execute function app.check_share_item_owner();

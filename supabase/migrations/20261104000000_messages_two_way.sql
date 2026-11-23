-- MemoryOn(기억온) — 보호자 메시지 양방향(2026-11-04 사용자 결정: 플로팅 대화창)
--
-- 20260901020000 은 보호자 → 담당 요양보호사 **단방향**이었다(당시 디자인에 답장 UI 가 없었다).
-- 새 플로팅 대화창 시안은 요양보호사의 답장을 그린다 → 담당 요양보호사가 **특정 보호자에게** 답한다.
--
-- 지키는 것:
--   · append-only 그대로(수정·삭제 정책 없음) — 이용 안내의 "내용과 전송 시간이 자동 저장" 약속.
--   · 읽기 범위 그대로: 담당 요양보호사 + 보낸 사람 + (새로) 받는 보호자 본인. 기관 관리자에게 열지 않는다.
--   · 보호자 메시지는 받는 사람 없이(담당 전원에게) — 기존 정책을 좁혀 sender_role 을 고정한다.
--   · 답장은 **담당 요양보호사만**, 받는 사람은 그 어르신에 **승인 연결된 보호자만**.
--     받는 사람 없는 요양보호사 메시지는 여전히 거절된다(기존 회귀 단언 유지).
begin;

alter table public.messages
  add column if not exists sender_role text not null default 'guardian',
  add column if not exists recipient_user_id uuid references public.users(id) on delete set null;

alter table public.messages drop constraint if exists messages_sender_role_check;
alter table public.messages add constraint messages_sender_role_check
  check (sender_role in ('guardian', 'caregiver'));

comment on column public.messages.sender_role is
  '보낸 쪽 — guardian(보호자 → 담당 요양보호사 전원) · caregiver(담당 요양보호사 → recipient_user_id 보호자 답장).';
comment on column public.messages.recipient_user_id is
  '요양보호사 답장의 받는 보호자. 보호자 메시지는 비운다(담당 요양보호사 전원이 받는다).';

create index if not exists idx_messages_recipient
  on public.messages(recipient_user_id, created_at desc);

-- 받는 사람이 그 어르신에 승인 연결된 보호자인가(정책 술어 — OID 로 묶이므로 app 스키마 USAGE 와 무관).
create or replace function app.is_approved_guardian_of(p_profile_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_guardians
    where profile_id = p_profile_id
      and guardian_user_id = p_user_id
      and status = 'approved'
  );
$$;
revoke all on function app.is_approved_guardian_of(uuid, uuid) from public, anon;
grant execute on function app.is_approved_guardian_of(uuid, uuid) to authenticated;

alter policy messages_select_scope on public.messages
  using (
    app.is_assigned_caregiver(profile_id)
    or sender_user_id = auth.uid()
    or recipient_user_id = auth.uid()
  );

alter policy messages_insert_guardian on public.messages
  with check (
    sender_user_id = auth.uid()
    and sender_role = 'guardian'
    and recipient_user_id is null
    and app.current_org_role() = 'guardian'
    and app.is_linked_guardian(profile_id)
  );

drop policy if exists messages_insert_caregiver_reply on public.messages;
create policy messages_insert_caregiver_reply
on public.messages
for insert
with check (
  sender_user_id = auth.uid()
  and sender_role = 'caregiver'
  and recipient_user_id is not null
  and app.is_care_team()
  and app.is_assigned_caregiver(profile_id)
  and app.is_approved_guardian_of(profile_id, recipient_user_id)
);

-- 알림: 보호자 메시지 → 담당 요양보호사 전원(기존) · 답장 → 받는 보호자 한 명.
create or replace function app.notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_role = 'caregiver' then
    if new.recipient_user_id is not null then
      insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title, body)
      values (new.org_id, new.recipient_user_id, 'message', new.profile_id, new.id,
              '요양보호사가 답장을 보냈어요', left(new.body, 200))
      on conflict do nothing;
    end if;
    return new;
  end if;
  insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title, body)
  select new.org_id, pc.caregiver_user_id, 'message', new.profile_id, new.id,
         '보호자가 메시지를 보냈어요',
         -- 알림 본문은 500자 제한 — 미리보기만 싣는다(원문은 messages 에 있다).
         left(new.body, 200)
    from public.profile_caregivers pc
   where pc.profile_id = new.profile_id
     and pc.status = 'active'
  on conflict do nothing;
  return new;
end;
$$;

commit;

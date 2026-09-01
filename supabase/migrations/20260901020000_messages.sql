-- MemoryOn(기억온) — 보호자 메시지 (보호자 → 담당 요양보호사 **단방향**)
--
-- 신규 웹 디자인(보호자 공개된 소식 50:543 "메시지 보내기" + 이용 안내 모달 69:195)이
-- 요구하는 유일한 사람↔사람 소통 경로다. 디자인에 **답장 UI 가 없고** 사용자가
-- 단방향으로 확정했다 → 요양보호사는 읽기만 하고 이 테이블에 쓰지 못한다.
--
-- 이용 안내 모달이 이용자에게 약속하는 것을 스키마가 지킨다:
--   "주고받은 메시지 내용과 전송 시간이 자동으로 저장됩니다"
--   → append-only(수정·삭제 정책 없음). 보낸 사람도 지울 수 없다.
--
-- 수신은 알림으로 간다(20260901010000_notifications) — 요양보호사 수신함 화면은
-- 디자인에 없다. 어르신 단위로 묶으므로 담당이 여럿이면 전원이 같은 메시지를 본다.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  /** 어느 어르신에 대한 문의인가 — 접근 권한도 이 어르신을 기준으로 정한다. */
  profile_id uuid not null references public.profiles(id) on delete cascade,
  /** 보낸 보호자. 탈퇴해도 기록은 남는다(누가 보냈는지는 비게 된다). */
  sender_user_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),

  constraint messages_body_check
    check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists idx_messages_profile
  on public.messages(profile_id, created_at desc);
create index if not exists idx_messages_sender
  on public.messages(sender_user_id, created_at desc);

create trigger stamp_messages_org_id
before insert on public.messages
for each row execute function app.stamp_org_id();

alter table public.messages enable row level security;

-- 읽기: 그 어르신의 **활성 담당 요양보호사** + **보낸 보호자 본인**.
-- 기관 관리자에게도 열지 않는다 — 개인 간 문의라 배정된 사람만 본다.
create policy messages_select_scope
on public.messages
for select
using (
  app.is_assigned_caregiver(profile_id)
  or sender_user_id = auth.uid()
);

-- 쓰기: **승인된 연결의 보호자만**, 자기 이름으로. 요양보호사는 여기 쓰지 못한다
-- (단방향). guardian 역할까지 확인해 요양보호사가 보호자로 위장할 수 없게 한다.
create policy messages_insert_guardian
on public.messages
for insert
with check (
  sender_user_id = auth.uid()
  and app.current_org_role() = 'guardian'
  and app.is_linked_guardian(profile_id)
);

-- UPDATE·DELETE 정책 없음 = append-only(이용 안내의 "자동 저장" 약속).

-- ──────────────────────────────────────────────────────────────────────────
-- 수신 → 알림
-- ──────────────────────────────────────────────────────────────────────────

/** 메시지가 오면 그 어르신의 활성 담당 요양보호사 모두에게 알림. */
create or replace function app.notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists notify_message on public.messages;
create trigger notify_message
after insert on public.messages
for each row execute function app.notify_message();

-- 요양보호사 화면이 폴링 없이 받도록 Realtime 에 올린다.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

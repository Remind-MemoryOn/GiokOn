-- MemoryOn(기억온) — 알림
--
-- 신규 웹 디자인의 탑바 벨 + 개수 배지가 읽는 값이다. 전용 알림 센터 화면은 디자인에
-- 없으므로 **벨 배지와 드롭다운까지**가 이 테이블의 소비처다.
--
-- 알림은 사람이 만들지 않는다 — 이미 일어난 일에서 **트리거가 파생**한다:
--   safety       안전 이벤트가 생기면 그 어르신의 활성 담당 요양보호사에게
--   share_viewed 보호자가 공개 항목을 열면(알림 받기를 켠 공개만) 공개한 사람에게
-- 그래서 INSERT 정책이 없다(deny by default) — 클라이언트는 읽고 읽음 처리만 한다.
-- append-only. safety_events(20260711100000) · guardian_shares 확인 영수증(20260831000000) 이후.

do $$
begin
  create type public.notification_kind as enum ('safety', 'share_viewed', 'message');
exception when duplicate_object then null;
end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  /** 받는 사람. */
  user_id uuid not null references public.users(id) on delete cascade,
  kind public.notification_kind not null,
  /** 어느 어르신에 대한 알림인가(있으면). */
  profile_id uuid references public.profiles(id) on delete cascade,
  /** 원본 행 id(safety_events.id · guardian_shares.id …). 화면에서 되짚어 가는 데 쓴다. */
  source_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint notifications_body_check
    check (body is null or char_length(body) <= 500)
);

create index if not exists idx_notifications_inbox
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(user_id) where read_at is null;
-- 같은 사건으로 두 번 알리지 않는다(트리거가 여러 번 돌아도 멱등).
create unique index if not exists idx_notifications_source_unique
  on public.notifications(user_id, kind, source_id) where source_id is not null;

create trigger stamp_notifications_org_id
before insert on public.notifications
for each row execute function app.stamp_org_id();

alter table public.notifications enable row level security;

-- 조회·읽음 처리는 **본인 것만**. INSERT/DELETE 정책 없음 = 트리거(정의자 권한)만 만든다.
create policy notifications_select_own
on public.notifications
for select
using (user_id = auth.uid());

create policy notifications_update_own
on public.notifications
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- 파생 트리거
-- ──────────────────────────────────────────────────────────────────────────

/** 안전 이벤트 → 그 어르신의 활성 담당 요양보호사 모두에게. */
create or replace function app.notify_safety_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title, body)
  select new.org_id, pc.caregiver_user_id, 'safety', new.profile_id, new.id,
         '안전 알림이 있어요', new.caregiver_alert
    from public.profile_caregivers pc
   where pc.profile_id = new.profile_id
     and pc.status = 'active'
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists notify_safety_event on public.safety_events;
create trigger notify_safety_event
after insert on public.safety_events
for each row execute function app.notify_safety_event();

/** 보호자가 공개 항목을 처음 열면 → 공개한 사람에게(알림 받기를 켠 공개만). */
create or replace function app.notify_share_viewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.notify_on_view
     and new.viewed_at is not null
     and old.viewed_at is null
     and new.shared_by is not null then
    insert into public.notifications (org_id, user_id, kind, profile_id, source_id, title, body)
    values (new.org_id, new.shared_by, 'share_viewed', new.profile_id, new.id,
            '보호자가 공개한 기록을 확인했어요', null)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_share_viewed on public.guardian_shares;
create trigger notify_share_viewed
after update on public.guardian_shares
for each row execute function app.notify_share_viewed();

-- 앱·웹이 배지를 바로 갱신하도록 Realtime 에 올린다.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

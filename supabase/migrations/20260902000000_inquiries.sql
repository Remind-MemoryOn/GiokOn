-- 기억온 문의사항 — 공개/비공개 게시판 + 운영자 답변.
--
-- 비공개 규약(2026-09-02 사용자 확정):
--   비공개 문의의 **제목과 본문은 작성자와 사이트 운영자만** 볼 수 있다.
--   목록에는 행이 남지만(작성일·답변 여부는 게시판 운영에 필요) 제목은 잠금 문구로 대체한다.
--   본문·답변은 RLS 가 막고(비로그인은 select 자체가 없다), 목록 함수는 아래에서 직접 가린다.

alter table public.users add column if not exists is_site_admin boolean not null default false;

do $$ begin create type public.inquiry_visibility as enum ('public', 'private'); exception when duplicate_object then null; end $$;
do $$ begin create type public.inquiry_status as enum ('waiting', 'answered'); exception when duplicate_object then null; end $$;

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 100),
  content text not null check (char_length(btrim(content)) between 2 and 5000),
  visibility public.inquiry_visibility not null default 'private',
  status public.inquiry_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiry_replies (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  content text not null check (char_length(btrim(content)) between 2 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiries_created_idx on public.inquiries(created_at desc);
create index if not exists inquiry_replies_inquiry_idx on public.inquiry_replies(inquiry_id, created_at);

create or replace function app.is_site_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_site_admin from public.users where id = auth.uid()), false)
$$;
revoke execute on function app.is_site_admin() from public;
grant execute on function app.is_site_admin() to authenticated;

-- 운영자 플래그는 운영자(또는 service_role)만 바꾼다 — 셀프 승격 차단.
create or replace function app.protect_site_admin_flag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_site_admin is distinct from old.is_site_admin
     and coalesce(auth.role(), '') <> 'service_role'
     and not app.is_site_admin() then
    raise exception '사이트 운영자 권한을 변경할 수 없습니다' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists users_protect_site_admin on public.users;
create trigger users_protect_site_admin before update of is_site_admin on public.users for each row execute function app.protect_site_admin_flag();

-- 작성자 표시는 늘 마스킹한다(홍길동 → 홍*동).
create or replace function public.mask_inquiry_author(value text) returns text language sql immutable set search_path = public as $$
  select case
    when value is null or btrim(value) = '' then '이용자'
    when char_length(btrim(value)) = 1 then btrim(value) || '*'
    when char_length(btrim(value)) = 2 then left(btrim(value), 1) || '*'
    else left(btrim(value), 1) || repeat('*', char_length(btrim(value)) - 2) || right(btrim(value), 1)
  end
$$;

-- 목록. security definer 라서 RLS 를 우회하므로 **가시성 판정을 함수 안에서 직접 한다**.
--   공개 = 누구나(비로그인 포함) 제목까지 / 비공개 = 작성자·운영자만 제목,
--   그 외에는 locked=true 로 잠금 문구만 나간다.  본문은 이 함수가 아예 반환하지 않는다.
create or replace function public.list_inquiries()
returns table (
  id uuid,
  title text,
  masked_author text,
  visibility public.inquiry_visibility,
  status public.inquiry_status,
  created_at timestamptz,
  reply_count bigint,
  locked boolean
)
language sql stable security definer set search_path = public as $$
  with viewer as (
    select auth.uid() as uid,
           coalesce((select u.is_site_admin from public.users u where u.id = auth.uid()), false) as is_admin
  )
  select
    i.id,
    case when i.visibility = 'public' or i.author_id = v.uid or v.is_admin
      then i.title else '비공개 문의입니다' end,
    case when i.visibility = 'public' or i.author_id = v.uid or v.is_admin
      then public.mask_inquiry_author(a.name) else '비공개' end,
    i.visibility,
    i.status,
    i.created_at,
    (select count(*) from public.inquiry_replies r where r.inquiry_id = i.id),
    not (i.visibility = 'public' or i.author_id = v.uid or v.is_admin)
  from public.inquiries i
  join public.users a on a.id = i.author_id
  cross join viewer v
  order by i.created_at desc
$$;
revoke execute on function public.list_inquiries() from public;
grant execute on function public.list_inquiries() to anon, authenticated;

alter table public.inquiries enable row level security;
alter table public.inquiry_replies enable row level security;

-- 본문 접근. 비로그인(anon)에는 정책이 없으므로 select 자체가 0건이다.
drop policy if exists inquiries_read on public.inquiries;
create policy inquiries_read on public.inquiries for select to authenticated using (
  visibility = 'public' or author_id = auth.uid() or app.is_site_admin()
);
drop policy if exists inquiries_insert on public.inquiries;
create policy inquiries_insert on public.inquiries for insert to authenticated with check (author_id = auth.uid() and status = 'waiting');
drop policy if exists inquiries_update on public.inquiries;
create policy inquiries_update on public.inquiries for update to authenticated using (author_id = auth.uid() or app.is_site_admin()) with check (author_id = auth.uid() or app.is_site_admin());
drop policy if exists inquiries_delete on public.inquiries;
create policy inquiries_delete on public.inquiries for delete to authenticated using (author_id = auth.uid() or app.is_site_admin());

drop policy if exists inquiry_replies_read on public.inquiry_replies;
create policy inquiry_replies_read on public.inquiry_replies for select to authenticated using (
  exists (select 1 from public.inquiries i where i.id = inquiry_id and (i.visibility = 'public' or i.author_id = auth.uid() or app.is_site_admin()))
);
drop policy if exists inquiry_replies_admin_insert on public.inquiry_replies;
create policy inquiry_replies_admin_insert on public.inquiry_replies for insert to authenticated with check (author_id = auth.uid() and app.is_site_admin());
drop policy if exists inquiry_replies_admin_update on public.inquiry_replies;
create policy inquiry_replies_admin_update on public.inquiry_replies for update to authenticated using (app.is_site_admin()) with check (app.is_site_admin());
drop policy if exists inquiry_replies_admin_delete on public.inquiry_replies;
create policy inquiry_replies_admin_delete on public.inquiry_replies for delete to authenticated using (app.is_site_admin());

grant select, insert, update, delete on public.inquiries to authenticated;
grant select, insert, update, delete on public.inquiry_replies to authenticated;
-- ⚠️ Supabase 는 public 스키마 신규 테이블에 anon 권한을 기본으로 붙인다(alter default privileges).
--    이 두 테이블의 정책은 전부 `to authenticated` 라 RLS 만으로도 anon 은 0건이지만,
--    문의 본문은 권한 자체를 떼어 이중으로 막는다. anon 의 유일한 경로는 list_inquiries() 다.
revoke all on public.inquiries from anon;
revoke all on public.inquiry_replies from anon;

-- 작성자·상태는 본인이 못 바꾼다(상태는 답변 유무에서 파생).
create or replace function app.protect_inquiry_admin_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not app.is_site_admin() and (new.author_id is distinct from old.author_id or new.status is distinct from old.status) then
    raise exception '문의 상태와 작성자는 운영자만 변경할 수 있습니다' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists inquiries_protect_admin_fields on public.inquiries;
create trigger inquiries_protect_admin_fields before update on public.inquiries for each row execute function app.protect_inquiry_admin_fields();

create or replace function public.sync_inquiry_answered() returns trigger language plpgsql security definer set search_path = public as $$
declare v_inquiry_id uuid;
begin
  v_inquiry_id := case when tg_op = 'DELETE' then old.inquiry_id else new.inquiry_id end;
  update public.inquiries set status = case when exists(select 1 from public.inquiry_replies where inquiry_id = v_inquiry_id) then 'answered'::public.inquiry_status else 'waiting'::public.inquiry_status end,
    updated_at = now() where id = v_inquiry_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists inquiry_reply_status on public.inquiry_replies;
create trigger inquiry_reply_status after insert or delete on public.inquiry_replies for each row execute function public.sync_inquiry_answered();

notify pgrst, 'reload schema';

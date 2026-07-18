-- MemoryOn(기억온) — 보호자↔어르신 연결: 초대 코드 + 승인 워크플로
-- (T17.1·T17.7 / M17.1·M17.7 / Phase W1)
--
-- 흐름(확정, 2026-07-16):
--   1) 요양보호사가 어르신 상세에서 초대 코드 발급(1회성·72h, QR=코드 URL).
--   2) 보호자가 코드를 입력(온보딩 중 또는 로그인 후 "어르신 연결") →
--      redeem_guardian_invite → 기관 합류(org_id) + 연결 pending.
--   3) 요양보호사가 승인(approved) → 이후 보호자는 공개 커밋(guardian_shares,
--      후속 마이그레이션) 경유 데이터만 열람.
-- 검색·이름노출형 연결은 배제(개인정보 노출 리스크). MVP=보호자 1계정↔1기관.
--
-- append-only. 인증 개편(20260718110000) 이후 적용.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 초대 코드 생성 헬퍼 (혼동 문자 제외 8자)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function app.generate_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random() * 31) + 1)::int, 1),
    ''
  )
  from generate_series(1, 8);
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) guardian_invites — 어르신별 1회성·72h 만료 초대 코드
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.guardian_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique default app.generate_invite_code(),
  created_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '72 hours',
  used_by uuid references public.users(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guardian_invites_code_check
    check (char_length(btrim(code)) between 6 and 32),
  constraint guardian_invites_used_pair_check
    check (
      (used_at is null and used_by is null)
      or (used_at is not null and used_by is not null)
    )
);

create index if not exists idx_guardian_invites_org
  on public.guardian_invites(org_id, created_at desc);
create index if not exists idx_guardian_invites_profile
  on public.guardian_invites(profile_id, created_at desc);

create trigger set_guardian_invites_updated_at
before update on public.guardian_invites
for each row execute function app.set_updated_at();

create trigger stamp_guardian_invites_org_id
before insert on public.guardian_invites
for each row execute function app.stamp_org_id();

create trigger audit_guardian_invites
after insert or update or delete on public.guardian_invites
for each row execute function app.write_audit_log();

alter table public.guardian_invites enable row level security;

-- 조회·발급·취소: 기관 돌봄 구성원(비 guardian)만. 보호자는 코드를 RPC 로만 사용.
create policy guardian_invites_select_org
on public.guardian_invites
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

create policy guardian_invites_insert_scope
on public.guardian_invites
for insert
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (created_by is null or created_by = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.org_id = app.current_org_id()
  )
);

create policy guardian_invites_update_org
on public.guardian_invites
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
)
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- 삭제 정책 없음(deny by default): 사용 이력은 감사 대상.

-- ──────────────────────────────────────────────────────────────────────────
-- 3) profile_guardians — 어르신↔보호자 연결(승인 워크플로)
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  create type public.guardian_link_status as enum ('pending', 'approved', 'revoked');
exception when duplicate_object then null;
end $$;

create table if not exists public.profile_guardians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  guardian_user_id uuid not null references public.users(id) on delete cascade,
  status public.guardian_link_status not null default 'pending',
  invited_via uuid references public.guardian_invites(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profile_guardians_unique unique (profile_id, guardian_user_id),
  constraint profile_guardians_approved_pair_check
    check (
      status <> 'approved'
      or (approved_by is not null and approved_at is not null)
    ),
  constraint profile_guardians_revoked_check
    check (status <> 'revoked' or revoked_at is not null)
);

create index if not exists idx_profile_guardians_guardian
  on public.profile_guardians(guardian_user_id, status);
create index if not exists idx_profile_guardians_profile
  on public.profile_guardians(profile_id, status);
create index if not exists idx_profile_guardians_org
  on public.profile_guardians(org_id, created_at desc);

create trigger set_profile_guardians_updated_at
before update on public.profile_guardians
for each row execute function app.set_updated_at();

create trigger audit_profile_guardians
after insert or update or delete on public.profile_guardians
for each row execute function app.write_audit_log();

alter table public.profile_guardians enable row level security;

-- 조회: 보호자=본인 연결만 / 기관 돌봄 구성원=기관 연결 전체(승인 관리 화면).
create policy profile_guardians_select_scope
on public.profile_guardians
for select
using (
  guardian_user_id = auth.uid()
  or (org_id = app.current_org_id() and app.current_org_role() <> 'guardian')
);

-- 연결 생성은 redeem_guardian_invite(security definer) 경유만 — insert 정책 없음.

-- 승인·철회: 기관 돌봄 구성원(비 guardian). 승인자는 본인으로만 기록.
create policy profile_guardians_update_org
on public.profile_guardians
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
)
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (approved_by is null or approved_by = auth.uid())
);

-- 삭제 정책 없음(deny by default): 연결 이력은 철회(revoked)로만 종료.

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 승인된 보호자 연결 헬퍼 + 보호자의 어르신 기본정보 열람
-- ──────────────────────────────────────────────────────────────────────────
-- RLS 정책 간 재귀를 피하기 위해 security definer 로 연결 여부만 판정한다.
-- guardian_shares(후속) RLS 도 이 헬퍼를 재사용한다.

create or replace function app.is_linked_guardian(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_guardians
    where profile_id = p_profile_id
      and guardian_user_id = auth.uid()
      and status = 'approved'
  );
$$;

-- 승인된 보호자는 연결 어르신의 기본 정보(이름 등 profiles row)를 볼 수 있다.
-- 세션·연대기·일지 등 하위 데이터는 여전히 공개 커밋(guardian_shares) 경유만.
create policy profiles_select_guardian_linked
on public.profiles
for select
using (app.is_linked_guardian(id));

-- 기관 돌봄 구성원(비 guardian)은 승인 판단을 위해 소속 기관 보호자 계정
-- (이름·연락처)을 볼 수 있다. 보호자는 여전히 본인 row 만 볼 수 있다.
create policy users_select_org_guardians
on public.users
for select
using (
  role = 'guardian'
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) redeem_guardian_invite — 초대 코드 사용(온보딩·로그인 후 공용 RPC)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.redeem_guardian_invite(p_code text)
returns public.profile_guardians
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
  v_invite public.guardian_invites;
  v_link public.profile_guardians;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  select * into v_user from public.users where id = v_uid for update;
  if not found then
    raise exception '가입 정보를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_user.role <> 'guardian' then
    raise exception '보호자 계정만 초대 코드를 사용할 수 있습니다' using errcode = 'P0001';
  end if;

  select * into v_invite
    from public.guardian_invites
    where code = upper(btrim(p_code))
    for update;
  if not found then
    raise exception '유효하지 않은 초대 코드입니다' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null then
    raise exception '취소된 초대 코드입니다' using errcode = 'P0001';
  end if;
  if v_invite.used_at is not null then
    raise exception '이미 사용된 초대 코드입니다' using errcode = 'P0001';
  end if;
  if v_invite.expires_at < now() then
    raise exception '만료된 초대 코드입니다(발급 후 72시간)' using errcode = 'P0001';
  end if;

  -- MVP: 보호자 1계정 ↔ 1기관. 첫 연결 기관으로 합류, 타 기관 코드는 거부.
  if v_user.org_id is null then
    update public.users set org_id = v_invite.org_id where id = v_uid;
  elsif v_user.org_id <> v_invite.org_id then
    raise exception '다른 기관의 초대 코드입니다. 기관당 한 계정만 연결할 수 있습니다'
      using errcode = 'P0001';
  end if;

  -- 기존 연결 상태별 처리(중복 연결 방지·철회 후 재연결 허용).
  select * into v_link
    from public.profile_guardians
    where profile_id = v_invite.profile_id and guardian_user_id = v_uid
    for update;

  if found then
    if v_link.status = 'approved' then
      raise exception '이미 연결된 어르신입니다' using errcode = 'P0001';
    elsif v_link.status = 'pending' then
      raise exception '이미 승인 대기 중인 연결입니다' using errcode = 'P0001';
    else
      update public.profile_guardians
        set status = 'pending',
            invited_via = v_invite.id,
            approved_by = null,
            approved_at = null,
            revoked_at = null
        where id = v_link.id
        returning * into v_link;
    end if;
  else
    insert into public.profile_guardians (org_id, profile_id, guardian_user_id, status, invited_via)
      values (v_invite.org_id, v_invite.profile_id, v_uid, 'pending', v_invite.id)
      returning * into v_link;
  end if;

  -- 1회성: 코드 소진 처리.
  update public.guardian_invites
    set used_by = v_uid, used_at = now()
    where id = v_invite.id;

  return v_link;
end;
$$;

revoke execute on function public.redeem_guardian_invite(text) from public;
grant execute on function public.redeem_guardian_invite(text) to authenticated;

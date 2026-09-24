-- 파일럿 계획 D3 후반 (tasks T22.7) — 직원이 같은 기관에 합류하는 길(파일럿 블로커)
--
-- ■ 문제
--   2026-07-25 이후 요양보호사 온보딩은 **항상 새 기관 + org_admin** 을 만든다. 1기관·여러 직원 파일럿이 성립하지 않는다.
--
-- ■ 방식(파일럿 계획 §5 "직원 합류와 역할 부여")
--   · org_invites       — 기관이 발급하는 초대 코드(합류 후 역할·만료·회수). 발급·회수는 org_admin·center_director 만.
--                          합류 후 역할에 guardian·org_admin 은 넣지 않는다.
--   · 온보딩에서 초대 코드를 넣으면 **가입(이름·전화·계정 동의)은 끝내되 users.org_id 는 NULL** 로 두고
--     org_join_requests(pending) 만 만든다 — "org_id 가 없으면 데이터 0건" 불변식을 그대로 쓴다.
--   · approve_org_join  — org_admin·center_director 만, 자기 요청 불가. 승인하면 users.org_id·역할이 정해진다.
--     ⚠️ 기관 단위 열람(D4)에서는 **승인 = 기관 전체 어르신 기록 열람**이다 — 승인 화면(웹 W6)에 그 사실을 명시한다.
--   · 기존 어르신 코드 배정(claim_elder_by_code 등)은 지우지 않는다 — "내 담당" 표시로 남는다.
--
-- ■ 웹 인계(W9·W6, 이 세션 범위 밖)
--   · 합류 대기자는 onboarded_at 이 있고 org_id 가 NULL 이다. 지금 웹 라우팅(routeForUser)은 그를 /caregiver 로 보내
--     빈 화면(데이터 0건)을 보여 준다 — W9 에서 "승인 대기" 화면으로 보내야 한다.
--   · 이미 자기 기관을 만든 기존 계정이 다른 기관으로 옮기는 경로는 없다(org_id 가 있으면 합류 요청 불가).

-- ──────────────────────────────────────────────────────────────────────────
-- 테이블
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  role public.org_role not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  constraint org_invites_role_check check (role in ('caregiver', 'social_worker', 'center_director')),
  constraint org_invites_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint org_invites_revoke_pair check ((revoked_at is null) = (revoked_by is null))
);
create index if not exists org_invites_org_idx on public.org_invites (org_id, created_at desc);

do $$ begin
  create type public.org_join_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.org_join_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  invite_id uuid not null references public.org_invites(id) on delete cascade,
  requested_role public.org_role not null,
  -- 요청자는 승인 전 기관 구성원이 아니라 users 행이 관리자에게 보이지 않는다 → 승인 판단용 이름만 남긴다.
  requester_name text not null,
  status public.org_join_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint org_join_requests_role_check check (requested_role in ('caregiver', 'social_worker', 'center_director')),
  constraint org_join_requests_name_check check (char_length(btrim(requester_name)) between 1 and 50),
  constraint org_join_requests_decision_check check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status = 'cancelled' and decided_at is not null)
    or (status in ('approved', 'rejected') and decided_at is not null and decided_by is not null))
);
-- 한 사람은 동시에 하나의 대기 요청만.
create unique index if not exists org_join_requests_one_pending
  on public.org_join_requests (user_id) where status = 'pending';
create index if not exists org_join_requests_org_idx on public.org_join_requests (org_id, status, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — 읽기만 정책으로, 쓰기는 전부 RPC(아래)로만
-- ──────────────────────────────────────────────────────────────────────────
alter table public.org_invites enable row level security;
alter table public.org_join_requests enable row level security;
revoke all on public.org_invites from anon;
revoke all on public.org_join_requests from anon;
revoke insert, update, delete on public.org_invites from authenticated;
revoke insert, update, delete on public.org_join_requests from authenticated;

drop policy if exists org_invites_select_manager on public.org_invites;
create policy org_invites_select_manager on public.org_invites for select
  using (org_id = app.current_org_id() and app.is_org_manager());

drop policy if exists org_join_requests_select_scope on public.org_join_requests;
create policy org_join_requests_select_scope on public.org_join_requests for select
  using (user_id = auth.uid() or (org_id = app.current_org_id() and app.is_org_manager()));

-- ──────────────────────────────────────────────────────────────────────────
-- 초대 발급·회수
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.create_org_invite(p_role public.org_role, p_valid_days integer default 7)
returns public.org_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  invite public.org_invites%rowtype;
  attempt int := 0;
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.org_id is null or actor.onboarded_at is null
     or actor.role not in ('org_admin', 'center_director') then
    raise exception 'ORG_INVITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('caregiver', 'social_worker', 'center_director') then
    raise exception 'ORG_INVITE_ROLE' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 30 then
    raise exception 'ORG_INVITE_EXPIRY' using errcode = '22023';
  end if;
  loop
    attempt := attempt + 1;
    begin
      insert into public.org_invites (org_id, code, role, created_by, expires_at)
      values (actor.org_id, app.generate_invite_code(), p_role, actor.id, now() + make_interval(days => p_valid_days))
      returning * into invite;
      exit;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (actor.id, actor.org_id, 'org_invite_create', 'org_invites', invite.id::text,
          jsonb_build_object('role', p_role, 'expires_at', invite.expires_at));
  return invite;
end $$;

create or replace function public.revoke_org_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor public.users%rowtype; n int;
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.org_id is null or actor.onboarded_at is null
     or actor.role not in ('org_admin', 'center_director') then
    raise exception 'ORG_INVITE_FORBIDDEN' using errcode = '42501';
  end if;
  update public.org_invites set revoked_at = now(), revoked_by = actor.id
   where id = p_invite_id and org_id = actor.org_id and revoked_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'ORG_INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id)
  values (actor.id, actor.org_id, 'org_invite_revoke', 'org_invites', p_invite_id::text);
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 합류 요청 — 내부 함수(온보딩과 재요청이 공유). 호출자 검증은 부르는 쪽이 한다.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.enqueue_org_join(p_user uuid, p_code text, p_name text)
returns public.org_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.org_invites%rowtype;
  request public.org_join_requests%rowtype;
begin
  -- 만료·회수·없는 코드는 같은 오류 — 어떤 코드가 실재하는지 흘리지 않는다.
  select * into invite from public.org_invites
   where code = upper(btrim(p_code)) and revoked_at is null and expires_at > now()
   for share;
  if invite.id is null then
    raise exception 'ORG_INVITE_INVALID' using errcode = '22023';
  end if;
  begin
    insert into public.org_join_requests (org_id, user_id, invite_id, requested_role, requester_name)
    values (invite.org_id, p_user, invite.id, invite.role, left(btrim(p_name), 50))
    returning * into request;
  exception when unique_violation then
    raise exception 'ORG_JOIN_PENDING' using errcode = '23505';
  end;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (p_user, invite.org_id, 'org_join_request', 'org_join_requests', request.id::text,
          jsonb_build_object('invite_id', invite.id, 'role', invite.role));
  return request;
end $$;
revoke all on function app.enqueue_org_join(uuid, text, text) from public, anon, authenticated;

-- 이미 가입했지만 기관이 없는 사람(거절·취소 후, 다른 코드로 다시)의 합류 요청.
create or replace function public.request_org_join(p_code text)
returns public.org_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare me public.users%rowtype;
begin
  select * into me from public.users where id = auth.uid() for update;
  if me.id is null or me.onboarded_at is null or me.org_id is not null or me.role = 'guardian' then
    raise exception 'ORG_JOIN_FORBIDDEN' using errcode = '42501';
  end if;
  return app.enqueue_org_join(me.id, p_code, me.name);
end $$;

create or replace function public.cancel_org_join()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.org_join_requests set status = 'cancelled', decided_at = now()
   where user_id = auth.uid() and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'ORG_JOIN_NOT_FOUND' using errcode = 'P0002';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 승인·거절 — org_admin·center_director 만, 같은 기관 요청만, 자기 요청 불가
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.decide_org_join(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  request public.org_join_requests%rowtype;
  joiner public.users%rowtype;
  invite_revoked boolean;
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.org_id is null or actor.onboarded_at is null
     or actor.role not in ('org_admin', 'center_director') then
    raise exception 'ORG_JOIN_FORBIDDEN' using errcode = '42501';
  end if;
  select * into request from public.org_join_requests where id = p_request_id for update;
  -- 다른 기관 요청은 없는 것처럼 — 존재를 흘리지 않는다.
  if request.id is null or request.org_id is distinct from actor.org_id then
    raise exception 'ORG_JOIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if request.user_id = actor.id then
    raise exception 'ORG_JOIN_SELF' using errcode = '42501';
  end if;
  if request.status <> 'pending' then
    raise exception 'ORG_JOIN_NOT_PENDING' using errcode = '22023';
  end if;

  if p_approve then
    select revoked_at is not null into invite_revoked from public.org_invites where id = request.invite_id;
    if invite_revoked then
      raise exception 'ORG_JOIN_INVITE_REVOKED' using errcode = '22023';
    end if;
    select * into joiner from public.users where id = request.user_id for update;
    if joiner.id is null or joiner.org_id is not null or joiner.onboarded_at is null or joiner.role = 'guardian' then
      raise exception 'ORG_JOIN_STALE' using errcode = '22023';
    end if;
    update public.users set org_id = request.org_id, role = request.requested_role, updated_at = now()
     where id = joiner.id;
  end if;

  update public.org_join_requests
     set status = case when p_approve then 'approved'::public.org_join_status else 'rejected'::public.org_join_status end,
         decided_at = now(), decided_by = actor.id
   where id = request.id;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (actor.id, actor.org_id, case when p_approve then 'org_join_approve' else 'org_join_reject' end,
          'org_join_requests', request.id::text,
          jsonb_build_object('user_id', request.user_id, 'role', request.requested_role));
end $$;
revoke all on function app.decide_org_join(uuid, boolean) from public, anon, authenticated;

create or replace function public.approve_org_join(p_request_id uuid)
returns void language sql security definer set search_path = public
as $$ select app.decide_org_join(p_request_id, true); $$;

create or replace function public.reject_org_join(p_request_id uuid)
returns void language sql security definer set search_path = public
as $$ select app.decide_org_join(p_request_id, false); $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 온보딩 — 요양보호사 경로에 "초대 코드로 합류" 추가
-- ──────────────────────────────────────────────────────────────────────────
-- 시그니처가 바뀌므로 옛 것을 지운다(20260910010000 과 같은 이유 — 느슨한 오버로드가 남지 않게).
drop function if exists public.complete_onboarding(text,text,text,text,text,text[],text,boolean);
create or replace function public.complete_onboarding(
  p_name text,
  p_phone text,
  p_role text,
  p_org_name text default null,
  p_elder_code text default null,
  p_consents text[] default null,
  p_consent_version text default null,
  p_social_acknowledged boolean default null,
  p_invite_code text default null
) returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user public.users;
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  select * into v_user from public.users where id = v_uid for update;
  if not found then
    raise exception '가입 정보를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_user.onboarded_at is not null then
    raise exception '이미 온보딩을 완료한 계정입니다' using errcode = 'P0001';
  end if;

  if p_consent_version is distinct from 'v1.0'
    or p_social_acknowledged is distinct from true
    or p_consents is null or not ('privacy_required' = any(p_consents))
    or exists(select 1 from unnest(p_consents) c where c is null or c not in ('privacy_required','marketing_optional')) then
    raise exception '현재 개인정보 동의와 소셜 정보 제공 확인이 필요합니다' using errcode = '22000';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception '이름을 입력해 주세요' using errcode = '22000';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception '전화번호를 입력해 주세요' using errcode = '22000';
  end if;

  if p_role = 'caregiver' and nullif(btrim(p_invite_code), '') is not null then
    -- 초대 코드로 합류: 가입은 끝내되 기관·역할은 **승인 전까지 정하지 않는다**(org_id NULL = 데이터 0건).
    if nullif(btrim(p_org_name), '') is not null then
      raise exception '새 기관 만들기와 초대 코드 합류 중 하나만 선택해 주세요' using errcode = '22000';
    end if;
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          role = 'caregiver', onboarded_at = now()
      where id = v_uid;
    perform app.enqueue_org_join(v_uid, p_invite_code, btrim(p_name));

  elsif p_role = 'caregiver' then
    -- 요양보호사 = 소속 기관명 입력 → 기관 생성 + 기관 관리자.
    if nullif(btrim(p_org_name), '') is null then
      raise exception '소속 기관명을 입력해 주세요' using errcode = '22000';
    end if;
    insert into public.organizations (name)
      values (left(btrim(p_org_name), 100))
      returning id into v_org_id;
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          org_id = v_org_id, role = 'org_admin', onboarded_at = now()
      where id = v_uid;

  elsif p_role = 'guardian' then
    if nullif(btrim(p_invite_code), '') is not null then
      raise exception '보호자는 기관 초대 코드로 합류할 수 없습니다' using errcode = '22000';
    end if;
    update public.users
      set name = left(btrim(p_name), 50), phone = btrim(p_phone),
          role = 'guardian', onboarded_at = now()
      where id = v_uid;
    if nullif(btrim(p_elder_code), '') is not null then
      perform public.link_guardian_by_elder_code(p_elder_code);
    end if;

  else
    raise exception '역할은 caregiver 또는 guardian 이어야 합니다' using errcode = '22000';
  end if;

  -- Account evidence must also exist for a guardian with no organization.
  insert into public.consents
    (user_id, consent_type, granted, version, subject_type, capacity, basis)
  select v_uid, t.x::public.consent_type, true, p_consent_version, 'self', 'capable',
    '온보딩: 개인정보 수집·이용 동의 및 소셜 계정 정보 제공 확인'
  from (select distinct unnest(p_consents) x) t;
  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;

revoke all on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean,text) from public, anon;
grant execute on function public.complete_onboarding(text,text,text,text,text,text[],text,boolean,text) to authenticated;
revoke all on function public.create_org_invite(public.org_role, integer) from public, anon;
grant execute on function public.create_org_invite(public.org_role, integer) to authenticated;
revoke all on function public.revoke_org_invite(uuid) from public, anon;
grant execute on function public.revoke_org_invite(uuid) to authenticated;
revoke all on function public.request_org_join(text) from public, anon;
grant execute on function public.request_org_join(text) to authenticated;
revoke all on function public.cancel_org_join() from public, anon;
grant execute on function public.cancel_org_join() to authenticated;
revoke all on function public.approve_org_join(uuid) from public, anon;
grant execute on function public.approve_org_join(uuid) to authenticated;
revoke all on function public.reject_org_join(uuid) from public, anon;
grant execute on function public.reject_org_join(uuid) to authenticated;

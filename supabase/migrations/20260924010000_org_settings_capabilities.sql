-- 파일럿 계획 D3 (tasks T22.2) — 기관 설정 · 위임 권한표 · 역할 부여 RPC
--
-- ■ 무엇을 만드나
--   1) app.is_care_team() / app.is_org_manager() / app.has_capability() — 판정 헬퍼.
--      (계획 표는 앞의 둘을 D4 로 적었지만 이 파일의 새 테이블 정책이 바로 쓰므로 여기서 만든다.)
--   2) org_settings      — 시설 유형·목표 시간·기본 피할 주제·기본 프로그램 유형·기본 장소(기관 1행).
--   3) org_capabilities  — 위임 가능한 **3종만**(일지 확정·공개 철회·보호자 연결 승인) × 허용 역할.
--      행이 없으면 기본 집합(org_admin·social_worker·center_director)으로 폴백 — 기존 기관이 안전하다.
--   4) 기관 생성 시 두 테이블을 시드하는 트리거 + 기존 기관 백필.
--   5) public.set_member_role(target, role) — users.role 3중 잠금(20260908000000)의 **신뢰된 우회로**.
--
-- ■ 지키는 원칙(파일럿 계획 §11)
--   · 위임 대상은 3종뿐이다. 위기 대응·출력 검열·진단표현 금지·Clova 경유는 enum 에 **넣지 않는다** —
--     넣는 순간 안전 구조가 설정 한 줄로 꺼진다.
--   · 권한표·기관 설정 편집은 위임 대상이 아니다 — org_admin·center_director 고정.
--   · 역할 부여: 자기 자신 불가(셀프 승격 차단) · 보호자 ↔ 돌봄팀 전환 불가 · 마지막 org_admin 강등 불가 ·
--     다른 기관 구성원 불가 · 감사 로그 기록.
--   · 목표 시간은 **최대 10분**(사용자 확정 2026-09-24, 서버 고정 상한).

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 판정 헬퍼 — definer 로 users 를 읽어 RLS 재귀를 피한다(기존 current_org_role 과 같은 방식)
-- ──────────────────────────────────────────────────────────────────────────
-- 돌봄팀 = 보호자가 아닌 기관 구성원. 기존 술어 `current_org_role() <> 'guardian'` 과 같은 뜻이지만
-- 역할을 **명시적으로 나열**한다 — 앞으로 enum 에 값이 늘어도 자동으로 돌봄팀이 되지 않게.
create or replace function app.is_care_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('org_admin', 'caregiver', 'social_worker', 'center_director')
       from public.users where id = auth.uid() and org_id is not null),
    false
  );
$$;

-- 기관 관리 역할(권한표·설정·역할 부여·합류 승인). 위임 불가.
create or replace function app.is_org_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('org_admin', 'center_director')
       from public.users where id = auth.uid() and org_id is not null),
    false
  );
$$;

do $$ begin
  create type public.org_capability as enum ('journal_finalize', 'share_revoke', 'guardian_link_approve');
exception when duplicate_object then null;
end $$;

-- 권한표 행이 없을 때의 기본 허용 역할(기획서 예시: 사회복지사·센터장 + 관리자).
create or replace function app.default_capability_roles()
returns public.org_role[]
language sql immutable
as $$
  select array['org_admin', 'social_worker', 'center_director']::public.org_role[];
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) org_settings
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  facility_type text,
  target_minutes smallint not null default 10,
  default_avoid_topics text[] not null default '{}',
  default_program_type text not null default '인지활동 - 회상훈련',
  default_location text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint org_settings_facility_type_check
    check (facility_type is null or facility_type in ('nursing_home', 'day_care')),
  -- 세션 1회 최대 10분(서버 고정 상한). 기관이 늘릴 수 없다.
  constraint org_settings_target_minutes_check check (target_minutes between 5 and 10),
  constraint org_settings_avoid_topics_check
    check (cardinality(default_avoid_topics) <= 30
      and coalesce(array_position(default_avoid_topics, null), 0) = 0),
  constraint org_settings_program_type_check
    check (char_length(btrim(default_program_type)) between 1 and 60),
  constraint org_settings_location_check
    check (default_location is null or char_length(btrim(default_location)) between 1 and 60)
);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) org_capabilities
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.org_capabilities (
  org_id uuid not null references public.organizations(id) on delete cascade,
  capability public.org_capability not null,
  allowed_roles public.org_role[] not null default app.default_capability_roles(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, capability),
  -- 보호자는 어떤 위임도 받을 수 없다.
  constraint org_capabilities_no_guardian check (not ('guardian' = any(allowed_roles))),
  constraint org_capabilities_no_null check (coalesce(array_position(allowed_roles, null), 0) = 0)
);

-- 수정자·시각은 클라이언트 값을 믿지 않고 서버가 채운다.
create or replace function app.stamp_org_config()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception '기관은 변경할 수 없습니다' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.stamp_org_config() from public, anon, authenticated;

drop trigger if exists org_settings_stamp on public.org_settings;
create trigger org_settings_stamp before insert or update on public.org_settings
  for each row execute function app.stamp_org_config();
drop trigger if exists org_capabilities_stamp on public.org_capabilities;
create trigger org_capabilities_stamp before insert or update on public.org_capabilities
  for each row execute function app.stamp_org_config();

-- ──────────────────────────────────────────────────────────────────────────
-- 위임 판정 — 행이 없으면 기본 집합으로 폴백. 보호자·무소속은 항상 false.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.has_capability(p_capability public.org_capability)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select u.role = any(coalesce(c.allowed_roles, app.default_capability_roles()))
      from public.users u
      left join public.org_capabilities c
        on c.org_id = u.org_id and c.capability = p_capability
     where u.id = auth.uid()
       and u.org_id is not null
       and u.role <> 'guardian'
  ), false);
$$;

revoke all on function app.is_care_team() from public, anon;
revoke all on function app.is_org_manager() from public, anon;
revoke all on function app.has_capability(public.org_capability) from public, anon;
grant execute on function app.is_care_team() to authenticated;
grant execute on function app.is_org_manager() to authenticated;
grant execute on function app.has_capability(public.org_capability) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — 읽기: 같은 기관 돌봄팀 / 쓰기: 같은 기관 관리 역할(org_admin·center_director)
-- ──────────────────────────────────────────────────────────────────────────
alter table public.org_settings enable row level security;
alter table public.org_capabilities enable row level security;
revoke all on public.org_settings from anon;
revoke all on public.org_capabilities from anon;
-- 행 삭제는 기관 삭제(cascade)로만 — 클라이언트에는 삭제 경로를 주지 않는다.
revoke delete on public.org_settings from authenticated;
revoke delete on public.org_capabilities from authenticated;

drop policy if exists org_settings_select_team on public.org_settings;
create policy org_settings_select_team on public.org_settings for select
  using (org_id = app.current_org_id() and app.is_care_team());
drop policy if exists org_settings_insert_manager on public.org_settings;
create policy org_settings_insert_manager on public.org_settings for insert
  with check (org_id = app.current_org_id() and app.is_org_manager());
drop policy if exists org_settings_update_manager on public.org_settings;
create policy org_settings_update_manager on public.org_settings for update
  using (org_id = app.current_org_id() and app.is_org_manager())
  with check (org_id = app.current_org_id() and app.is_org_manager());

drop policy if exists org_capabilities_select_team on public.org_capabilities;
create policy org_capabilities_select_team on public.org_capabilities for select
  using (org_id = app.current_org_id() and app.is_care_team());
drop policy if exists org_capabilities_insert_manager on public.org_capabilities;
create policy org_capabilities_insert_manager on public.org_capabilities for insert
  with check (org_id = app.current_org_id() and app.is_org_manager());
drop policy if exists org_capabilities_update_manager on public.org_capabilities;
create policy org_capabilities_update_manager on public.org_capabilities for update
  using (org_id = app.current_org_id() and app.is_org_manager())
  with check (org_id = app.current_org_id() and app.is_org_manager());

-- 권한표·설정 변경은 제도 증빙이다 — 감사 로그에 남긴다.
-- 기존 app.write_audit_log 는 new.id 를 읽는데 이 두 테이블엔 id 가 없어(키 = org_id[, capability]) 전용 함수를 둔다.
create or replace function app.write_org_config_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (auth.uid(), r.org_id, lower(tg_op), tg_table_name,
          r.org_id::text || case when tg_table_name = 'org_capabilities' then ':' || (to_jsonb(r) ->> 'capability') else '' end,
          case when tg_op = 'DELETE' then null else to_jsonb(r) - 'org_id' end);
  return null;
end $$;
revoke all on function app.write_org_config_audit() from public, anon, authenticated;

drop trigger if exists audit_org_settings on public.org_settings;
create trigger audit_org_settings after insert or update or delete on public.org_settings
  for each row execute function app.write_org_config_audit();
drop trigger if exists audit_org_capabilities on public.org_capabilities;
create trigger audit_org_capabilities after insert or update or delete on public.org_capabilities
  for each row execute function app.write_org_config_audit();

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 기관 생성 시 시드 + 기존 기관 백필
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.seed_org_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_settings (org_id) values (new.id) on conflict do nothing;
  insert into public.org_capabilities (org_id, capability)
    select new.id, c from unnest(enum_range(null::public.org_capability)) c
    on conflict do nothing;
  return null;
end $$;
revoke all on function app.seed_org_config() from public, anon, authenticated;

drop trigger if exists organizations_seed_config on public.organizations;
create trigger organizations_seed_config after insert on public.organizations
  for each row execute function app.seed_org_config();

insert into public.org_settings (org_id) select id from public.organizations on conflict do nothing;
insert into public.org_capabilities (org_id, capability)
  select o.id, c from public.organizations o cross join unnest(enum_range(null::public.org_capability)) c
  on conflict do nothing;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) 역할 부여 RPC — users.role 3중 잠금의 신뢰된 우회로
-- ──────────────────────────────────────────────────────────────────────────
-- 오류 코드는 사람이 읽는 문구가 아니라 식별자로 둔다(웹이 문구를 매핑).
-- 대상이 없거나 다른 기관이면 같은 코드(MEMBER_ROLE_FORBIDDEN) — 다른 기관 사용자의 존재를 흘리지 않는다.
create or replace function public.set_member_role(p_target uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  target public.users%rowtype;
begin
  select * into actor from public.users where id = auth.uid();
  if actor.id is null or actor.org_id is null or actor.onboarded_at is null
     or actor.role not in ('org_admin', 'center_director') then
    raise exception 'MEMBER_ROLE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_target is null or p_role is null then
    raise exception 'MEMBER_ROLE_INVALID' using errcode = '22023';
  end if;
  if p_target = actor.id then
    raise exception 'MEMBER_ROLE_SELF' using errcode = '42501';
  end if;

  -- 같은 기관의 역할 변경을 직렬화한다 — 두 관리자가 서로를 동시에 강등해 관리자가 0명이 되는 경쟁을 막는다.
  perform pg_advisory_xact_lock(hashtextextended(actor.org_id::text, 2409));

  select * into target from public.users where id = p_target for update;
  if target.id is null or target.org_id is distinct from actor.org_id or target.onboarded_at is null then
    raise exception 'MEMBER_ROLE_FORBIDDEN' using errcode = '42501';
  end if;
  -- 보호자 격리가 역할 하나로 무너지지 않게: 보호자 ↔ 돌봄팀 전환은 어느 방향도 안 된다.
  if target.role = 'guardian' or p_role = 'guardian' then
    raise exception 'MEMBER_ROLE_GUARDIAN' using errcode = '42501';
  end if;
  if target.role = p_role then
    return;
  end if;
  if target.role = 'org_admin' and not exists (
    select 1 from public.users
     where org_id = actor.org_id and role = 'org_admin' and id <> target.id
  ) then
    raise exception 'MEMBER_ROLE_LAST_ADMIN' using errcode = '42501';
  end if;

  update public.users set role = p_role, updated_at = now() where id = target.id;

  insert into public.audit_log (actor_id, org_id, action, table_name, record_id, detail)
  values (actor.id, actor.org_id, 'set_member_role', 'users', target.id::text,
          jsonb_build_object('from', target.role, 'to', p_role));
end $$;

revoke all on function public.set_member_role(uuid, public.org_role) from public, anon;
grant execute on function public.set_member_role(uuid, public.org_role) to authenticated;

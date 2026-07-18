-- MemoryOn(기억온) — 인증 개편: 가입 트리거 재작업 + 온보딩 회원가입 RPC
-- (T17.4 / M17.4·M17.6 / Phase W1, 2026-07-16 인증 개편 계획)
--
-- 배경: 기존 handle_new_user(20260703120000)는 **모든 가입자**를 새 기관 +
-- org_admin 으로 강제해 보호자(guardian) 가입 경로가 없었다. 인증 개편으로
-- 로그인은 소셜 3종(구글·카카오·네이버, 이메일/비밀번호 제거), 회원가입은
-- "OAuth 후 온보딩(기본정보 입력)"이 된다:
--   1) OAuth 최초 로그인 → 트리거는 **최소 users row**(org_id NULL,
--      onboarded_at NULL)만 생성한다.
--   2) 온보딩 폼 제출 → public.complete_onboarding RPC 가 역할·기관·전화를
--      원자적으로 확정한다(요양보호사=새 기관+org_admin / 보호자=guardian).
--   3) 온보딩 전에는 org_id 가 NULL 이므로 app.current_org_id() = NULL →
--      모든 조직 범위 RLS 가 자동으로 닫힌다(데이터 화면 접근 불가).
--
-- 소셜 로그인 대응: 카카오 등은 이메일 미제공 가능 → users.email NULL 허용.
-- 이름 메타데이터 키도 provider 별로 달라 다중 fallback 을 둔다.
-- append-only. 조직/RBAC(20260703120000) 이후 적용.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) users 컬럼 개편: org_id NULL 허용 + phone/onboarded_at + email NULL 허용
-- ──────────────────────────────────────────────────────────────────────────

alter table public.users alter column org_id drop not null;

alter table public.users
  add column if not exists phone text,
  add column if not exists onboarded_at timestamptz;

alter table public.users
  add constraint users_phone_check
  check (phone is null or phone ~ '^[0-9+][0-9 -]{7,19}$');

-- 소셜 provider(카카오 등)가 이메일을 제공하지 않을 수 있다.
alter table public.users alter column email drop not null;
alter table public.users drop constraint if exists users_email_check;
alter table public.users
  add constraint users_email_check
  check (
    email is null
    or (char_length(btrim(email)) between 3 and 255 and position('@' in email) > 1)
  );

-- 기존(백필 완료) 사용자는 이미 기관·역할이 확정돼 있으므로 온보딩 완료로 간주.
update public.users set onboarded_at = created_at where onboarded_at is null;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 가입 트리거 재작업: 최소 row 생성(기관 자동생성·org_admin 강제 폐지)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  -- provider 별 이름 키 fallback(구글=name, 카카오=name/nickname 등).
  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '사용자'
  );

  -- 최소 row: 기관·역할은 온보딩(complete_onboarding)에서 확정한다.
  insert into public.users (id, name, email)
  values (new.id, left(display_name, 50), new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 온보딩 RPC: 역할·기관·기본정보를 원자적으로 확정 (클라이언트 rpc() 호출)
-- ──────────────────────────────────────────────────────────────────────────
-- p_role='caregiver' → 새 기관 생성 + role=org_admin (기관 합류 초대는 후속).
-- p_role='guardian'  → role=guardian. p_invite_code 가 있으면 어르신 연결까지
--                      (redeem_guardian_invite — 20260718120000, 런타임 결합).
-- 반환: 갱신된 본인 users row(클라이언트가 라우팅 판단에 사용).

create or replace function public.complete_onboarding(
  p_name text,
  p_phone text,
  p_role text,
  p_org_name text default null,
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

  if nullif(btrim(p_name), '') is null then
    raise exception '이름을 입력해 주세요' using errcode = '22000';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception '전화번호를 입력해 주세요' using errcode = '22000';
  end if;

  if p_role = 'caregiver' then
    if nullif(btrim(p_org_name), '') is null then
      raise exception '기관명을 입력해 주세요' using errcode = '22000';
    end if;

    insert into public.organizations (name)
    values (left(btrim(p_org_name), 100))
    returning id into v_org_id;

    update public.users
      set name = left(btrim(p_name), 50),
          phone = btrim(p_phone),
          org_id = v_org_id,
          role = 'org_admin',
          onboarded_at = now()
      where id = v_uid;

  elsif p_role = 'guardian' then
    update public.users
      set name = left(btrim(p_name), 50),
          phone = btrim(p_phone),
          role = 'guardian',
          onboarded_at = now()
      where id = v_uid;

    -- 초대 코드는 선택: 없이 가입하면 연결 0건 상태로 시작(로그인 후 연결 가능).
    if nullif(btrim(p_invite_code), '') is not null then
      perform public.redeem_guardian_invite(p_invite_code);
    end if;

  else
    raise exception '역할은 caregiver 또는 guardian 이어야 합니다' using errcode = '22000';
  end if;

  select * into v_user from public.users where id = v_uid;
  return v_user;
end;
$$;

-- security definer 함수는 기본 PUBLIC 실행 권한을 회수하고 인증 사용자에게만 허용.
revoke execute on function public.complete_onboarding(text, text, text, text, text) from public;
grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated;

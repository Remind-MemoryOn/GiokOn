-- MemoryOn(기억온) — 이메일/비밀번호 인증 지원 + 소셜 본인인증 정보 캡처
-- (2026-07-23, 사용자 요청: 소셜 3종에 더해 이메일 로그인·회원가입·아이디 찾기)
--
-- 배경: 2026-07-16 "이메일 로그인 제거·소셜 전용" 결정을 사용자 요청으로 되돌려,
-- 소셜 로그인과 **병행**해 이메일(아이디)+비밀번호 로그인을 재도입한다. 로그인·
-- 회원가입·비밀번호 재설정은 Supabase Auth 가 기본 제공(코드/데이터층에서 호출).
-- 이 마이그레이션은 서버 보조 2가지만 담당한다:
--   1) find_login_email: 아이디(이메일) 찾기 — 이름+전화 일치 1건의 **마스킹 이메일**.
--   2) handle_new_user 보강: 소셜/이메일 가입 시 provider 메타의 **전화(본인인증)**
--      를 users.phone 에 선반영(온보딩 프리필). name 은 기존대로 캡처.
-- append-only.

-- ══════════════════════════════════════════════════════════════════════════
-- 1) 아이디(이메일) 찾기 — 이름+전화 → 마스킹 이메일(정확히 1건일 때만)
-- ══════════════════════════════════════════════════════════════════════════
-- 보안: 존재 여부 노출·열거를 줄이려 (a) 정확히 1건 일치일 때만 반환, (b) 항상
-- 마스킹(ab***@dom), (c) 전화는 숫자만 정규화 비교. 프로덕션은 본인인증(PASS/
-- 휴대폰) 게이트 권장. SECURITY DEFINER 로 RLS 우회(전 사용자 조회 필요).
create or replace function public.find_login_email(p_name text, p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_cnt int;
  v_local text;
  v_domain text;
  v_at int;
begin
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_phone), '') is null then
    return null;
  end if;

  select count(*), min(email) into v_cnt, v_email
  from public.users
  where btrim(name) = btrim(p_name)
    and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
        = regexp_replace(p_phone, '[^0-9]', '', 'g')
    and email is not null;

  if v_cnt <> 1 or v_email is null then
    return null;  -- 없음·중복 모두 null(존재 노출 최소화)
  end if;

  -- 마스킹: 로컬파트 앞 2자만 노출(짧으면 1자) + 나머지 ***, 도메인 유지.
  v_at := position('@' in v_email);
  if v_at < 2 then
    return null;
  end if;
  v_local := substr(v_email, 1, v_at - 1);
  v_domain := substr(v_email, v_at + 1);
  if char_length(v_local) <= 2 then
    return substr(v_local, 1, 1) || '***@' || v_domain;
  end if;
  return substr(v_local, 1, 2) || '***@' || v_domain;
end;
$$;

revoke execute on function public.find_login_email(text, text) from public;
-- 로그인 전 기능이므로 anon 에도 허용(마스킹·1건 제한으로 노출 최소화).
grant execute on function public.find_login_email(text, text) to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 2) handle_new_user 보강 — 소셜/이메일 가입 시 전화(본인인증) 선반영
-- ══════════════════════════════════════════════════════════════════════════
-- provider(카카오·네이버 등) 본인인증에서 넘어온 전화번호가 메타에 있으면
-- users.phone 에 선반영해 온보딩에서 프리필한다(형식 검증 통과 시에만).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  raw_phone text;
  norm_phone text;
begin
  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '사용자'
  );

  -- provider 별 전화 키 fallback(본인인증 정보). 숫자·+·-·공백만 남겨 검증 통과분만.
  raw_phone := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'mobile'), '')
  );
  if raw_phone is not null then
    norm_phone := regexp_replace(raw_phone, '[^0-9+ -]', '', 'g');
    if norm_phone !~ '^[0-9+][0-9 -]{7,19}$' then
      norm_phone := null;  -- 형식 불일치 시 미반영(온보딩에서 직접 입력)
    end if;
  end if;

  insert into public.users (id, name, email, phone)
  values (new.id, left(display_name, 50), new.email, norm_phone)
  on conflict (id) do nothing;

  return new;
end;
$$;

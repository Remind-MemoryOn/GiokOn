-- MemoryOn(기억온) — 어르신/초대 코드 생성 강화(CSPRNG + 혼동문자 제거)
-- (2026-07-22, 영속 코드 생성 방식 개선 — 조사 기반 채택)
--
-- 문제: app.generate_invite_code() 가 Postgres `random()`(예측 가능한 PRNG)로
-- 코드를 만들었다. 이 코드는 요양보호사 기관 합류·보호자 연결의 입력 자격이
-- 되므로(승인 게이트가 2차 방어지만), 접근을 부여하는 값은 **암호학적 난수**로
-- 만들어야 한다.
--
-- 개선(주요 서비스·표준 ULID/nanoid/Base58 관행 반영):
--   1) 난수원: random() → gen_random_bytes()(pgcrypto, OS CSPRNG). 예측 불가.
--   2) 알파벳: 혼동문자(0/O·1/I/L) + 욕설 방지 U 를 전면 제외한 30자 →
--      육안·수기 입력 오류 최소화(입력 정규화 불필요).
--   3) 길이: 8 → 10자(30^10 ≈ 2^49). 승인 게이트와 함께 추측 저항 충분.
-- 기존 코드(8자)는 그대로 유효(check 6~32). 신규 발급·회전분부터 10자 적용.
-- pgcrypto 는 초기 스키마에서 이미 활성(방어적으로 재선언). append-only.

create extension if not exists pgcrypto;

create or replace function app.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  -- 혼동문자 전면 제외: 0·1(→O/I/L 혼동), I·L·O(→0/1 혼동), U(욕설 방지). 30자.
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  n constant int := length(alphabet);
  code text := '';
  b bytea := gen_random_bytes(10);  -- CSPRNG(OS 엔트로피) — 예측 가능한 random() 대체
  i int;
begin
  for i in 0..9 loop
    -- 바이트(0..255) → 알파벳 인덱스. n=30 이라 미세 모듈로 편향은 무시가능
    -- (키 자료가 아니라 승인형 입력 코드이므로 실질 영향 없음).
    code := code || substr(alphabet, (get_byte(b, i) % n) + 1, 1);
  end loop;
  return code;
end;
$$;

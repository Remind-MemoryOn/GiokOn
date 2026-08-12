-- MemoryOn(기억온) — 어르신 성별 (profiles.gender)
-- (2026-08-12, Figma 재적용: 메인 화면 카드가 "83세 l 여성" 을 표기하므로 스키마 보강)
--
-- 배경: Figma 메인 카드·어르신 상세에 성별이 표기되는데 v1 스키마에 컬럼이 없어 목업
-- 상수로만 표시되고 있었다(라이브에서는 표기 누락). 사용자 결정(2026-08-12)으로
-- 디자인을 100% 구현하기 위해 컬럼을 추가한다.
--
-- 선택 입력(nullable) — 미입력 시 화면은 나이만 표기한다(임의값 표시 금지 원칙).
-- 값은 코드 표기('female'/'male')로 저장하고, 화면 문구('여성'/'남성')는 앱에서 매핑한다
-- (다국어·표기 변경에 안전). append-only.

do $$
begin
  create type public.elder_gender as enum ('female', 'male');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists gender public.elder_gender;

comment on column public.profiles.gender is
  '어르신 성별(선택). 화면 표기는 앱에서 여성/남성으로 매핑. 미입력 시 표기 생략.';

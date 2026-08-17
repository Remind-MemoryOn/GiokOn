-- MemoryOn(기억온) — 어르신 생년월일 (profiles.birth_date)
-- (2026-08-13, 사용자 요청: 어르신 등록 폼의 "출생연도 선택" → "생년월일 선택")
--
-- 배경: v1 스키마는 출생연도(birth_year)만 받았다. 회상 대화는 생일·계절 같은 시점
-- 단서를 쓰고, 만 나이도 생일 경과 여부에 따라 달라져 연도만으로는 부족하다.
--
-- 설계:
--   - birth_date 를 **입력의 단일 근거**로 삼는다(폼이 년·월·일을 모두 받는다).
--   - birth_year 는 유지한다. 기존 행(월·일을 모르는 데이터)을 보존하고, 프롬프트·
--     집계·웹 표기가 계속 동작하게 하기 위함이다. 쓰기 시 birth_date 에서 파생한다.
--   - **기존 행에 1월 1일을 채우지 않는다.** 월·일은 관찰·입력된 근거가 없으므로
--     임의값을 만들지 않는다(실서비스 원칙). birth_date is null → 화면은 "1945년"처럼
--     아는 만큼만 표기하고, 요양보호사가 연대기 수정에서 실제 날짜를 채운다.
--   - 두 컬럼이 어긋나지 않도록 연도 일치를 DB 에서 강제한다(드리프트 → 즉시 오류).
-- append-only.

alter table public.profiles
  add column if not exists birth_date date;

do $$
begin
  alter table public.profiles
    add constraint profiles_birth_date_check
      check (birth_date is null or birth_date between date '1900-01-01' and date '2006-12-31');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.profiles
    add constraint profiles_birth_date_year_check
      check (birth_date is null or extract(year from birth_date)::int = birth_year);
exception when duplicate_object then null;
end $$;

comment on column public.profiles.birth_date is
  '어르신 생년월일. 입력의 단일 근거이며 birth_year 는 여기서 파생한다. '
  '월·일을 모르는 기존 행은 null(임의값 금지) — 화면은 연도만 표기한다.';

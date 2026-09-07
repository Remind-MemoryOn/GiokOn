-- W-4 · 요양일지 활동 시간 (Figma 221:283 "활동 시간" 시작~종료)
--
-- 문제: 작성 화면이 시작·종료 시각을 받아 놓고 **저장하지 않았다**. 요양보호사가
-- 09:00~17:00 을 골라도 아무 데도 남지 않아, 목록·상세·보호자 공개 어디에도 나오지
-- 않았다. 입력을 받으면서 버리는 것은 "적었는데 사라졌다"는 가장 나쁜 실패다.
--
-- `time` 두 칸으로 받는다(날짜는 이미 `journal_date` 에 있다).
-- ⚠️ **기존 행에 값을 지어내지 않는다** — 09:00~17:00 같은 기본값을 채우면 관찰하지
-- 않은 시각을 기록으로 만든다. 없으면 null 이고 화면은 `—` 로 둔다.

alter table public.care_journals
  add column if not exists activity_from time,
  add column if not exists activity_to time;

comment on column public.care_journals.activity_from is '활동 시작 시각(없으면 null — 미입력이지 0시가 아니다).';
comment on column public.care_journals.activity_to is '활동 종료 시각(없으면 null).';

-- 한쪽만 있는 것은 허용한다(진행 중 기록). 다만 뒤집힌 구간은 오기다.
do $$
begin
  alter table public.care_journals
    add constraint care_journals_activity_time_check
    check (
      activity_from is null
      or activity_to is null
      or activity_to >= activity_from
    );
exception when duplicate_object then null;
end $$;

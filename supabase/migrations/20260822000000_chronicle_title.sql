-- MemoryOn(기억온) — 연대기 제목 (chronicle_entries.title)
-- (2026-08-22, 신규 웹 디자인 `196:271`·`198:991` "연대기 추가/상세 정보")
--
-- 배경: v1 연대기는 `topic`(유형)과 `content`(내용)만 받았다. 신규 웹 디자인은
-- **제목(0/50)** 을 별도 필수 입력으로 두고, 목록(`198:506`)은 그 제목을 한 줄로 보여
-- 준다. 제목 없이 `content` 를 목록 제목 자리에 쓰면 AI 가 쓴 긴 서술이 잘려 나온다.
--
-- 설계:
--   - **nullable** 이다. 앱(모바일)과 AI 대화 종료 파이프라인은 제목을 쓰지 않으므로
--     기존 쓰기 경로가 그대로 동작해야 한다.
--   - **기존 행을 백필하지 않는다.** 제목은 사람이 붙이는 값이고 근거가 없다
--     (실서비스 원칙: 값이 없으면 만들지 않는다). 화면은 title 이 없으면 `content` 로
--     대체 표기한다 — 지어낸 제목을 저장하지는 않는다.
--   - 길이는 디자인 카운터(0/50)와 맞춘다. 공백만 있는 제목은 없는 것으로 본다.
-- RLS 는 chronicle_entries 의 기존 정책을 그대로 따른다(컬럼 추가는 정책에 영향 없음).
-- append-only.

alter table public.chronicle_entries
  add column if not exists title text;

do $$
begin
  alter table public.chronicle_entries
    add constraint chronicle_entries_title_check
      check (title is null or (char_length(btrim(title)) between 1 and 50));
exception when duplicate_object then null;
end $$;

comment on column public.chronicle_entries.title is
  '연대기 제목(사람이 입력, 최대 50자). null = 미입력 — 화면은 content 로 대체 표기한다.';

notify pgrst, 'reload schema';

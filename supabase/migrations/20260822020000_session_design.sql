-- MemoryOn(기억온) — 회상 세션 설계 필드 (sessions)
-- (2026-08-22, 신규 웹 디자인 `196:272` "회상 세션 설계")
--
-- 웹에서 요양보호사가 세션을 설계(status='planned')하면 앱이 그 설계를 받아 진행한다.
-- 설계 값은 **앱의 대화 진행에 직접 쓰인다** — 피해갈 내용은 안전 가드, 목표·키워드는
-- 질문 생성 입력이다. 화면 표시용 값이 아니다.
--
-- 컬럼(디자인 필드 ↔ 컬럼)
--   세션 제목*(0/50)   → title
--   목표*(0/200)       → goal
--   예상 소요 시간     → duration_minutes
--   기록일             → planned_date
--   내용(0/500)        → content        (AI 가 어떤 이야기를 나눌지)
--   피해갈 내용        → avoid_topics   (디자인이 자유 입력 한 칸이라 text)
--   관련 키워드        → keywords       (칩 입력 → text[])
--
-- ⚠️ `started_at` 은 NOT NULL 을 유지한다. planned 행에서는 **설계 시각**이고, 앱이
--    세션을 실제로 시작할 때 now() 로 갱신한다. 예정일은 `planned_date` 가 단일 근거다.
--    (nullable 로 바꾸면 앱 도메인 타입까지 파급돼 기기 검증 없이 건드리지 않는다.)
-- ⚠️ 기존 행은 손대지 않는다 — 전부 active/ended 이고 설계 값은 근거가 없어 null 이다.
-- RLS 는 sessions 의 기존 정책을 그대로 따른다(컬럼 추가는 정책에 영향 없음).
-- append-only.

alter table public.sessions
  add column if not exists title text,
  add column if not exists goal text,
  add column if not exists content text,
  add column if not exists avoid_topics text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists duration_minutes integer,
  add column if not exists planned_date date;

-- 상태 기계: planned 는 아직 끝나지 않았다(ended_at 없음).
alter table public.sessions drop constraint if exists sessions_ended_at_check;
alter table public.sessions
  add constraint sessions_ended_at_check check (
    (status = 'planned'::session_status and ended_at is null)
    or (status = 'active'::session_status and ended_at is null)
    or (status = 'ended'::session_status and ended_at is not null)
  );

do $$
begin
  alter table public.sessions
    add constraint sessions_title_check
      check (title is null or (char_length(btrim(title)) between 1 and 50));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.sessions
    add constraint sessions_goal_check
      check (goal is null or (char_length(btrim(goal)) between 1 and 200));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.sessions
    add constraint sessions_content_check
      check (content is null or char_length(content) <= 500);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.sessions
    add constraint sessions_avoid_topics_check
      check (avoid_topics is null or char_length(avoid_topics) <= 500);
exception when duplicate_object then null;
end $$;

-- 예상 소요 시간은 디자인 드롭다운(10·15·20·30·40분) 범위 안에서만 받는다.
do $$
begin
  alter table public.sessions
    add constraint sessions_duration_minutes_check
      check (duration_minutes is null or duration_minutes between 5 and 120);
exception when duplicate_object then null;
end $$;

comment on column public.sessions.title is '세션 제목(설계, 최대 50자). null = 앱이 즉석으로 시작한 세션.';
comment on column public.sessions.goal is '이 세션에서 나누고 싶은 이야기(설계, 최대 200자).';
comment on column public.sessions.content is 'AI 가 나눌 이야기 지침(설계, 최대 500자).';
comment on column public.sessions.avoid_topics is '피해갈 내용 — 앱의 안전 가드 입력(설계, 최대 500자).';
comment on column public.sessions.keywords is '관련 키워드 — 질문 생성 입력(설계).';
comment on column public.sessions.duration_minutes is '예상 소요 시간(분, 설계).';
comment on column public.sessions.planned_date is '세션 예정일. planned 행의 시점 근거는 started_at 이 아니라 이 값이다.';

-- 앱이 "오늘 진행할 설계"를 찾는 경로.
create index if not exists sessions_planned_idx
  on public.sessions (profile_id, planned_date)
  where status = 'planned';

notify pgrst, 'reload schema';

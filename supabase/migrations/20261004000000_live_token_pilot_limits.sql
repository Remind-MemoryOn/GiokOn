-- 기억온 — live-token 발급 한도를 파일럿 운영에 맞춘다(T21.14 · 2026-10-04)
--
-- 왜: 사용자 분당 3회로는 요양보호사 1명이 4대(파일럿 운영 규칙)를 1분 안에 시작하면 네 번째가 막힌다.
--     중계는 연결·재연결마다 토큰을 받으므로(토큰 1회 사용) 재연결 여유도 필요하다. 일 20회도 하루 운영(평일 09~18시,
--     세션 1회 최대 10분 × 동시 4대)에는 부족하다.
-- 값(2026-10-03 사용자 확정): 사용자 분당 3 → 8 · 사용자 일 20 → 80 · 기관 일 200 · 프로젝트 일 2,000 은 그대로.
-- 이 한도는 **발급 횟수 상한**이지 과금 상한이 아니다(이미 발급한 토큰·열린 연결은 취소하지 못한다).
-- 표는 app 스키마(사용자 권한 없음)이고 판정은 reserve_live_token 이 한다 — 함수는 바꾸지 않는다.

begin;

update app.live_token_limits
   set user_minute = 8, user_day = 80, org_day = 200, project_day = 2000
 where singleton;

do $$
begin
  assert (select count(*) from app.live_token_limits) = 1, 'live_token_limits 는 한 행이어야 한다';
  assert (select (user_minute, user_day, org_day, project_day) = (8, 80, 200, 2000) from app.live_token_limits),
    'live-token 파일럿 한도(8 · 80 · 200 · 2000)';
end $$;

commit;

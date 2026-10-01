-- 기억온 — 세션 상태 'recording'(종료 후 일괄 기록 전용 · 파일럿 T25.18)
--
-- ⚠️ enum 값 추가는 단독 마이그레이션이다(같은 트랜잭션에서 새 값을 쓸 수 없다). 규칙은 20260929010000 에 있다.
-- 'recording' = 앱이 실행 중 세션을 만들지 못하고 대화를 마친 뒤, 과거 시각의 기록을 한꺼번에 저장하는 동안의 상태.
-- 실행 중이 아니다: session_tick·live-token·중계·감독 한도·어르신당 실행 세션 1개는 모두 'active' 만 본다.
alter type public.session_status add value if not exists 'recording';

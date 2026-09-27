-- 보호자에게 '대화 요약'만 공개한 경우(session_summary) — 요약 문장만 돌려주는 RPC (파일럿 W4 · T20.9)
--
-- 왜: 공개 모달은 '대화 요약 내용'(session_summary)과 '대화 AI 분석'(analysis)을 따로 고르게 한다.
--     그런데 session_analyses 의 보호자 열람 정책은 app.is_shared_to_me('analysis', id) 뿐이라,
--     요약만 공개하면 보호자는 분석 행을 읽을 수 없어 **요약이 화면에 한 번도 나오지 않았다**(기존 버그).
-- 무엇: get_my_shared_summaries() — 공개(미철회)된 session_summary 의 **요약 문장·첫 주제·날짜만**.
--       분석 세부(말투·지표·주제별 반응)는 보내지 않는다 — '요약만 공개'한 요양보호사의 의도보다 더 열지 않는다
--       (RLS 를 넓히면 분석 행 전체가 열린다 — 채택하지 않음, 사용자 확정 2026-09-27).
-- 판정은 기존 app.is_shared_to_me(승인된 보호자 연결 + 미철회 공개)를 그대로 쓴다.

create or replace function public.get_my_shared_summaries()
returns table (id uuid, session_id uuid, profile_id uuid, summary text, first_topic text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.session_id, a.profile_id,
         nullif(btrim(a.analysis ->> 'summary'), ''),
         nullif(btrim(a.analysis -> 'topicsEngaged' ->> 0), ''),
         a.created_at
    from public.session_analyses a
   where app.is_shared_to_me('session_summary', a.id)
   order by a.created_at desc;
$$;
revoke all on function public.get_my_shared_summaries() from public, anon;
grant execute on function public.get_my_shared_summaries() to authenticated;
comment on function public.get_my_shared_summaries() is
  '보호자 — 공개된 대화 요약(session_summary)의 요약 문장·첫 주제·날짜만. 분석 세부는 analysis 공개로만 열린다.';

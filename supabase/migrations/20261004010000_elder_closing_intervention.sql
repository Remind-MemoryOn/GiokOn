-- 기억온 — 어르신 요청으로 마무리 → 감독 화면 기록(T21.11 · 2026-10-04)
--
-- 왜: 휴식 요청("그만할래")·거부("듣기 싫어")에 중계가 지금은 위기와 같은 경로로 즉시 멈춘다. 파일럿 종료 정책(계획 §9-5,
--     2026-09-24·10-03 사용자 확정)은 이 둘을 "짧은 인사 한 문장 → 재생 뒤 자동 종료 + 감독 화면 알림"으로 바꾼다.
--     위기·급성 고통은 즉시 종료 그대로(약화 금지).
-- 어떻게: 감독 화면이 이미 Realtime 으로 듣는 session_interventions 에 새 종류 `elder_closing` 을 넣는다.
--   · record_elder_closing — 세션 시작자(중계가 쓰는 JWT 의 주인)만 · 처리 가능(active·동의) 세션만 · 세션당 한 번.
--   · detail 은 {situation: 'rest_request'|'refusal'} 만 — 발화 원문·매칭 단어는 넣지 않는다.
--   · 직접 INSERT 권한은 여전히 없다(기존 revoke 유지) — 이 RPC 로만 쓴다.
-- 배포 순서: 이 마이그레이션 → 중계(RPC 가 없어도 중계는 마무리·종료를 진행한다 — 기록만 빠진다).

begin;

alter table public.session_interventions drop constraint if exists session_interventions_action_check;
alter table public.session_interventions add constraint session_interventions_action_check
  check (action in ('pause', 'resume', 'end', 'phase_advance', 'elder_closing'));

create or replace function public.record_elder_closing(p_session_id uuid, p_situation text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare s public.sessions%rowtype;
begin
  if p_situation is null or p_situation not in ('rest_request', 'refusal') then
    raise exception 'ELDER_CLOSING_SITUATION' using errcode = '22023';
  end if;
  select * into s from public.sessions where id = p_session_id for update;
  -- 다른 사용자·없는 세션·처리 불가 세션은 구분하지 않는다(존재를 흘리지 않는다).
  if s.id is null or s.user_id is distinct from auth.uid() or not public.can_process_session(p_session_id) then
    raise exception 'ELDER_CLOSING_FORBIDDEN' using errcode = '42501';
  end if;
  -- 세션당 한 번(재연결·재시도로 같은 알림이 쌓이지 않게). 이미 있으면 false.
  if exists (select 1 from public.session_interventions where session_id = s.id and action = 'elder_closing') then
    return false;
  end if;
  insert into public.session_interventions (session_id, profile_id, org_id, actor_id, action, detail)
  values (s.id, s.profile_id, s.org_id, auth.uid(), 'elder_closing', jsonb_build_object('situation', p_situation));
  return true;
end $$;

revoke all on function public.record_elder_closing(uuid, text) from public, anon;
grant execute on function public.record_elder_closing(uuid, text) to authenticated;

commit;

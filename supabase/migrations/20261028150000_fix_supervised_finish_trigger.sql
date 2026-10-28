begin;

-- 20261028125824 결함 수정(2026-10-28 운영 장애): 트리거의 조건식
--   `tg_table_name <> 'sessions' and tg_op = 'UPDATE' and old.session_id is distinct from new.session_id`
-- 를 PL/pgSQL 은 앞이 거짓이어도 식 전체로 준비한다 → sessions 행에는 session_id 칸이 없어
-- `record "old" has no field "session_id"` 로 **sessions 의 모든 UPDATE** 가 실패했다
-- (대화 시작 start_planned_session · 일시정지/재개/종료 · 단계 전환 · 종료 저장).
-- 고침: 칸 접근을 테이블별 분기 안에만 둔다.
-- 함께: 운영자 SQL·워커(service_role)·FK `on delete set null` 연쇄처럼 로그인 사용자가 없는 서버 경로는
-- 막지 않는다 — 막을 대상은 감독 종료 뒤 다시 연결된 기기의 늦은 저장(로그인 사용자 요청)이다.
create or replace function app.protect_supervised_session_finish()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid uuid; moved_from uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'sessions' then
    sid := old.id;
  else
    if tg_op = 'DELETE' then
      sid := old.session_id;
    else
      sid := new.session_id;
      if tg_op = 'UPDATE' and old.session_id is distinct from new.session_id then
        moved_from := old.session_id;
      end if;
    end if;
    -- 같은 세션 행으로 하위 쓰기를 직렬화한다(종료 처리와 늦은 저장의 경합).
    perform 1 from public.sessions where id = sid for update;
    if moved_from is not null then
      perform 1 from public.sessions where id = moved_from for update;
    end if;
  end if;
  if exists (select 1 from public.session_interventions
    where session_id in (sid, moved_from) and action = 'end' and detail->>'source' = 'supervision_finalize') then
    raise exception 'SESSION_SUPERVISED_FINISHED' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app.protect_supervised_session_finish() from public, anon, authenticated;

commit;

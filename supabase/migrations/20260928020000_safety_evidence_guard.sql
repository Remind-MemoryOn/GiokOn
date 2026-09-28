-- 기억온 — 안전 이벤트 판정·근거 보호(파일럿 T25.17 · 2026-09-27 감사 보류 ① 결정)
--
-- 음성 중계는 위험 발화를 감지하면 사건 id 를 먼저 만들고 기록을 제한된 횟수 동안 재시도한다. 기록이 늦어지면
-- 앱이 **같은 id 로** 수준·분류만 담은 대체 기록(발췌 없음)을 먼저 넣을 수 있고, 그 뒤 성공한 중계 재시도는
-- 그 행의 **비어 있는 근거 칸(발췌·매칭 단어)만 한 번** 채운다.
--
-- 그런데 지금은 같은 기관 돌봄팀이면 safety_events 의 어느 칸이든 UPDATE 할 수 있다(확인 시각을 쓰려고 연 정책).
-- 위기 판정·근거가 사후에 바뀌면 기록의 의미가 없다 → 사용자 요청(auth.uid() 있음)에 대해:
--   · 판정(level·categories·caregiver_alert)은 기록 뒤 바꿀 수 없다.
--   · 근거(excerpt·matched_terms)는 **비어 있을 때 한 번, 그 사건을 기록한 본인만** 채울 수 있다(지우기·덮어쓰기 불가).
-- 확인 시각(acknowledged_at/by) 갱신은 그대로 된다. 서버 내부(service_role·운영자 SQL — auth.uid() 없음)는 막지 않는다.

create or replace function app.guard_safety_event_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.level is distinct from old.level
     or new.categories is distinct from old.categories
     or new.caregiver_alert is distinct from old.caregiver_alert then
    raise exception 'SAFETY_EVENT_VERDICT_IMMUTABLE' using errcode = '42501';
  end if;
  if new.excerpt is distinct from old.excerpt or new.matched_terms is distinct from old.matched_terms then
    if coalesce(old.excerpt, '') <> '' or cardinality(old.matched_terms) > 0 then
      raise exception 'SAFETY_EVIDENCE_IMMUTABLE' using errcode = '42501';
    end if;
    if old.user_id is distinct from auth.uid() then
      raise exception 'SAFETY_EVIDENCE_NOT_RECORDER' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.guard_safety_event_evidence() from public;

drop trigger if exists guard_safety_event_evidence on public.safety_events;
create trigger guard_safety_event_evidence
before update on public.safety_events
for each row execute function app.guard_safety_event_evidence();

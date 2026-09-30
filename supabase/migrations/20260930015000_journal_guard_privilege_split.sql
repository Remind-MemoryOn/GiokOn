-- 프로그램 일지 가드가 운영 권한에서 깨지는 문제 — invoker/definer 로 나눈다 (T25.4 선행 · 2026-09-30 운영 재현)
--
-- ■ 무엇이 잘못됐나
--   app.guard_program_journal 은 SECURITY INVOKER 트리거다(current_user 로 "클라이언트 요청"을 가리려고).
--   그런데 본문에서 app.is_org_care_member · app.has_capability · app.record_journal_revision 를 **이름으로** 부른다.
--   운영에서 authenticated 는 app 스키마 USAGE 가 없어(nspacl 비어 있음), 요양보호사가 일지를 저장할 때
--   진행자 칸이 있으면(새 일지는 기본값이 본인) · 확정하면 · 확정 후 고치면 → 'permission denied for schema app'.
--   2026-09-30 운영에서 authenticated 로 app.has_capability 호출 → 42501 재현. 웹이 아직 운영 배포 전이라 드러나지 않았다.
--   로컬·CI 회귀는 _grants.sql 이 authenticated 에게 app USAGE 를 줘서 이 차이를 가렸다(같은 커밋에서 운영과 맞춤).
--
-- ■ 어떻게 고치나 — 판정은 그대로, 실행 권한만 나눈다
--   · app.guard_program_journal(invoker) — current_user 가 필요한 **클라이언트 전용 검사**(워커 칸)만 남긴다. app.* 호출 없음.
--   · app.guard_program_journal_rules(definer, 새 트리거 z_guard_program_journal_rules — 이름 순서상 위 트리거 다음)
--     — 나머지 규칙(확정 잠금 · 진행자 검증 · 확정 권한/필수 칸 · 확정 후 수정 사유·이력 · 보호자 문장 승인). 본문 동일.
--     current_user 를 쓰지 않으므로 definer 여도 판정이 같다(auth.uid() 는 요청 그대로).

create or replace function app.guard_program_journal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  client boolean := current_user in ('authenticated', 'anon');
begin
  -- 워커가 쓰는 칸(상태 생성 중/실패 · 시도 횟수 · 마지막 오류)은 클라이언트가 바꾸지 못한다.
  if client then
    if tg_op = 'INSERT' then
      if new.status not in ('pending_review', 'final') or new.generation_attempts <> 0 or new.last_error is not null then
        raise exception 'JOURNAL_WORKER_FIELDS' using errcode = '42501';
      end if;
    else
      if (new.status in ('generating', 'failed') and new.status is distinct from old.status)
         or new.generation_attempts is distinct from old.generation_attempts
         or new.last_error is distinct from old.last_error then
        raise exception 'JOURNAL_WORKER_FIELDS' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function app.guard_program_journal() from public, anon, authenticated;

create or replace function app.guard_program_journal_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changes jsonb := '{}'::jsonb;
  f text;
  tracked constant text[] := array['journal_date','operated_from','operated_to','program_type','location',
    'facilitator_user_id','participants','goal','activity_content','participant_response','opinion_collected',
    'overall_evaluation','next_plan','tool_used','delivered','non_delivery_reason'];
  finalizing boolean;
begin
  if tg_op = 'UPDATE' and old.status = 'final' and new.status <> 'final' then
    raise exception 'JOURNAL_FINAL_LOCKED' using errcode = '42501';
  end if;

  if new.facilitator_user_id is not null
     and (tg_op = 'INSERT' or new.facilitator_user_id is distinct from old.facilitator_user_id)
     and not app.is_org_care_member(new.facilitator_user_id, new.org_id) then
    raise exception 'JOURNAL_FACILITATOR_INVALID' using errcode = '22023';
  end if;

  finalizing := new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final');
  if finalizing then
    if auth.uid() is null then
      raise exception 'JOURNAL_FINALIZE_HUMAN_ONLY' using errcode = '42501';
    end if;
    if not app.has_capability('journal_finalize') then
      raise exception 'JOURNAL_FINALIZE_FORBIDDEN' using errcode = '42501';
    end if;
    if new.facilitator_user_id is null then
      raise exception 'JOURNAL_FACILITATOR_REQUIRED' using errcode = '23514';
    end if;
    if new.delivered and nullif(btrim(coalesce(new.activity_content, '')), '') is null then
      raise exception 'JOURNAL_CONTENT_REQUIRED' using errcode = '23514';
    end if;
    new.finalized_by := auth.uid();
    new.finalized_at := statement_timestamp();
  elsif tg_op = 'INSERT' then
    new.finalized_by := null;
    new.finalized_at := null;
  else
    new.finalized_by := old.finalized_by;
    new.finalized_at := old.finalized_at;
  end if;

  if tg_op = 'UPDATE' and old.status = 'final' then
    foreach f in array tracked loop
      if to_jsonb(new) -> f is distinct from to_jsonb(old) -> f then
        changes := changes || jsonb_build_object(f, jsonb_build_object('from', to_jsonb(old) -> f, 'to', to_jsonb(new) -> f));
      end if;
    end loop;
    if changes <> '{}'::jsonb then
      if auth.uid() is null then
        raise exception 'JOURNAL_FINALIZE_HUMAN_ONLY' using errcode = '42501';
      end if;
      if not app.has_capability('journal_finalize') then
        raise exception 'JOURNAL_EDIT_FORBIDDEN' using errcode = '42501';
      end if;
      if new.edit_reason is null or char_length(btrim(new.edit_reason)) not between 1 and 200 then
        raise exception 'JOURNAL_EDIT_REASON_REQUIRED' using errcode = '23514';
      end if;
      perform app.record_journal_revision(old.id, old.org_id, old.profile_id, new.edit_reason, changes);
    end if;
  end if;
  new.edit_reason := null;

  -- 보호자 문장 승인: 승인자·시각은 서버가 채운다(클라이언트 값 무시).
  if tg_op = 'UPDATE' and new.guardian_text is distinct from old.guardian_text
     and new.guardian_text_approved_at is not distinct from old.guardian_text_approved_at then
    new.guardian_text_approved_by := null;
    new.guardian_text_approved_at := null;
  elsif new.guardian_text_approved_at is not null
     and (tg_op = 'INSERT' or new.guardian_text_approved_at is distinct from old.guardian_text_approved_at) then
    if auth.uid() is null then
      raise exception 'JOURNAL_GUARDIAN_APPROVE_HUMAN_ONLY' using errcode = '42501';
    end if;
    if nullif(btrim(coalesce(new.guardian_text, '')), '') is null then
      raise exception 'JOURNAL_GUARDIAN_TEXT_REQUIRED' using errcode = '23514';
    end if;
    new.guardian_text_approved_by := auth.uid();
    new.guardian_text_approved_at := statement_timestamp();
  elsif new.guardian_text_approved_at is null then
    new.guardian_text_approved_by := null;
  else
    new.guardian_text_approved_by := old.guardian_text_approved_by;
  end if;
  return new;
end $$;
revoke all on function app.guard_program_journal_rules() from public, anon, authenticated;
drop trigger if exists z_guard_program_journal_rules on public.program_journals;
create trigger z_guard_program_journal_rules before insert or update on public.program_journals
  for each row execute function app.guard_program_journal_rules();

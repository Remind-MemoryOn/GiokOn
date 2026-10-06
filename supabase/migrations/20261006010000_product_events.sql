-- 기억온 — 제품 이벤트(파일럿 T24.2 · DB 계획 D8 · 요구 PF-44) — 최소 범위(2026-10-06 사용자 확정)
--
-- "시간 절감·기록 품질"은 나중에 소급 계산할 수 없는 값이 있다. 그중 **기존 칸으로 못 남기는 것만** 서버가 기록한다.
--   · 초안 생성 → 확정 시간: 이미 program_journals.draft_generated_at · finalized_at 에 있다(확정은 되돌릴 수 없다 —
--     JOURNAL_FINAL_LOCKED). 그래서 이벤트로 중복 기록하지 않는다.
--   · 확정 **전에** 사람이 고친 칸: 어디에도 남지 않는다(program_journal_revisions 는 확정 **후** 수정만) → 이 파일이 남긴다.
-- 지표(분모·수작업 기준선)는 결정 대기라 여기서 계산하지 않는다 — 원자료만 쌓는다.
--
-- 원칙:
--   · 서버만 기록한다 — 클라이언트는 읽기·쓰기 모두 불가(RLS 켜고 정책 없음 · 권한 회수). 앱·웹 코드 변경 없음, 위조 불가.
--   · 내용은 넣지 않는다 — 칸 **이름**만(값·발화·전사 없음 · compliance.md 5.1). payload 크기 상한.
--   · 사람의 수정만 — auth.uid() 가 있는 요청. 워커(초안 채우기)의 쓰기는 수정이 아니다.
--   · 보존 기간 미정(compliance.md) — 정해지면 파기 예약을 따로 단다.

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint product_events_key_check check (event_key in ('journal_draft_edited')),
  constraint product_events_payload_check check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2048)
);
comment on table public.product_events is
  '제품 이벤트(T24.2 · D8) — 지표 원자료. 서버 트리거만 기록하고 클라이언트는 읽기·쓰기 불가. 내용(값·발화) 없이 이름·시각만.';
create index if not exists idx_product_events_org_key_time on public.product_events (org_id, event_key, occurred_at);
create index if not exists idx_product_events_subject on public.product_events (subject_id) where subject_id is not null;

alter table public.product_events enable row level security;
revoke all on table public.product_events from public, anon, authenticated;

-- 서버 전용 삽입 함수 — 트리거(definer)가 부른다. 행위자는 요청의 auth.uid().
create or replace function app.record_product_event(p_org_id uuid, p_event_key text, p_subject_id uuid, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.product_events (org_id, event_key, actor_user_id, subject_id, payload)
  values (p_org_id, p_event_key, auth.uid(), p_subject_id, coalesce(p_payload, '{}'::jsonb));
$$;
revoke all on function app.record_product_event(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- 일지 검토 중(확인 대기) 사람이 고친 칸 — 확정과 같은 요청에서 고친 칸도 포함한다(old 가 확인 대기).
-- 칸 목록은 확정 후 수정 이력(app.guard_program_journal_rules 의 tracked)과 같고 보호자 문장을 더한다.
create or replace function app.record_journal_draft_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[];
  tracked constant text[] := array['journal_date','operated_from','operated_to','program_type','location',
    'facilitator_user_id','participants','goal','activity_content','participant_response','opinion_collected',
    'overall_evaluation','next_plan','tool_used','delivered','non_delivery_reason','guardian_text'];
begin
  if auth.uid() is null or old.status <> 'pending_review' then
    return null;
  end if;
  select array_agg(f order by f) into fields
    from unnest(tracked) f
   where to_jsonb(new) -> f is distinct from to_jsonb(old) -> f;
  if fields is null then
    return null;
  end if;
  perform app.record_product_event(new.org_id, 'journal_draft_edited', new.id,
    jsonb_build_object('fields', to_jsonb(fields), 'ai_draft', old.draft_generated_at is not null));
  return null;
end $$;
revoke all on function app.record_journal_draft_edit() from public, anon, authenticated;
drop trigger if exists record_program_journal_draft_edit on public.program_journals;
create trigger record_program_journal_draft_edit after update on public.program_journals
  for each row execute function app.record_journal_draft_edit();

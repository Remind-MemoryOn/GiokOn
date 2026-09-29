-- 공개 후 내용이 바뀌면 자동 공개 해제 (감사 2026-09-27 P0-2(b) → P1 공개 무결성 · tasks T25.12)
--
-- ■ 무엇이 잘못됐나
--   guardian_shares 는 분석 **ID 만** 가리킨다. 돌봄팀은 session_analyses·session_logs 를 직접 UPDATE 할 수 있고
--   (RLS: 같은 기관 돌봄팀), session-report 재생성(서비스 계정)도 같은 분석 행을 고친다 → 공개한 뒤 내용이 바뀌면
--   **재승인 없이** 보호자에게 새 내용이 보였다(일반 화면 경로는 없지만 직접 API 로 가능 — 서버 계약의 결함).
--
-- ■ 방향(사용자 검토 2026-09-27) — 보호자에게 보이는 내용이 **실제로** 바뀔 때만, 같은 트랜잭션에서 그 공개를 해제
--   보호자에게 보이는 내용(여기서 확정 · 회귀 share_auto_revoke.sql 에 고정):
--     · analysis 공개   = 분석 전체(session_analyses.analysis — 기술 키 'version' 제외)
--                         + 그 세션의 대화 원문(session_logs: content · original_content · role · turn_index · topic · audio_url,
--                           줄 추가·삭제 포함 — 20260906000000 이 공개된 분석의 원문을 보호자에게 연다)
--     · session_summary 공개 = 요약 문장(analysis.summary) + 첫 주제(analysis.topicsEngaged[0]) — get_my_shared_summaries 가 주는 것
--   유지(해제하지 않음): 같은 내용 재저장(jsonb 동등) · 기술 메타데이터(analysis.version · updated_at · 전사 출처/이력 칸 ·
--     타임스탬프) · 세션 기본 정보(시각 등 — 사람이 승인하는 생성물이 아님).
--   해제는 철회와 같다(revoked_at) — 보호자에게는 즉시 닫히고, 다시 보이려면 **명시적 재공개**가 필요하다.
--   revoke_reason = 'content_changed' 로 사람이 누른 철회(비어 있음)와 구분한다. revoked_by 는 비운다(사람이 아님).
--   T25.4 의 공개 철회 권한 검사는 트랜잭션 로컬 설정 app.share_auto_revoke 로 건너뛴다(사람이 누른 철회가 아니다).
--   스냅샷 방식(이전 공개본을 계속 보여 주기)은 그 요구가 생기면 재검토.

alter table public.guardian_shares add column if not exists revoke_reason text;
alter table public.guardian_shares drop constraint if exists guardian_shares_revoke_reason_check;
alter table public.guardian_shares add constraint guardian_shares_revoke_reason_check
  check (revoke_reason is null or (revoke_reason = 'content_changed' and revoked_at is not null));
comment on column public.guardian_shares.revoke_reason is
  '자동 해제 사유 — content_changed: 공개한 뒤 보호자에게 보이는 내용이 바뀌어 해제됨(T25.12). 사람이 누른 철회는 비어 있다.';

-- 클라이언트가 사유를 지어 넣거나 지우지 못한다(자동 해제만 채운다). 운영은 authenticated 에게 테이블 단위 UPDATE 가
-- 있어 컬럼 권한 회수가 효과가 없다 → 트리거로 막는다.
create or replace function app.guard_share_revoke_reason()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revoke_reason is distinct from (case when tg_op = 'UPDATE' then old.revoke_reason end)
     and coalesce(current_setting('app.share_auto_revoke', true), '') <> 'on' then
    raise exception 'SHARE_REVOKE_REASON_SYSTEM_ONLY' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.guard_share_revoke_reason() from public, anon, authenticated;
drop trigger if exists guard_share_revoke_reason on public.guardian_shares;
create trigger guard_share_revoke_reason before insert or update on public.guardian_shares
  for each row execute function app.guard_share_revoke_reason();

-- 공개 해제 — 트리거 전용. 권한 검사(T25.4)는 사람이 누른 철회가 아니므로 건너뛰고, 끝나면 바로 되돌린다.
create or replace function app.auto_revoke_shares(p_share_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_share_ids is null or cardinality(p_share_ids) = 0 then return; end if;
  perform set_config('app.share_auto_revoke', 'on', true);
  update public.guardian_shares
     set revoked_at = statement_timestamp(), revoked_by = null, revoke_reason = 'content_changed'
   where id = any(p_share_ids) and revoked_at is null;
  perform set_config('app.share_auto_revoke', 'off', true);
end $$;
revoke all on function app.auto_revoke_shares(uuid[]) from public, anon, authenticated;

-- ① 분석이 바뀜 — analysis 공개는 분석 전체(버전 키 제외), session_summary 공개는 요약·첫 주제만 본다.
create or replace function app.revoke_shares_on_analysis_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  analysis_changed boolean := (old.analysis - 'version') is distinct from (new.analysis - 'version');
  summary_changed boolean :=
    coalesce(nullif(btrim(old.analysis ->> 'summary'), ''), '') is distinct from coalesce(nullif(btrim(new.analysis ->> 'summary'), ''), '')
    or coalesce(nullif(btrim(old.analysis -> 'topicsEngaged' ->> 0), ''), '') is distinct from coalesce(nullif(btrim(new.analysis -> 'topicsEngaged' ->> 0), ''), '');
begin
  if not analysis_changed and not summary_changed then return null; end if;
  perform app.auto_revoke_shares(array(
    select s.id from public.guardian_shares s
     where s.item_id = new.id and s.revoked_at is null
       and ((s.item_type = 'analysis' and analysis_changed)
         or (s.item_type = 'session_summary' and summary_changed))));
  return null;
end $$;
revoke all on function app.revoke_shares_on_analysis_change() from public, anon, authenticated;
drop trigger if exists revoke_shares_on_analysis_change on public.session_analyses;
create trigger revoke_shares_on_analysis_change after update of analysis on public.session_analyses
  for each row execute function app.revoke_shares_on_analysis_change();

-- ② 대화 원문이 바뀜 — 그 세션의 analysis 공개를 해제(요약 공개는 원문을 열지 않는다).
create or replace function app.revoke_shares_on_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid := coalesce(new.session_id, old.session_id);
begin
  -- 음성 보존기한 만료로 audio_url 을 지우는 것(→ null)은 보호자에게 보이는 대화가 바뀐 게 아니다 —
  -- 다른 음성으로 **교체**될 때만 변경으로 본다.
  if tg_op = 'UPDATE' and (old.content, old.original_content, old.role, old.turn_index, old.topic, old.audio_url)
       is not distinct from (new.content, new.original_content, new.role, new.turn_index, new.topic,
                             coalesce(new.audio_url, old.audio_url)) then
    return null;
  end if;
  perform app.auto_revoke_shares(array(
    select s.id from public.guardian_shares s
      join public.session_analyses a on a.id = s.item_id
     where a.session_id = sid and s.item_type = 'analysis' and s.revoked_at is null));
  return null;
end $$;
revoke all on function app.revoke_shares_on_log_change() from public, anon, authenticated;
drop trigger if exists revoke_shares_on_log_change on public.session_logs;
create trigger revoke_shares_on_log_change after insert or update or delete on public.session_logs
  for each row execute function app.revoke_shares_on_log_change();

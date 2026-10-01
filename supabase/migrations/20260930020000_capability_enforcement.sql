-- 권한 위임 표 DB 강제 — 공개 철회 · 보호자 연결 승인 (감사 2026-09-27 P1-2 · tasks T25.4)
--
-- ■ 무엇이 잘못됐나
--   org_capabilities 의 3종 중 journal_finalize 만 DB(guard_program_journal)가 검사했다. share_revoke(공개 철회)와
--   guardian_link_approve(보호자 연결 승인)는 권한 표에서 역할을 빼도 RLS(같은 기관 돌봄팀)만 통과하면 허용됐다 —
--   웹 기관 관리 화면이 "위임"을 보여 주는데 효과가 없었다(운영 확인 2026-09-30: has_capability 사용처 = 일지 가드 하나).
--
-- ■ 무엇을 하나 — 전이(transition) 트리거로 강제
--   · guardian_shares: revoked_at 이 비어 있다 → 채워지는 UPDATE 는 app.has_capability('share_revoke') 여야 한다.
--   · profile_guardians: status 가 approved 가 **되는** UPDATE 는 app.has_capability('guardian_link_approve') 여야 한다.
--     (거절·연결 해제는 막지 않는다 — 노출을 줄이는 방향이다.)
--   · 사람 요청(auth.uid() 있음)만 검사한다. 서버 내부 처리(auth.uid 없음 — cron·서비스)는 대상이 아니다.
--   · 시스템 자동 철회(T25.12 — 공개한 내용이 바뀌면 공개 해제)는 사람이 누른 "철회"가 아니다 →
--     그 트리거가 트랜잭션 로컬 설정 app.share_auto_revoke='on' 을 켜고 철회하면 이 검사를 건너뛴다.
--     ⚠️ 이 설정은 클라이언트가 켤 수 없다(PostgREST 요청은 set_config 를 부를 수 없고, 켜는 함수는 트리거 전용).
--   · 오류는 코드 식별자(SHARE_REVOKE_FORBIDDEN · GUARDIAN_LINK_APPROVE_FORBIDDEN) — 웹이 문구로 바꾼다.
--   · 트리거 함수는 SECURITY DEFINER — 운영에서 authenticated 는 app 스키마 USAGE 가 없어, invoker 함수 본문에서
--     app.has_capability 를 부르면 'permission denied for schema app' 이 난다(2026-09-30 운영 재현). current_user 를
--     쓰지 않으므로 definer 여도 판정이 바뀌지 않는다(auth.uid()·설정값은 요청 그대로).
--
-- ⚠️ 기본 허용 = 관리자·사회복지사·센터장(권한 표 행이 없는 기관). 권한 표에 요양보호사를 넣지 않은 기관에서는
--    적용 즉시 요양보호사가 공개 철회·연결 승인을 못 한다(계획 §D3 그대로). 운영 확인 2026-09-30: 기관 1곳 ·
--    그 기관 권한 표 3종 모두 요양보호사 포함 → 지금 사용자에게 바뀌는 것은 없다.

create or replace function app.guard_share_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.revoked_at is null and new.revoked_at is not null
     and auth.uid() is not null
     and coalesce(current_setting('app.share_auto_revoke', true), '') <> 'on'
     and not app.has_capability('share_revoke') then
    raise exception 'SHARE_REVOKE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.guard_share_revoke() from public, anon, authenticated;
drop trigger if exists guard_share_revoke on public.guardian_shares;
create trigger guard_share_revoke before update on public.guardian_shares
  for each row execute function app.guard_share_revoke();

create or replace function app.guard_guardian_link_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and auth.uid() is not null
     and not app.has_capability('guardian_link_approve') then
    raise exception 'GUARDIAN_LINK_APPROVE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.guard_guardian_link_approve() from public, anon, authenticated;
drop trigger if exists guard_guardian_link_approve on public.profile_guardians;
create trigger guard_guardian_link_approve before update on public.profile_guardians
  for each row execute function app.guard_guardian_link_approve();

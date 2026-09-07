-- W-2a · 보호자가 공개된 세션의 원본을 읽을 수 있게 한다 (2026-09-06 사용자 확정)
--
-- 문제: 보호자 "대화 분석" 화면(104:1041·104:1830)은 `sessions`·`session_logs`·
-- `session_analyses` 셋을 함께 읽는데, 앞의 둘은 정책이
--   app.current_org_role() <> 'guardian'
-- 이라 보호자에게 **항상 0행**이었다. 분석만 열려 있으니(`..._select_shared_guardian`)
-- 화면은 오류 없이 그냥 비어 보였다 — "아직 기록이 없다"로 오해하기 딱 좋다.
--
-- 해법: 세션 단위로 **공개된 분석이 실제로 존재할 때만** 원본을 연다. 셋을 모두
-- 만족해야 한다.
--   ① 승인된 연결(profile_guardians.status = 'approved')
--   ② 그 어르신의 세션일 것(공개 행의 profile_id 와 분석의 profile_id 가 같을 것)
--   ③ 그 세션의 분석이 공개돼 있고 **철회되지 않았을 것**
-- 철회하면 즉시 닫힌다(guardian_shares.revoked_at 이 조건에 들어 있다).
--
-- ⚠️ 범위를 넓히지 않는다: `planned`·`active` 세션은 분석이 없으므로 자동으로 빠지고
-- (분석은 종료 시에만 생긴다), 공개하지 않은 세션은 계속 보이지 않는다.
-- 요양보호사 브랜치(배정+기관)는 손대지 않는다 — permissive 정책이라 OR 로 더해질 뿐이다.

-- ──────────────────────────────────────────────────────────────────────────
-- 판정 헬퍼 — RLS 정책끼리 서로를 조회해 재귀하지 않도록 security definer.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function app.is_session_shared_to_me(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_analyses a
    join public.guardian_shares s
      on s.item_type = 'analysis'
     and s.item_id = a.id
     and s.revoked_at is null
     and s.profile_id = a.profile_id          -- 어르신 교차 공개 차단
    join public.profile_guardians pg
      on pg.profile_id = s.profile_id
     and pg.guardian_user_id = auth.uid()
     and pg.status = 'approved'
    where a.session_id = p_session_id
  );
$$;

revoke execute on function app.is_session_shared_to_me(uuid) from public;
grant execute on function app.is_session_shared_to_me(uuid) to authenticated;

comment on function app.is_session_shared_to_me(uuid) is
  '승인된 보호자에게 이 세션의 분석이 공개(미철회)돼 있는가. sessions·session_logs 보호자 열람 판정.';

-- 공개된 세션의 기본 정보(시작·종료 시각, 주제 등).
drop policy if exists sessions_select_shared_guardian on public.sessions;
create policy sessions_select_shared_guardian
on public.sessions
for select
using (app.is_session_shared_to_me(id));

-- 공개된 세션의 대화 원문. 분석 카드가 감정 분포·말투를 여기서 센다.
drop policy if exists session_logs_select_shared_guardian on public.session_logs;
create policy session_logs_select_shared_guardian
on public.session_logs
for select
using (app.is_session_shared_to_me(session_id));

-- 조인 성능: 공개 여부를 item 으로 되짚는 경로가 이번에 상시 경로가 된다.
create index if not exists idx_guardian_shares_item_live
  on public.guardian_shares(item_type, item_id)
  where revoked_at is null;
create index if not exists idx_session_analyses_session
  on public.session_analyses(session_id);

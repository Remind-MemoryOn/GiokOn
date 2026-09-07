-- W-6a · 보안 advisor 정리 — 노출 면을 줄인다
--
-- 라이브 advisor(2026-09-07) 결과를 그대로 받아 처리한다. 세 가지다.
--
-- ① **트리거 함수가 RPC 로 열려 있었다**: `handle_new_user()` · `sync_inquiry_answered()`
--    는 트리거 전용인데 `/rest/v1/rpc/...` 로 anon·authenticated 가 부를 수 있었다.
--    트리거 밖에서 부르면 실패하지만, 부를 수 있다는 것 자체가 불필요한 공격면이다.
-- ② **`search_path` 미고정**: `app.set_updated_at`(전 테이블 트리거) ·
--    `app.text_array_within`. 호출자의 search_path 를 따르면 같은 이름의 함수·연산자를
--    앞세워 트리거 안에서 실행시킬 여지가 남는다.
-- ③ **로그인이 필요한 RPC 가 anon 에 열려 있었다**: 함수 안에서 `auth.uid()` 를 확인하니
--    실제로 통과하지는 못하지만, 미인증으로 도달 가능한 경로는 열거·레이트리밋 대상이
--    된다. 로그인 전 화면이 실제로 쓰는 둘만 남긴다.
--
-- ⚠️ 남겨 두는 것(의도적):
--    · `find_login_email` — 아이디 찾기는 **로그아웃 상태** 화면이다.
--    · `list_inquiries`   — 문의 게시판은 비로그인도 목록을 본다(비공개는 서버가 가린다).

-- ── ① 트리거 함수는 아무도 직접 부를 수 없다 ──────────────────────────────
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_inquiry_answered() from public, anon, authenticated;

-- ── ② search_path 고정 ────────────────────────────────────────────────────
-- 스키마를 명시해 두면 호출자 search_path 와 무관하게 같은 객체를 본다.
alter function app.set_updated_at() set search_path = public, pg_temp;
alter function app.text_array_within(text[], integer, integer) set search_path = public, pg_temp;

-- ── ③ 로그인이 필요한 RPC 에서 anon 회수 ──────────────────────────────────
revoke execute on function public.complete_onboarding(text, text, text, text, text, text[]) from anon;
revoke execute on function public.claim_elder_by_code(text) from anon;
revoke execute on function public.link_guardian_by_elder_code(text) from anon;
revoke execute on function public.approve_caregiver_assignment(uuid) from anon;
revoke execute on function public.rotate_elder_code(uuid) from anon;
revoke execute on function public.mark_share_viewed(uuid) from anon;

-- 구 보호자 초대(1회성 코드)는 2026-07-22 재설계로 **어르신 영속 코드**가 대체했다.
-- 저장소·앱 어디에도 호출처가 없다 → 전부 회수한다(표·함수는 이력으로 남긴다).
do $$
begin
  revoke all on function public.redeem_guardian_invite(text) from public, anon, authenticated;
exception when undefined_function then null;
end $$;

comment on function public.find_login_email(text, text) is
  '아이디(이메일) 찾기 — 로그아웃 화면이 부르므로 anon 실행을 의도적으로 남긴다.';

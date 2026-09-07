-- 정리 · 구 "보호자 1회성 초대(QR)" 클러스터 제거 (2026-09-07 사용자 요청)
--
-- 배경: 2026-07-22 재설계로 보호자 연결 방식이 **어르신 영속 코드**(`elder_codes` +
-- `link_guardian_by_elder_code`)로 바뀌었다. 그때 구 경로를 "이력으로 남긴다"며 두었는데,
-- 그 뒤로 한 번도 쓰이지 않았다:
--   · `guardian_invites` 행 0건 · 저장소 코드 참조 0건(생성 타입에만 존재)
--   · `redeem_guardian_invite` 호출처 0건(2026-09-06 에 실행 권한도 이미 회수)
--   · `profile_guardians.invited_via` 참조 0건
-- 쓰지 않는 표가 남아 있으면 "이 경로도 살아 있나" 하는 오해와, RLS 를 새로 손볼 때마다
-- 검토해야 하는 표가 하나 늘어난다. 지운다.
--
-- ⚠️ **`app.generate_invite_code()` 는 지우지 않는다.** 이름은 초대 시절 것이지만 지금은
--    어르신 코드를 만드는 함수다 — `app.bootstrap_profile`(profiles 등록 트리거)과
--    `public.rotate_elder_code` 가 쓴다. 지우면 **어르신 등록이 깨진다.**
--    (이름 변경은 트리거·함수를 함께 고쳐야 해 이번 정리 범위 밖으로 둔다.)
--
-- ⚠️ 되돌릴 수 없다. 행이 0건이라 잃는 데이터는 없지만, 되살리려면
--    `20260718120000_guardian_links.sql` 의 정의를 다시 적용해야 한다.

-- ① 참조부터 끊는다(FK 컬럼).
alter table public.profile_guardians
  drop constraint if exists profile_guardians_invited_via_fkey;
alter table public.profile_guardians
  drop column if exists invited_via;

-- ② 구 교환 함수. 이미 권한은 회수돼 있었다(20260906040000).
drop function if exists public.redeem_guardian_invite(text);

-- ③ 표 본체. 정책·트리거·인덱스는 함께 사라진다.
drop table if exists public.guardian_invites;

comment on function app.generate_invite_code() is
  '난수 코드 생성기. 이름은 구 보호자 초대에서 왔지만 현재 용도는 **어르신 코드**다 '
  '(app.bootstrap_profile · public.rotate_elder_code 가 사용). 지우지 말 것.';

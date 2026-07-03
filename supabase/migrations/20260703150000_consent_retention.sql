-- MemoryOn(기억온) v1 — 동의 증빙 보존 정합 (M9.4)
--
-- 배경: 계정(요양보호사) 삭제 시 동의·철회 증빙(consents)은 법적 대응을 위해
-- 보존하되 계정 식별 링크만 해제(익명화)해야 한다. 그러나 최초 consents 정의는
-- user_id 를 NOT NULL + ON DELETE CASCADE 로 두어, 계정 삭제 시 증빙까지 파기된다.
-- → user_id 를 nullable + ON DELETE SET NULL 로 바꿔 "증빙 보존, 링크만 해제"로 정합.
-- (subject-rights.buildAccountDeletionPlan 의 consents=anonymize 와 일치.)
--
-- append-only. consents(20260703140000) 이후 적용.

alter table public.consents drop constraint if exists consents_user_id_fkey;

alter table public.consents alter column user_id drop not null;

alter table public.consents
  add constraint consents_user_id_fkey
  foreign key (user_id) references public.users(id) on delete set null;

-- 주: profile_id 는 ON DELETE CASCADE 유지 — 어르신(정보주체) 파기 시 관련 동의도
--     함께 파기(삭제권). 계정 삭제와 어르신 삭제의 처리가 다름에 유의.

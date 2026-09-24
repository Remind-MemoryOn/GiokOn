-- 파일럿 계획 D1 (tasks T22.1) — 돌봄팀 역할 확장: 사회복지사·센터장
--
-- 기존 RLS 의 핵심 술어가 `current_org_role() <> 'guardian'` 이라 새 값은 돌봄팀에 자동 포함되고
-- **보호자 격리는 변경 0** 으로 유지된다. 반대로 `= 'caregiver'` 비교는 새 역할을 조용히 빼므로
-- 후속 마이그레이션에서 `app.is_care_team()` 으로 치환한다(파일럿 계획 §11-8).
--
-- 이 값을 가질 수 있는 경로(set_member_role·기관 합류 승인)는 다음 마이그레이션(D3)에서 만든다 —
-- 이 파일만 적용된 상태에서는 두 역할을 가진 사용자가 0명이다(users.role 3중 잠금, 20260908000000).
--
-- ⚠️ 이 파일에 다른 DDL 을 넣지 말 것 — `alter type ... add value` 로 추가한 값은
--    **같은 트랜잭션 안에서 쓸 수 없다**(PostgreSQL 제약). 새 값을 쓰는 정책·함수는 다음 파일에서.
alter type public.org_role add value if not exists 'social_worker';
alter type public.org_role add value if not exists 'center_director';

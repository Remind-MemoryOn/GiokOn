-- MemoryOn(기억온) — profile_caregivers 배정에 'pending'(승인 대기) 상태 추가
-- (2026-07-22, 요양보호사 기관 합류 승인 게이트의 선행 마이그레이션)
--
-- 배경: 어르신 영속 코드(20260722100000)로 데이터 연속성은 확보했으나, 다른
-- 요양보호사가 "기존 기관에 합류"할 경로가 없었다(온보딩이 항상 새 기관 생성).
-- 코드만 알아도 즉시 기관 권한을 얻으면 격리가 약해지므로, 신규 요양보호사의
-- 기관 합류를 **승인형**으로 만든다: 코드로 합류 요청(pending) → 관리자/해당
-- 어르신의 활성 담당이 승인해야 active. is_assigned_caregiver 는 이미 status='active'
-- 만 인정하므로 pending 행은 어떤 데이터 접근도 부여하지 않는다.
--
-- 주의: PostgreSQL 은 새 enum 값을 추가한 트랜잭션 안에서 그 값을 "사용"할 수 없다.
-- 따라서 값 추가만 별도 파일로 커밋하고, 사용(온보딩/승인 RPC·정책)은 후속
-- 마이그레이션(20260722120000)에서 한다. append-only.

alter type public.caregiver_assignment_status add value if not exists 'pending';

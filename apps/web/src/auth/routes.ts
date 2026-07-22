// 역할 기반 라우팅 헬퍼 (T17.4 — SCR-W05)
//
// 로그인 후 도착지: 미온보딩 → /onboarding, guardian → /guardian, 그 외
// (org_admin·caregiver) → /caregiver. users row 조회 실패 시에도 온보딩으로
// 보내 안전하게 재시도하게 한다.

import type { UserRow } from '@giokon/data';

export function routeForUser(row: UserRow | null): string {
  if (!row || !row.onboarded_at) return '/onboarding';
  return row.role === 'guardian' ? '/guardian' : '/caregiver';
}

// 역할 기반 라우팅 헬퍼 (T17.4 — SCR-W05 · 파일럿 W9)
//
// 로그인 후 도착지: 미온보딩 → /onboarding, guardian → /guardian,
// 초대 코드로 가입해 기관 승인을 기다리는(기관 없는) 돌봄팀 → /join-pending, 그 외 → /caregiver.
// users row 조회 실패 시에도 온보딩으로 보내 안전하게 재시도하게 한다.

import { isAwaitingOrgJoin, type UserRow } from '@giokon/data';

export function routeForUser(row: UserRow | null): string {
  if (!row || !row.onboarded_at) return '/onboarding';
  if (row.role === 'guardian') return '/guardian';
  // 기관이 없으면 데이터가 0건이다 — 요양보호사 화면으로 보내면 "기록이 없다"로 보인다.
  return isAwaitingOrgJoin(row) ? '/join-pending' : '/caregiver';
}

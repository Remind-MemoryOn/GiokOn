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

/** 복귀 주소는 같은 앱의 절대 경로만 받는다. URL 정규화 뒤 역할 범위를 검사한다. */
function returnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')
    || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value, 'https://giokon.invalid');
    if (url.origin !== 'https://giokon.invalid') return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function loginPath(returnTo: unknown): string {
  const path = returnPath(returnTo);
  return path ? `/login?returnTo=${encodeURIComponent(path)}` : '/login';
}

export function routeAfterLogin(row: UserRow | null, returnTo: unknown): string {
  const home = routeForUser(row);
  // 온보딩·합류 승인을 복귀 주소로 건너뛸 수 없다.
  if (home !== '/caregiver' && home !== '/guardian') return home;
  const target = returnPath(returnTo);
  if (!target) return home;
  const pathname = target.split(/[?#]/, 1)[0];
  if (pathname === home || pathname.startsWith(`${home}/`) || pathname === '/inquiries' || pathname.startsWith('/inquiries/')) return target;
  return home;
}

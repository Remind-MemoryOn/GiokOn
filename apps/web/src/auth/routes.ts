// 역할 기반 라우팅 헬퍼 (T17.4 — SCR-W05)
//
// 로그인 후 도착지: 미온보딩 → /onboarding, guardian → /guardian, 그 외
// (org_admin·caregiver) → /caregiver. users row 조회 실패 시에도 온보딩으로
// 보내 안전하게 재시도하게 한다.

import type { UserRow } from '@giokon/data';

/** 보호자 초대 코드 스태시 키(QR /join/:code → 로그인 → 온보딩 프리필). */
export const INVITE_CODE_STORAGE_KEY = 'giokon-invite-code';

export function routeForUser(row: UserRow | null): string {
  if (!row || !row.onboarded_at) return '/onboarding';
  return row.role === 'guardian' ? '/guardian' : '/caregiver';
}

export function stashInviteCode(code: string): void {
  try {
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    /* storage 불가 환경 — 프리필 생략 */
  }
}

export function popInviteCode(): string | null {
  try {
    const code = localStorage.getItem(INVITE_CODE_STORAGE_KEY);
    return code && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

export function clearInviteCode(): void {
  try {
    localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

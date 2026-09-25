// 요양보호사 PIN — 어르신 표시 모드에서 요양보호사 화면으로 돌아가는 복귀 게이트(계획 M4).
//
// - 기기의 보안 저장소(expo-secure-store: iOS Keychain · Android Keystore)에만 둔다.
//   서버로 보내지 않는다 — 이 PIN 은 계정 인증이 아니라 "어르신이 실수로 요양보호사 화면을
//   여는 것"을 막는 기기 잠금이다(사용자 확정 2026-09-24).
// - 로그인한 **요양보호사별**로 저장한다. 공용 태블릿에서 다른 직원이 정한 PIN 에 막히지 않게.
// - 4자리 숫자라 추측 공격에는 약하다 → 연속 실패 시 잠시 잠근다(PinAttempts).
import * as SecureStore from 'expo-secure-store';

export const PIN_LENGTH = 4;
/** 연속 실패 허용 횟수 — 넘으면 잠시 잠근다. */
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MS = 30_000;

const PIN_RE = /^\d{4}$/;
const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function keyFor(userId: string): string {
  // SecureStore 키 허용 문자: 영숫자 . - _ — 사용자 id(uuid)는 그대로 들어간다.
  if (!USER_RE.test(userId)) throw new Error('INVALID_USER');
  return `giokon.caregiverPin.${userId}`;
}

function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

export async function hasCaregiverPin(userId: string): Promise<boolean> {
  return isValidPin((await SecureStore.getItemAsync(keyFor(userId))) ?? '');
}

export async function setCaregiverPin(userId: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('INVALID_PIN');
  await SecureStore.setItemAsync(keyFor(userId), pin);
}

/** 저장소를 읽지 못하면 false — 확인할 수 없는 PIN 은 통과시키지 않는다. */
export async function verifyCaregiverPin(userId: string, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  try {
    const stored = await SecureStore.getItemAsync(keyFor(userId));
    return stored !== null && isValidPin(stored) && stored === pin;
  } catch {
    return false;
  }
}

/** 연속 실패 잠금(메모리 — 앱 프로세스 단위). 순수 로직이라 시간은 호출자가 넣는다. */
export class PinAttempts {
  private failures = 0;
  private lockedUntil = 0;

  /** 잠겨 있으면 남은 ms, 아니면 0. */
  remainingLock(now: number): number {
    return Math.max(0, this.lockedUntil - now);
  }

  /** 시도 결과 기록. 실패가 허용 횟수에 닿으면 잠그고 카운트를 새로 시작한다. */
  record(ok: boolean, now: number): { failures: number; lockedMs: number } {
    if (ok) {
      this.failures = 0;
      return { failures: 0, lockedMs: 0 };
    }
    this.failures += 1;
    if (this.failures >= PIN_MAX_FAILURES) {
      this.failures = 0;
      this.lockedUntil = now + PIN_LOCK_MS;
      return { failures: PIN_MAX_FAILURES, lockedMs: PIN_LOCK_MS };
    }
    return { failures: this.failures, lockedMs: 0 };
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ items: new Map<string, string>(), fail: false }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => { if (store.fail) throw new Error('keystore'); return store.items.get(key) ?? null; }),
  setItemAsync: vi.fn(async (key: string, value: string) => { store.items.set(key, value); }),
}));
import { hasCaregiverPin, PinAttempts, PIN_LOCK_MS, PIN_MAX_FAILURES, setCaregiverPin, verifyCaregiverPin } from './caregiverPin';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
beforeEach(() => { store.items.clear(); store.fail = false; });

describe('caregiver PIN storage', () => {
  it('stores a 4-digit PIN per caregiver and verifies only that caregiver’s PIN', async () => {
    expect(await hasCaregiverPin(A)).toBe(false);
    await setCaregiverPin(A, '1234');
    expect(await hasCaregiverPin(A)).toBe(true);
    expect(await hasCaregiverPin(B)).toBe(false);
    expect(await verifyCaregiverPin(A, '1234')).toBe(true);
    expect(await verifyCaregiverPin(A, '4321')).toBe(false);
    expect(await verifyCaregiverPin(B, '1234')).toBe(false);
  });
  it.each(['123', '12345', 'abcd', '12 4', ''])('rejects malformed PIN %j', async pin => {
    await expect(setCaregiverPin(A, pin)).rejects.toThrow();
    expect(await verifyCaregiverPin(A, pin)).toBe(false);
  });
  it('fails closed when the secure store cannot be read', async () => {
    await setCaregiverPin(A, '1234');
    store.fail = true;
    expect(await verifyCaregiverPin(A, '1234')).toBe(false);
  });
  it('refuses keys built from unexpected user ids', async () => {
    await expect(setCaregiverPin('../x', '1234')).rejects.toThrow();
  });
});

describe('PIN attempt lockout', () => {
  it('locks after the maximum consecutive failures and resets on success', () => {
    const attempts = new PinAttempts();
    for (let i = 1; i < PIN_MAX_FAILURES; i++) expect(attempts.record(false, 0)).toEqual({ failures: i, lockedMs: 0 });
    expect(attempts.record(false, 1000)).toEqual({ failures: PIN_MAX_FAILURES, lockedMs: PIN_LOCK_MS });
    expect(attempts.remainingLock(1000 + PIN_LOCK_MS - 1)).toBe(1);
    expect(attempts.remainingLock(1000 + PIN_LOCK_MS)).toBe(0);
    attempts.record(false, 0);
    expect(attempts.record(true, 0)).toEqual({ failures: 0, lockedMs: 0 });
  });
});

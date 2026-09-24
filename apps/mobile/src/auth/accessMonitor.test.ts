import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserRow } from '@giokon/data';
import { AccessMonitor, type AccessSnapshot } from './accessMonitor';

const row = { id: 'a', role: 'caregiver', org_id: 'org', onboarded_at: 'date' } as UserRow;
const snapshot = (overrides: Partial<AccessSnapshot> = {}): AccessSnapshot => ({
  row, activeProfileDenied: false, ...overrides,
});
function setup() {
  const load = vi.fn(async () => snapshot());
  const reset = vi.fn();
  const publish = vi.fn();
  const monitor = new AccessMonitor({ load, reset, publish });
  monitor.identify('a');
  reset.mockClear();
  return { monitor, load, reset, publish };
}
afterEach(() => vi.useRealTimers());

describe('mobile permission revalidation', () => {
  it('unchanged permissions preserve a conversation', async () => {
    const api = setup();
    await api.monitor.refresh();
    await api.monitor.refresh();
    expect(api.reset).not.toHaveBeenCalled();
  });
  it.each(['social_worker', 'center_director', 'org_admin'] as const)('a %s care-team member keeps an active conversation', async role => {
    const api = setup();
    api.load.mockResolvedValue(snapshot({ row: { ...row, role } }));
    await api.monitor.refresh();
    await api.monitor.refresh();
    expect(api.reset).not.toHaveBeenCalled();
    expect(api.publish).toHaveBeenLastCalledWith('a', { ...row, role });
  });
  it.each([
    snapshot({ row: { ...row, role: 'guardian' } }),
    snapshot({ row: { ...row, org_id: 'other' } }),
    snapshot({ row: { ...row, onboarded_at: null } }),
    snapshot({ row: null }),
    snapshot({ activeProfileDenied: true }),
  ])('discards resources before publishing revoked access %j', async next => {
    const api = setup();
    await api.monitor.refresh();
    api.load.mockResolvedValue(next);
    await api.monitor.refresh();
    expect(api.reset).toHaveBeenCalledOnce();
    expect(api.reset.mock.invocationCallOrder[0]).toBeLessThan(api.publish.mock.invocationCallOrder[1]);
  });
  it('failed and timed-out checks remove the previously accepted row', async () => {
    vi.useFakeTimers();
    const api = setup();
    await api.monitor.refresh();
    api.load.mockRejectedValueOnce(new Error('network'));
    await api.monitor.refresh();
    expect(api.publish).toHaveBeenLastCalledWith('a', null);
    api.load.mockImplementationOnce(() => new Promise(() => {}));
    const check = api.monitor.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    await check;
    expect(api.reset).toHaveBeenCalledTimes(2);
    expect(api.publish).toHaveBeenLastCalledWith('a', null);
  });
  it('a delayed previous-account response cannot republish or clear the new account', async () => {
    const api = setup();
    let resolve!: (value: AccessSnapshot) => void;
    api.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const old = api.monitor.refresh();
    api.monitor.identify('b');
    api.load.mockResolvedValue(snapshot({ row: { ...row, id: 'b' } }));
    await api.monitor.refresh();
    api.reset.mockClear();
    resolve(snapshot());
    expect(await old).toBeNull();
    expect(api.publish).toHaveBeenCalledExactlyOnceWith('b', { ...row, id: 'b' });
    expect(api.reset).not.toHaveBeenCalled();
  });
  it('a delayed success cannot override a newer revocation', async () => {
    const api = setup();
    let resolve!: (value: AccessSnapshot) => void;
    api.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const old = api.monitor.refresh();
    api.load.mockResolvedValue(snapshot({ row: null }));
    await api.monitor.refresh();
    resolve(snapshot());
    await old;
    expect(api.publish).toHaveBeenCalledExactlyOnceWith('a', null);
  });
});

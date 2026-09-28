import { describe, expect, it, vi } from 'vitest';
import { resolveStartPlan } from './plannedStart';

describe('resolveStartPlan', () => {
  it('adopts the plan returned by the fresh query', async () => {
    const row = { id: 'planned-1' };
    await expect(resolveStartPlan(async () => row)).resolves.toEqual({ kind: 'planned', row });
  });

  it('starts an instant session only when the fresh query succeeds with no plan', async () => {
    await expect(resolveStartPlan(async () => null)).resolves.toEqual({ kind: 'instant' });
  });

  it('never falls back to an instant session when the query fails', async () => {
    await expect(resolveStartPlan(async () => { throw new Error('network'); })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('uses the answer that arrives after waiting, not an earlier empty render value', async () => {
    // 렌더 때는 조회 중이라 null 이었지만, 시작 직전 조회가 끝나면 그 설계를 쓴다.
    let resolve!: (row: { id: string }) => void;
    const fetch = vi.fn(() => new Promise<{ id: string } | null>(r => { resolve = r; }));
    const pending = resolveStartPlan(fetch);
    resolve({ id: 'planned-late' });
    await expect(pending).resolves.toEqual({ kind: 'planned', row: { id: 'planned-late' } });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

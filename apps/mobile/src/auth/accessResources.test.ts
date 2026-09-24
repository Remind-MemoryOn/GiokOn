import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function api() {
  const getRow = vi.fn(async () => ({ id: 'user', role: 'caregiver', org_id: 'org', onboarded_at: 'date' }));
  const range = vi.fn(async () => ({ data: [{ profile_id: 'elder' }], error: null as Error | null }));
  const maybeSingle = vi.fn(async () => ({ data: { id: 'elder' } as { id: string } | null, error: null }));
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), range, maybeSingle };
  const from = vi.fn(() => query);
  const active = { elder: { id: 'elder' }, remoteId: 'session' };
  const canProcess = vi.fn(async () => true);
  const close = vi.fn(async () => {});
  const setState = vi.fn();
  const cancelQueries = vi.fn(async () => {});
  const clear = vi.fn();
  const exports: { loadAccessSnapshot?: (uid: string) => Promise<{ activeProfileDenied: boolean }>; resetAccessResources?: () => void } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./accessResources.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => {
    if (name === '@giokon/data') return { getCurrentUserRow: getRow, getGiokonClient: () => ({ from }), canProcessSession: canProcess };
    if (name === '../lib/supabase') return { queryScope: { reset: () => { void cancelQueries(); clear(); } } };
    if (name === '../store/appStore') return { useApp: { getState: () => ({ active }), setState } };
    if (name === '../lib/live/engine') return { closeLiveEngine: close };
    throw new Error(name);
  } });
  return { exports, getRow, range, maybeSingle, from, query, close, setState, cancelQueries, clear, canProcess };
}

describe('access checks and resource disposal', () => {
  it('denies a visible elder whose processing consent/session has been withdrawn', async () => {
    const a = api();
    a.canProcess.mockResolvedValue(false);
    expect((await a.exports.loadAccessSnapshot!('user')).activeProfileDenied).toBe(true);
    expect(a.canProcess).toHaveBeenCalledWith('session');
  });
  it('checks the current profile under RLS without consulting assignments (pilot D4: assignment is not access)', async () => {
    const a = api();
    const result = await a.exports.loadAccessSnapshot!('user');
    expect(result.activeProfileDenied).toBe(false);
    expect(a.from).toHaveBeenCalledWith('profiles');
    expect(a.from).not.toHaveBeenCalledWith('profile_caregivers');
  });
  it.each(['social_worker', 'center_director'])('checks a %s like any care-team member', async role => {
    const a = api();
    a.getRow.mockResolvedValue({ id: 'user', role, org_id: 'org', onboarded_at: 'date' });
    a.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await a.exports.loadAccessSnapshot!('user')).activeProfileDenied).toBe(true);
  });
  it('a now-invisible active profile is denied', async () => {
    const a = api();
    a.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await a.exports.loadAccessSnapshot!('user')).activeProfileDenied).toBe(true);
  });
  it('a failed profile query is not treated as permission', async () => {
    const a = api();
    a.maybeSingle.mockResolvedValue({ data: null, error: new Error('offline') } as never);
    await expect(a.exports.loadAccessSnapshot!('user')).rejects.toThrow('offline');
  });
  it('disposes the voice connection, session state and query state', () => {
    const a = api();
    a.exports.resetAccessResources!();
    expect(a.close).toHaveBeenCalledOnce();
    expect(a.setState).toHaveBeenCalledWith({ active: null, lastFinished: null });
    expect(a.cancelQueries).toHaveBeenCalledOnce();
    expect(a.clear).toHaveBeenCalledOnce();
  });
});

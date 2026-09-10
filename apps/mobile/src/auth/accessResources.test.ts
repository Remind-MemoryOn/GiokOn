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
  const cancelSpeak = vi.fn();
  const setState = vi.fn();
  const cancelQueries = vi.fn(async () => {});
  const clear = vi.fn();
  const exports: { loadAccessSnapshot?: (uid: string) => Promise<{ assignments: string[]; activeProfileDenied: boolean }>; resetAccessResources?: () => void } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./accessResources.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => {
    if (name === '@giokon/data') return { getCurrentUserRow: getRow, getGiokonClient: () => ({ from }), canProcessSession: canProcess };
    if (name === '../lib/supabase') return { queryScope: { reset: () => { void cancelQueries(); clear(); } } };
    if (name === '../store/appStore') return { useApp: { getState: () => ({ active }), setState } };
    if (name === '../lib/live/engine') return { closeLiveEngine: close };
    if (name === '../lib/speech') return { ExpoSpeechProvider: { cancelSpeak } };
    throw new Error(name);
  } });
  return { exports, getRow, range, maybeSingle, from, query, close, cancelSpeak, setState, cancelQueries, clear, canProcess };
}

describe('access checks and resource disposal', () => {
  it('denies a visible elder whose processing consent/session has been withdrawn', async () => {
    const a = api();
    a.canProcess.mockResolvedValue(false);
    expect((await a.exports.loadAccessSnapshot!('user')).activeProfileDenied).toBe(true);
    expect(a.canProcess).toHaveBeenCalledWith('session');
  });
  it('pages all own active assignments and checks the current profile under RLS', async () => {
    const a = api();
    a.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ profile_id: `elder-${i}` })), error: null });
    const result = await a.exports.loadAccessSnapshot!('user');
    expect(result.assignments).toHaveLength(501);
    expect(a.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(a.query.eq).toHaveBeenCalledWith('caregiver_user_id', 'user');
    expect(a.query.eq).toHaveBeenCalledWith('status', 'active');
    expect(a.from).toHaveBeenCalledWith('profiles');
  });
  it('a now-invisible active profile is denied', async () => {
    const a = api();
    a.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await a.exports.loadAccessSnapshot!('user')).activeProfileDenied).toBe(true);
  });
  it('a failed assignment query is not treated as a successful empty list', async () => {
    const a = api();
    a.range.mockResolvedValue({ data: [], error: new Error('offline') });
    await expect(a.exports.loadAccessSnapshot!('user')).rejects.toThrow('offline');
  });
  it('disposes Live, TTS, session state and query state', () => {
    const a = api();
    a.exports.resetAccessResources!();
    expect(a.close).toHaveBeenCalledOnce();
    expect(a.cancelSpeak).toHaveBeenCalledOnce();
    expect(a.setState).toHaveBeenCalledWith({ active: null, lastFinished: null });
    expect(a.cancelQueries).toHaveBeenCalledOnce();
    expect(a.clear).toHaveBeenCalledOnce();
  });
});

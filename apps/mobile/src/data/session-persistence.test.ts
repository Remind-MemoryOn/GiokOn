import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { SessionSafetyEvent } from '../store/appStore';

function fixture() {
  let generation = 0;
  let user = { id: 'a' };
  const active = (id: string) => ({ session: { id }, elder: { id: `elder-${id}` }, remoteId: null as string | null,
    turns: [], syncedTurns: 0, events: [] as SessionSafetyEvent[], startedAt: 'synthetic-date', currentTopic: null });
  const attach = vi.fn();
  const finish = vi.fn();
  const clear = vi.fn();
  const state = { active: active('a'), lastFinished: null as unknown, attachRemoteSession: attach,
    finishSession: finish, clearLastFinished: clear, markSynced: vi.fn() };
  const single = vi.fn(async () => ({ data: { id: 'remote' }, error: null }));
  const maybeSingle = vi.fn(async (): Promise<{ data: { id: string } | null; error: { message: string } | null }> => ({ data: { id: 'planned' }, error: null }));
  const writes: string[] = [];
  let table = '';
  const builder = { insert: vi.fn((row: { status?: string }) => { writes.push(`${table}:insert${row.status ? `:${row.status}` : ''}`); return builder; }),
    update: vi.fn((row: { status?: string }) => { writes.push(`${table}:update${row.status ? `:${row.status}` : ''}`); return builder; }),
    upsert: vi.fn(async () => { writes.push(`${table}:upsert`); return { error: null }; }),
    delete: vi.fn(() => { writes.push(`${table}:delete`); return builder; }),
    eq: () => builder, select: () => builder, single, maybeSingle };
  const from = vi.fn((name: string) => { table = name; return builder; });
  const persistTurns = vi.fn(async () => { writes.push('session_logs:upsert'); });
  const exports: { useSessionPersistence?: () => { syncProgress: () => Promise<boolean>; adoptPlannedSession: (id: string, at: string) => Promise<void>; openRemoteSession: () => Promise<void>; finishAndPersist: () => Promise<unknown>; discardUnsaved: () => void } } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./session-persistence.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console: { warn: vi.fn() }, setTimeout: (fn: () => void) => setTimeout(fn, 0),
    require: (name: string) => {
      if (name === 'react') return { useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn() };
      if (name === '@giokon/data') return { getGiokonClient: () => ({ from }), persistConversationTurns: persistTurns, queryKeys: { sessions: () => [], sessionAnalyses: () => [], recentSessions: [] } };
      if (name === '../lib/supabase') return { queryScope: { capture: () => {
        const captured = generation;
        return { generation, current: () => captured === generation, assertCurrent: () => {
          if (captured !== generation) throw new Error('identity changed');
        }, client: { invalidateQueries: vi.fn() } };
      } } };
      if (name === '../store/appStore') return { useApp: { getState: () => state } };
      if (name === '../auth/AuthProvider') return { useAuth: () => ({ user, accessRevision: generation }) };
      throw new Error(name);
    },
  });
  return { state, builder, writes, persistTurns, api: () => exports.useSessionPersistence!(), single, maybeSingle, from, attach, finish, clear,
    ready: () => { state.active.remoteId = 'remote'; },
    switchUser: () => { generation++; user = { id: 'b' }; state.active = active('b'); } };
}

describe('session writes across account changes', () => {
  it('reports missing remote session as unsaved for the automatic loop', async () => {
    const f=fixture(); expect(await f.api().syncProgress()).toBe(false);
  });
  it('reports completion only after the progress update succeeds', async () => {
    const f=fixture(); f.ready(); expect(await f.api().syncProgress()).toBe(true);
  });
  it.each([null, { message: 'PROCESSING_CONSENT_REQUIRED' }])('does not attach a planned session without a successful activation: %s', async error => {
    const f = fixture();
    f.maybeSingle.mockResolvedValue({ data: null, error });
    await f.api().adoptPlannedSession('planned', 'synthetic-date');
    expect(f.attach).not.toHaveBeenCalled();
  });
  it('does not attach an old delayed remote session to the new account', async () => {
    const f = fixture();
    let done!: (result: { data: { id: string }; error: null }) => void;
    f.single.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const old = f.api();
    const opening = old.openRemoteSession();
    f.switchUser();
    done({ data: { id: 'remote-a' }, error: null });
    await opening;
    expect(f.attach).not.toHaveBeenCalled();
    expect(f.from).toHaveBeenCalledOnce(); // no retry under the new credentials
    await f.api().openRemoteSession();
    expect(f.attach).toHaveBeenCalledExactlyOnceWith('remote');
  });
  it('stale screen callbacks cannot start writes, finish or discard the new session', async () => {
    const f = fixture();
    const old = f.api();
    f.switchUser();
    await old.openRemoteSession();
    await old.finishAndPersist();
    old.discardUnsaved();
    expect(f.from).not.toHaveBeenCalled();
    expect(f.finish).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
  });
});

it('writes a relay review event with no fabricated excerpt or categories',async()=>{
  const f=fixture();f.ready();
  f.state.active.events.push({level:'watch',categories:[],matchedTerms:[],excerpt:'',caregiverAlert:'중계 확인 요청',acknowledgedAt:null,remoteId:null,ackSynced:false});
  expect(await f.api().syncProgress()).toBe(true);
  expect(f.builder.insert).toHaveBeenCalledWith(expect.objectContaining({session_id:'remote',level:'watch',categories:[],matched_terms:[],excerpt:'',caregiver_alert:'중계 확인 요청'}));
  expect(f.state.markSynced).toHaveBeenCalledWith(expect.objectContaining({events:[expect.objectContaining({remoteId:'remote'})]}));
});

describe('fallback save without a remote session (M7)', () => {
  const bundle = (events: SessionSafetyEvent[] = []) => ({ logId: 'log', elder: { id: 'elder-a' },
    turns: [{ id: 't1', speaker: 'AI', text: '질문', timestamp: 'synthetic-date' }],
    events, analysis: { version: 1 }, startedAt: 'synthetic-start', endedAt: 'synthetic-end',
    durationSeconds: 60, currentTopic: null, remoteId: null, syncedTurns: 0 });
  const event: SessionSafetyEvent = { level: 'watch', categories: [], matchedTerms: [], excerpt: '', caregiverAlert: '확인',
    acknowledgedAt: null, remoteId: null, ackSynced: false };

  it('creates the session active and ends it only after turns, analysis and events are written', async () => {
    const f = fixture();
    f.state.lastFinished = bundle([event]);
    expect(await f.api().finishAndPersist()).toEqual({ status: 'saved', logId: 'remote' });
    expect(f.writes).toEqual(['sessions:insert:active', 'session_logs:upsert', 'session_analyses:upsert',
      'safety_events:insert', 'sessions:update:ended']);
    expect(f.builder.update).toHaveBeenLastCalledWith({ status: 'ended', ended_at: 'synthetic-end', duration_seconds: 60 });
    expect(f.builder.insert).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ ended_at: expect.anything() }));
  });

  it('never marks the session ended when a later write fails, and removes the partial session', async () => {
    const f = fixture();
    f.state.lastFinished = bundle();
    f.builder.upsert.mockResolvedValue({ error: { message: 'analysis failed' } } as never);
    expect(await f.api().finishAndPersist()).toMatchObject({ status: 'failed' });
    expect(f.writes).not.toContain('sessions:update:ended');
    expect(f.writes.at(-1)).toBe('sessions:delete');
    expect(f.clear).not.toHaveBeenCalled();
  });
});

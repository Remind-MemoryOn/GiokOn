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
  const randomUUID = vi.fn().mockReturnValueOnce('remote').mockReturnValue('different-request');
  const finish = vi.fn();
  const clear = vi.fn();
  const state = { active: active('a'), lastFinished: null as unknown, attachRemoteSession: attach,
    finishSession: finish, clearLastFinished: clear, markSynced: vi.fn() };
  const single = vi.fn(async () => ({ data: { id: 'remote' }, error: null }));
  type RecoveredSession = { id: string; profile_id: string; user_id: string; status: string; paused_at: string | null; ended_at: string | null };
  const maybeSingle = vi.fn(async (): Promise<{ data: RecoveredSession | null; error: { message: string } | null }> => ({ data: null, error: null }));
  const writes: string[] = [];
  let table = '';
  const builder = { insert: vi.fn((row: { status?: string }) => { writes.push(`${table}:insert${row.status ? `:${row.status}` : ''}`); return builder; }),
    update: vi.fn((row: { status?: string }) => { writes.push(`${table}:update${row.status ? `:${row.status}` : ''}`); return builder; }),
    upsert: vi.fn(async () => { writes.push(`${table}:upsert`); return { error: null }; }),
    delete: vi.fn(() => { writes.push(`${table}:delete`); return builder; }),
    eq: vi.fn((_key: string, _value: unknown) => builder), select: () => builder, single, maybeSingle };
  const from = vi.fn((name: string) => { table = name; return builder; });
  const rpc = vi.fn(async (_name: string, _args: unknown): Promise<{ data: { session_id: string; started_at: string } | null; error: { message: string } | null }> =>
    ({ data: { session_id: 'planned', started_at: 'server-time' }, error: null }));
  const persistTurns = vi.fn(async () => { writes.push('session_logs:upsert'); });
  const exports: { useSessionPersistence?: () => { syncProgress: () => Promise<boolean>; adoptPlannedSession: (id: string) => Promise<unknown>; openRemoteSession: () => Promise<unknown>; finishAndPersist: () => Promise<unknown>; discardUnsaved: () => void } } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./session-persistence.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console: { warn: vi.fn() }, setTimeout: (fn: () => void) => setTimeout(fn, 0),
    require: (name: string) => {
      if (name === 'react') return { useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn() };
      if (name === 'expo-crypto') return { randomUUID };
      if (name === '@giokon/data') return { getGiokonClient: () => ({ from, rpc }), persistConversationTurns: persistTurns, queryKeys: { sessions: () => [], sessionAnalyses: () => [], recentSessions: [] } };
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
  return { state, builder, writes, persistTurns, api: () => exports.useSessionPersistence!(), single, maybeSingle, from, rpc, attach, finish, clear, randomUUID,
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
    f.rpc.mockResolvedValue({ data: null, error });
    await f.api().adoptPlannedSession('planned');
    expect(f.attach).not.toHaveBeenCalled();
  });
  it('does not attach an old delayed remote session to the new account', async () => {
    const f = fixture();
    let done!: (result: { data: { id: string }; error: null }) => void;
    f.single.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const old = f.api();
    const opening = old.openRemoteSession();
    await vi.waitFor(() => expect(f.single).toHaveBeenCalledOnce());
    f.switchUser();
    done({ data: { id: 'remote-a' }, error: null });
    await opening;
    expect(f.attach).not.toHaveBeenCalled();
    expect(f.single).toHaveBeenCalledOnce(); // no retry under the new credentials
    f.single.mockResolvedValue({ data: { id: 'different-request' }, error: null });
    await f.api().openRemoteSession();
    expect(f.attach).toHaveBeenCalledExactlyOnceWith('different-request');
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

it('records a relay-pending event under the relay event id only if absent, then syncs the acknowledgement (T25.17)',async()=>{
  const f=fixture();f.ready();
  f.state.active.events.push({level:'crisis',categories:['self_harm'],matchedTerms:[],excerpt:'',caregiverAlert:'위기 안내',
    acknowledgedAt:'synthetic-ack',remoteId:null,reservedId:'cccccccc-cccc-cccc-cccc-cccccccccccc',ackSynced:false});
  expect(await f.api().syncProgress()).toBe(true);
  expect(f.builder.insert).not.toHaveBeenCalledWith(expect.objectContaining({caregiver_alert:'위기 안내'}));
  expect(f.builder.upsert).toHaveBeenCalledWith(
    expect.objectContaining({id:'cccccccc-cccc-cccc-cccc-cccccccccccc',session_id:'remote',level:'crisis',categories:['self_harm'],excerpt:'',matched_terms:[]}),
    {onConflict:'id',ignoreDuplicates:true});
  // 중계 재시도가 먼저 넣었다면 upsert 는 아무것도 안 하므로 확인 시각은 따로 쓴다.
  expect(f.builder.update).toHaveBeenCalledWith({acknowledged_at:'synthetic-ack',acknowledged_by:'a'});
  expect(f.state.markSynced).toHaveBeenCalledWith(expect.objectContaining({events:[expect.objectContaining({remoteId:'cccccccc-cccc-cccc-cccc-cccccccccccc',reservedId:null,ackSynced:true})]}));
});

describe('fallback save without a remote session (M7)', () => {
  const bundle = (events: SessionSafetyEvent[] = []) => ({ logId: 'log', elder: { id: 'elder-a' },
    turns: [{ id: 't1', speaker: 'AI', text: '질문', timestamp: 'synthetic-date' }],
    events, analysis: { version: 1 }, startedAt: 'synthetic-start', endedAt: 'synthetic-end',
    durationSeconds: 60, currentTopic: null, remoteId: null, syncedTurns: 0 });
  const event: SessionSafetyEvent = { level: 'watch', categories: [], matchedTerms: [], excerpt: '', caregiverAlert: '확인',
    acknowledgedAt: null, remoteId: null, ackSynced: false };

  it('creates the session as recording (not runnable) and ends it only after turns, analysis and events are written (T25.18)', async () => {
    const f = fixture();
    f.state.lastFinished = bundle([event]);
    expect(await f.api().finishAndPersist()).toEqual({ status: 'saved', logId: 'remote' });
    expect(f.writes).toEqual(['sessions:insert:recording', 'session_logs:upsert', 'session_analyses:upsert',
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

describe('start rejection reasons (pilot D6 · T21.13)', () => {
  it('reports the per-supervisor limit without retrying a policy rejection', async () => {
    const f = fixture();
    f.single.mockResolvedValue({ data: null, error: { message: 'SESSION_SUPERVISOR_LIMIT' } } as never);
    expect(await f.api().openRemoteSession()).toBe('supervisor_limit');
    expect(f.single).toHaveBeenCalledOnce();
    expect(f.attach).not.toHaveBeenCalled();
  });
  it('starts a planned session through the DB start RPC so the caller becomes the facilitator (T25.11)', async () => {
    const f = fixture();
    expect(await f.api().adoptPlannedSession('planned')).toBeNull();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('start_planned_session', { p_session_id: 'planned' });
    // 직접 UPDATE(planned → active) 경로를 더 쓰지 않는다 — user_id·시작 시각은 DB 가 정한다.
    expect(f.builder.update).not.toHaveBeenCalled();
    expect(f.attach).toHaveBeenCalledExactlyOnceWith('planned');
  });
  it.each([
    ['SESSION_SUPERVISOR_LIMIT', 'supervisor_limit'],
    ['ELDER_SESSION_ACTIVE', 'elder_busy'],
    ['SESSION_ALREADY_STARTED', 'already_started'],
    ['PROCESSING_CONSENT_REQUIRED', 'consent_required'],
    ['SESSION_START_FORBIDDEN', 'failed'],
  ])('maps %s from the start RPC to %s without retrying', async (message, reason) => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await f.api().adoptPlannedSession('planned')).toBe(reason);
    expect(f.rpc).toHaveBeenCalledOnce();
    expect(f.attach).not.toHaveBeenCalled();
  });
  it('treats an instant start of an elder already in a conversation as elder_busy (T25.19)', async () => {
    const f = fixture();
    f.single.mockResolvedValue({ data: null, error: { message: 'ELDER_SESSION_ACTIVE' } } as never);
    expect(await f.api().openRemoteSession()).toBe('elder_busy');
    expect(f.single).toHaveBeenCalledOnce();
  });
  it('does not send a device clock start time for an instant session (T25.18)', async () => {
    const f = fixture();
    expect(await f.api().openRemoteSession()).toBeNull();
    expect(f.builder.insert).toHaveBeenCalledWith(expect.not.objectContaining({ started_at: expect.anything() }));
  });
  it('keeps unknown failures generic after retrying', async () => {
    const g = fixture();
    g.single.mockResolvedValue({ data: null, error: { message: 'network down' } } as never);
    expect(await g.api().openRemoteSession()).toBe('failed');
    expect(g.single).toHaveBeenCalledTimes(3);
  });
});

describe('instant session creation response recovery', () => {
  const recovered = { id: 'remote', profile_id: 'elder-a', user_id: 'a', status: 'active', paused_at: null, ended_at: null };

  it('recovers the same committed row after its insert response is lost, without creating another session', async () => {
    const f = fixture();
    f.single.mockRejectedValueOnce(new Error('response lost'));
    f.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue({ data: recovered, error: null });
    expect(await f.api().openRemoteSession()).toBeNull();
    expect(f.builder.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'remote', profile_id: 'elder-a', user_id: 'a' }));
    expect(f.builder.eq.mock.calls).toEqual([
      ['id', 'remote'], ['user_id', 'a'], ['profile_id', 'elder-a'],
      ['id', 'remote'], ['user_id', 'a'], ['profile_id', 'elder-a'],
    ]);
    expect(f.attach).toHaveBeenCalledExactlyOnceWith('remote');
  });

  it('uses the same id on every retry and recovers even when the final insert response is lost', async () => {
    const f = fixture();
    f.single.mockRejectedValue(new Error('response lost'));
    for (let check = 0; check < 5; check++) f.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    f.maybeSingle.mockResolvedValue({ data: recovered, error: null });
    expect(await f.api().openRemoteSession()).toBeNull();
    expect(f.builder.insert).toHaveBeenCalledTimes(3);
    expect(f.randomUUID).toHaveBeenCalledOnce();
    for (const [row] of f.builder.insert.mock.calls) expect(row).toMatchObject({ id: 'remote' });
    expect(f.attach).toHaveBeenCalledExactlyOnceWith('remote');
  });

  it('keeps the same creation id when the screen retries the same local session after a failed attempt', async () => {
    const f = fixture();
    f.single.mockRejectedValue(new Error('response lost'));
    expect(await f.api().openRemoteSession()).toBe('failed');
    // A later read can finally see the committed request; the store snapshot has
    // changed, but its session identity is unchanged across progress updates.
    f.state.active = { ...f.state.active };
    f.maybeSingle.mockResolvedValue({ data: recovered, error: null });
    expect(await f.api().openRemoteSession()).toBeNull();
    expect(f.randomUUID).toHaveBeenCalledOnce();
    expect(f.builder.insert).toHaveBeenCalledTimes(3);
    expect(f.attach).toHaveBeenCalledExactlyOnceWith('remote');
  });

  it('keeps a different active session as elder_busy instead of adopting it', async () => {
    const f = fixture();
    f.single.mockResolvedValue({ data: null, error: { message: 'ELDER_SESSION_ACTIVE' } } as never);
    expect(await f.api().openRemoteSession()).toBe('elder_busy');
    expect(f.attach).not.toHaveBeenCalled();
    expect(f.builder.eq).toHaveBeenCalledWith('id', 'remote');
    expect(f.single).toHaveBeenCalledOnce();
  });

  it.each([
    { id: 'other' }, { user_id: 'other' }, { profile_id: 'other' },
    { status: 'ended', ended_at: 'server-time' }, { paused_at: 'server-time' },
  ])('does not attach an incompatible recovered row: %s', async mismatch => {
    const f = fixture();
    f.maybeSingle.mockResolvedValue({ data: { ...recovered, ...mismatch }, error: null });
    expect(await f.api().openRemoteSession()).not.toBeNull();
    expect(f.attach).not.toHaveBeenCalled();
    expect(f.builder.insert).not.toHaveBeenCalled();
  });

  it('does not recover or attach across an account change during the lookup', async () => {
    const f = fixture();
    let resolve!: (value: { data: typeof recovered; error: null }) => void;
    f.maybeSingle.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const opening = f.api().openRemoteSession();
    f.switchUser(); resolve({ data: recovered, error: null });
    expect(await opening).toBe('failed');
    expect(f.builder.insert).not.toHaveBeenCalled();
    expect(f.attach).not.toHaveBeenCalled();
  });
});

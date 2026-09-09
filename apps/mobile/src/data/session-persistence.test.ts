import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  let generation = 0;
  let user = { id: 'a' };
  const active = (id: string) => ({ session: { id }, elder: { id: `elder-${id}` }, remoteId: null,
    turns: [], startedAt: 'synthetic-date', currentTopic: null });
  const attach = vi.fn();
  const finish = vi.fn();
  const clear = vi.fn();
  const state = { active: active('a'), lastFinished: null, attachRemoteSession: attach,
    finishSession: finish, clearLastFinished: clear };
  const single = vi.fn(async () => ({ data: { id: 'remote' }, error: null }));
  const builder = { insert: vi.fn(() => builder), select: () => builder, single };
  const from = vi.fn(() => builder);
  const exports: { useSessionPersistence?: () => { openRemoteSession: () => Promise<void>; finishAndPersist: () => Promise<unknown>; discardUnsaved: () => void } } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./session-persistence.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console: { warn: vi.fn() }, setTimeout,
    require: (name: string) => {
      if (name === 'react') return { useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn() };
      if (name === '@giokon/data') return { getGiokonClient: () => ({ from }), queryKeys: { sessions: () => [], sessionAnalyses: () => [], recentSessions: [] } };
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
  return { api: () => exports.useSessionPersistence!(), single, from, attach, finish, clear,
    switchUser: () => { generation++; user = { id: 'b' }; state.active = active('b'); } };
}

describe('session writes across account changes', () => {
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

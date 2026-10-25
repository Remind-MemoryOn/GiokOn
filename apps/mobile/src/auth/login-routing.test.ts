import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { UserRow } from '@giokon/data';
import { AccessMonitor, type AccessSnapshot } from './accessMonitor';
import { evaluateAppAccess } from './appAccess';
import { loginCanvasHeight } from '../lib/keyboard-layout';

type AuthState = { authed: boolean; loading: boolean; userRow: UserRow | null };
type Element = { type: unknown; props: Record<string, unknown> };
const row = { id: 'test-user', role: 'caregiver', org_id: 'org', onboarded_at: 'date' } as UserRow;

// Execute the actual screen; only native rendering and hook hosts are replaced.
function renderLogin(state: AuthState): Element {
  const exports: { default?: () => Element } = {};
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  runInNewContext(ts.transpileModule(readFileSync(new URL('../../app/login.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState: (value: unknown) => [value, () => {}] };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', Image: 'Image', useWindowDimensions: () => ({ width: 393, height: 852 }) };
    if (name === 'expo-router') return { Redirect: 'Redirect' };
    if (name.endsWith('/AuthProvider')) return { useAuth: () => state };
    if (name.endsWith('/appAccess')) return { evaluateAppAccess };
    if (name.endsWith('/useEnforceAppAccess')) return { useEnforceAppAccess: () => {
      const access = evaluateAppAccess(state);
      return { ready: access.status !== 'loading', target: access.status === 'ok' ? '/main' : '/login' };
    } };
    if (name.endsWith('/theme')) return { C: {} };
    if (name.endsWith('/keyboard-layout')) return { loginCanvasHeight };
    return {};
  } });
  return exports.default!();
}

describe('login follows committed access state', () => {
  it('enters main when a later valid refresh supersedes the login refresh', async () => {
    const state: AuthState = { authed: true, loading: true, userRow: null };
    const pending: ((snapshot: AccessSnapshot) => void)[] = [];
    const monitor = new AccessMonitor({
      load: () => new Promise(resolve => pending.push(resolve)), reset: () => {},
      publish: (_, value) => { state.userRow = value; state.loading = false; },
    });
    monitor.identify(row.id);
    const login = monitor.refresh();
    const event = monitor.refresh();
    pending[0]({ row, activeProfileDenied: false });
    expect(await login).toBeNull();
    expect(renderLogin(state).type).not.toBe('Redirect');
    pending[1]({ row, activeProfileDenied: false });
    await event;
    expect(renderLogin(state)).toEqual({ type: 'Redirect', props: { href: '/main' } });
  });

  it.each([
    { authed: false, loading: false, userRow: null },
    { authed: true, loading: true, userRow: row },
    { authed: true, loading: false, userRow: null },
    { authed: true, loading: false, userRow: { ...row, role: 'guardian' } },
    { authed: true, loading: false, userRow: { ...row, org_id: null } },
    { authed: true, loading: false, userRow: { ...row, onboarded_at: null } },
  ] as AuthState[])('does not bypass pending or denied access: %j', state => {
    expect(renderLogin(state).type).not.toBe('Redirect');
  });
});

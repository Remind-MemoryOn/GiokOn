import { readdirSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { protectedRoutes } from './protectedRoutes';
import { evaluateAppAccess, type AccessUserRow } from './appAccess';

describe('root route boundary', () => {
  it('classifies every real screen except login/splash as protected', () => {
    const files = readdirSync(new URL('../../app/', import.meta.url), { recursive: true }) as string[];
    const routes = files.map(file => file.replaceAll('\\', '/')).filter(file => file.endsWith('.tsx'))
      .map(file => file.slice(0, -4)).filter(file => !['_layout', 'index', 'login'].includes(file));
    expect([...protectedRoutes].sort()).toEqual(routes.sort());
  });
  it.each([
    { authed: false, loading: false, userRow: null, allowed: false },
    { authed: true, loading: true, userRow: null, allowed: false },
    { authed: true, loading: false, userRow: null, allowed: false },
    ...(['guardian', 'caregiver', 'org_admin'] as const).map(role => ({ authed: true, loading: false,
      userRow: { role, org_id: 'org', onboarded_at: 'date' }, allowed: role !== 'guardian' })),
  ])('actual navigator guards all private routes for %j', input => {
    const access = evaluateAppAccess(input as { authed: boolean; loading: boolean; userRow: AccessUserRow | null });
    type Element = { type: string; props: Record<string, unknown>; children: Element[] };
    const exports: { ProtectedNavigator?: () => Element } = {};
    runInNewContext(ts.transpileModule(readFileSync(new URL('./ProtectedNavigator.tsx', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports, require: (name: string) => {
      if (name === 'react/jsx-runtime') return { jsx: makeElement, jsxs: makeElement };
      if (name === 'expo-router') return { Stack: { Screen: 'screen', Protected: 'protected' } };
      if (name === './AuthProvider') return { useAuth: () => ({ user: { id: 'a' }, userRow: input.userRow, accessRevision: 0 }) };
      if (name === './useEnforceAppAccess') return { useEnforceAppAccess: () => ({ ready: access.status !== 'loading', target: access.status === 'ok' ? '/main' : '/login' }) };
      if (name === './protectedRoutes') return { protectedRoutes };
      throw new Error(name);
    } });
    function makeElement(type: string, props: Record<string, unknown>): Element {
      return { type, props, children: (props.children ?? []) as Element[] };
    }
    const root = exports.ProtectedNavigator!();
    const guard = root.children.find(child => child.type === 'protected')!;
    expect(guard.props.guard).toBe(input.allowed);
    expect(guard.children.map(child => child.props.name)).toEqual(protectedRoutes);
    expect(root.children.filter(child => child.type === 'screen').map(child => child.props.name)).toEqual(['index', 'login']);
  });
});

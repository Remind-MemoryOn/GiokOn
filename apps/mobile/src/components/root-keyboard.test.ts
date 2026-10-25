import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';

type Element = { type: unknown; props: { children?: unknown } };
function flatten(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element;
  return [node, ...flatten(node.props.children)];
}

it('keeps the error banner inside the same keyboard surface as the navigator', () => {
  const exports: { default?: () => Element } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name: string) => {
    const jsx = (type: unknown, props: Element['props']) => ({ type, props });
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'expo-font') return { useFonts: () => [true, null] };
    if (name.endsWith('/fetchGuard')) return { installFetchGuard() {} };
    if (name.endsWith('/supabase')) return { initSupabase() {}, isSupabaseConfigured: true };
    if (name.endsWith('/KeyboardForm')) return { KeyboardSurface: 'KeyboardSurface' };
    if (name.endsWith('/QueryFailureBanner')) return { QueryFailureBanner: 'QueryFailureBanner' };
    if (name.endsWith('/ProtectedNavigator')) return { ProtectedNavigator: 'ProtectedNavigator' };
    return {};
  } });
  const nodes = flatten(exports.default!());
  const surface = nodes.filter(node => node.type === 'KeyboardSurface');
  expect(surface, 'one global surface must include the banner offset, rather than each route assuming y=0').toHaveLength(1);
  expect(flatten(surface[0]).map(node => node.type)).toEqual(['KeyboardSurface', 'QueryFailureBanner', 'ProtectedNavigator']);
});

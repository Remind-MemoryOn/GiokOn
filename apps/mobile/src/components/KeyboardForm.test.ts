import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { inputScrollOffset } from '../lib/keyboard-layout';

type Node = { type: unknown; props: Record<string, unknown> };
type Input = { measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) => void };
function host(os = 'android', tablet = false) {
  let focused: Input | null = { measureInWindow: done => done(0, 390, 200, 44) };
  let visible = false;
  let nextFrame = 0;
  const frames = new Map<number, () => void>();
  const listeners = new Map<string, Set<() => void>>();
  const cleanup: (() => void)[] = [];
  const exports: {
    KeyboardSurface?: (props: Record<string, unknown>) => Node;
    KeyboardScrollView?: (props: Record<string, unknown>) => Node;
    useKeyboardVisible?: () => boolean;
    MODAL_ORIENTATIONS?: string[];
  } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./KeyboardForm.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    requestAnimationFrame: (cb: () => void) => { frames.set(++nextFrame, cb); return nextFrame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    require: (name: string) => {
      if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
      if (name === 'react') return {
        useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }),
        useEffect: (fn: () => () => void) => cleanup.push(fn()),
        useSyncExternalStore: (subscribe: (fn: () => void) => () => void, snapshot: () => unknown) => {
          cleanup.push(subscribe(() => {})); return snapshot();
        },
      };
      if (name === 'react-native') return {
        Platform: { OS: os, isPad: tablet }, KeyboardAvoidingView: 'AvoidKeyboard', ScrollView: 'Scroll',
        TextInput: { State: { currentlyFocusedInput: () => focused } },
        Keyboard: { isVisible: () => visible, addListener: (event: string, fn: () => void) => {
          const entries = listeners.get(event) ?? new Set(); entries.add(fn); listeners.set(event, entries);
          return { remove: () => entries.delete(fn) };
        } },
      };
      if (name === '../lib/keyboard-layout') return { inputScrollOffset };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return {
    api: exports, cleanup: () => cleanup.forEach(fn => fn()),
    focus: (input: Input | null) => { focused = input; },
    keyboard: (value: boolean) => { visible = value; for (const fn of listeners.get(value ? 'keyboardDidShow' : 'keyboardDidHide') ?? []) fn(); },
    flush: () => { for (const [key, fn] of [...frames]) { frames.delete(key); fn(); } },
  };
}

describe('native keyboard surface contract', () => {
  it.each([['ios', 'padding'], ['android', 'height']])('avoids the keyboard on %s', (os, behavior) => {
    expect(host(os).api.KeyboardSurface!({ children: 'form' })).toEqual({ type: 'AvoidKeyboard', props: { style: { flex: 1 }, behavior, children: 'form' } });
  });
  it('keeps iPad modals in landscape while preserving portrait phone modals', () => {
    expect(host('ios', true).api.MODAL_ORIENTATIONS).toEqual(['landscape-left', 'landscape-right']);
    expect(host('ios', false).api.MODAL_ORIENTATIONS).toEqual(['portrait']);
  });
  it('reads current keyboard state even when mounted after it opened', () => {
    const runtime = host(); runtime.keyboard(true);
    expect(runtime.api.useKeyboardVisible!()).toBe(true);
    runtime.keyboard(false); expect(runtime.api.useKeyboardVisible!()).toBe(false);
    runtime.cleanup();
  });
  it('reveals only actual overlap and preserves child focus/scroll handlers and first tap actions', () => {
    const runtime = host(); const onFocus = vi.fn(); const onScroll = vi.fn();
    const tree = runtime.api.KeyboardScrollView!({ children: 'input and save', onFocus, onScroll });
    const scrollTo = vi.fn();
    (tree.props.ref as { current: unknown }).current = { scrollTo, getNativeScrollRef: () => ({ measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) => done(0, 100, 500, 300) }) };
    const scroll = tree.props.onScroll as (e: unknown) => void;
    const focus = tree.props.onFocus as (e: unknown) => void;
    scroll({ nativeEvent: { contentOffset: { y: 10 } } }); focus({}); runtime.flush();
    expect(scrollTo).toHaveBeenCalledWith({ y: 60, animated: true });
    expect(onFocus).toHaveBeenCalledTimes(1); expect(onScroll).toHaveBeenCalledTimes(1);
    expect(tree.props.keyboardShouldPersistTaps).toBe('handled');
    runtime.keyboard(true); runtime.flush(); expect(scrollTo).toHaveBeenCalledTimes(2);
    runtime.cleanup();
  });
  it('drops late measurement when focus moves or the old screen unmounts', () => {
    const runtime = host(); let measured: ((x: number, y: number, w: number, h: number) => void) | undefined;
    runtime.focus({ measureInWindow: done => { measured = done; } });
    const tree = runtime.api.KeyboardScrollView!({}); const scrollTo = vi.fn();
    (tree.props.ref as { current: unknown }).current = { scrollTo, getNativeScrollRef: () => ({ measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) => done(0, 0, 500, 300) }) };
    (tree.props.onFocus as (e: unknown) => void)({}); runtime.flush(); runtime.focus(null);
    measured?.(0, 500, 200, 44); expect(scrollTo).not.toHaveBeenCalled();
    (tree.props.onLayout as (e: unknown) => void)({}); runtime.cleanup(); runtime.flush();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

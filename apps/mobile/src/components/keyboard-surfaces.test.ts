import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { daysInMonth, isBirthDate } from '@giokon/core';

type Element = { type: unknown; props: Record<string, unknown> };
const orientations = ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'];

// Execute the screen/component; native rendering, hooks, and external services are host doubles.
function renderSource(path: string, name: string, props = {}, keyboardVisible = false, dimensions = { width: 393, height: 852 }) {
  const events: string[] = [];
  const exports: Record<string, (props: Record<string, unknown>) => Element> = {};
  const jsx = (type: unknown, elementProps: Record<string, unknown>) => ({ type, props: elementProps });
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'Image', 'TextInput', 'Modal', 'ScrollView', 'FlatList'].map(key => [key, key]));
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (module: string) => {
    if (module === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (module === 'react') return {
      useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, (next: unknown) => { if (next === true) events.push('open'); }],
      useMemo: (factory: () => unknown) => factory(), useRef: (current: unknown) => ({ current }),
    };
    if (module === 'react-native') return { ...native, useWindowDimensions: () => dimensions, Keyboard: { dismiss: () => events.push('dismiss') } };
    if (module === 'expo-router') return { router: { push: (path: string) => events.push(`navigate:${path}`) }, useLocalSearchParams: () => ({ id: 'elder', logId: 'log' }) };
    if (module === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 0 }) };
    if (module === '@giokon/core') return { daysInMonth, isBirthDate };
    if (module === 'react-native-svg') return { default: 'Svg', Path: 'Path' };
    if (module.endsWith('/KeyboardForm')) return { KeyboardSurface: 'KeyboardSurface', KeyboardScrollView: 'KeyboardScrollView', useKeyboardVisible: () => keyboardVisible, MODAL_ORIENTATIONS: orientations };
    if (module.endsWith('/ScreenHeader')) return { HEADER_H: 114, HEADER_SHADOW: 'shadow' };
    if (module.endsWith('/AuthProvider')) return { useAuth: () => ({ caregiverName: '담당자' }) };
    if (module.endsWith('/reads')) return { useElders: () => [], useLastTalkByElder: () => ({}), useElder: () => ({ name: '어르신' }), useChronicles: () => [], useDuePlannedFetcher: () => () => null };
    if (module.endsWith('/layout')) return { useContentWidth: () => ({ contentW: dimensions.width - 57 }) };
    if (module.endsWith('/supabase')) return { queryScope: { capture: () => ({ current: () => true }) } };
    if (module.endsWith('/appStore')) return { useApp: (select: (state: object) => unknown) => select({ beginSession() {} }) };
    if (module.endsWith('/session-persistence')) return { useSessionPersistence: () => ({}) };
    if (module.endsWith('/brand')) return { RobotMascot: 'RobotMascot', RobotInline: 'RobotInline', Waveform: 'Waveform', MicIndicator: 'MicIndicator' };
    if (module.endsWith('/banners')) return { AiDisclosureBanner: 'AiDisclosureBanner' };
    if (module.endsWith('/elderStatus')) return { ELDER_STATUS: { listening: '말씀을 듣고 있어요.' } };
    if (module.endsWith('/QuestionCard')) return { QuestionCard: (cardProps: object) => renderSource('../features/session/QuestionCard.tsx', 'QuestionCard', cardProps, false, dimensions).tree };
    if (module.endsWith('/caregiverPin')) return { PinAttempts: class {}, PIN_LENGTH: 4 };
    return {};
  } });
  return { tree: exports[name](props), events };
}

function descendants(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  if (typeof element.type === 'function') return descendants(element.type(element.props));
  return [element, ...descendants(element.props.children)];
}

describe('keyboard and landscape surfaces', () => {
  it.each([600, 800])('retains room between session illustrations, titles, and actions at 1280×%i', height => {
    for (const path of ['../../app/session/start.tsx', '../../app/session/saved.tsx']) {
      const { tree } = renderSource(path, 'default', {}, false, { width: 1280, height });
      const scroll = descendants(tree).find(node => node.type === 'ScrollView');
      expect(scroll, `${path} must scroll instead of compressing fixed-height elements`).toBeDefined();
      expect((scroll?.props.contentContainerStyle as { height: number }).height).toBeGreaterThanOrEqual(852);
      const firstTitle = descendants(tree).find(node => node.type === 'View' && typeof (node.props.style as { top?: number })?.top === 'number' && descendants(node).some(child => child.type === 'Text'));
      expect((firstTitle!.props.style as { top: number }).top).toBeGreaterThanOrEqual(path.includes('start') ? 347 : 411);
    }
  });

  it('keeps the original 393×852 portrait session canvas', () => {
    for (const path of ['../../app/session/start.tsx', '../../app/session/saved.tsx']) {
      const { tree } = renderSource(path, 'default');
      expect(descendants(tree).some(node => node.type === 'ScrollView')).toBe(false);
      expect(descendants(tree).some(node => (node.props.style as { top?: number })?.top === (path.includes('start') ? 185 : 194))).toBe(true);
    }
  });

  it.each([600, 800])('bounds long elder questions while keeping controls outside the question scroll at 1280×%i', height => {
    const { tree } = renderSource('../features/session/ElderView.tsx', 'ElderView', { question: '긴 질문입니다. '.repeat(100), phase: 'listening', onCaregiver() {} }, false, { width: 1280, height });
    const scroll = descendants(tree).find(node => node.type === 'ScrollView');
    expect(scroll).toBeDefined();
    expect(scroll?.props.style).toMatchObject({ flex: 1, minHeight: 0 });
    expect(descendants(scroll).some(node => node.type === 'MicIndicator')).toBe(false);
    expect(descendants(tree).some(node => node.type === 'MicIndicator' && node.props.size === 123)).toBe(true);
    expect(descendants(tree).some(node => node.type === 'AiDisclosureBanner')).toBe(true);
  });

  it('keeps main actions scrollable while the keyboard is visible and fixed otherwise', () => {
    for (const visible of [true, false]) {
      const { tree } = renderSource('../../app/main.tsx', 'default', {}, visible);
      const scroll = descendants(tree).find(node => node.type === 'KeyboardScrollView');
      expect(scroll, 'main search needs a keyboard-aware scroll viewport').toBeDefined();
      const labels = descendants(scroll).filter(node => node.type === 'Text').map(node => node.props.children);
      expect(labels.includes('어르신 등록')).toBe(visible);
      expect(labels.includes('전체 분석')).toBe(visible);
      expect(descendants(tree).filter(node => node.type === 'Text' && node.props.children === '어르신 등록')).toHaveLength(1);
    }
  });

  it('lets the PIN cancel and last keypad row scroll into view in landscape', () => {
    const { tree } = renderSource('../features/session/CaregiverPinModal.tsx', 'CaregiverPinModal', {
      visible: true, mode: 'verify', userId: 'user', onDone() {}, onCancel() {},
    });
    expect(tree.props.supportedOrientations).toContain('landscape-left');
    const scroll = descendants(tree).find(node => node.type === 'ScrollView');
    expect(scroll, 'short screens need a scrollable keypad').toBeDefined();
    const buttons = descendants(scroll).filter(node => node.type === 'Pressable').map(node => node.props.accessibilityLabel);
    expect(buttons).toContain('취소');
    expect(buttons).toContain('0');
    expect(buttons).toContain('지우기');
  });

  it.each([
    { label: '어르신 등록', path: '/register' },
    { label: '전체 분석', path: '/analytics' },
  ])('dismisses the search keyboard before navigating from $label', ({ label, path }) => {
    const { tree, events } = renderSource('../../app/main.tsx', 'default', {}, true);
    const action = descendants(tree).find(node => node.type === 'Pressable' && descendants(node.props.children).some(child => child.type === 'Text' && child.props.children === label));
    (action!.props.onPress as () => void)();
    expect(events).toEqual(['dismiss', `navigate:${path}`]);
  });

  it.each([
    { path: './Calendar.tsx', name: 'Calendar', props: { value: null, minYear: 1920, maxYear: 1980, onSelect() {} }, label: '연도 선택:' },
    { path: './detail.tsx', name: 'PeriodPill', props: { label: '이번 달', options: [{ label: '이번 달', value: 'month' }], title: '기간', onSelect() {} }, label: '기간:' },
  ])('dismisses the keyboard before opening $name and allows landscape', ({ path, name, props, label }) => {
    const { tree, events } = renderSource(path, name, props);
    const trigger = descendants(tree).find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(label));
    expect(trigger).toBeDefined();
    (trigger!.props.onPress as () => void)();
    expect(events).toEqual(['dismiss', 'open']);
    const modal = descendants(tree).find(node => node.type === 'Modal');
    expect(modal?.props.supportedOrientations).toContain('landscape-left');
  });
});

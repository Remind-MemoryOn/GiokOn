#!/usr/bin/env node
// 웹 디자인 대조 검사 (apps/web) — 신규 Figma 디자인 기준.
//
// 기준(SoT): Figma `4iU6Zw4MhLAMZWlnPFgsCI` "기억온 웹" — 화면↔노드 맵과 절차는
// docs/runbooks/figma-web-extraction.md. 구 디자인(2026-08 이전)은 폐기됐다.
//
// 이 검사는 **이관이 끝난 화면만** 대조한다(SCREENS 표). 화면을 옮길 때마다 실측 항목을
// 추가해 표를 키운다 — 모바일 `check:figma` 와 같은 방식이다.
//
// 상시 검사(화면과 무관):
//   1) 토큰 단일 소스  — @giokon/theme ↔ 웹 tailwind.config 값 동일성(미러 드리프트 차단)
//   2) 미정의 토큰     — 팔레트에 없는 shade 사용 시 색이 조용히 사라진다
//   3) 에셋 인벤토리   — Figma export 48화면이 제자리에 있는지
//
// 사용: node scripts/check-web-design.mjs   (pnpm check:design)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const WEB = 'apps/web';
const THEME = 'packages/theme/src/index.ts';
const RUNBOOK = 'docs/runbooks/figma-web-extraction.md';
const ASSETS = `${WEB}/assets/figma`;

const cache = new Map();
function src(file) {
  if (!cache.has(file)) {
    try { cache.set(file, readFileSync(file, 'utf8')); } catch { cache.set(file, null); }
  }
  return cache.get(file);
}
/** JSX 는 줄바꿈으로 카피가 쪼개지므로 공백을 접어서 비교한다. */
const flat = (file) => (src(file) ?? '').replace(/\s+/g, ' ');

let ok = 0;
const fails = [];
const check = (section, name, passed, detail = '') =>
  passed ? ok++ : fails.push({ section, name, detail });

// ── 1) 토큰 단일 소스: theme ↔ tailwind 미러 동일성 ──────────────────────
// tailwind.config 는 TS 를 import 할 수 없어 값을 미러한다. 한쪽만 바뀌는 드리프트를 막는다.
/** `name: { 50: '#…', … }` 블록을 중괄호 균형으로 잘라 shade→hex 맵을 만든다. */
function colorMap(text, group) {
  const head = new RegExp(`(?:^|[^\\w-])${group}:\\s*\\{`, 'm').exec(text ?? '');
  if (!head) return null;
  const start = (text ?? '').indexOf('{', head.index);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const out = {};
  for (const m of text.slice(start, end).matchAll(/'?([\w-]+)'?:\s*'(#[0-9a-fA-F]{3,8})'/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}
/** theme 의 palette 안에 정의된 색 그룹 이름들. */
function paletteGroups(text) {
  const head = /export const palette = \{/.exec(text ?? '');
  if (!head) return [];
  const start = text.indexOf('{', head.index);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = text.slice(start + 1, end);
  return [...body.matchAll(/^\s{2}(\w[\w-]*):\s*\{/gm)].map((m) => m[1]);
}

const themeSrc = src(THEME);
const twSrc = src(`${WEB}/tailwind.config.js`);
check('토큰', '테마 토큰 파일 존재', Boolean(themeSrc), THEME);
check('토큰', '웹 tailwind.config 존재', Boolean(twSrc), `${WEB}/tailwind.config.js`);

const groups = paletteGroups(themeSrc);
check('토큰', 'theme palette 에 색 그룹이 정의돼 있다', groups.length > 0);
const defined = {};
for (const g of groups) {
  const inTheme = colorMap(themeSrc, g);
  const inTailwind = colorMap(twSrc, g);
  if (inTheme) defined[g] = inTheme;
  check('토큰', `${g}: @giokon/theme = 웹 tailwind.config (미러 동일성)`,
    inTheme && inTailwind && JSON.stringify(inTheme) === JSON.stringify(inTailwind),
    `theme ${JSON.stringify(inTheme)} / tailwind ${JSON.stringify(inTailwind)}`);
}

// ── 2) 팔레트에 없는 shade 사용 차단 ─────────────────────────────────────
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'coverage', 'assets']);
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIR.has(name)) walk(p, out); }
    else if (['.ts', '.tsx', '.css', '.html'].includes(extname(name))) out.push(p);
  }
  return out;
}
const UTIL = 'text|bg|border|ring|from|via|to|shadow|accent|divide|placeholder|decoration|outline|fill|stroke|caret';
const undefinedShades = [];
if (groups.length) {
  const re = new RegExp(`\\b(?:${UTIL})-(${groups.join('|')})-([\\w-]+)\\b`, 'g');
  for (const file of walk(`${WEB}/src`)) {
    for (const m of (src(file) ?? '').matchAll(re)) {
      if (!defined[m[1]]?.[m[2]]) undefinedShades.push(`${file}: ${m[0]}`);
    }
  }
}
check('토큰', '미정의 shade 사용 없음(정의되지 않은 클래스는 색이 적용되지 않는다)',
  undefinedShades.length === 0, undefinedShades.slice(0, 8).join(' / '));

// ── 3) 디자인 에셋 인벤토리 ──────────────────────────────────────────────
check('에셋', '재적용 런북(화면↔노드 맵) 존재', existsSync(RUNBOOK), RUNBOOK);
const screenPngs = existsSync(ASSETS)
  ? readdirSync(ASSETS).filter((f) => f.endsWith('.png'))
  : [];
check('에셋', `Figma export 화면 48종 존재 (현재 ${screenPngs.length})`, screenPngs.length >= 48, ASSETS);
check('에셋', 'Pretendard 자체 호스팅 폰트 존재',
  existsSync(`${WEB}/assets/fonts/Pretendard-1.3.9`), '컨테이너에서 CDN 이 막혀 자체 호스팅한다');

// ── 4) 이관 완료 화면 실측 대조 ──────────────────────────────────────────
// [파일, 항목명, [정규식 …], 'code'|'copy']  — 'copy' 는 공백을 접어서 비교한다.
// 화면을 옮길 때마다 여기에 실측값을 추가한다(런북 §절차 4).
const SCREENS = [];

for (const [file, name, patterns, mode = 'code'] of SCREENS) {
  const text = mode === 'copy' ? flat(file) : src(file);
  if (!text) { fails.push({ section: '화면', name, detail: `파일 없음: ${file}` }); continue; }
  const missing = patterns.filter((p) => !p.test(text));
  check('화면', name, missing.length === 0, `[${file}] 누락 ${missing.map(String).join(' , ')}`);
}

// ── 결과 ────────────────────────────────────────────────────────────────
if (fails.length > 0) {
  console.error('✗ 웹 디자인 스펙 불일치:\n');
  for (const f of fails) {
    console.error(`  [${f.section}] ${f.name}`);
    if (f.detail) console.error(`      ${f.detail}`);
  }
  console.error(`\n일치 ${ok} / 불일치 ${fails.length}\n기준: ${RUNBOOK}`);
  process.exit(1);
}
console.log(
  `✓ 웹 디자인 대조 통과 (${ok}개 항목 · 이관 완료 화면 ${SCREENS.length}/48)`,
);

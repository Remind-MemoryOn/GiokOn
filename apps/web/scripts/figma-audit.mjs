// Figma 실측 ↔ 구현 DOM 대조 감사 (apps/web)
//
// 모바일 `check:figma` 의 웹판. 스크린샷 픽셀 비율 대신 **요소 좌표를 직접 재서**
// Figma 노드 좌표와 비교한다 — 3px 어긋난 텍스트가 전체 diff % 에는 묻히기 때문이다.
//
// 좌표 규약: Figma 화면 프레임(1440 폭)의 프레임 로컬 좌표 = 문서 좌표.
//   뷰포트를 1440×(프레임 높이)로 잡고 document 좌표(rect + scroll)를 잰다.
//
// 비교 방식
//   box  : left/top/width/height 를 그대로 비교(사각형·이미지·버튼 배경 등)
//   text : left 와 **잉크 중심 Y**(top + height/2)를 비교한다.
//          Figma 텍스트 박스 높이 = lineHeight 이고 글자는 그 안에서 중앙에 놓이므로,
//          line-height 가 달라도 중심이 맞으면 눈에 보이는 위치가 같다.
//
// 사용: pnpm -F @giokon/web figma:build           (전체)
//       pnpm -F @giokon/web figma:build -- 118:300 (노드 하나만)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCREENS } from './figma-audit.spec.mjs';

const PORT = Number(process.env.PORT || 4183);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const TOL = Number(process.env.AUDIT_TOL || 1.5);

async function reachable(url, timeoutMs = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function startPreview() {
  if (!existsSync(new URL('../dist-audit/index.html', import.meta.url))) {
    console.error('✗ dist 가 없습니다 — pnpm -F @giokon/web figma:build 를 먼저 실행하세요.');
    process.exit(1);
  }
  const child = spawn(
    process.execPath,
    [
      './node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      'dist-audit',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i++) {
    if (await reachable(BASE)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  console.error(`✗ preview 가 ${BASE} 에서 뜨지 않았습니다.`);
  process.exit(1);
}

let preview = null;
if (!process.env.BASE_URL && !(await reachable(BASE))) preview = await startPreview();

const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) ??
  (existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/** 브라우저 안에서 한 화면의 모든 프로브를 잰다.
 *  모달처럼 페이지 좌표가 아니라 **카드 안 좌표**로 그려진 프레임은 `origin` 선택자의
 *  좌상단을 원점으로 삼는다(Figma 프레임 = 카드 자체라 화면 위치가 정해져 있지 않다). */
const MEASURE = ({ probes, origin }) => {
  let ox = 0;
  let oy = 0;
  if (origin) {
    const o = document.querySelector(origin);
    if (o) {
      const r = o.getBoundingClientRect();
      ox = r.left + window.scrollX;
      oy = r.top + window.scrollY;
    }
  }
  return probes.map((p) => {
    const el = document.querySelector(p.sel);
    if (!el) return { name: p.name, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      name: p.name,
      left: r.left + window.scrollX - ox,
      top: r.top + window.scrollY - oy,
      width: r.width,
      height: r.height,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      color: cs.color,
      background: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      borderWidth: parseFloat(cs.borderTopWidth),
      radius: parseFloat(cs.borderTopLeftRadius),
    };
  });
};

const rows = [];
const notes = [];
let checked = 0;
for (const screen of SCREENS) {
  if (ONLY.length && !ONLY.includes(screen.node)) continue;
  // ⚠️ 모달 화면의 `height` 는 **패널 높이**지 화면 높이가 아니다. 그대로 뷰포트로 쓰면
  //    창이 패널과 똑같이 낮아서, 좁은 화면에서 패널을 줄이는 축소 로직(Dialog `fit`,
  //    2026-09-11)이 켜져 모든 좌표가 배율만큼 어긋난다. 모달은 `viewportHeight` 로
  //    실제 데스크톱 높이를 준다 — 배율 1 에서 시안 치수를 재는 것이 이 검사의 목적이다.
  const page = await browser.newPage({
    viewport: { width: 1440, height: screen.viewportHeight ?? screen.height ?? 1024 },
    deviceScaleFactor: 1,
  });
  await page.goto(BASE + screen.route, { waitUntil: 'networkidle', timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const got = await page.evaluate(MEASURE, { probes: screen.probes, origin: screen.origin });
  await page.close();

  for (let i = 0; i < screen.probes.length; i++) {
    const p = screen.probes[i];
    const g = got[i];
    if (p.pending) {
      notes.push({ screen: screen.name, name: p.name, kind: '미배선', why: p.pending });
      continue;
    }
    checked += 1;
    if (g.missing) {
      rows.push({ screen: screen.name, node: screen.node, name: p.name, fail: '요소 없음', sel: p.sel });
      continue;
    }
    const f = p.figma;
    const tol = p.tol ?? TOL;
    const bad = [];
    const cmp = (label, actual, expected, t = tol) => {
      if (expected == null) return;
      const d = actual - expected;
      if (Math.abs(d) > t) bad.push(`${label} ${d > 0 ? '+' : ''}${d.toFixed(1)} (구현 ${actual.toFixed(1)} / Figma ${expected})`);
    };
    if (p.kind === 'text') {
      // 가운데 정렬 텍스트는 박스 폭이 달라도 되므로 중심 X 로 본다.
      if (p.topEdge) cmp('첫줄y', g.top, f.y);
      if (p.center) cmp('중심x', g.left + g.width / 2, f.x + f.w / 2);
      else if (p.right) cmp('오른끝x', g.left + g.width, f.x + f.w);
      else cmp('x', g.left, f.x);
      if (!p.topEdge) cmp('중심y', g.top + g.height / 2, f.y + f.h / 2);
      if (p.fontSize != null) cmp('fontSize', g.fontSize, p.fontSize, 0.6);
      if (p.fontWeight != null && String(g.fontWeight) !== String(p.fontWeight))
        bad.push(`weight ${g.fontWeight} ≠ ${p.fontWeight}`);
      if (p.color && g.color.replace(/\s/g, '') !== p.color.replace(/\s/g, ''))
        bad.push(`color ${g.color} ≠ ${p.color}`);
    } else {
      // 오른쪽 정렬 박스(반전된 말풍선 등)는 폭이 내용에 따라 달라진다 → 오른끝만 본다.
      if (p.right) cmp('오른끝x', g.left + g.width, f.x + f.w);
      else {
        cmp('x', g.left, f.x);
        cmp('w', g.width, f.w);
      }
      cmp('y', g.top, f.y);
      cmp('h', g.height, f.h);
      if (p.radius != null) cmp('r', g.radius, p.radius, 0.6);
      if (p.background && g.background.replace(/\s/g, '') !== p.background.replace(/\s/g, ''))
        bad.push(`bg ${g.background} ≠ ${p.background}`);
      if (p.borderColor && g.borderColor.replace(/\s/g, '') !== p.borderColor.replace(/\s/g, ''))
        bad.push(`border ${g.borderColor} ≠ ${p.borderColor}`);
    }
    if (bad.length) {
      if (p.accept) notes.push({ screen: screen.name, name: p.name, kind: '수용', why: p.accept, fail: bad.join(' · ') });
      else rows.push({ screen: screen.name, node: screen.node, name: p.name, fail: bad.join(' · ') });
    }
  }
}

await browser.close();
preview?.kill();

function printNotes() {
  if (!notes.length) return;
  console.log(`\n· 참고 ${notes.length}건 (수용된 차이·미배선)`);
  for (const n of notes) console.log(`   [${n.kind}] ${n.screen} — ${n.name}: ${n.why}${n.fail ? ` (${n.fail})` : ''}`);
}

if (rows.length) {
  console.error('✗ Figma 대조 편차:\n');
  let last = '';
  for (const r of rows) {
    if (r.screen !== last) {
      console.error(`  ── ${r.screen} (${r.node})`);
      last = r.screen;
    }
    console.error(`     ${r.name}\n        ${r.fail}${r.sel ? `  [${r.sel}]` : ''}`);
  }
  console.error(`\n일치 ${checked - rows.length} / 편차 ${rows.length} (허용 ±${TOL}px)`);
  printNotes();
  process.exit(1);
}
console.log(`✓ Figma 대조 통과 (${checked}개 프로브 · 허용 ±${TOL}px)`);
printNotes();

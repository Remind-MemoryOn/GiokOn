// KWCAG 접근성 검사 — 이관 완료 화면 전부에 axe-core 를 돌린다.
//
// 왜 감사 빌드(dist-audit)인가: 요양보호사·보호자 화면은 가드 뒤에 있고 컨테이너에서
// *.supabase.co 가 막혀 있다. figma-audit 과 같은 스텁·같은 라우트를 그대로 쓴다.
//
// 규칙 집합: WCAG 2.1 A/AA (KWCAG 2.2 는 WCAG 2.1 을 기반으로 한다).
// 색 대비는 Figma 시안이 정한 값이라 위반이 나오면 **디자인 확인이 필요한 사안**으로
// 따로 모아 보여 준다(코드가 임의로 색을 바꾸면 시안과 어긋난다).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCREENS } from './figma-audit.spec.mjs';

const PORT = Number(process.env.PORT || 4184);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
/** 디자인 결정이라 코드가 마음대로 못 고치는 것 — 실패시키지 않고 따로 보고한다. */
const DESIGN_RULES = new Set(['color-contrast']);

const reachable = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
};

let preview = null;
if (!process.env.BASE_URL && !(await reachable(BASE))) {
  if (!existsSync(new URL('../dist-audit/index.html', import.meta.url))) {
    console.error('✗ dist-audit 없음 — pnpm -F @giokon/web figma:build 를 먼저 실행하세요.');
    process.exit(1);
  }
  preview = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-audit',
     '--port', String(PORT), '--strictPort'],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' },
  );
  for (let i = 0; i < 60 && !(await reachable(BASE)); i++) await new Promise((r) => setTimeout(r, 500));
}

const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) ??
  (existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/** 같은 위반이 화면마다 반복되므로 규칙+선택자로 묶어 한 번만 보고한다. */
const violations = new Map();
/** 대비는 색 쌍(전경·배경·글자크기)으로 묶는다 — 노드마다 찍으면 수백 줄이 된다. */
const contrast = new Map();
let screens = 0;

const CONTRAST_RX =
  /contrast of ([\d.]+) \(foreground color: (#\w+), background color: (#\w+), font size: [\d.]+pt \((\d+)px\), font weight: (\w+)\)/;
/** WCAG: 24px 이상 또는 굵은 19px 이상은 '큰 글자'라 3:1 이면 된다. */
const needed = (px, weight) =>
  Number(px) >= 24 || (Number(px) >= 19 && (weight === 'bold' || Number(weight) >= 600)) ? 3 : 4.5;

// Figma 에 없는 신규 공개 화면(2026-09-02) — 좌표 대조 대상은 아니지만 접근성은 같은 기준으로 본다.
const EXTRA_SCREENS = [
  { name: '개인정보 처리방침', route: '/privacy', height: 2400 },
  { name: '이용약관', route: '/terms', height: 2400 },
  { name: '문의사항 목록', route: '/inquiries', height: 1200 },
  { name: '문의사항 등록', route: '/inquiries/new', height: 1400 },
  // Figma 에 프레임이 없는 화면(찾기 화면 골격을 한 칸 연장) — 그래도 접근성은 같은 기준.
  { name: '회원가입(이메일)', route: '/signup', height: 1200 },
];

for (const s of [...SCREENS, ...EXTRA_SCREENS]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: s.height ?? 1024 } });
  await page.goto(BASE + s.route, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () =>
    await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    }),
  );
  screens += 1;
  for (const v of result.violations) {
    for (const node of v.nodes) {
      const summary = node.failureSummary?.split('\n').slice(1).join(' ').trim() ?? '';
      if (DESIGN_RULES.has(v.id)) {
        const m = CONTRAST_RX.exec(summary);
        if (!m) continue;
        const [, ratio, fg, bg, px, weight] = m;
        const key = `${fg}|${bg}|${px}|${weight}`;
        if (!contrast.has(key))
          contrast.set(key, { fg, bg, px, weight, ratio: Number(ratio), need: needed(px, weight), count: 0, screens: [] });
        const hit = contrast.get(key);
        hit.count += 1;
        if (!hit.screens.includes(s.name)) hit.screens.push(s.name);
        continue;
      }
      const key = `${v.id}|${node.target.join(' ')}`;
      if (!violations.has(key)) {
        violations.set(key, {
          id: v.id, impact: v.impact, help: v.help,
          target: node.target.join(' '), summary, screens: [],
        });
      }
      const hit = violations.get(key);
      if (!hit.screens.includes(s.name)) hit.screens.push(s.name);
    }
  }
  await page.close();
}

// ── 모달 키보드 동작 — axe 가 못 보는 부분(2.1.1 키보드 · 2.1.2 덫 없음 · 2.4.3 순서) ──
// 초점이 열 때 안으로 들어가는지 · Tab/Shift+Tab 이 밖으로 새지 않는지 · Esc 로 닫히는지.
const MODALS = [
  ['연대기 추가(모달)', '/caregiver/elders/e1/chronicles/new'],
  ['회상 세션 설계(모달)', '/caregiver/sessions/e1/new'],
  ['어르신 등록(모달)', '/caregiver/elders/new'],
  ['공개 기록 설정(모달)', '/caregiver/shares/e1?settings=j1'],
  ['공개 이력 상세(모달)', '/caregiver/shares/e1/history?receipt=sh1'],
  ['메시지 이용 안내(모달)', '/guardian/feed?state=connected&compose=1'],
];
const outsidePanel = () => {
  const d = document.querySelector('[role="dialog"]');
  return !(d && document.activeElement && d.contains(document.activeElement));
};
const modalFails = [];
for (const [name, route] of MODALS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  const entered = await page.evaluate(outsidePanel).then((out) => !out);
  let trapped = true;
  for (let i = 0; i < 60 && trapped; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(outsidePanel)) trapped = false;
  }
  let trappedBack = true;
  for (let i = 0; i < 20 && trappedBack; i++) {
    await page.keyboard.press('Shift+Tab');
    if (await page.evaluate(outsidePanel)) trappedBack = false;
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
  if (!(entered && trapped && trappedBack && closed)) {
    modalFails.push(
      `${name} — 초점진입 ${entered} · Tab가둠 ${trapped} · Shift+Tab가둠 ${trappedBack} · Esc닫힘 ${closed}`,
    );
  }
  await page.close();
}

await browser.close();
preview?.kill();

const show = (rows, title) => {
  console.log(`\n${title} (${rows.length}건)`);
  for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
    const where = r.screens.length > 3
      ? `${r.screens.slice(0, 3).join(' · ')} 외 ${r.screens.length - 3}개 화면`
      : r.screens.join(' · ');
    console.log(`  [${r.impact}] ${r.id} — ${r.help}`);
    console.log(`      ${r.target}`);
    console.log(`      ${where}`);
    if (r.summary) console.log(`      ${r.summary}`);
  }
};

const fails = [...violations.values()];
if (modalFails.length > 0) {
  console.log(`\n✗ 모달 키보드 동작 (${modalFails.length}건)`);
  for (const m of modalFails) console.log(`  ${m}`);
}
const pairs = [...contrast.values()].filter((c) => c.ratio < c.need).sort((a, b) => b.count - a.count);
if (pairs.length > 0) {
  const total = pairs.reduce((n, c) => n + c.count, 0);
  console.log(
    `\n· 대비 미달 색 쌍 ${pairs.length}종 · ${total}곳 — **시안이 정한 색이라 코드가 임의로 바꾸지 않는다**(사용자 확인 대기)`,
  );
  console.log(`  ${'전경'.padEnd(9)}${'배경'.padEnd(9)}${'대비'.padStart(5)} ${'필요'.padStart(4)}  ${'글자'.padEnd(13)}건수  화면`);
  for (const c of pairs) {
    const where = c.screens.length > 2
      ? `${c.screens.slice(0, 2).join(' · ')} 외 ${c.screens.length - 2}개`
      : c.screens.join(' · ');
    console.log(
      `  ${c.fg.padEnd(9)}${c.bg.padEnd(9)}${String(c.ratio).padStart(5)} ${String(c.need).padStart(4)}  ` +
      `${`${c.px}px ${c.weight}`.padEnd(13)}${String(c.count).padStart(4)}  ${where}`,
    );
  }
}
if (fails.length > 0) show(fails, '✗ KWCAG 위반');
if (fails.length > 0 || modalFails.length > 0) {
  console.error(`\n화면 ${screens}개 검사 · 위반 ${fails.length}건 · 모달 키보드 ${modalFails.length}건`);
  process.exit(1);
}

// 대비(color-contrast)는 **의도적으로 비차단**이다 — 시안이 정한 브랜드 색이라
// 코드가 임의로 바꾸지 않는다(디자인 결정 대기). 다만 미달이 남아 있는데 "통과" 라고
// 적으면 그 결과가 "접근성 전체 통과" 로 읽힌다. 남은 항목을 종료 문구에 명시한다.
const contrastLeft = [...contrast.values()].filter((c) => c.ratio < c.need);
const scope = `${screens}개 화면 axe WCAG 2.1 A/AA · 모달 ${MODALS.length}종 키보드 동작`;
if (contrastLeft.length > 0) {
  const total = contrastLeft.reduce((n, c) => n + c.count, 0);
  console.log(
    `\n△ 차단 항목 없음 (${scope})\n` +
      `  단, 대비 미달 ${contrastLeft.length}종 · ${total}곳이 남아 있다 — 디자인 결정 대기라 비차단으로 둔 것이며\n` +
      `  "접근성 통과" 가 아니다. 이 검사는 **웹 전용**이다(모바일 앱 대비는 아직 측정하지 않는다).`,
  );
} else {
  console.log(`\n✓ KWCAG 검사 통과 (${scope}) — 대비 미달 없음. ※ 웹 전용 검사다.`);
}

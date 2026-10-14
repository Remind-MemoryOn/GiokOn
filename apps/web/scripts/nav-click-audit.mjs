// 사이드바가 **실제로 눌리는가** — 좌표·색이 아니라 히트테스트를 본다.
//
// 왜 필요한가: 화면 24종이 Figma 절대좌표를 쓰려고 본문을 `-ml-[323px] w-[1440px]` 로
// 왼쪽으로 당긴다. 그 띠(x 0~322)는 비어 있지만 **사이드바 위를 덮고**, DOM 순서상
// 나중이라 클릭을 가로챈다 — 어느 페이지에서도 사이드바를 누를 수 없었다
// (2026-09-11 사용자 신고). 렌더는 멀쩡해 보이므로 스크린샷·좌표 대조로는 안 잡힌다.
//
// 판정: 각 링크의 중심점에서 `elementFromPoint` 가 그 링크(또는 자손)를 돌려주는가.
//
// 사용: pnpm -F @giokon/web nav:audit   (figma:build 로 만든 dist-audit 을 쓴다)
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

// 셸을 쓰는 화면 중 레이아웃 성격이 다른 것들을 고른다(목록·상세·폼·모달 배경·보호자).
const ROUTES = [
  '/caregiver',
  '/caregiver/elders',
  '/caregiver/elders/e1',
  '/caregiver/sessions/e1',
  '/caregiver/sessions/e1/s1',
  '/caregiver/analysis',
  '/caregiver/analysis/e1',
  '/caregiver/journal/e1',
  '/caregiver/journal/e1/new',
  '/caregiver/shares/e1',
  '/caregiver/shares/e1/history',
  '/caregiver/org',
  '/caregiver/settings',
  '/guardian?state=connected',
  '/guardian/feed?state=connected',
  '/guardian/analysis?state=connected',
  '/guardian/settings',
];

const port = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close((e) => (e ? rej(e) : res(p)));
  });
});
const BASE = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const SELF = !process.env.BASE_URL;

let child = null;
if (SELF) {
  if (!existsSync(new URL('../dist-audit/index.html', import.meta.url))) {
    console.error('✗ dist-audit 이 없습니다 — 먼저 `pnpm -F @giokon/web figma:build`.');
    process.exit(1);
  }
  child = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--outDir', 'dist-audit', '--port', String(port), '--strictPort'],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' },
  );
  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
      if (r.ok || r.status < 500) { up = true; break; }
    } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { child.kill(); console.error(`✗ preview 가 ${BASE} 에서 뜨지 않았습니다.`); process.exit(1); }
}

const exe = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe }
  : process.platform === 'win32' ? { channel: 'msedge' } : {});
// 1440×900 — 노트북에서 가장 흔한 크기. 세로가 짧을수록 겹침이 잘 드러난다.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let checked = 0;
const failures = [];
for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(150);
  const rows = await page.evaluate(() => {
    const out = [];
    // 사이드바의 링크와 로그아웃 버튼이 대상이다.
    for (const el of document.querySelectorAll('aside a[href], aside button')) {
      if (!el.getBoundingClientRect().height) continue;
      // 화면 밖(로그아웃은 사이드바 맨 아래)이면 elementFromPoint 가 null 이다 —
      // 가려진 것이 아니라 안 보이는 것이므로, 보이게 한 뒤 판정한다.
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      out.push({
        name: el.getAttribute('href') || el.textContent.trim().slice(0, 12),
        ok: Boolean(hit && el.contains(hit)),
        // 무엇이 가로챘는지 — 고칠 때 바로 쓰인다.
        blocker: hit ? `${hit.tagName.toLowerCase()}.${(hit.getAttribute('class') || '').split(' ').slice(0, 3).join('.')}` : 'none',
      });
    }
    return out;
  });
  checked += rows.length;
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) failures.push({ route, bad });
}

await browser.close();
child?.kill();

if (failures.length === 0) {
  console.log(`✓ 사이드바 클릭 통과 (${ROUTES.length}화면 · ${checked}개 항목)`);
  process.exit(0);
}

console.error('✗ 사이드바 항목이 눌리지 않습니다 — 무언가가 위를 덮고 있습니다:\n');
for (const f of failures) {
  console.error(`  ${f.route}`);
  for (const b of f.bad) console.error(`     ${b.name}  ← ${b.blocker}`);
  console.error('');
}
console.error('대개 본문 화면의 `-ml-[323px] w-[1440px]` 오버레이다 — 사이드바에 `relative z-30`.');
process.exit(1);

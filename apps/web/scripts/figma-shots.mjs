// 이관 완료 화면을 Figma 프레임과 같은 배율(@4x)로 캡처한다 — 잉크 대조용.
// FIGMA_AUDIT=1 로 빌드한 dist 를 프리뷰하고 1440 폭으로 전체 페이지를 찍는다.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { SCREENS } from './figma-audit.spec.mjs';

const PORT = Number(process.env.PORT || 4183);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const OUT = process.env.AUDIT_OUT || '/tmp/audit';
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
mkdirSync(OUT, { recursive: true });
// 잉크 대조(figma-ink.py)가 같은 실측표를 읽도록 내보낸다.
writeFileSync(`${OUT}/spec.json`, JSON.stringify(SCREENS));

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
    console.error('✗ dist 없음 — pnpm -F @giokon/web figma:build 를 먼저 실행하세요.');
    process.exit(1);
  }
  preview = spawn(
    'node',
    [
      './node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      'dist-audit',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' },
  );
  for (let i = 0; i < 60 && !(await reachable(BASE)); i++) await new Promise((r) => setTimeout(r, 500));
}

const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

for (const s of SCREENS) {
  if (ONLY.length && !ONLY.includes(s.node)) continue;
  const page = await browser.newPage({
    viewport: { width: 1440, height: s.height ?? 1024 },
    deviceScaleFactor: 4,
  });
  await page.goto(BASE + s.route, { waitUntil: 'networkidle', timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const file = `${OUT}/${s.node.replace(':', '_')}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`· ${s.node} ${s.route} → ${file}`);
  await page.close();
}

await browser.close();
preview?.kill();

// 이관 완료 화면을 Figma 프레임과 같은 배율(@4x)로 캡처한다 — 잉크 대조용.
// FIGMA_AUDIT=1 로 빌드한 dist 를 프리뷰하고 1440 폭으로 전체 페이지를 찍는다.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from './figma-audit.spec.mjs';

const PORT = Number(process.env.PORT || 4183);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const OUT = process.env.AUDIT_OUT || join(tmpdir(), 'giokon-audit');
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
  for (let i = 0; i < 60 && !(await reachable(BASE)); i++) await new Promise((r) => setTimeout(r, 500));
}

const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) ??
  (existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

for (const s of SCREENS) {
  if (ONLY.length && !ONLY.includes(s.node)) continue;
  const page = await browser.newPage({
    // 모달 프레임은 뷰포트보다 크면 스크롤 컨테이너 안에서 잘려 캡처된다 →
    // 카드가 통째로 들어가도록 넉넉히 잡고, 잘라내기는 origin 박스로 한다.
    viewport: {
      width: 1440,
      height: s.origin ? Math.max(s.height ?? 0, 1600) : (s.height ?? 1024),
    },
    deviceScaleFactor: 4,
  });
  await page.goto(BASE + s.route, { waitUntil: 'networkidle', timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const file = `${OUT}/${s.node.replace(':', '_')}.png`;
  if (s.origin) {
    // 모달 프레임은 카드만 잘라 export 와 1:1 로 맞춘다(카드 좌상단 = Figma 원점).
    const box = await page.locator(s.origin).first().boundingBox();
    if (!box) {
      console.error(`✗ ${s.node}: origin(${s.origin}) 을 찾지 못했습니다.`);
      process.exit(1);
    }
    await page.screenshot({
      path: file,
      clip: { x: box.x, y: box.y, width: s.width ?? box.width, height: s.height ?? box.height },
    });
  } else {
    await page.screenshot({ path: file, fullPage: true });
  }
  console.log(`· ${s.node} ${s.route} → ${file}`);
  await page.close();
}

await browser.close();
preview?.kill();

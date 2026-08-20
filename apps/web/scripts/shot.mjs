// 화면 스크린샷 — Figma export 와 눈으로 대조하기 위한 도구.
// 사용: node apps/web/scripts/shot.mjs <경로> <출력파일> [높이]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const [path = '/', out = 'shot.png', height = '1084'] = process.argv.slice(2);
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const reachable = async () => {
  try { return (await fetch(BASE, { signal: AbortSignal.timeout(1500) })).status < 500; } catch { return false; }
};
let preview = null;
if (!(await reachable())) {
  preview = spawn('node', ['./node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 500));
}
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: Number(height) }, deviceScaleFactor: 1 });
await page.goto(BASE + path, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
preview?.kill();
console.log('saved', out);

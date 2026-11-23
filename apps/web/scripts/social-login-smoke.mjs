// 간편 로그인 버튼 회귀(2026-11-05 사용자 보고) — 배포본(production 빌드) + 합성 Supabase 만. 환경 파일을 읽지 않는다.
//
//   ① 네이버·카카오·구글 화면으로 갔다가 뒤로 돌아오면(브라우저가 화면을 되살리는 bfcache 포함)
//      '이동 중...' 이 남지 않고 세 버튼을 다시 누를 수 있다. (이전: 잠긴 채 '이동 중...'만 계속 보였다)
//      bfcache 지원은 브라우저마다 달라(CI 의 Playwright 크로미움은 되살리지 않는다) ①' 에서 이동 중 상태에
//      '되살린 화면' 신호(pageshow persisted)를 직접 보내 같은 경로를 어느 환경에서나 시험한다.
//   ② 누른 버튼의 '이동 중...' 은 버튼 가운데에 있다(아이콘 없이 글자만 — 사용자 결정). 평소엔 아이콘 + 이름.
import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-social-login-'));
await build({ envDir: false, mode: 'production', logLevel: 'error', define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false } });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// Playwright 는 기본으로 bfcache 를 끈다 — 실제 브라우저처럼 켜야 '되살린 화면' 결함이 재현된다.
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : process.platform === 'win32' ? { channel: 'msedge' } : {}),
  ignoreDefaultArgs: ['--disable-back-forward-cache'],
  args: ['--enable-features=BackForwardCache'],
});
const SOCIAL = [['네이버', '72:836'], ['카카오톡', '72:855'], ['구글', '72:872']];
const buttons = (page) => page.locator(SOCIAL.map(([, fx]) => `button[data-fx="${fx}"]`).join(', '));

try {
  // ① 뒤로 돌아오기
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => addEventListener('pageshow', (e) => { window.__restored = e.persisted; }));
  await page.route('https://synthetic.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>provider</body></html>' }));
  await page.goto(`${base}/login`);
  let restoredAny = false;
  for (const [name] of SOCIAL) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForURL(/synthetic\.supabase\.co/);
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForURL(/\/login/, { waitUntil: 'commit' });
    await page.getByRole('button', { name: '로그인', exact: true }).waitFor();
    restoredAny ||= await page.evaluate(() => window.__restored === true);
    assert.deepEqual(await buttons(page).allInnerTexts(), SOCIAL.map(([n]) => n), `${name} 뒤로: 이동 중이 남으면 안 된다`);
    for (const b of await buttons(page).all()) assert.equal(await b.isDisabled(), false, `${name} 뒤로: 다시 누를 수 있어야 한다`);
    console.log(`  ✓ ① ${name} 화면에서 뒤로 → 다시 누를 수 있다`);
  }
  console.log(`  · 이 브라우저의 bfcache 복원: ${restoredAny ? '실제로 일어남' : '일어나지 않음 — ①\' 가 같은 경로를 시험한다'}`);
  await page.close();

  // ①' 이동 중 상태에서 '되살린 화면' 신호 → 다시 누를 수 있다(bfcache 지원과 무관하게 같은 경로).
  for (const [name, fx] of SOCIAL) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.route('https://synthetic.supabase.co/**', (r) => r.fulfill({ status: 204 }));
    await p.goto(`${base}/login`);
    const btn = p.locator(`button[data-fx="${fx}"]`);
    await btn.dispatchEvent('click');
    await btn.getByText('이동 중...', { exact: true }).waitFor();
    await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await btn.getByText(name, { exact: true }).waitFor({ timeout: 5_000 }); // 이전 코드는 여기서 '이동 중...' 그대로
    for (const b of await buttons(p).all()) assert.equal(await b.isDisabled(), false, `${name} 되살린 화면: 다시 누를 수 있어야 한다`);
    console.log(`  ✓ ①' ${name} 이동 중 → 되살린 화면 신호 → 다시 누를 수 있다`);
    await p.close();
  }

  // ② 이동 중 글자 가운데 — 이동 요청에 204 를 주면 화면이 남아 이동 중 상태를 잴 수 있다.
  for (const [name, fx] of SOCIAL) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.route('https://synthetic.supabase.co/**', (r) => r.fulfill({ status: 204 }));
    await p.goto(`${base}/login`);
    const btn = p.locator(`button[data-fx="${fx}"]`);
    await btn.dispatchEvent('click');
    const text = btn.getByText('이동 중...', { exact: true });
    await text.waitFor();
    const [b, t] = [await btn.boundingBox(), await text.boundingBox()];
    const off = Math.abs((t.x + t.width / 2) - (b.x + b.width / 2));
    assert.ok(off <= 1.5, `${name}: '이동 중...' 이 가운데가 아니다(Δ${off.toFixed(1)}px)`);
    assert.equal(await btn.locator('img').count(), 0, `${name}: 이동 중에는 아이콘을 숨긴다`);
    console.log(`  ✓ ② ${name} 이동 중 글자 가운데(Δ${off.toFixed(1)}px)`);
    await p.close();
  }
  console.log('PASS: 간편 로그인 — 뒤로 돌아오면(bfcache 포함) 다시 누를 수 있다 · 이동 중 글자는 버튼 가운데. 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

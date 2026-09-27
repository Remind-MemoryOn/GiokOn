// 화면 폭 모드 회귀(2026-09-27 사용자 결정) — 창이 1440 보다 좁을 때 시안 배치가 유지되는지 본다.
//
// 지키는 것: ① PC 좁은 창(1024) — 캔버스가 1440 그대로(가로 스크롤)라 머리줄 글자가 두 줄로 밀리지 않는다
//   ② 휴대폰(390, 모바일 뷰포트) — 브라우저가 1440 폭으로 배치해 화면에 맞춰 축소한다(가로 스크롤 없음)
//   ③ 감독 화면만 반응형 — 첫 진입이든 앱 안 이동이든 기기 폭 그대로다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-viewport-'));
await build({ envDir: false, mode: 'figma', build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4203;
const BASE = `http://127.0.0.1:${PORT}`;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const layout = (page) =>
  page.evaluate(() => ({
    canvas: document.documentElement.dataset.canvas,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
try {
  // ① PC 좁은 창 — 대시보드 통계 라벨이 1440 에서처럼 한 줄
  const desk = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  await desk.goto(`${BASE}/caregiver`);
  const label = desk.getByText('등록된 어르신', { exact: true }).first();
  await label.waitFor();
  const box = await label.boundingBox();
  const lh = await label.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  assert.ok(box.height < lh * 1.5, `'등록된 어르신' 이 두 줄로 밀림(높이 ${box.height}, 줄 높이 ${lh})`);
  const d = await layout(desk);
  assert.equal(d.canvas, 'fixed');
  assert.ok(d.scrollWidth >= 1440, `캔버스가 1440 보다 좁아짐(${d.scrollWidth})`);
  await desk.close();

  // ② 휴대폰 — 1440 폭으로 배치(화면에 맞춰 축소) · 가로 스크롤 없음
  const mob = await browser.newPage(phone);
  await mob.goto(`${BASE}/caregiver`);
  await mob.getByText('등록된 어르신', { exact: true }).first().waitFor();
  const m = await layout(mob);
  assert.equal(m.innerWidth, 1440);
  assert.ok(m.scrollWidth <= m.innerWidth + 1, `휴대폰 가로 스크롤(${m.scrollWidth} > ${m.innerWidth})`);

  // ③ 앱 안에서 감독 화면으로 이동하면 반응형(기기 폭)으로 바뀐다
  await mob.evaluate(() => {
    window.history.pushState({}, '', '/caregiver/supervision');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await mob.waitForFunction(() => document.documentElement.dataset.canvas === 'fluid');
  assert.equal(
    await mob.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute('content')),
    'width=device-width, initial-scale=1.0',
  );
  await mob.close();

  // ③ 감독 화면 첫 진입 — 처음부터 기기 폭
  const sup = await browser.newPage(phone);
  await sup.goto(`${BASE}/caregiver/supervision`);
  const s = await layout(sup);
  assert.equal(s.canvas, 'fluid');
  assert.equal(s.innerWidth, 390);
  await sup.close();

  console.log('PASS: PC 좁은 창 1440 캔버스 유지(줄바꿈 없음) · 휴대폰 1440 축소(가로 스크롤 없음) · 감독 화면만 반응형(첫 진입·앱 안 이동).');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

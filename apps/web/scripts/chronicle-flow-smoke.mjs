// 연대기 날짜 회귀 — 실제 저장/재열기 + 합성 API. 환경 파일과 운영 데이터는 읽지 않는다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-chronicle-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'chronicle-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS' };
try {
  for (const timezoneId of ['Asia/Seoul', 'UTC']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let row;
    const savedDates = [];
    await page.route('https://**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname.endsWith('/rest/v1/chronicle_entries')) {
        if (req.method() === 'PATCH') {
          assert.equal(url.searchParams.get('id'), 'eq.ch-date');
          const patch = req.postDataJSON();
          savedDates.push(patch.recorded_at);
          row = { ...row, ...patch };
          return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(row) });
        }
        return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify([row]) });
      }
      return route.abort();
    });
    await page.goto(`${base}/caregiver/elders/e1/chronicles`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    row = await page.evaluate(() => {
      const q = window.__giokonQC;
      const template = q.getQueryData(['chronicles', 'e1'])[0];
      const row = { ...template, id: 'ch-date', source: 'caregiver', title: '날짜 보존 확인', recorded_at: '2026-07-30T03:00:00Z' };
      q.setQueryData(['chronicles', 'e1'], [row]);
      return row;
    });
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.getByRole('link', { name: '날짜 보존 확인 상세 기록 열기', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByLabel('기록일', { exact: true }).inputValue(), '2026-07-30', `${timezoneId}: 저장 후 재열기에서도 기록일을 보존해야 함`);
      await page.getByRole('button', { name: '저장', exact: true }).click();
      await page.waitForURL(/\/chronicles$/);
      assert.equal(savedDates.length, cycle + 1);
    }
    assert.deepEqual(savedDates, ['2026-07-29T15:00:00.000Z', '2026-07-29T15:00:00.000Z'], `${timezoneId}: 기록일은 서울 자정으로 저장해야 함`);

    await page.clock.install({ time: new Date('2026-10-13T15:30:00Z') });
    await page.getByRole('link', { name: '연대기 추가', exact: true }).click();
    assert.equal(await page.getByLabel('기록일', { exact: true }).inputValue(), '2026-10-14', '서울 새벽의 새 기록은 한국의 오늘이어야 함');
    await page.getByLabel('제목', { exact: true }).fill('새 기록');
    await page.getByLabel('내용', { exact: true }).fill('기록일을 비운 저장 확인');
    await page.getByLabel('기록일', { exact: true }).fill('');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByText('기록일을 선택해 주세요.', { exact: true }).waitFor();
    assert.equal(savedDates.length, 2, '빈 기록일은 요청으로 보내면 안 됨');
    assert.deepEqual(errors, [], '날짜를 비워도 화면 오류가 없어야 함');
    await context.close();
  }
  console.log('PASS: 서울/UTC에서 연대기 2회 저장·재열기 날짜 보존 · 서울 새벽 기본 날짜 · 빈 기록일 차단. 합성 API만 사용.');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

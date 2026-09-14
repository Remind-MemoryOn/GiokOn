// UI-only integration test. Synthetic API replies; never reads environment files.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'memoryon-report-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'report-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 4197, strictPort: true } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const requests = [];
  let failNext = false;
  await page.route('https://**/*', async route => {
    if (route.request().url().endsWith('/functions/v1/session-report')) {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
        return;
      }
      const input = route.request().postDataJSON(); requests.push(input);
      if (failNext) {
        failNext = false;
        await route.fulfill({ status: 502, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: '시연 테스트 생성 실패' }) });
        return;
      }
      await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ report: {
        schemaVersion: 'session-report-v1', sourceSessionId: input.session_id,
        result: { summary: [], topics: [], journal: [{ text: '시연 참여자가 시장에 갔던 기억을 이야기했습니다.', evidence: [{ turnId: 'synthetic-log', quote: '시장에 갔어요' }] }] },
      } }) });
    } else await route.abort();
  });
  await page.goto('http://127.0.0.1:4197/caregiver/journal/e1/new');
  const field = page.getByRole('textbox', { name: '오늘 어르신의 활동' });
  await field.fill('담당자가 작성 중인 원문');
  await page.getByRole('button', { name: '회상 대화에서 일지 초안', exact: true }).click();
  await page.getByLabel('대화 선택').selectOption('s1');
  await page.getByRole('button', { name: 'AI 초안 생성·불러오기' }).click();
  await page.getByRole('heading', { name: '초안 미리보기' }).waitFor();
  assert.equal(await field.inputValue(), '담당자가 작성 중인 원문');
  assert.deepEqual(requests, [{ session_id: 's1' }]);
  await page.getByRole('button', { name: '본문을 초안으로 교체' }).click();
  assert.match(await field.inputValue(), /회상 대화 일지 초안/);
  assert.match(await field.inputValue(), /시장에 갔어요/);
  assert.equal(await page.getByRole('dialog').count(), 0);
  const applied = await field.inputValue();
  await page.getByRole('button', { name: '회상 대화에서 일지 초안', exact: true }).click();
  await page.getByLabel('대화 선택').selectOption('s2');
  failNext = true;
  await page.getByRole('button', { name: 'AI 초안 생성·불러오기' }).click();
  await page.getByText('시연 테스트 생성 실패', { exact: true }).waitFor();
  assert.equal(await field.inputValue(), applied);
  assert.equal(await page.getByRole('button', { name: '본문을 초안으로 교체' }).count(), 0);
  await page.getByRole('button', { name: 'AI 초안 생성·불러오기' }).click();
  await page.getByRole('heading', { name: '초안 미리보기' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await field.inputValue(), applied);
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(requests.slice(1), [{ session_id: 's2' }, { session_id: 's2' }]);
  console.log('PASS: selection, request, preview, explicit replacement, evidence, failed generation, retry and Escape preserve the draft. Synthetic API only.');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

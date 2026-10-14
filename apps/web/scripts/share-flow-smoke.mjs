// 공개 설정 회귀 — 실제 화면 + 합성 쿼리/API. 운영 데이터와 환경 파일은 읽지 않는다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-share-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'share-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const patches = [];
  let shares = [];
  await page.route('https://**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/rest/v1/guardian_shares')) {
      if (req.method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        patches.push(id);
        shares = shares.map(row => row.id === id ? { ...row, ...req.postDataJSON() } : row);
        return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(shares.find(row => row.id === id)) });
      }
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(shares) });
    }
    return route.abort();
  });
  const go = async () => {
    await page.goto(`${base}/caregiver/shares/e1?audit-role=social_worker`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    shares = await page.evaluate(() => {
      const q = window.__giokonQC;
      q.setQueryData(['profile_guardians', 'e1'], [{ id: 'link-1', profile_id: 'e1', guardian_user_id: 'guardian-1', status: 'approved', guardian: { name: '김보호' } }]);
      const rows = q.getQueryData(['guardian_shares', 'e1']);
      const source = rows.find(row => row.item_type === 'journal' && row.item_id === 'j1');
      const next = [...rows, { ...source, id: 'sh-photo', item_type: 'photo', item_id: 'photo-1' }];
      q.setQueryData(['guardian_shares', 'e1'], next);
      return next;
    });
  };
  const photo = { id: 'photo-1', journal_id: 'j1', path: 'e1/photo.png', caption: null, sort: 0, created_at: '2026-07-30T00:00:00Z' };
  const pending = async key => page.evaluate(key => {
    window.__giokonQC.getQueryCache().find({ queryKey: key }).setState({ data: undefined, status: 'pending', fetchStatus: 'fetching', error: null });
  }, key);
  const restore = async (key, data) => page.evaluate(({ key, data }) => window.__giokonQC.setQueryData(key, data), { key, data });
  const allPhotosKey = ['program_journal_photos', 'org', ['j1', 'j2', 'j3', 'j4']];

  // 첨부 목록이 아직 없으면 일지만 철회하고 사진을 남기는 동작을 허용하면 안 된다.
  await go();
  await pending(allPhotosKey);
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('button', { name: '비공개로 전환', exact: true }).first().isDisabled(), true, '첨부 조회 중에는 묶음 철회를 막아야 함');
  await page.evaluate(key => window.__giokonQC.getQueryCache().find({ queryKey: key }).setState({ status: 'error', fetchStatus: 'idle', error: new Error('합성 첨부 조회 실패') }), allPhotosKey);
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('button', { name: '비공개로 전환', exact: true }).first().isDisabled(), true, '첨부 조회 실패도 빈 목록으로 인정하면 안 됨');
  await restore(allPhotosKey, [photo]);
  await page.getByRole('button', { name: '비공개로 전환', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: '비공개로 전환', exact: true }).click();
  await page.getByText('비공개로 전환했어요.', { exact: true }).waitFor();
  assert.deepEqual(patches.sort(), ['sh-photo', 'sh2'], '일지와 그 사진 공개를 모두 철회해야 함');

  // 모달은 첨부가 늦게 도착해도 기존 사진 공개 체크를 보존해야 한다.
  patches.length = 0;
  await go();
  await restore(allPhotosKey, [photo]);
  await pending(['program_journal_photos', 'j1']);
  await page.getByRole('button', { name: '공개 기록 수정', exact: true }).first().click();
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: '공개하기', exact: true }).count(), 0, '첨부 조회 중에는 기본 체크값으로 공개할 수 없어야 함');
  await restore(['program_journal_photos', 'j1'], [photo]);
  const photos = page.getByRole('button', { name: '관련 사진 (1장)', exact: true });
  await photos.waitFor();
  assert.equal(await photos.getAttribute('aria-pressed'), 'true', '늦게 도착한 기존 사진 공개를 체크한 채로 시작해야 함');
  assert.deepEqual(patches, [], '열어 보기만으로 공개 상태를 바꾸면 안 됨');
  console.log('PASS: 첨부 대기/실패 시 묶음 철회 차단 · 일지+사진 전체 철회 · 공개 설정의 늦은 첨부 초기값 보존. 합성 API만 사용.');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

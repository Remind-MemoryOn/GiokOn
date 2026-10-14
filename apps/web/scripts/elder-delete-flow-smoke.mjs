// 어르신 정보 삭제 흐름 회귀(2026-09-27 사용자 신고 — 상세의 '어르신 정보 삭제하기'가 목록으로 이동만 했다).
// UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것: ① 확인창을 거친다(취소하면 아무것도 지우지 않는다) ② Storage 파일 → 프로필 행 순서로 지운다
//   (행을 먼저 지우면 Storage 정책이 기관을 확인하지 못해 사진이 남는다 — packages/data/src/storage.ts) ③ 끝나면 목록으로 간다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-elder-delete-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'elder-delete-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4202;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const calls = [];
  let finalJournalState = 'none';
  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/rest/v1/program_journals') && req.method() === 'GET') {
      calls.push('inspect:final');
      return route.fulfill({ status: finalJournalState === 'error' ? 500 : 200,
        contentType: 'application/json', headers: cors,
        body: JSON.stringify(finalJournalState === 'error' ? { message: 'synthetic inspection failure' }
          : finalJournalState === 'final' ? [{ id: 'final-journal' }] : []) });
    }
    if (url.pathname.includes('/storage/v1/object/list/')) {
      calls.push(`list:${url.pathname.split('/').pop()}`);
      return route.fulfill({ contentType: 'application/json', headers: cors, body: '[]' });
    }
    if (url.pathname.endsWith('/rest/v1/profiles') && req.method() === 'DELETE') {
      calls.push(`delete:${url.searchParams.get('id')}`);
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ id: 'e1' }) });
    }
    return route.abort();
  });
  const go = async (path) => {
    await page.goto(`http://127.0.0.1:${PORT}${path}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
  };

  // ① 누르면 확인창 — 취소하면 아무것도 지우지 않는다(이동만 하던 링크가 아니다)
  await go('/caregiver/elders/e1');
  await page.getByRole('button', { name: '어르신 정보 삭제하기' }).click();
  const dialog = page.getByRole('dialog', { name: '어르신 정보를 삭제할까요?' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: '취소' }).click();
  assert.equal(calls.length, 0);
  assert.match(page.url(), /\/caregiver\/elders\/e1$/);

  // ② 확정 일지 또는 확인 실패면 파일을 건드리기 전에 멈춘다.
  finalJournalState = 'final';
  await page.getByRole('button', { name: '어르신 정보 삭제하기' }).click();
  await dialog.getByRole('button', { name: '삭제' }).click();
  await page.getByText('확정된 프로그램 일지가 있어 삭제할 수 없어요. 기록 파기는 운영자에게 요청해 주세요.').waitFor();
  assert.deepEqual(calls, ['inspect:final']);
  assert.match(page.url(), /\/caregiver\/elders\/e1$/);
  await go('/caregiver/elders/e1');
  calls.length = 0;
  finalJournalState = 'error';
  await page.getByRole('button', { name: '어르신 정보 삭제하기' }).click();
  await dialog.getByRole('button', { name: '삭제' }).click();
  await page.getByText('확정 일지 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.').waitFor();
  assert.deepEqual(calls, ['inspect:final']);
  assert.match(page.url(), /\/caregiver\/elders\/e1$/);
  await go('/caregiver/elders/e1');
  calls.length = 0;
  finalJournalState = 'none';

  // ③ 확인하면 확정 여부 → Storage 파일(사진·일지 사진) → 프로필 행 순서로 파기하고 목록으로 간다
  await page.getByRole('button', { name: '어르신 정보 삭제하기' }).click();
  await dialog.getByRole('button', { name: '삭제' }).click();
  await page.waitForURL(/\/caregiver\/elders$/);
  await page.getByText('어르신 정보를 삭제했어요.').waitFor();
  assert.deepEqual(calls, ['inspect:final', 'list:elder-photos', 'list:journal-photos', 'delete:eq.e1']);

  console.log('PASS: 어르신 삭제 — 취소 시 무동작 · 확정 일지/조회 실패 시 파일 보존 · 확인 → 파일 → 행 순서 파기 · 목록 복귀. 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

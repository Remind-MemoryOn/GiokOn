// 장기요양등급 흐름 회귀(파일럿 W8) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것: ① 주간보호 기관(스텁 ?audit-grade=day_care)은 등급이 필수 — 상세는 미입력을 알리고, 수정·등록은 미입력이면 저장/다음을 막는다
//   ② 등급을 고르면 저장 요청에 care_grade 가 실린다 ③ 요양원 기관은 선택 사항(미입력이어도 저장된다)
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { selectValue } from './select-control.mjs';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-grade-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'grade-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4201;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const patches = [];
  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/rest/v1/profiles') && req.method() === 'PATCH') {
      const body = req.postDataJSON();
      patches.push(body);
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ id: 'e1', ...body }) });
    }
    return route.abort();
  });
  const go = async (path) => {
    await page.goto(`http://127.0.0.1:${PORT}${path}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
  };

  // ① 상세 — 주간보호인데 미입력이면 알린다
  await go('/caregiver/elders/e1?audit-grade=day_care');
  await page.getByText('장기요양등급 미입력 (주간보호 필수)').waitFor();

  // ① ② 수정 — 미입력 저장 막음 → 고르면 care_grade 로 저장
  await go('/caregiver/elders/e1/edit?audit-grade=day_care');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('주간보호 기관은 장기요양등급을 입력해야 해요.').waitFor();
  assert.equal(patches.length, 0);
  await selectValue(page, '장기요양등급', 'grade_3');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForURL(/\/caregiver\/elders\/e1$/);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].care_grade, 'grade_3');

  // ① 등록 — 주간보호는 등급 없이 다음 단계로 못 간다
  await page.goto(`http://127.0.0.1:${PORT}/caregiver/elders/new?audit-grade=day_care`);
  await page.getByRole('dialog', { name: '어르신 등록' }).waitFor();
  await page.locator('#r-name').fill('박시험');
  await page.locator('#r-birth').fill('1940-03-02');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByText('주간보호 기관은 장기요양등급을 입력해야 해요.').waitFor();
  await selectValue(page, '장기요양등급', 'cognitive_support');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '동의 후 등록' }).waitFor();

  // ③ 요양원 — 선택 사항: 미입력으로 저장되고 null 이 간다
  await go('/caregiver/elders/e1/edit?audit-grade=nursing_home');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForURL(/\/caregiver\/elders\/e1$/);
  assert.equal(patches.length, 2);
  assert.equal(patches[1].care_grade, null);

  // 기관 설정 대기/실패는 '등급 선택 사항'이라는 뜻이 아니다. 수정 저장을 막고 다시 조회할 길을 준다.
  await go('/caregiver/elders/e1/edit?audit-grade=day_care');
  const settings = await page.evaluate(() => window.__giokonQC.getQueryData(['org_settings']));
  await page.evaluate(() => window.__giokonQC.getQueryCache().find({ queryKey: ['org_settings'] }).setState({ data: undefined, status: 'pending', fetchStatus: 'fetching', error: null }));
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('button', { name: '저장', exact: true }).isDisabled(), true, '기관 설정 확인 전에는 등급 필요 여부를 알 수 없어 저장을 막아야 함');
  await page.evaluate(() => window.__giokonQC.getQueryCache().find({ queryKey: ['org_settings'] }).setState({ status: 'error', fetchStatus: 'idle', error: new Error('합성 설정 조회 실패') }));
  await page.getByRole('button', { name: '기관 설정 다시 확인', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '저장', exact: true }).isDisabled(), true);
  await page.evaluate(settings => window.__giokonQC.setQueryData(['org_settings'], settings), settings);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('주간보호 기관은 장기요양등급을 입력해야 해요.').waitFor();
  assert.equal(patches.length, 2);

  await page.goto(`http://127.0.0.1:${PORT}/caregiver/elders/new?audit-grade=day_care`);
  await page.getByRole('dialog', { name: '어르신 등록' }).waitFor();
  await page.locator('#r-name').fill('박시험');
  await page.locator('#r-birth').fill('1940-03-02');
  await page.evaluate(() => window.__giokonQC.getQueryCache().find({ queryKey: ['org_settings'] }).setState({ data: undefined, status: 'pending', fetchStatus: 'fetching', error: null }));
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('button', { name: '다음', exact: true }).isDisabled(), true, '기관 설정 확인 전에는 등록 동의 단계로 넘어가면 안 됨');

  // 주요 기억은 수가 늘어도 특이사항·저장 버튼 위를 덮지 않는다. 시안의 2행까지는 좌표를 그대로 둔다.
  await go('/caregiver/elders/e1/edit?audit-grade=nursing_home');
  const noteTop = (await page.locator('#f-note').boundingBox()).y;
  const setMemories = async count => page.evaluate(count => {
    const q = window.__giokonQC;
    const template = q.getQueryData(['chronicles', 'e1'])[0];
    q.setQueryData(['chronicles', 'e1'], Array.from({ length: count }, (_, i) => ({ ...template, id: `memory-${i}`, topic: '주요 기억', content: `추가 기억 ${i + 1}` })));
  }, count);
  await setMemories(2);
  await page.getByText('추가 기억 2', { exact: true }).waitFor();
  assert.equal((await page.locator('#f-note').boundingBox()).y, noteTop, '2개까지는 기존 시안 좌표를 보존해야 함');
  await setMemories(5);
  const lastMemory = page.getByText('추가 기억 5', { exact: true }).locator('..');
  await lastMemory.waitFor();
  const lastBox = await lastMemory.boundingBox();
  const noteBox = await page.locator('#f-note').boundingBox();
  const saveBox = await page.getByRole('button', { name: '저장', exact: true }).boundingBox();
  assert.ok(noteBox.y > lastBox.y + lastBox.height, '5번째 기억 아래로 특이사항을 내려야 함');
  assert.ok(saveBox.y > noteBox.y + noteBox.height, '저장 버튼도 특이사항 아래를 유지해야 함');

  console.log('PASS: 주간보호 등급 필수(상세 안내 · 수정 저장 막음 · 등록 다음 막음) · 고르면 care_grade 저장 · 요양원은 선택. 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

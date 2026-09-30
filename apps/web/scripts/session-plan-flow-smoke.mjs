// 세션 설계 흐름 회귀(파일럿 W5) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것: ① 목표 시간 선택지는 5~10분(서버 상한) ② 새 세션 기본값 = 기관 목표 시간 · 피해갈 내용 = 기관 기본 피할 주제
//   ③ 단계 미리보기가 목표 시간을 따라 바뀐다 ④ 10분을 넘게 설계된 세션은 10분으로 맞춰 보이고, 저장하면 10분으로 간다.
//   ⑤ 새 세션 기록일 기본값은 한국 날짜(T25.7) — 기기가 UTC 여도 한국 08:30(UTC 로는 전날)이면 한국의 오늘.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { selectField, selectValue } from './select-control.mjs';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-plan-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'plan-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4200;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const calls = [];
  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/rest/v1/sessions') && (req.method() === 'POST' || req.method() === 'PATCH')) {
      const body = req.postDataJSON();
      calls.push({ method: req.method(), body });
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ id: 'new-1', profile_id: 'e1', ...(Array.isArray(body) ? body[0] : body) }) });
    }
    return route.abort();
  });
  const open = async (path) => {
    await page.goto(`http://127.0.0.1:${PORT}${path}`);
    await page.getByRole('dialog', { name: '회상 세션 설계' }).waitFor();
  };

  // ① ② ③ 새 세션
  await open('/caregiver/sessions/e1/new?audit-plan=1');
  const minutes = selectField(page, '목표 시간');
  assert.deepEqual(await minutes.locator('option').evaluateAll((os) => os.map((o) => o.value)), ['5', '6', '7', '8', '9', '10']);
  assert.equal(await minutes.inputValue(), '8');
  assert.equal(await page.getByLabel('피해갈 내용').inputValue(), '전쟁, 돌아가신 가족');
  const preview = page.getByRole('note', { name: '진행 단계 미리보기' });
  assert.match(await preview.innerText(), /도입 ~1분 → 회상 ~5분 30초 → 마무리 1분 30초/);
  await selectValue(page, '목표 시간', '10');
  assert.match(await preview.innerText(), /회상 ~7분 30초/);
  await page.getByLabel('세션 제목').fill('고향 이야기');
  await page.getByLabel('목표', { exact: true }).fill('고향 집을 떠올린다');
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForURL(/\/caregiver\/sessions\/e1$/);
  const created = calls.filter((c) => c.method === 'POST');
  assert.equal(created.length, 1);
  const c = Array.isArray(created[0].body) ? created[0].body[0] : created[0].body;
  assert.equal(c.duration_minutes, 10);
  assert.equal(c.avoid_topics, '전쟁, 돌아가신 가족');
  assert.equal(c.status, 'planned');

  // ④ 30분으로 설계돼 있던 세션 — 10분으로 보이고 안내가 뜨며, 기존 피해갈 내용은 그대로
  await open('/caregiver/sessions/e1/plan/sp-old?audit-plan=1');
  assert.equal(await selectField(page, '목표 시간').inputValue(), '10');
  assert.match(await page.getByRole('note', { name: '진행 단계 미리보기' }).innerText(), /기존 설계 30분 → 최대 10분으로 진행돼요/);
  assert.equal(await page.getByLabel('피해갈 내용').inputValue(), '병원');
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForURL(/\/caregiver\/sessions\/e1$/);
  const patched = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patched.length, 1);
  assert.equal(patched[0].body.duration_minutes, 10);

  // ⑤ 한국 날짜 기준 — UTC 기기 · 한국 2026-09-27 08:30(= UTC 2026-09-26 23:30)
  const utc = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'UTC' });
  const early = await utc.newPage();
  await early.clock.setFixedTime(new Date('2026-09-26T23:30:00Z'));
  await early.route('https://**/*', (route) => route.abort());
  await early.goto(`http://127.0.0.1:${PORT}/caregiver/sessions/e1/new?audit-plan=1`);
  await early.getByRole('dialog', { name: '회상 세션 설계' }).waitFor();
  assert.equal(await early.locator('#p-date').inputValue(), '2026-09-27', '기록일 기본값은 한국의 오늘이어야 함(UTC 로 자르면 전날)');
  await utc.close();

  console.log('PASS: 한국 날짜 기본값(UTC 기기·한국 오전) · 목표 시간 5~10분 · 새 세션 기본값=기관 설정 · 피할 주제 미리 채움 · 단계 미리보기 · 10분 초과 설계는 10분으로. 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

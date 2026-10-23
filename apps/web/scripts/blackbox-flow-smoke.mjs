// Black-box UI checks: synthetic HTTP/auth fixtures; assertions use rendered UI,
// browser validation, navigation and outgoing requests. Never reads dotenv.
// Run from repository root: pnpm -F @giokon/web exec node scripts/blackbox-flow-smoke.mjs
import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const evidence = resolve('../../.tmp/blackbox-2026-10-24');
await mkdir(evidence, { recursive: true });
const servers = [];
const results = [];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
  : existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : { channel: 'msedge' });
async function site(mode) {
  const outDir = await mkdtemp(join(tmpdir(), `giokon-blackbox-${mode}-`));
  await build({ envDir: false, mode, logLevel: 'error', plugins: mode === 'figma' ? [{ name: 'synthetic-auth', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
  } }] : [], define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
  }, build: { outDir, emptyOutDir: false } });
  const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  servers.push(server);
  return `http://127.0.0.1:${server.httpServer.address().port}`;
}
async function check(id, technique, title, action) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const writes = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // All external traffic is intercepted; neither production nor Gemini is contacted.
  await page.route('https://**/*', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() !== 'GET') writes.push({ path: new URL(req.url()).pathname, method: req.method() });
    return route.fulfill({ status: 400, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ code: 'synthetic_rejection', msg: '합성 서버 거절', message: '합성 서버 거절', error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
  });
  const started = Date.now();
  try {
    const observed = await action({ page, context, writes });
    assert.deepEqual(errors, [], 'No uncaught browser exception');
    results.push({ id, technique, title, status: 'PASS', observed, elapsedMs: Date.now() - started });
  } catch (error) {
    const screenshot = `${id}.png`;
    await page.screenshot({ path: join(evidence, screenshot), fullPage: true }).catch(() => {});
    results.push({ id, technique, title, status: 'FAIL', error: error.message, url: page.url(),
      visibleText: (await page.locator('body').innerText().catch(() => '')).slice(-5000), writes, screenshot, elapsedMs: Date.now() - started });
  } finally {
    await context.close();
    console.log(`${results.at(-1).status} ${id} ${title}`);
  }
}
async function open(page, base, path) {
  await page.goto(`${base}${path}`);
  await page.locator('h1').first().waitFor();
}
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });

try {
  const publicBase = await site('production');
  const auditBase = await site('figma');

  // Cause-effect: request = valid email AND password length >= 8 AND confirmation matches.
  for (const emailOk of [false, true]) for (const lengthOk of [false, true]) for (const matches of [false, true]) {
    const bits = [emailOk, lengthOk, matches].map(Number).join('');
    await check(`DT-SIGN-${bits}`, ['동등 분할', '원인-결과 그래프', '결정 테이블'], `가입 E/L/M=${bits}`, async ({ page, writes }) => {
      await open(page, publicBase, '/signup');
      const password = lengthOk ? '12345678' : '1234567';
      const fields = page.locator('main input');
      await fields.nth(0).fill(emailOk ? 'qa@example.invalid' : 'invalid-email');
      await fields.nth(1).fill(password);
      await fields.nth(2).fill(matches ? password : 'different-password');
      await page.getByRole('button', { name: '가입하기', exact: true }).click();
      const expected = emailOk && lengthOk && matches ? 1 : 0;
      if (expected) await page.getByText('합성 서버 거절', { exact: false }).waitFor();
      else if (emailOk) await page.getByText(lengthOk ? '비밀번호가 일치하지 않아요.' : '비밀번호는 8자 이상이어야 해요.', { exact: true }).waitFor();
      else assert.equal(await fields.nth(0).evaluate(e => e.validity.typeMismatch), true);
      assert.equal(writes.length, expected);
      return { expectedRequests: expected, actualRequests: writes.length };
    });
  }
  for (const [id, path, button, message] of [
    ['EP-EMPTY-SIGN', '/signup', '가입하기', '가입할 이메일(아이디)을 입력해 주세요.'],
    ['EP-EMPTY-LOGIN', '/login', '로그인', '이메일을 입력해 주세요.'],
    ['EP-EMPTY-FORGOT', '/forgot-password', '재설정 메일 보내기', '가입한 이메일을 입력해 주세요.'],
    ['EP-EMPTY-FIND', '/find-id', '아이디 찾기', '이름과 전화번호를 입력해 주세요.'],
    ['EP-EMPTY-RESET', '/reset-password', '비밀번호 변경', '비밀번호는 8자 이상이어야 해요.'],
  ]) await check(id, ['동등 분할', '오류 예측'], `${path} 필수 입력 없음`, async ({ page, writes }) => {
    await open(page, publicBase, path);
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByText(message, { exact: true }).waitFor();
    assert.equal(writes.length, 0);
    return { feedback: message, requests: 0 };
  });
  await check('ST-SIGN-RETRY', ['상태 전이', '오류 예측'], '가입 대기 중 중복 차단 → 실패 → 재시도', async ({ page }) => {
    let release;
    let signal;
    let issued = new Promise(r => { signal = r; });
    let requests = 0;
    await page.route('**/auth/v1/signup**', async route => {
      requests++;
      await new Promise(r => { release = r; signal(); });
      return json(route, { code: 'synthetic_rejection', msg: '합성 서버 거절' }, 400);
    });
    await open(page, publicBase, '/signup');
    const fields = page.locator('main input');
    for (const [i, value] of ['qa@example.invalid', '12345678', '12345678'].entries()) await fields.nth(i).fill(value);
    await page.getByRole('button', { name: '가입하기', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.disabled && /처리 중/.test(b.textContent)));
    await issued;
    assert.equal(requests, 1);
    release();
    await page.getByText('합성 서버 거절', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '가입하기', exact: true }).isEnabled(), true);
    issued = new Promise(r => { signal = r; });
    await page.getByRole('button', { name: '가입하기', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.disabled && /처리 중/.test(b.textContent)));
    await issued;
    assert.equal(requests, 2);
    release();
    await page.getByRole('button', { name: '가입하기', exact: true }).waitFor();
    return { attempts: requests, duplicateWhilePending: 0 };
  });
  for (const [length, field] of [[100, 'input'], [5000, 'textarea']]) await check(`EP-INQUIRY-${length}`, ['동등 분할', '오류 예측'], `문의 ${field} 최대 ${length}자`, async ({ page }) => {
    await open(page, publicBase, '/inquiries/new');
    const input = page.locator(`main ${field}`).first();
    await input.fill('가'.repeat(length + 1));
    assert.equal((await input.inputValue()).length, length);
    return { submittedLength: length + 1, retainedLength: length };
  });
  await check('EG-INQUIRY-ANON', ['오류 예측'], '미인증 문의 등록 차단', async ({ page, writes }) => {
    await open(page, publicBase, '/inquiries/new');
    await page.locator('main input').first().fill('합성 문의');
    await page.locator('main textarea').fill('블랙박스 시험용 문장');
    await page.getByRole('button', { name: '등록하기', exact: true }).click();
    await page.getByText('로그인이 먼저 필요한 서비스예요.', { exact: true }).waitFor();
    assert.equal(writes.filter(r => r.path.includes('inquiries')).length, 0);
    return { inquiryWrites: 0 };
  });

  // Production AuthProvider and real routes; only the remote server is synthetic.
  await check('ST-LOGIN-RETURN', ['상태 전이', '오류 예측'], '감독 링크 → 로그인 성공 → 원래 감독 화면', async ({ page }) => {
    const uid = '10000000-0000-4000-8000-000000000001';
    const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'qa@example.invalid', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-24T00:00:00Z' };
    const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url'), 'synthetic'].join('.');
    await page.route('https://**/*', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (path.endsWith('/auth/v1/token')) return json(route, { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'synthetic', user });
      if (path.endsWith('/auth/v1/user')) return json(route, user);
      if (path.endsWith('/rest/v1/users')) {
        const row = { id: uid, org_id: '10000000-0000-4000-8000-000000000002', role: 'caregiver', name: '합성직원', phone: '010-0000-0000', email: user.email, onboarded_at: '2026-10-24T00:00:00Z', created_at: '2026-10-24T00:00:00Z', updated_at: '2026-10-24T00:00:00Z' };
        return json(route, req.headers().accept?.includes('object+json') ? row : [row]);
      }
      return json(route, []);
    });
    await open(page, publicBase, '/caregiver/supervision');
    await page.getByRole('button', { name: '로그인', exact: true }).waitFor();
    await page.getByLabel('아이디', { exact: true }).fill(user.email);
    await page.getByLabel('비밀번호', { exact: true }).fill('12345678');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    assert.equal(new URL(page.url()).pathname, '/caregiver/supervision');
    return { destination: new URL(page.url()).pathname };
  });

  for (const role of ['caregiver', 'social_worker', 'center_director', 'org_admin']) await check(`DT-FINAL-${role}`, ['결정 테이블', '원인-결과 그래프'], `확정 권한: ${role}`, async ({ page }) => {
    await open(page, auditBase, `/caregiver/journal/e1/j1?audit-role=${role}`);
    const button = page.getByRole('button', { name: '확정', exact: true });
    assert.equal(await button.isEnabled(), role !== 'caregiver');
    return { role, finalizationEnabled: await button.isEnabled() };
  });
  for (const [status, label] of [['generating', '생성 중'], ['pending_review', '확인 대기'], ['final', '확정'], ['failed', '생성 실패']]) await check(`ST-JOURNAL-${status}`, ['동등 분할', '상태 전이'], `일지 ${status} 표시·재시도`, async ({ page, writes }) => {
    await open(page, auditBase, '/caregiver/journal/e1');
    // Existing audit seam supplies external record states; no implementation state is asserted.
    await page.evaluate(status => {
      const q = window.__giokonQC;
      const row = q.getQueryData(['program_journals', 'e1'])[0];
      q.setQueryData(['program_journals', 'e1'], [{ ...row, status }]);
    }, status);
    await page.getByText(label, { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: '다시 생성', exact: true }).count(), status === 'failed' ? 1 : 0);
    assert.equal(await page.getByRole('button', { name: /초안 (생성|만들기)/ }).count(), 0);
    assert.equal(writes.length, 0);
    return { status, displayed: label, retry: status === 'failed', automaticWrites: 0 };
  });
  for (const value of ['0', '5', '10', '11', '30']) await check(`EP-TIME-${value}`, ['동등 분할', '비교'], `목표 시간 입력군 ${value}분`, async ({ page }) => {
    await open(page, auditBase, '/caregiver/sessions/e1/new?audit-plan=1');
    const minutes = page.getByRole('combobox', { name: '목표 시간', exact: true });
    await minutes.click();
    const choice = page.getByRole('option', { name: `${value}분`, exact: true });
    const expected = ['5','10'].includes(value);
    assert.equal(await choice.count() > 0, expected);
    if (expected) {
      await choice.click();
      assert.match(await minutes.innerText(), new RegExp(`${value}분`));
    }
    return { input: value, offered: expected };
  });
  for (const zone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) await check(`CMP-DATE-${zone.replaceAll('/','-')}`, ['비교'], `${zone} 기기의 한국 새벽 날짜`, async () => {
    const zoned = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1100 } });
    try {
      const page = await zoned.newPage();
      await page.route('https://**/*', r => r.abort());
      await page.clock.setFixedTime(new Date('2026-10-23T15:30:00Z'));
      await open(page, auditBase, '/caregiver/sessions/e1/new?audit-plan=1');
      assert.equal(await page.locator('#p-date').inputValue(), '2026-10-24');
      return { timezone: zone, displayedDate: '2026-10-24' };
    } finally { await zoned.close(); }
  });
  await check('EG-XSS-JOURNAL', ['오류 예측'], '일지 문자열의 HTML 실행 방지', async ({ page }) => {
    await open(page, auditBase, '/caregiver/journal/e1');
    const payload = '<img src=x onerror="window.blackboxXss=1">';
    await page.evaluate(payload => {
      const q = window.__giokonQC;
      q.setQueryData(['program_journals', 'e1'], q.getQueryData(['program_journals', 'e1']).map(r => ({ ...r, activity_content: payload })));
    }, payload);
    await page.getByText(payload, { exact: false }).first().waitFor();
    assert.equal(await page.evaluate(() => window.blackboxXss), undefined);
    assert.equal(await page.locator('img[onerror]').count(), 0);
    return { displayedAsText: true, scriptExecuted: false };
  });
} finally {
  await writeFile(join(evidence, 'additional-ui-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length, evidence }));
  await browser.close();
  for (const server of servers) await new Promise(r => server.httpServer.close(r));
}
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;

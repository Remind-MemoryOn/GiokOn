// BB-01 regression: production UI and synthetic auth HTTP only; no dotenv.
import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const evidence = resolve('../../.tmp/bb01-fix-2026-10-24');
const mutant = process.argv.includes('--unguarded-return');
const baseline = process.argv.includes('--baseline');
await mkdir(evidence, { recursive: true });
const outDir = await mkdtemp(join(tmpdir(), 'giokon-login-return-'));
await build({ envDir: false, mode: 'production', logLevel: 'error', plugins: baseline ? [{ name: 'original-code-for-regression-proof', enforce: 'pre', transform(_code, id) {
  const file = ['src/App.tsx', 'src/auth/routes.ts', 'src/pages/public/LoginPage.tsx'].find(file => id.replaceAll('\\', '/').endsWith(`/${file}`));
  if (file) return execFileSync('git', ['show', `ee1d3de6dfc3c457e71f48b69fc62285f719ced1:apps/web/${file}`], { encoding: 'utf8' });
} }] : mutant ? [{ name: 'remove-return-policy-for-regression-proof', enforce: 'pre', transform(code, id) {
  if (!id.replaceAll('\\', '/').endsWith('/src/auth/routes.ts')) return;
  const signature = 'export function routeAfterLogin(row: UserRow | null, returnTo: unknown): string {';
  assert.ok(code.includes(signature), 'Mutation must match the production return policy');
  return code.replace(signature, `${signature}\n  if (typeof returnTo === 'string') return returnTo;`);
} }] : [], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false } });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
  : existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' }
  : process.platform === 'win32' ? { channel: 'msedge' } : {});
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const results = [];
const loginUrl = path => `/login?returnTo=${encodeURIComponent(path)}`;
async function check(id, options, action) {
  if (mutant && !['external-url', 'javascript-url', 'prefix-confusion'].includes(id)) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const row = { id: '40000000-0000-4000-8000-000000000001', org_id: '40000000-0000-4000-8000-000000000002',
    role: 'caregiver', name: '합성복귀시험', phone: '010-0000-0000', email: 'return@example.invalid',
    onboarded_at: '2026-10-24T00:00:00Z', created_at: '2026-10-24T00:00:00Z', ...options };
  const user = { id: row.id, email: row.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: row.created_at };
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: row.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url'), Buffer.from('synthetic-signature').toString('base64url')].join('.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = body => route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path.endsWith('/auth/v1/token')) return json({ access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'synthetic', user });
    if (path.endsWith('/auth/v1/user')) return json(user);
    if (path.endsWith('/rest/v1/users')) return json(req.headers().accept?.includes('object+json') ? row : [row]);
    if (path.endsWith('/authorize')) return route.fulfill({ contentType: 'text/html', body: '<p>Synthetic provider</p>' });
    return json([]);
  });
  const submit = async () => {
    await page.getByLabel('아이디', { exact: true }).fill(row.email);
    await page.getByLabel('비밀번호', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => url.pathname !== '/login');
  };
  try {
    const observed = await action({ page, submit, token });
    assert.deepEqual(errors, []);
    results.push({ id, status: 'PASS', observed });
  } catch (error) {
    results.push({ id, status: 'FAIL', error: error.message, url: page.url(), text: await page.locator('body').innerText() });
  } finally {
    await context.close();
    console.log(`${results.at(-1).status} ${id}`);
  }
}
try {
  for (const [id, path, role] of [
    ['guard-caregiver', '/caregiver/supervision?source=push#event-1', 'caregiver'],
    ['guard-guardian', '/guardian/feed?tab=journal#today', 'guardian'],
  ]) await check(id, { role }, async ({ page, submit }) => {
    await page.goto(`${base}${path}`);
    await page.getByRole('button', { name: '로그인', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), path);
    await page.reload();
    await submit();
    assert.equal(page.url(), `${base}${path}`);
    return { path };
  });
  const cases = [
    ['direct-target', '/caregiver/supervision', {}, '/caregiver/supervision'],
    ['no-target', null, {}, '/caregiver'],
    ['guardian-home', null, { role: 'guardian' }, '/guardian'],
    ['guardian-deny-care', '/caregiver/supervision', { role: 'guardian' }, '/guardian'],
    ['care-deny-guardian', '/guardian/feed', {}, '/caregiver'],
    ['pending-org', '/caregiver/supervision', { org_id: null }, '/join-pending'],
    ['needs-onboarding', '/caregiver/supervision', { onboarded_at: null }, '/onboarding'],
    ['external-url', 'https://example.invalid/steal', {}, '/caregiver'],
    ['protocol-relative', '//example.invalid/steal', {}, '/caregiver'],
    ['backslash-host', '/\\example.invalid/steal', {}, '/caregiver'],
    ['javascript-url', 'javascript:alert(1)', {}, '/caregiver'],
    ['login-loop', '/login?returnTo=/caregiver', {}, '/caregiver'],
    ['normalized-loop', '/caregiver/../login', {}, '/caregiver'],
    ['prefix-confusion', '/caregiverevil/supervision', {}, '/caregiver'],
    ['inquiry-target', '/inquiries/new', {}, '/inquiries/new'],
  ];
  for (const [id, target, row, expected] of cases) await check(id, row, async ({ page, submit }) => {
    await page.goto(`${base}${target === null ? '/login' : loginUrl(target)}`);
    await submit();
    assert.equal(new URL(page.url()).origin, base);
    assert.equal(new URL(page.url()).pathname, expected);
    return { target, expected };
  });
  await check('legacy-inquiry-state', {}, async ({ page, submit }) => {
    await page.goto(`${base}/login`);
    await page.evaluate(() => window.history.replaceState({ usr: { from: '/inquiries/new' } }, '', window.location.href));
    await page.reload();
    await submit();
    assert.equal(new URL(page.url()).pathname, '/inquiries/new');
  });
  const target = '/caregiver/supervision?source=push#event-1';
  for (const [id, name] of [['google-return', '구글'], ['kakao-return', '카카오톡'], ['naver-return', '네이버']]) {
    await check(id, {}, async ({ page }) => {
      await page.goto(`${base}${loginUrl(target)}`);
      const requested = page.waitForRequest(req => new URL(req.url()).pathname.endsWith('/authorize'));
      await page.getByRole('button', { name, exact: true }).click();
      const request = await requested;
      const callback = new URL(new URL(request.url()).searchParams.get('redirect_to'));
      assert.equal(callback.origin, base);
      assert.equal(callback.pathname, '/login');
      assert.equal(callback.searchParams.get('returnTo'), target);
      return { callback: callback.pathname + callback.search };
    });
  }
  await check('naver-callback-return', {}, async ({ page, token }) => {
    await page.goto(`${base}${loginUrl(target)}#access_token=${token}&refresh_token=synthetic&provider=naver`);
    await page.waitForURL(url => url.pathname !== '/login');
    assert.equal(page.url(), `${base}${target}`);
  });
} finally {
  await writeFile(join(evidence, baseline ? 'login-return-baseline-results.json' : mutant ? 'login-return-mutant-results.json' : 'login-return-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length }));
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;

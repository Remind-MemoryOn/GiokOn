// 사용자 디자인 수정(2026-09-28): 실제 UI + 합성 캐시/API. 운영 데이터와 환경 파일은 읽지 않는다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-design-feedback-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'signup-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('const signedIn = app || onboarding || joinPending;', "const signedIn = path === '/signup' ? false : app || onboarding || joinPending;");
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  const go = async path => {
    await page.goto(base + path);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
  };
  const choose = async (name, option) => {
    await page.getByRole('combobox', { name, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };

  await go('/signup');
  const prefix = page.getByText('이미 계정이 있으신가요?', { exact: true });
  assert.equal(await prefix.evaluate(el => !!el.closest('a,button')), false);
  assert.equal(await page.getByRole('link', { name: '로그인', exact: true }).last().getAttribute('href'), '/login');

  await go('/guardian/feed?state=multi&tab=journal&elder=e1');
  await page.getByText('7월 30일 오늘의 이야기', { exact: true }).waitFor();
  const date = page.locator('input[type=date]');
  await date.fill('2026-07-28');
  await page.getByText('7월 28일 오늘의 이야기', { exact: true }).waitFor();
  assert.equal(await page.getByText('7월 30일 오늘의 이야기', { exact: true }).count(), 0);
  await date.fill('');
  await choose('연결된 어르신 선택', '이영수 어르신');
  assert.equal(new URL(page.url()).pathname, '/guardian/feed');
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'journal');
  assert.equal(new URL(page.url()).searchParams.get('elder'), 'e2');
  await page.getByText('7월 30일 오늘의 이야기', { exact: true }).waitFor({ state: 'hidden' });
  await choose('연결된 어르신 선택', '김복순 어르신');
  await page.getByText('7월 30일 오늘의 이야기', { exact: true }).waitFor();

  // 같은 공통 선택기를 네 화면에서 실제로 조작한다.
  for (const path of ['/caregiver/analysis', '/caregiver/analysis/e1', '/guardian/analysis?state=multi', '/guardian/analysis/sessions?state=multi']) {
    await go(path);
    const combo = page.getByRole('combobox', { name: '분석 기간', exact: true });
    await combo.focus();
    await combo.press('ArrowDown');
    await page.getByRole('listbox', { name: '분석 기간' }).waitFor();
    const rect = await combo.boundingBox();
    const menu = await page.getByRole('listbox', { name: '분석 기간' }).boundingBox();
    assert.ok(Math.abs(menu.y - (rect.y + rect.height + 4)) < 2, '기간 메뉴는 선택기 바로 아래에 열림');
    const aligned = await combo.evaluate(el => {
      const [text, arrow] = [el.parentElement.querySelector('span'), el.parentElement.querySelector('img')].map(node => node.getBoundingClientRect());
      return Math.abs(text.y + text.height / 2 - arrow.y - arrow.height / 2) < 1;
    });
    assert.ok(aligned, '기간 글자와 화살표 중앙 정렬');
    await combo.press('End');
    await combo.press('Enter');
    assert.equal(await combo.locator('xpath=preceding-sibling::select[1]').inputValue(), '12');
    assert.equal(await page.getByRole('listbox', { name: '분석 기간' }).count(), 0);
    await combo.press('Enter');
    await combo.press('Escape');
    assert.equal(await combo.evaluate(el => el === document.activeElement), true);
  }

  // 모달 속 선택창 Escape는 선택창만 닫고 모달을 유지해야 한다.
  await go('/caregiver/sessions/e1/new');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const modalCombo = dialog.getByRole('combobox').first();
  await modalCombo.click();
  await page.getByRole('listbox').waitFor();
  await modalCombo.press('Escape');
  assert.equal(await dialog.isVisible(), true);

  await go('/caregiver/elders/e1');
  const long = '매우긴기본정보'.repeat(40);
  await page.evaluate(text => {
    const q = window.__giokonQC;
    q.setQueryData(['profiles', 'e1'], old => ({ ...old, hometown: text, job: text, family: text, hobbies: text }));
  }, long);
  const truncated = page.locator(`[title="${long}"]`).first();
  await truncated.waitFor();
  assert.equal(await truncated.evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis');

  await page.evaluate(() => {
    window.__giokonQC.setQueryData(['notifications', 'mine'], [
      { id: 'n-old', title: '이미 읽은 알림', body: '', read_at: '2026-09-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z' },
      { id: 'n-new', title: '긴알림제목'.repeat(100), body: '긴알림본문'.repeat(100), read_at: null, created_at: '2026-09-28T00:00:00Z' },
    ]);
  });
  await page.getByRole('button', { name: '알림 1건', exact: true }).click();
  const notices = page.getByRole('region', { name: '알림', exact: true });
  assert.equal(await notices.getByText('이미 읽은 알림', { exact: true }).count(), 0);
  assert.equal(await notices.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  // 읽음 서버 응답이 캐시에 반영된 상태를 재현한다(실제 기록 삭제 없음).
  await page.evaluate(() => window.__giokonQC.setQueryData(['notifications', 'mine'], old => old.map(n => ({ ...n, read_at: '2026-09-28T00:01:00Z' }))));
  await notices.getByText('새로운 알림이 없어요.').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: 가입 링크 · 보호자 날짜/어르신 필터 · 4화면 공통 드롭다운 키보드 · 모달 Escape · 긴 정보/알림 말줄임 · 읽은 알림 숨김');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

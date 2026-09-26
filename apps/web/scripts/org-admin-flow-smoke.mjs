// 기관 관리 흐름 회귀(파일럿 W6 후반) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것: ① 관리 역할이 아니면 역할 변경·권한표·설정이 잠긴다 ② 본인 역할은 바꿀 수 없고, 다른 구성원은 확인 후 set_member_role
//   ③ 권한표는 체크를 모아 저장 버튼으로 **바뀐 권한만** 한 번에 ④ 기관 설정 저장은 AI 스위치를 보내지 않는다(운영자 전용).
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-org-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'org-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4199;
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
    if (url.pathname.endsWith('/rest/v1/rpc/set_member_role')) {
      calls.push({ kind: 'role', body: req.postDataJSON() });
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname.endsWith('/rest/v1/org_capabilities') && req.method() === 'POST') {
      calls.push({ kind: 'caps', body: req.postDataJSON(), onConflict: url.searchParams.get('on_conflict') });
      return route.fulfill({ status: 201, headers: cors });
    }
    if (url.pathname.endsWith('/rest/v1/org_settings') && req.method() === 'POST') {
      calls.push({ kind: 'settings', body: req.postDataJSON(), onConflict: url.searchParams.get('on_conflict') });
      return route.fulfill({ status: 201, headers: cors });
    }
    return route.abort();
  });
  const go = async (path) => {
    await page.goto(`http://127.0.0.1:${PORT}${path}`);
    await page.getByRole('heading', { name: '권한 위임' }).waitFor();
  };

  // ① 관리 역할이 아니면(요양보호사) 역할 변경 없음 · 권한표·설정 잠김 · 저장 버튼 없음
  await go('/caregiver/org');
  assert.equal(await page.getByLabel(/역할 변경$/).count(), 0);
  assert.equal(await page.getByLabel('일지 확정 — 요양보호사').isDisabled(), true);
  assert.equal(await page.getByLabel('목표 시간').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '저장', exact: true }).count(), 1); // 기관 정보 카드의 저장(잠김)뿐

  // ② 센터장 — 본인 행에는 역할 변경이 없고, 다른 구성원은 확인 후 set_member_role
  await go('/caregiver/org?audit-role=center_director');
  assert.equal(await page.getByLabel('이지은 역할 변경').count(), 0);
  await page.getByLabel('김요양 역할 변경').selectOption('social_worker');
  await page.getByRole('dialog').getByRole('button', { name: '바꾸기' }).click();
  await page.getByText('역할을 바꿨어요.').waitFor();
  assert.deepEqual(calls.filter((c) => c.kind === 'role').map((c) => c.body), [{ p_target: 'u-kim', p_role: 'social_worker' }]);

  // ③ 권한표 — 체크를 모아 저장 버튼으로 한 번(바뀐 권한만)
  const capsCard = page.locator('div', { has: page.getByRole('heading', { name: '권한 위임' }) }).last();
  await page.getByLabel('보호자 연결 승인 — 사회복지사').check();
  await page.getByLabel('공개 철회 — 사회복지사').uncheck();
  assert.equal(calls.filter((c) => c.kind === 'caps').length, 0);
  await capsCard.getByRole('button', { name: '저장' }).click();
  await page.getByText('권한 위임을 저장했어요.').waitFor();
  const caps = calls.filter((c) => c.kind === 'caps');
  assert.equal(caps.length, 1);
  assert.equal(caps[0].onConflict, 'org_id,capability');
  const byCap = Object.fromEntries(caps[0].body.map((r) => [r.capability, [...r.allowed_roles].sort()]));
  assert.deepEqual(Object.keys(byCap).sort(), ['guardian_link_approve', 'share_revoke']);
  assert.deepEqual(byCap.guardian_link_approve, ['center_director', 'org_admin', 'social_worker']);
  assert.deepEqual(byCap.share_revoke, ['center_director', 'org_admin']);

  // ④ 기관 설정 — 목표 시간·피할 주제(쉼표 구분 → 배열)
  const settingsCard = page.locator('div', { has: page.getByRole('heading', { name: '기관 설정' }) }).last();
  await page.getByLabel('목표 시간').selectOption('8');
  await page.getByLabel('기본 피할 주제').fill('전쟁, 병원 , 전쟁, 가족사');
  await settingsCard.getByRole('button', { name: '저장' }).click();
  await page.getByText('기관 설정을 저장했어요.').waitFor();
  const st = calls.filter((c) => c.kind === 'settings');
  assert.equal(st.length, 1);
  assert.equal(st[0].onConflict, 'org_id');
  assert.equal(st[0].body.target_minutes, 8);
  assert.deepEqual(st[0].body.default_avoid_topics, ['전쟁', '병원', '가족사']);
  assert.equal('ai_drafts_enabled' in st[0].body, false);

  console.log('PASS: 비관리 역할 읽기 전용 · 본인 역할 변경 없음 · 역할 변경 확인 후 RPC · 권한표 바뀐 권한만 한 번 저장 · 기관 설정 저장(AI 스위치 제외). 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

// 감독 화면 안전 표시 회귀(T25.6) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것:
//   ① 진행 중 대화의 미확인 위기는 그 카드 안에, 끝난 대화의 미확인 위기는 '확인하지 않은 안전 알림'에 — 둘 다 확인 버튼이 있다.
//   ② 대화가 저장돼 진행 목록에서 사라져도 미확인 위기와 확인 버튼은 남는다(확인하면 그 알림만 확인 처리).
//   ③ 안전 알림 조회만 실패하면 '알림 없음'처럼 보이지 않고 실패를 알린다 · 다시 확인하면 사라진다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-supervision-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'supervision-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4204;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
const session = (id, profileId) => ({
  id, profile_id: profileId, user_id: 'u1', org_id: 'o1', status: 'active', turn_count: 3, duration_seconds: null,
  current_topic: null, title: null, goal: null, content: null, avoid_topics: null, keywords: [], duration_minutes: 10,
  planned_date: null, started_at: at(5), ended_at: null, updated_at: at(0), phase: 'reminiscence', phase_started_at: at(4),
  paused_at: null, paused_by: null, pause_reason: null, control_request: null, prompt_version: 'v2.0',
});
const event = (id, sessionId, excerpt) => ({
  id, org_id: 'o1', user_id: 'u1', profile_id: 'e1', session_id: sessionId, level: 'escalate', categories: ['self_harm'],
  matched_terms: [], excerpt, caregiver_alert: '위기 신호가 감지됐어요. 어르신 곁에서 상태를 확인해 주세요.',
  acknowledged_at: null, acknowledged_by: null, created_at: at(1), updated_at: at(1),
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const state = {
    sessions: [session('s-live', 'e1')],
    events: [event('ev-live', 's-live', '진행 중 대화 발췌'), event('ev-ended', 's-old', '끝난 대화 발췌')],
    safetyFails: false,
  };
  const acks = [];
  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/rest/v1/sessions') && req.method() === 'GET') return json(state.sessions);
    if (url.pathname.endsWith('/rest/v1/safety_events') && req.method() === 'GET') {
      return state.safetyFails ? json({ message: '합성 실패' }, 500) : json(state.events.filter((e) => !e.acknowledged_at));
    }
    if (url.pathname.endsWith('/rest/v1/safety_events') && req.method() === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      acks.push(id);
      const ev = state.events.find((e) => e.id === id);
      Object.assign(ev, req.postDataJSON());
      return json(ev);
    }
    if (url.pathname.endsWith('/rest/v1/session_interventions')) return json([]);
    return route.abort();
  });
  const detached = page.getByRole('region', { name: '확인하지 않은 안전 알림' });
  // 스텁이 심은 캐시는 30초 동안 신선하다 → 합성 서버 값은 주기 재조회(세션 10초·안전 15초 + 재시도 1회) 뒤에 들어온다.
  const SLOW = { timeout: 45_000 };
  const card = page.getByRole('article');

  // ① 진행 중 위기는 카드 안, 끝난 대화 위기는 위쪽 목록 — 둘 다 확인 버튼
  await page.goto(`http://127.0.0.1:${PORT}/caregiver/supervision`);
  await detached.getByText('끝난 대화 발췌', { exact: false }).waitFor(SLOW);
  await card.getByText('진행 중 대화 발췌', { exact: false }).waitFor(SLOW);
  assert.equal(await detached.getByText('진행 중 대화 발췌', { exact: false }).count(), 0, '진행 중 위기는 카드 안에만');
  assert.equal(await detached.getByText('끝난 대화', { exact: false }).count() > 0, true);
  assert.equal(await detached.getByRole('button', { name: '확인했어요' }).count(), 1);
  assert.equal(await card.getByRole('button', { name: '확인했어요' }).count(), 1);

  // ② 대화가 저장돼 진행 목록에서 사라져도 미확인 위기와 확인 버튼은 남는다
  state.sessions = [];
  await page.reload();
  await page.getByText('지금 진행 중인 대화가 없어요.').waitFor(SLOW);
  await detached.getByText('진행 중 대화 발췌', { exact: false }).waitFor(SLOW);
  assert.equal(await detached.getByRole('button', { name: '확인했어요' }).count(), 2, '끝난 대화의 미확인 위기 2건 모두 확인 버튼이 남아야 함');
  await detached.getByRole('alert').filter({ hasText: '끝난 대화 발췌' }).getByRole('button', { name: '확인했어요' }).click();
  await detached.getByText('끝난 대화 발췌', { exact: false }).waitFor({ state: 'detached' });
  assert.deepEqual(acks, ['ev-ended']);
  assert.equal(await detached.getByRole('button', { name: '확인했어요' }).count(), 1);

  // ③ 안전 알림 조회만 실패 — 실패를 알리고, 다시 확인하면 사라진다
  state.safetyFails = true;
  await page.reload();
  await page.getByText('안전 알림을 확인하지 못했어요. 알림이 없다는 뜻이 아닙니다.').waitFor(SLOW);
  state.safetyFails = false;
  await page.getByRole('button', { name: '안전 알림 다시 확인' }).click();
  await page.getByText('안전 알림을 확인하지 못했어요.', { exact: false }).waitFor({ state: 'detached', ...SLOW });

  console.log('PASS: 진행 중 위기는 카드·끝난 대화 위기는 별도 목록 · 대화 저장 뒤에도 미확인 위기·확인 버튼 유지 · 안전 조회 실패 표시와 재확인. 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

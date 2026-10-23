// Actor journeys against the production UI. Only HTTP responses are synthetic;
// no auth aliases, cache injection, production accounts or dotenv files.
import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectValue } from './select-control.mjs';

const evidence = resolve('../../.tmp/usecases-2026-10-24');
await mkdir(evidence, { recursive: true });
const now = () => new Date().toISOString();
const uid = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = uid(100);
const profile = uid(101);
const roles = ['caregiver', 'social_worker', 'org_admin', 'guardian', 'pending'];
const names = ['시험요양', '시험복지', '시험관리', '시험보호', '시험신입'];
function fixture() {
  const users = roles.map((role, i) => ({ id: uid(i + 1), org_id: role === 'pending' ? null : org,
    role: role === 'pending' ? 'caregiver' : role, name: names[i], email: `${role}@example.invalid`, phone: `010-0000-000${i}`,
    onboarded_at: now(), created_at: now(), updated_at: now(), is_site_admin: false }));
  return { calls: [], unknown: [], tables: {
    users, organizations: [{ id: org, name: '합성시험기관', created_at: now() }],
    profiles: [{ id: profile, user_id: uid(1), org_id: org, name: '시험어르신', birth_year: 1940, birth_date: '1940-01-01',
      gender: 'female', hometown: '서울', job: null, hobbies: null, family: null, photo_path: null, note: null,
      guardian_name: null, guardian_relation: null, care_grade: null, created_at: now(), updated_at: now() }],
    org_settings: [{ org_id: org, facility_type: 'nursing_home', default_location: '합성활동실', target_minutes: 10, default_avoid_topics: [], ai_drafts_enabled: false }],
    org_capabilities: ['journal_finalize', 'share_revoke', 'guardian_link_approve'].map(capability => ({ org_id: org, capability, allowed_roles: ['org_admin', 'social_worker', 'center_director'] })),
    profile_caregivers: [1,2].map(n => ({ id: uid(101+n), org_id: org, profile_id: profile, caregiver_user_id: uid(n), status: 'active', assigned_at: now(), created_at: now() })),
    profile_guardians: [{ id: uid(103), org_id: org, profile_id: profile, guardian_user_id: uid(4), status: 'approved', approved_by: uid(3), approved_at: now(), created_at: now() }],
    program_journals: [], program_journal_photos: [], program_journal_revisions: [], guardian_shares: [],
    sessions: [], session_logs: [], session_analyses: [], chronicle_entries: [], notifications: [], messages: [],
    safety_events: [], session_interventions: [], org_invites: [], org_join_requests: [],
    consents: ['elder_privacy_required', 'sensitive_health_voice', 'cross_border_transfer', 'ai_processing'].map((consent_type, i) => ({ id: uid(110+i), profile_id: profile, org_id: org, user_id: uid(1), consent_type, granted: true, revoked_at: null, version: 'v1.0', capacity: 'capable', created_at: now() })),
    elder_codes: [{ profile_id: profile, code: 'SYNTHETIC123' }],
  } };
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,DELETE,OPTIONS' };
function matches(row, params) {
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'or'].includes(key)) continue;
    if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
    if (value === 'is.null' && row[key] != null) return false;
    if (value.startsWith('in.(') && !value.slice(4, -1).replaceAll('"', '').split(',').includes(String(row[key]))) return false;
  }
  return true;
}
function authUser(row) { return { id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: row.created_at }; }
function tokenFor(row) {
  return [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: row.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url'), 'synthetic'].join('.');
}
async function intercept(context, state) {
  await context.route('https://**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = req.postData() ? req.postDataJSON() : {};
    const actor = (() => { try { return JSON.parse(Buffer.from(req.headers().authorization.split('.')[1], 'base64url')).sub; } catch { return null; } })();
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { ...cors, 'content-range': `0-0/${Array.isArray(value) ? value.length : 1}` }, body: JSON.stringify(value) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    // Passwords and tokens are deliberately excluded from persisted evidence.
    state.calls.push({ actor, method, path, ...(path.startsWith('/rest/') && method !== 'GET' ? { body } : {}) });
    if (path.endsWith('/auth/v1/token')) {
      const row = state.tables.users.find(u => u.email === body.email);
      if (!row) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      return json({ access_token: tokenFor(row), token_type: 'bearer', expires_in: 3600, refresh_token: 'synthetic', user: authUser(row) });
    }
    if (path.endsWith('/auth/v1/user')) return json(authUser(state.tables.users.find(u => u.id === actor)));
    if (path.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: cors });
    if (path.includes('/rpc/')) {
      const rpc = path.split('/').pop();
      if (rpc === 'get_my_shared_journals') {
        const ids = state.tables.guardian_shares.filter(s => !s.revoked_at).map(s => s.item_id);
        return json(state.tables.program_journals.filter(j => ids.includes(j.id)).map(j => ({ id: j.id, profile_id: j.profile_id, journal_date: j.journal_date,
          operated_from: j.operated_from, operated_to: j.operated_to, guardian_text: j.guardian_text, finalized_at: j.finalized_at })));
      }
      if (rpc === 'mark_share_viewed') {
        const share = state.tables.guardian_shares.find(s => s.id === body.p_share_id);
        Object.assign(share, { viewed_at: now(), viewed_by: actor });
        return json(share);
      }
      if (rpc === 'create_org_invite') {
        const invite = { id: uid(200), org_id: org, code: 'UC-VALID-CODE', role: body.p_role, created_by: actor,
          created_at: now(), expires_at: new Date(Date.now()+86400000).toISOString(), revoked_at: null };
        state.tables.org_invites.push(invite);
        return json(invite);
      }
      if (rpc === 'request_org_join') {
        const invite = state.tables.org_invites.find(i => i.code === body.p_code);
        if (!invite) return json({ message: 'ORG_INVITE_INVALID' }, 400);
        const request = { id: uid(201), org_id: org, user_id: actor, invite_id: invite.id, requested_role: invite.role, status: 'pending', created_at: now(), updated_at: now(), decided_at: null, decided_by: null };
        state.tables.org_join_requests.push(request);
        return json(request);
      }
      if (rpc === 'approve_org_join') {
        const request = state.tables.org_join_requests.find(r => r.id === body.p_request_id);
        Object.assign(request, { status: 'approved', decided_by: actor, decided_at: now() });
        Object.assign(state.tables.users.find(u => u.id === request.user_id), { org_id: org, role: request.requested_role });
        return json(null);
      }
      if (rpc === 'request_session_control') {
        const session = state.tables.sessions.find(s => s.id === body.p_session_id);
        Object.assign(session, { paused_at: body.p_action === 'pause' ? now() : null, paused_by: body.p_action === 'pause' ? actor : null,
          pause_reason: body.p_reason ?? null, control_request: body.p_action === 'end' ? 'end' : null });
        state.tables.session_interventions.unshift({ id: uid(220+state.tables.session_interventions.length), session_id: session.id, profile_id: profile, org_id: org,
          actor_id: actor, action: body.p_action, detail: { reason: body.p_reason ?? null }, created_at: now() });
        return json(null);
      }
      if (rpc === 'get_my_shared_summaries') return json([]);
      state.unknown.push(`${method} ${path}`);
      return json({ message: `Unsupported synthetic RPC ${rpc}` }, 501);
    }
    const table = path.split('/').pop();
    if (path.startsWith('/rest/v1/') && table in state.tables) {
      let rows = state.tables[table].filter(r => matches(r, url.searchParams));
      if (table === 'guardian_shares' && actor === uid(4)) rows = rows.filter(s => !s.revoked_at);
      if (method === 'POST') {
        rows = (Array.isArray(body) ? body : [body]).map(value => {
          const row = { id: uid(300+state.tables[table].length), org_id: org, created_at: now(), updated_at: now(), ...value };
          if (table === 'program_journals') Object.assign(row, { status: row.status ?? 'pending_review', finalized_at: null, finalized_by: null,
            guardian_text_approved_at: row.guardian_text_approved_at ?? null,
            guardian_text_approved_by: row.guardian_text_approved_at ? actor : null, draft_generated_at: null, generation_attempts: 0, last_error: null });
          if (table === 'guardian_shares') Object.assign(row, { shared_by: actor, shared_at: now(), revoked_at: null, viewed_at: null });
          state.tables[table].push(row);
          return row;
        });
      } else if (method === 'PATCH') {
        for (const row of rows) {
          if (table === 'program_journals' && row.status === 'final' && body.edit_reason) {
            state.tables.program_journal_revisions.push({ id: uid(400), journal_id: row.id, org_id: org, changed_by: actor, changed_at: now(), created_at: now(),
              reason: body.edit_reason, changes: Object.fromEntries(Object.keys(body).filter(k => k !== 'edit_reason').map(k => [k, { from: row[k] ?? null, to: body[k] }])) });
          }
          Object.assign(row, body, { updated_at: new Date(Date.now()+1000).toISOString() });
          if (body.status === 'final') Object.assign(row, { finalized_at: now(), finalized_by: actor });
          if (body.guardian_text_approved_at) row.guardian_text_approved_by = actor;
        }
      } else if (!['GET', 'HEAD'].includes(method)) {
        state.unknown.push(`${method} ${path}`);
        return json({ message: 'Unsupported synthetic method' }, 501);
      }
      return json(req.headers().accept?.includes('object+json') ? rows[0] ?? null : rows);
    }
    state.unknown.push(`${method} ${path}`);
    return json({ message: `Unsupported synthetic endpoint ${path}` }, 501);
  });
}

const outDir = await mkdtemp(join(tmpdir(), 'giokon-usecases-'));
await build({ envDir: false, mode: 'production', logLevel: 'error', define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false } });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
  : existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : { channel: 'msedge' });
const results = [];
async function journey(id, title, run) {
  const state = fixture();
  const contexts = [];
  const steps = [];
  let lastPage;
  const login = async role => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Seoul' });
    contexts.push(context);
    await intercept(context, state);
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    lastPage = page;
    await page.goto(`${base}/login`);
    await page.getByLabel('아이디', { exact: true }).fill(`${role}@example.invalid`);
    await page.getByLabel('비밀번호', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => url.pathname !== '/login');
    assert.equal(await page.evaluate(() => '__giokonQC' in window), false, 'Production UI required');
    return page;
  };
  const step = async (title, action) => { await action(); steps.push(title); console.log(`  OK ${id}: ${title}`); };
  const go = async (page, path) => { lastPage = page; await page.goto(`${base}${path}`); await page.locator('h1').first().waitFor(); };
  try {
    await run({ state, login, step, go });
    assert.deepEqual(state.unknown, [], 'Fixture endpoint coverage');
    results.push({ id, title, status: 'PASS', steps, calls: state.calls });
  } catch (error) {
    const screenshot = `${id}.png`;
    await lastPage?.screenshot({ path: join(evidence, screenshot), fullPage: true }).catch(() => {});
    results.push({ id, title, status: 'FAIL', steps, error: error.message, url: lastPage?.url(),
      text: await lastPage?.locator('body').innerText().catch(() => ''), calls: state.calls, unknown: state.unknown, screenshot });
  } finally {
    for (const context of contexts) await context.close();
    console.log(`${results.at(-1).status} ${id}: ${title}`);
  }
}
try {
  await journey('UC-W01', '요양보호사 작성 → 복지사 확정 → 보호자 열람 → 철회', async ({ state, login, step, go }) => {
    const care = await login('caregiver');
    let jid;
    await step('요양보호사가 일지 작성·보호자 문장 승인 후 임시 저장', async () => {
      await go(care, `/caregiver/journal/${profile}/new`);
      await selectValue(care, '진행자', uid(1));
      await care.getByLabel('진행 내용', { exact: true }).fill('공단 내부 전용: 고향 이야기를 나누었다.');
      await care.getByLabel('보호자에게 보일 문장', { exact: true }).fill('보호자 승인 문장: 고향 이야기를 들려주셨어요.');
      await care.getByLabel('이 문장을 보호자에게 보여도 된다고 확인했어요').check();
      await care.getByRole('button', { name: '임시 저장', exact: true }).click();
      await care.waitForURL(new RegExp(`/caregiver/journal/${profile}$`));
      jid = state.tables.program_journals[0].id;
      assert.equal(state.tables.program_journals.length, 1);
      assert.equal(state.tables.program_journals[0].status, 'pending_review');
    });
    const social = await login('social_worker');
    await step('사회복지사가 저장된 내용 확인 후 확정', async () => {
      await go(social, `/caregiver/journal/${profile}/${jid}`);
      await social.waitForFunction(() => document.querySelector('#pj-activity_content')?.value === '공단 내부 전용: 고향 이야기를 나누었다.');
      assert.equal(await social.getByLabel('진행 내용', { exact: true }).inputValue(), '공단 내부 전용: 고향 이야기를 나누었다.');
      await social.getByRole('button', { name: '확정', exact: true }).click();
      const dialog = social.getByRole('dialog');
      if (await dialog.count()) await dialog.getByRole('button', { name: /확정/ }).click();
      await social.waitForURL(new RegExp(`/caregiver/journal/${profile}$`));
      assert.equal(state.tables.program_journals[0].status, 'final');
    });
    await step('복지사가 보호자 연결 대상으로 공개', async () => {
      await go(social, `/caregiver/shares/${profile}`);
      await social.getByRole('button', { name: '공개하기', exact: true }).first().click();
      await social.getByRole('dialog').getByRole('button', { name: '공개하기', exact: true }).click();
      await social.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(state.tables.guardian_shares.length, 1);
    });
    const guardian = await login('guardian');
    await step('보호자가 승인 문장만 열람하고 열람 요청이 기록됨', async () => {
      const viewed = guardian.waitForResponse(r => r.url().includes('/rpc/mark_share_viewed'));
      await go(guardian, `/guardian/feed/journal/${jid}`);
      await guardian.getByText('보호자 승인 문장: 고향 이야기를 들려주셨어요.', { exact: true }).waitFor();
      assert.equal(await guardian.getByText('공단 내부 전용:', { exact: false }).count(), 0);
      await viewed;
    });
    await step('복지사가 공개 철회 후 보호자 재조회에서 문장이 사라짐', async () => {
      await go(social, `/caregiver/shares/${profile}`);
      await social.getByRole('button', { name: '비공개로 전환', exact: true }).click();
      await social.getByRole('dialog').getByRole('button', { name: '비공개로 전환', exact: true }).click();
      await social.getByRole('dialog').waitFor({ state: 'detached' });
      const reloaded = guardian.waitForResponse(r => r.url().includes('/rest/v1/guardian_shares'));
      await go(guardian, `/guardian/feed/journal/${jid}`);
      await reloaded;
      assert.equal(await guardian.getByText('보호자 승인 문장: 고향 이야기를 들려주셨어요.', { exact: true }).count(), 0);
      assert.ok(state.tables.guardian_shares[0].revoked_at);
    });
  });
  await journey('UC-W02', '초대 발급 → 잘못된 코드 복구 → 직원 요청 → 관리자 승인', async ({ state, login, step, go }) => {
    const admin = await login('org_admin');
    await step('관리자가 직원 초대 코드 발급', async () => {
      await go(admin, '/caregiver/org');
      await admin.getByRole('button', { name: '코드 만들기', exact: true }).click();
      await admin.getByText('UC-VALID-CODE', { exact: true }).waitFor();
    });
    const pending = await login('pending');
    await step('미합류 직원의 기록 접근 차단과 잘못된 코드 안내', async () => {
      await go(pending, '/caregiver/elders');
      await pending.waitForURL(/\/join-pending$/);
      assert.equal(state.calls.filter(c => c.actor === uid(5) && c.path.endsWith('/rest/v1/profiles')).length, 0, 'Pending UI must not query elder records');
      await pending.getByLabel('초대 코드', { exact: true }).fill('INVALID-CODE');
      await pending.getByRole('button', { name: '합류 요청', exact: true }).click();
      await pending.getByText('초대 코드가 맞지 않거나 만료·회수된 코드예요.', { exact: false }).waitFor();
      assert.equal(state.tables.org_join_requests.length, 0);
    });
    await step('유효 코드로 요청하고 승인 전까지 대기', async () => {
      await pending.getByLabel('초대 코드', { exact: true }).fill('UC-VALID-CODE');
      await pending.getByRole('button', { name: '합류 요청', exact: true }).click();
      await pending.getByRole('button', { name: '승인 확인', exact: true }).waitFor();
      assert.equal(state.tables.users.find(u => u.id === uid(5)).org_id, null);
    });
    await step('관리자 승인 후 신입이 기관 기록 화면에 진입', async () => {
      await go(admin, '/caregiver/org');
      await admin.getByRole('button', { name: '승인', exact: true }).first().click();
      await admin.getByRole('dialog').getByRole('button', { name: '승인', exact: true }).click();
      await admin.getByRole('dialog').waitFor({ state: 'detached' });
      await pending.getByRole('button', { name: '승인 확인', exact: true }).click();
      await pending.waitForURL(/\/caregiver$/);
      await go(pending, '/caregiver/elders');
      await pending.getByText('시험어르신', { exact: false }).first().waitFor();
    });
  });
  await journey('UC-W03', '감독자가 일시정지·재개·종료 취소·종료 요청', async ({ state, login, step, go }) => {
    state.tables.sessions.push({ id: uid(500), profile_id: profile, user_id: uid(1), org_id: org, status: 'active', started_at: now(), ended_at: null,
      turn_count: 1, title: '합성 감독 세션', phase: 'intro', phase_started_at: now(), duration_minutes: 10, paused_at: null, paused_by: null, control_request: null });
    const care = await login('caregiver');
    await go(care, '/caregiver/supervision');
    await step('진행 중 세션을 일시정지 후 재개', async () => {
      await care.getByRole('button', { name: '일시정지', exact: true }).click();
      await care.getByRole('dialog').getByRole('button', { name: '일시정지', exact: true }).click();
      await care.getByRole('button', { name: '재개', exact: true }).waitFor();
      await care.getByRole('button', { name: '재개', exact: true }).click();
      await care.getByRole('button', { name: '일시정지', exact: true }).waitFor();
    });
    await step('종료 확인에서 취소하면 종료 RPC 없음', async () => {
      await care.getByRole('button', { name: '종료', exact: true }).click();
      await care.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
      assert.equal(state.calls.filter(c => c.body?.p_action === 'end').length, 0);
    });
    await step('종료를 확인하면 올바른 세션으로 종료 RPC 전송', async () => {
      await care.getByRole('button', { name: '종료', exact: true }).click();
      await care.getByRole('dialog').getByRole('button', { name: /종료/ }).click();
      await care.getByRole('dialog').waitFor({ state: 'detached' });
      assert.deepEqual(state.calls.filter(c => c.path.endsWith('/request_session_control')).map(c => c.body.p_action), ['pause', 'resume', 'end']);
      assert.ok(state.calls.filter(c => c.path.endsWith('/request_session_control')).every(c => c.body.p_session_id === uid(500)));
    });
  });
  await journey('UC-W04', '안전 알림 링크에서 로그인 후 감독 화면 복귀', async ({ login, step, go }) => {
    // BB-01 regression: preserve the original destination across login.
    const page = await login('caregiver');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await step('로그아웃 상태에서 감독 링크 열고 로그인', async () => {
      await go(page, '/caregiver/supervision');
      await page.getByLabel('아이디', { exact: true }).fill('caregiver@example.invalid');
      await page.getByLabel('비밀번호', { exact: true }).fill('synthetic-password');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.waitForURL(url => url.pathname !== '/login');
    });
    await step('원래 감독 화면으로 복귀', async () => assert.equal(new URL(page.url()).pathname, '/caregiver/supervision'));
  });
  await journey('UC-W05', '종료된 대화의 안전 알림 확인 → 재조회에서 처리 유지', async ({ state, login, step, go }) => {
    state.tables.safety_events.push({ id: uid(600), org_id: org, user_id: uid(1), profile_id: profile, session_id: null,
      level: 'escalate', categories: ['acute_distress'], matched_terms: [], excerpt: '합성 안전 근거 문장',
      caregiver_alert: '합성 안전 안내: 곁에서 확인해 주세요.', acknowledged_at: null, acknowledged_by: null, created_at: now(), updated_at: now() });
    const care = await login('caregiver');
    await step('실행 중 세션이 없어도 미확인 알림이 보임', async () => {
      await go(care, '/caregiver/supervision');
      await care.getByText('합성 안전 근거 문장', { exact: false }).waitFor();
      await care.getByRole('button', { name: '확인했어요', exact: true }).waitFor();
    });
    await step('요양보호사가 확인하고 재조회해도 미확인 목록에 없음', async () => {
      await care.getByRole('button', { name: '확인했어요', exact: true }).click();
      await care.getByText('합성 안전 근거 문장', { exact: false }).waitFor({ state: 'detached' });
      assert.ok(state.tables.safety_events[0].acknowledged_at);
      const loaded = care.waitForResponse(r => r.url().includes('/rest/v1/safety_events'));
      await go(care, '/caregiver/supervision');
      await loaded;
      assert.equal(await care.getByRole('button', { name: '확인했어요', exact: true }).count(), 0);
    });
  });
  await journey('UC-W06', '확정 일지 정정: 사유 없음 거절 → 사유 입력 → 이력 확인', async ({ state, login, step, go }) => {
    const jid = uid(700);
    state.tables.program_journals.push({ id: jid, org_id: org, profile_id: profile, session_id: null, status: 'final',
      journal_date: '2026-10-24', operated_from: null, operated_to: null, program_type: '회상', facilitator_user_id: uid(1),
      activity_content: '확정된 합성 기록', guardian_text: null, guardian_text_approved_at: null, draft_generated_at: null,
      finalized_at: now(), finalized_by: uid(2), delivered: true, created_at: now(), updated_at: now() });
    const social = await login('social_worker');
    await go(social, `/caregiver/journal/${profile}/${jid}`);
    await social.waitForFunction(() => document.querySelector('#pj-activity_content')?.value === '확정된 합성 기록');
    await step('수정 사유 없이는 저장 요청을 보내지 않음', async () => {
      await social.getByLabel('장소', { exact: true }).fill('정정한 합성 활동실');
      await social.getByRole('button', { name: '변경 저장', exact: true }).click();
      await social.getByText('수정 사유를 적어 주세요', { exact: false }).waitFor();
      assert.equal(state.calls.filter(c => c.method === 'PATCH' && c.path.endsWith('/program_journals')).length, 0);
    });
    await step('사유를 적고 저장한 변경을 다시 열면 유지됨', async () => {
      await social.getByLabel(/수정 사유/).fill('합성 장소 오기 정정');
      await social.getByRole('button', { name: '변경 저장', exact: true }).click();
      await social.waitForURL(new RegExp(`/caregiver/journal/${profile}$`));
      await go(social, `/caregiver/journal/${profile}/${jid}`);
      await social.waitForFunction(() => document.querySelector('#pj-location')?.value === '정정한 합성 활동실');
      assert.equal(await social.getByLabel('장소', { exact: true }).inputValue(), '정정한 합성 활동실');
      assert.equal(state.tables.program_journals[0].status, 'final');
    });
    await step('수정 이력에서 정정 사유를 확인', async () => {
      await social.getByRole('tab', { name: /^수정 이력/ }).click();
      await social.getByText('합성 장소 오기 정정', { exact: false }).waitFor();
      assert.equal(state.tables.program_journal_revisions.length, 1);
    });
  });
} finally {
  await writeFile(join(evidence, 'ui-usecases.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length }));
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;

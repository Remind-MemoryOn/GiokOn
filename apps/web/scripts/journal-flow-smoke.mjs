// 프로그램 일지 흐름 회귀(파일럿 W1) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것:
//   ① "초안 생성" 버튼이 없다 — 초안은 대화 종료 시 자동(사용자 확정 2026-09-25). 수동 초안 함수(session-report)를 부르지 않는다.
//   ② "다시 생성"은 생성 실패 일지에만 있고 retry_journal_generation 을 그 일지로 부른다.
//   ③ 저장은 **바꾼 칸만** 보낸다 — 손댄 뒤 워커가 채운 칸도 빈 값으로 지우지 않는다. 상태는 건드리지 않는다.
//   ③' 버전 충돌(T25.3) — 화면을 연 뒤 서버에서 일지가 바뀌면(워커가 칸을 채움) 저장·승인은 **거절**된다(보지 않은 문장 승인 금지).
//       '최신 내용 불러오기'는 내가 바꾼 칸을 유지하고 나머지를 서버 값으로 채우며, 그 뒤 저장은 새 버전 조건으로 성공한다.
//   ④ 확정 권한이 없으면 확정 버튼이 잠긴다.
//   ⑤ 확정된 일지의 공단 칸을 고치면 수정 사유 없이는 보내지 않고, 사유와 함께 보낸다.
//   ⑥ 사진 부분 실패(T25.2) — 새 일지에 사진 2장 중 두 번째 첨부가 실패하면: 첫 사진 파일은 지우지 않고 실패한 파일만 지운다 ·
//      만들어진 일지로 옮겨 남은 사진만 다시 올린다 · 다시 저장해도 일지는 1건이다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-journal-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'journal-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4198;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const calls = [];
  /** 합성 서버의 일지 상태(첫 화면의 스텁 값으로 시작) — PATCH 는 `updated_at` 조건이 맞을 때만 반영한다. */
  const server = new Map();
  /** ⑥ 에서 채운다 — 새 일지 행의 틀(기존 일지 모양). */
  const photoFixture = { template: null };
  let created = null;
  const attachedRows = [];
  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/functions/v1/session-report')) {
      calls.push({ kind: 'session-report' });
      return route.fulfill({ status: 500, headers: cors, body: '{}' });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/retry_journal_generation')) {
      calls.push({ kind: 'retry', body: req.postDataJSON() });
      return route.fulfill({ status: 204, headers: cors });
    }
    // ⑥ 사진 부분 실패 — 새 일지 생성 · 업로드 · 첨부(두 번째 첨부만 한 번 실패) · 파일 삭제 · 재조회
    if (url.pathname.endsWith('/rest/v1/program_journals') && req.method() === 'POST') {
      const body = req.postDataJSON();
      created = { ...photoFixture.template, ...body, id: 'jnew', session_id: null, status: body.status ?? 'pending_review', updated_at: new Date().toISOString() };
      calls.push({ kind: 'create' });
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(created) });
    }
    if (url.pathname.endsWith('/rest/v1/program_journals') && req.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify([...(created ? [created] : []), ...server.values()]) });
    }
    if (url.pathname.includes('/storage/v1/object/journal-photos/') && req.method() === 'POST') {
      const path = decodeURIComponent(url.pathname.split('/storage/v1/object/journal-photos/')[1]);
      calls.push({ kind: 'upload', path });
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ Key: `journal-photos/${path}`, Id: path }) });
    }
    if (url.pathname.endsWith('/storage/v1/object/journal-photos') && req.method() === 'DELETE') {
      calls.push({ kind: 'remove', paths: req.postDataJSON().prefixes });
      return route.fulfill({ contentType: 'application/json', headers: cors, body: '[]' });
    }
    if (url.pathname.includes('/storage/v1/object/sign/journal-photos')) {
      return route.fulfill({ contentType: 'application/json', headers: cors, body: '[]' });
    }
    if (url.pathname.endsWith('/rest/v1/program_journal_photos') && req.method() === 'POST') {
      const body = req.postDataJSON();
      const attempt = calls.filter((c) => c.kind === 'attach').length;
      calls.push({ kind: 'attach', path: body.path, journal: body.journal_id });
      if (attempt === 1) return route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: JSON.stringify({ message: '첨부 실패(합성)' }) });
      const row = { id: `ph${attempt}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      attachedRows.push(row);
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(row) });
    }
    if (url.pathname.endsWith('/rest/v1/program_journal_photos') && req.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(attachedRows) });
    }
    if (url.pathname.endsWith('/rest/v1/program_journals') && req.method() === 'PATCH') {
      const body = req.postDataJSON();
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const expected = url.searchParams.get('updated_at')?.replace('eq.', '');
      const current = server.get(id) ?? (id === 'jnew' ? created : null);
      // 버전 조건이 틀리면 0건(PostgREST 와 같은 모양 — 빈 배열).
      if (!current || (expected && expected !== current.updated_at)) {
        calls.push({ kind: 'conflict', id, body, expected });
        return route.fulfill({ contentType: 'application/json', headers: cors, body: '[]' });
      }
      calls.push({ kind: 'patch', id: `eq.${id}`, body, expected });
      const next = { ...current, ...body, updated_at: new Date(Date.now() + 1000).toISOString() };
      if (server.has(id)) server.set(id, next); else created = next;
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify([next]) });
    }
    return route.abort();
  });
  const go = async (path) => {
    await page.goto(`http://127.0.0.1:${PORT}${path}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
  };

  // ① ② 목록 — 다시 생성은 생성 실패 행 하나뿐, 초안 생성 버튼 없음
  await go('/caregiver/journal/e1');
  for (const row of await page.evaluate(() => window.__giokonQC.getQueryData(['program_journals', 'e1']))) server.set(row.id, row);
  // ⑥ 새 일지 행의 틀 — 다른 시나리오가 서버 값을 바꾸기 전(승인 표시 없는) 원본으로 떠 둔다.
  photoFixture.template = { ...server.get('j1'), guardian_text: null, guardian_text_approved_at: null, guardian_text_approved_by: null };
  assert.equal(await page.getByRole('button', { name: '다시 생성' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /초안 (생성|만들기)/ }).count(), 0);
  await page.getByRole('button', { name: '다시 생성' }).click();
  await page.getByText('초안을 다시 만들고 있어요', { exact: false }).waitFor();
  assert.deepEqual(calls.filter((c) => c.kind === 'retry').map((c) => c.body), [{ p_journal_id: 'j3' }]);

  // ③ ④ 확인 대기(AI 초안) — 요양보호사는 확정 잠김 · 바꾼 칸 + 승인만 보낸다
  await go('/caregiver/journal/e1/j1');
  assert.equal(await page.getByRole('button', { name: '다시 생성' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /초안 (생성|만들기)/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '확정', exact: true }).isDisabled(), true);
  await page.getByLabel('전반적 평가').fill('대화에 적극적으로 참여하셨습니다.');
  // ③' 손댄 뒤 서버에서 일지가 바뀐다(워커가 의견수렴을 채움) — 화면은 아직 모른다.
  const seenVersion = server.get('j1').updated_at;
  const workerVersion = new Date(Date.now() + 500).toISOString();
  server.set('j1', { ...server.get('j1'), opinion_collected: '워커가 채운 의견', updated_at: workerVersion });
  await page.getByLabel('이 문장을 보호자에게 보여도 된다고 확인했어요').check();
  await page.getByRole('button', { name: '임시 저장' }).click();
  await page.getByText('다른 곳에서 이 일지가 바뀌어 저장하지 않았어요', { exact: false }).waitFor();
  assert.equal(calls.filter((c) => c.kind === 'patch').length, 0, '버전이 다르면 저장·승인되면 안 됨');
  assert.equal(calls.find((c) => c.kind === 'conflict').expected, seenVersion, '화면이 읽은 버전을 조건으로 보내야 함');
  assert.equal(server.get('j1').guardian_text_approved_at ?? null, null, '보지 않은 문장이 승인되면 안 됨');
  assert.equal(await page.getByRole('button', { name: '임시 저장' }).isDisabled(), true, '충돌 중에는 다시 저장할 수 없어야 함');
  // 최신 내용 불러오기 — 내가 고친 칸은 유지, 워커가 채운 칸은 서버 값, 승인은 다시 확인하게 해제
  await page.getByRole('button', { name: '최신 내용 불러오기' }).click();
  await page.getByRole('button', { name: '최신 내용 불러오기' }).waitFor({ state: 'detached' });
  assert.equal(await page.getByLabel('전반적 평가').inputValue(), '대화에 적극적으로 참여하셨습니다.');
  assert.equal(await page.getByLabel('의견수렴').inputValue(), '워커가 채운 의견');
  assert.equal(await page.getByLabel('이 문장을 보호자에게 보여도 된다고 확인했어요').isChecked(), false, '새 내용을 보고 다시 승인해야 함');
  await page.getByLabel('이 문장을 보호자에게 보여도 된다고 확인했어요').check();
  await page.getByRole('button', { name: '임시 저장' }).click();
  await page.waitForURL(/\/caregiver\/journal\/e1$/);
  const saved = calls.filter((c) => c.kind === 'patch');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'eq.j1');
  assert.equal(saved[0].expected, workerVersion, '다시 저장은 불러온 새 버전을 조건으로 보내야 함');
  // ③ 바꾼 칸만 — 워커가 채운 의견수렴은 보내지 않는다
  assert.deepEqual(Object.keys(saved[0].body).sort(), ['guardian_text_approved_at', 'overall_evaluation']);
  assert.equal(saved[0].body.overall_evaluation, '대화에 적극적으로 참여하셨습니다.');

  // ⑤ 확정된 일지(확정 권한 있는 역할) — 공단 칸을 고치면 사유가 필요하다
  await go('/caregiver/journal/e1/j2?audit-role=social_worker');
  await page.getByLabel('장소').fill('1층 거실');
  await page.getByRole('button', { name: '변경 저장' }).click();
  await page.getByText('수정 사유를 적어 주세요', { exact: false }).waitFor();
  assert.equal(calls.filter((c) => c.kind === 'patch').length, 1);
  await page.getByLabel(/수정 사유/).fill('장소 오기 수정');
  await page.getByRole('button', { name: '변경 저장' }).click();
  await page.waitForURL(/\/caregiver\/journal\/e1$/);
  const edit = calls.filter((c) => c.kind === 'patch')[1];
  assert.deepEqual(edit.body, { location: '1층 거실', edit_reason: '장소 오기 수정' });

  // ⑥ 사진 부분 실패 — 새 일지 + 사진 2장, 두 번째 첨부 실패
  await go('/caregiver/journal/e1/new');
  const png = (name) => ({ name, mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  await page.locator('input[type="file"]').setInputFiles([png('a.png'), png('b.png')]);
  await page.getByRole('button', { name: '임시 저장' }).click();
  await page.getByText('일지는 저장했어요. 사진 1장을 붙이지 못했어요', { exact: false }).waitFor();
  await page.waitForURL(/\/caregiver\/journal\/e1\/jnew$/);
  const uploads = calls.filter((c) => c.kind === 'upload').map((c) => c.path);
  const removed = calls.filter((c) => c.kind === 'remove').flatMap((c) => c.paths);
  assert.equal(calls.filter((c) => c.kind === 'create').length, 1);
  assert.equal(uploads.length, 2);
  assert.deepEqual(removed, [uploads[1]], '실패한 두 번째 파일만 지워야 함(첫 사진은 그대로)');
  assert.equal(attachedRows.length, 1);
  assert.equal(attachedRows[0].path, uploads[0]);
  // 만들어진 일지에서 다시 저장 — 남은 사진 1장만 올리고, 일지는 새로 만들지 않는다
  await page.getByRole('button', { name: '첨부 사진 2' }).waitFor();
  await page.getByRole('button', { name: '임시 저장' }).click();
  await page.waitForURL(/\/caregiver\/journal\/e1$/);
  assert.equal(calls.filter((c) => c.kind === 'create').length, 1, '다시 저장해도 일지는 1건이어야 함');
  assert.equal(calls.filter((c) => c.kind === 'upload').length, 3, '남은 사진 1장만 다시 올려야 함');
  assert.deepEqual(attachedRows.map((r) => r.journal_id), ['jnew', 'jnew']);
  assert.deepEqual(attachedRows.map((r) => r.sort), [0, 1]);

  assert.equal(calls.filter((c) => c.kind === 'session-report').length, 0);
  console.log('PASS: 초안 생성 버튼 없음 · 다시 생성은 실패 일지만 · 바꾼 칸만 저장 · 확정 권한 잠금 · 확정 후 수정 사유 · 사진 부분 실패(첫 사진 보존·일지 1건) · 버전 충돌 시 저장·승인 거절 → 최신 불러오기(내 칸 유지). 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

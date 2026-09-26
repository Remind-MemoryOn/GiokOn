// 프로그램 일지 흐름 회귀(파일럿 W1) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것:
//   ① "초안 생성" 버튼이 없다 — 초안은 대화 종료 시 자동(사용자 확정 2026-09-25). 수동 초안 함수(session-report)를 부르지 않는다.
//   ② "다시 생성"은 생성 실패 일지에만 있고 retry_journal_generation 을 그 일지로 부른다.
//   ③ 저장은 **바꾼 칸만** 보낸다 — 손댄 뒤 워커가 채운 칸도 빈 값으로 지우지 않는다. 상태는 건드리지 않는다.
//   ④ 확정 권한이 없으면 확정 버튼이 잠긴다.
//   ⑤ 확정된 일지의 공단 칸을 고치면 수정 사유 없이는 보내지 않고, 사유와 함께 보낸다.
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
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const calls = [];
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
    if (url.pathname.endsWith('/rest/v1/program_journals') && req.method() === 'PATCH') {
      const body = req.postDataJSON();
      calls.push({ kind: 'patch', id: url.searchParams.get('id'), body });
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ id: url.searchParams.get('id')?.replace('eq.', ''), profile_id: 'e1', ...body }) });
    }
    return route.abort();
  });
  const go = async (path) => {
    await page.goto(`http://127.0.0.1:${PORT}${path}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
  };

  // ① ② 목록 — 다시 생성은 생성 실패 행 하나뿐, 초안 생성 버튼 없음
  await go('/caregiver/journal/e1');
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
  // 손댄 뒤 서버 값이 바뀐다(워커가 의견수렴을 채움 · Realtime 무효화 → 다시 읽기) — 그 칸을 옛 값(빈 값)으로 보내면 안 된다.
  await page.evaluate(() => {
    const qc = window.__giokonQC;
    const key = ['program_journals', 'e1'];
    qc.setQueryData(key, qc.getQueryData(key).map((j) => (j.id === 'j1' ? { ...j, opinion_collected: '워커가 채운 의견', updated_at: new Date().toISOString() } : j)));
  });
  await page.getByLabel('이 문장을 보호자에게 보여도 된다고 확인했어요').check();
  await page.getByRole('button', { name: '임시 저장' }).click();
  await page.waitForURL(/\/caregiver\/journal\/e1$/);
  const saved = calls.filter((c) => c.kind === 'patch');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'eq.j1');
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

  assert.equal(calls.filter((c) => c.kind === 'session-report').length, 0);
  console.log('PASS: 초안 생성 버튼 없음 · 다시 생성은 실패 일지만 · 바꾼 칸만 저장 · 확정 권한 잠금 · 확정 후 수정 사유. 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

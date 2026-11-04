// 플로팅 대화창 회귀(2026-11-04) — UI 만 검사한다. API 응답은 합성이고 환경 파일을 읽지 않는다.
//
// 지키는 것:
//   ① 요양보호사·보호자 화면 모두 오른쪽 아래 버튼으로 대화창이 열리고, 최소화하면 대화가 남고 닫으면 처음으로 돌아간다.
//   ② 세션 설계: 대화로 모은 값은 **확인 카드에서 '설계 저장'을 누르기 전에는 저장 요청이 없다**.
//      저장 값은 설계 모달과 같은 모양(status planned · 목표 시간 · 기록일 · 키워드)이다. '취소'는 아무것도 보내지 않는다.
//   ③ 공개 관리: 미승인 일지는 공개 카드 없이 이유를 안내 · 승인 일지는 확인 뒤 요약 줄만 공개 ·
//      철회 권한이 없으면 카드 없이 이유 안내 · 권한이 있으면 확인 뒤 그 항목의 공개 전부(요약+AI 분석)를 내린다.
//   ④ 확인할 일: 미확인 안전 알림·확인 대기 일지를 이름과 함께 알리고 해당 화면 링크를 준다.
//   ⑤ 보호자 메시지: 요양보호사는 스레드를 열어 그 보호자에게 답장(sender_role caregiver · recipient) · 읽음 처리.
//   ⑥ 보호자: 자주 묻는 질문은 정해진 답(규칙 기반) + 질문별 후속 버튼(기록 → 최근 공개된 소식 · 분석 → 최근 대화 분석 · 다른 질문 보기),
//      모르는 질문은 지어내지 않고 요양보호사 문의를 권한다,
//      문의 화면에서 요양보호사 답장이 보이고 보낸 메시지는 받는 사람 없이(담당 전원) 간다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-assistant-ui-'));
await build({ envDir: false, mode: 'figma', plugins: [{ name: 'assistant-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/audit/auth-stub.tsx')) return code.replace('isConfigured: false,', 'isConfigured: true,');
} }], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const PORT = 4207;
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: PORT, strictPort: true } });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const seoulToday = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const seoulTomorrow = new Date(Date.now() + 9 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);

const journal = (id, approved, daysAgo) => ({
  id, org_id: 'org-1', profile_id: 'e1', status: 'final', journal_date: iso(daysAgo).slice(0, 10),
  guardian_text: approved ? `승인된 보호자 문장 ${id}` : '아직 승인 전 문장', guardian_text_approved_at: approved ? iso(daysAgo) : null,
  created_at: iso(daysAgo), updated_at: iso(daysAgo),
});
const analysis = (id, daysAgo) => ({
  id, org_id: 'org-1', profile_id: 'e1', session_id: `s-${id}`, user_id: 'user-1', version: 'v1', created_at: iso(daysAgo),
  analysis: {
    version: 'v1', summary: `대화 요약 ${id}`, emotionTone: 'bright', topicsEngaged: ['고향'], topicsLow: [],
    interestKeywords: [], recommendedTopics: [], topicOutcomes: [],
    metrics: { elderTurns: 4, aiTurns: 4, responseRate: 1, participation: 1, avgUtteranceChars: 20 },
  },
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // 분석 행은 감사 스텁이 김복순 어르신(e1)에 심어 둔 것(a0 = 오늘)을 쓴다 — 공개 행이 그것을 가리킨다.
  const state = {
    journals: [journal('j-ok', true, 1), journal('j-wait', false, 2)],
    analyses: [analysis('a1', 3)],
    shares: [
      { id: 'sh-sum', org_id: 'org-1', profile_id: 'e1', item_type: 'session_summary', item_id: 'a0', revoked_at: null, shared_at: iso(3), notify_on_view: false },
      { id: 'sh-an', org_id: 'org-1', profile_id: 'e1', item_type: 'analysis', item_id: 'a0', revoked_at: null, shared_at: iso(3), notify_on_view: false },
    ],
    messages: [
      { id: 'm1', org_id: 'org-1', profile_id: 'e1', sender_user_id: 'u-guardian', sender_role: 'guardian', recipient_user_id: null, body: '오늘 어머니 컨디션은 어떠셨나요?', created_at: iso(0.1) },
    ],
  };
  const posts = { sessions: [], shares: [], revokes: [], messages: [] };
  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const p = url.pathname;
    if (p.endsWith('/rest/v1/sessions') && req.method() === 'POST') {
      const body = req.postDataJSON();
      posts.sessions.push(body);
      return json({ id: 's-new', ...body });
    }
    if (p.endsWith('/rest/v1/program_journals') && req.method() === 'GET') {
      if (url.searchParams.get('status') === 'eq.pending_review') return json([{ profile_id: 'e1' }]);
      return json(state.journals);
    }
    if (p.endsWith('/rest/v1/session_analyses')) return json(state.analyses);
    if (p.endsWith('/rest/v1/program_journal_photos')) return json([]);
    if (p.endsWith('/rest/v1/guardian_shares') && req.method() === 'GET') return json(state.shares);
    if (p.endsWith('/rest/v1/guardian_shares') && req.method() === 'POST') {
      const body = req.postDataJSON();
      posts.shares.push(body);
      return json({ id: 'sh-new', revoked_at: null, ...body });
    }
    if (p.endsWith('/rest/v1/guardian_shares') && req.method() === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      posts.revokes.push(id);
      const row = state.shares.find((s) => s.id === id);
      Object.assign(row, req.postDataJSON());
      return json(row);
    }
    if (p.endsWith('/rest/v1/rpc/has_capability')) return json(true);
    if (p.endsWith('/rest/v1/messages') && req.method() === 'GET') return json([...state.messages].reverse());
    if (p.endsWith('/rest/v1/messages') && req.method() === 'POST') {
      const body = req.postDataJSON();
      posts.messages.push(body);
      const row = { id: `m${state.messages.length + 1}`, org_id: 'org-1', created_at: new Date().toISOString(), sender_role: 'guardian', recipient_user_id: null, ...body };
      state.messages.push(row);
      return json(row);
    }
    if (p.endsWith('/rest/v1/notifications') && req.method() === 'PATCH') return json({ id: 'n', read_at: new Date().toISOString() });
    if (p.endsWith('/rest/v1/notifications') && req.method() === 'GET') {
      return json([{ id: 'nm1', org_id: 'org-1', user_id: 'user-1', kind: 'message', profile_id: 'e1', source_id: 'm1', title: '보호자가 메시지를 보냈어요', body: '미리보기', read_at: null, created_at: iso(0.1), pushed_at: null }]);
    }
    return json([]);
  });

  const SLOW = { timeout: 30_000 };
  const fab = page.getByRole('button', { name: 'GIEOK-ON AI 대화창 열기' });
  const win = page.getByRole('dialog', { name: 'GIEOK-ON AI 대화창' });
  const chip = (name) => win.getByRole('button', { name, exact: true });
  const type = async (text) => {
    await win.getByLabel('메시지').fill(text);
    await win.getByRole('button', { name: '전송', exact: true }).click();
  };

  // ① 요양보호사 화면 — 버튼으로 열기, 업무 칩 4개
  await page.goto(`http://127.0.0.1:${PORT}/caregiver`);
  await fab.waitFor(SLOW);
  await fab.click();
  await win.getByText('대화로 업무를 도와드릴게요.', { exact: false }).waitFor();
  for (const name of ['대화 세션 설계', '공개 관리', '확인할 일']) await chip(name).waitFor();

  // ② 세션 설계 — 확인 전에는 저장 요청이 없다
  await chip('대화 세션 설계').click();
  await chip('김복순 어르신').click();
  await type('봄 시장 이야기');
  await type('즐거운 기억 떠올리기');
  await chip('8분').click();
  await chip('내일').click();
  await chip('건너뛰기').click(); // 나눌 이야기
  await win.getByText('피해갈 내용이', { exact: false }).last().waitFor();
  await chip('건너뛰기').click(); // 피해갈 내용
  await type('시장, 백설기');
  await win.getByRole('button', { name: '설계 저장' }).waitFor();
  assert.equal(posts.sessions.length, 0, '확인 전에는 세션을 만들지 않는다');
  await win.getByText(seoulTomorrow, { exact: false }).waitFor();
  await win.getByRole('button', { name: '설계 저장' }).click();
  await win.getByText('세션을 설계했어요. 앱에서 진행할 수 있어요.', { exact: false }).waitFor(SLOW);
  assert.equal(posts.sessions.length, 1);
  assert.deepEqual(
    { ...posts.sessions[0] },
    { profile_id: 'e1', user_id: 'user-1', status: 'planned', title: '봄 시장 이야기', goal: '즐거운 기억 떠올리기',
      duration_minutes: 8, planned_date: seoulTomorrow, content: null, avoid_topics: null, keywords: ['시장', '백설기'] },
  );
  assert.equal(await win.getByRole('button', { name: '설계 저장' }).isDisabled(), true, '실행한 카드는 다시 누를 수 없다');
  // 취소는 아무것도 보내지 않는다
  await chip('대화 세션 설계').click();
  await type('취소');
  await win.getByText('진행하던 일을 취소했어요.', { exact: false }).waitFor();
  assert.equal(posts.sessions.length, 1);

  // ③ 공개 관리
  await chip('공개 관리').click();
  await chip('김복순 어르신').click();
  const waitChip = win.getByRole('button', { name: /프로그램 일지 · 미공개$/ });
  await waitChip.first().waitFor(SLOW);
  // 미승인 일지 → 이유 안내, 카드 없음
  await win.getByRole('button', { name: `${state.journals[1].journal_date.replaceAll('-', '.')} 프로그램 일지 · 미공개` }).click();
  await win.getByText('보호자 문장이 승인된 일지만 공개할 수 있어요', { exact: false }).waitFor();
  assert.equal(await win.getByRole('button', { name: '공개하기' }).count(), 0);
  // 승인 일지 → 확인 뒤 요약 줄만 공개
  await win.getByRole('button', { name: `${state.journals[0].journal_date.replaceAll('-', '.')} 프로그램 일지 · 미공개` }).click();
  await win.getByRole('button', { name: '공개하기' }).waitFor();
  assert.equal(posts.shares.length, 0, '확인 전에는 공개하지 않는다');
  await win.getByRole('button', { name: '공개하기' }).click();
  await win.getByText('보호자에게 공개했어요.', { exact: false }).waitFor(SLOW);
  assert.deepEqual(posts.shares.map((s) => [s.item_type, s.item_id]), [['journal', 'j-ok']]);
  // 철회 권한이 없는 요양보호사(기본 권한표) → 이유 안내, 카드 없음
  await chip('공개 관리').click();
  await chip('김복순 어르신').click();
  await win.getByRole('button', { name: /AI 회상 대화 요약 · 공개 중$/ }).click();
  await win.getByText('공개 철회 권한이 없어요.', { exact: false }).waitFor();
  assert.equal(await win.getByRole('button', { name: '비공개로 전환' }).count(), 0);
  assert.equal(posts.revokes.length, 0);
  // 철회 권한이 있는 사회복지사 → 확인 뒤 요약 + AI 분석 공개 모두 내린다
  await page.goto(`http://127.0.0.1:${PORT}/caregiver?audit-role=social_worker`);
  await fab.click();
  await chip('공개 관리').click();
  await chip('김복순 어르신').click();
  await win.getByRole('button', { name: /AI 회상 대화 요약 · 공개 중$/ }).click();
  await win.getByRole('button', { name: '비공개로 전환' }).click();
  await win.getByText('비공개로 전환했어요.', { exact: false }).waitFor(SLOW);
  assert.deepEqual([...posts.revokes].sort(), ['sh-an', 'sh-sum']);

  // ④ 확인할 일
  await chip('확인할 일').click();
  await win.getByText('김복순 어르신 · 확인 대기 일지 1건', { exact: false }).waitFor(SLOW);
  await win.getByRole('link', { name: '김복순 어르신 일지 확인' }).waitFor();

  // ⑤ 보호자 메시지 → 스레드 → 답장
  await win.getByRole('button', { name: /^보호자 메시지/ }).click();
  const threadBtn = win.getByRole('button', { name: /김보호 보호자 · 김복순 어르신/ });
  await threadBtn.waitFor(SLOW);
  await threadBtn.click();
  const thread = page.getByRole('dialog', { name: '김보호 보호자 · 김복순 어르신 메시지 대화창' });
  await thread.getByText('오늘 어머니 컨디션은 어떠셨나요?').waitFor();
  await thread.getByLabel('메시지').fill('네, 식사도 잘 하시고 산책도 하셨어요.');
  await thread.getByRole('button', { name: '전송', exact: true }).click();
  await thread.getByText('네, 식사도 잘 하시고 산책도 하셨어요.').waitFor(SLOW);
  assert.deepEqual(posts.messages[0], {
    profile_id: 'e1', sender_user_id: 'user-1', sender_role: 'caregiver', recipient_user_id: 'u-guardian',
    body: '네, 식사도 잘 하시고 산책도 하셨어요.',
  });

  // ① 최소화하면 남고, 닫으면 처음으로
  await thread.getByRole('button', { name: '대화창 최소화' }).click();
  await fab.click();
  await page.getByRole('dialog').getByText('네, 식사도 잘 하시고 산책도 하셨어요.').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: '대화창 닫기' }).click();
  await fab.click();
  await win.getByText('대화로 업무를 도와드릴게요.', { exact: false }).waitFor();
  assert.equal(await win.getByText('세션을 설계했어요.', { exact: false }).count(), 0, '닫으면 대화를 비운다');

  // ⑥ 보호자 화면
  state.messages = [
    { id: 'g1', org_id: 'org-1', profile_id: 'e1', sender_user_id: 'guardian-1', sender_role: 'guardian', recipient_user_id: null, body: '어제 산책은 어떠셨나요?', created_at: iso(0.2) },
    { id: 'g2', org_id: 'org-1', profile_id: 'e1', sender_user_id: 'user-1', sender_role: 'caregiver', recipient_user_id: 'guardian-1', body: '네, 즐겁게 다녀오셨어요.', created_at: iso(0.1) },
  ];
  posts.messages.length = 0;
  await page.goto(`http://127.0.0.1:${PORT}/guardian/feed?state=connected`);
  await fab.waitFor(SLOW);
  await fab.click();
  await win.getByText('물어보세요.', { exact: false }).first().waitFor();
  await chip('기록은 어떻게 작성하나요?').click();
  await win.getByText('담당 요양보호사가 작성하고 확인해요', { exact: false }).waitFor();
  await win.getByRole('link', { name: '공개된 소식 보기' }).waitFor();
  // 답에 따라 버튼이 바뀐다: 기록 → 최근 공개된 소식 · 다른 질문 보기(처음 질문 버튼은 사라진다)
  await chip('최근 공개된 소식 보기').waitFor();
  await chip('다른 질문 보기').waitFor();
  assert.equal(await chip('소식이 보이지 않아요.').count(), 0, '답 뒤에는 그 질문의 후속 버튼만');
  await chip('최근 공개된 소식 보기').click();
  await win.getByText('가장 최근에 공개된 소식을 열었어요.', { exact: false }).waitFor();
  await page.waitForURL(/\/guardian\/feed(\/(journal|summary)\/[^/?]+|\?tab=photo)/);
  // 다른 질문 보기 → 질문 전체
  await chip('다른 질문 보기').click();
  await chip('개인정보는 어떻게 관리되나요?').waitFor();
  // 분석 → 최근 대화 분석 보기 → 대화 분석 화면(어느 대화가 가장 최근인지는 core latestEndedSession 단위 테스트가 본다)
  await chip('분석은 무엇을 보여 주나요?').click();
  await chip('최근 대화 분석 보기').click();
  await page.waitForURL(/\/guardian\/analysis\/sessions\/[^/?]+$/);
  await win.getByText('가장 최근 대화의 분석을 열었어요.', { exact: false }).waitFor();
  await chip('다른 질문 보기').waitFor();
  await type('오늘 날씨 어때요');
  await win.getByText('제가 답하기 어려운 질문이에요.', { exact: false }).waitFor();
  await chip('요양보호사에게 문의하기').click();
  const gThread = page.getByRole('dialog', { name: '담당 요양보호사 메시지 대화창' });
  await gThread.getByText('네, 즐겁게 다녀오셨어요.').waitFor(SLOW);
  await gThread.getByText('주고받은 내용과 전송 시간은 자동으로 기록돼요.', { exact: false }).waitFor();
  await gThread.getByLabel('메시지').fill('감사합니다. 다음 주도 부탁드려요.');
  await gThread.getByRole('button', { name: '전송', exact: true }).click();
  await gThread.getByText('감사합니다. 다음 주도 부탁드려요.').waitFor(SLOW);
  assert.deepEqual(posts.messages[0], { profile_id: 'e1', sender_user_id: 'guardian-1', body: '감사합니다. 다음 주도 부탁드려요.' },
    '보호자 메시지는 받는 사람·요양보호사 표시 없이 간다');

  console.log('PASS: 대화창 열기·최소화·닫기 · 세션 설계는 확인 뒤 저장(모달과 같은 값)·취소는 무전송 · 공개는 승인 일지만·확인 뒤 요약 공개·비공개는 항목 공개 전부 철회 · 확인할 일 안내 · 보호자 메시지 답장(받는 사람 지정) · 보호자 FAQ·모르는 질문 안내·요양보호사 문의(답장 표시). 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

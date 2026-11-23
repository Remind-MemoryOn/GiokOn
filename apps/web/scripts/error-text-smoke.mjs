// 오류 문구 회귀(2026-11-04 사용자 요청: "에러 메시지들 전부 한국어 안내로").
// 실제 배포본(production 빌드)의 가입·비밀번호 찾기·로그인 화면에 합성 Supabase 오류를 돌려주고,
// 토스트가 **한국어 안내만** 보이는지(영문 원문이 안 보이는지) 확인한다. 환경 파일을 읽지 않는다.
//
//   ① 가입 429 over_email_send_rate_limit('email rate limit exceeded') → 메일 발송 한도 안내
//   ② 비밀번호 찾기 429 같은 코드 → 같은 안내
//   ③ 로그인 400 invalid_credentials → '이메일 또는 비밀번호가 맞지 않아요.'
//   ④ 네트워크 끊김(Failed to fetch) → 연결 안내
//   ⑤ 코드도 아는 표현도 없는 영문 오류 → 화면의 한국어 fallback(원문 미노출)
import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-error-text-'));
await build({ envDir: false, mode: 'production', logLevel: 'error', define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.supabase.co'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic'),
}, build: { outDir, emptyOutDir: false } });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : process.platform === 'win32' ? { channel: 'msedge' } : {});
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const HANGUL = /[가-힣]/;

/** 한 화면에서 제출 → 오류 토스트 문구를 돌려준다. reply = 그 인증 경로의 합성 응답(또는 'abort'). */
async function errorToast({ path, endpoint, reply, fill, submit }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.route('https://synthetic.supabase.co/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (new URL(req.url()).pathname.endsWith(endpoint)) {
      if (reply === 'abort') return route.abort('internetdisconnected');
      return route.fulfill({ status: reply.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(reply.body) });
    }
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
  });
  await page.goto(`${base}${path}`);
  for (const [placeholder, value] of fill) await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
  await page.getByRole('button', { name: submit, exact: true }).click();
  const toast = page.locator('.fixed.bottom-8.right-8 > div').first();
  await toast.waitFor();
  const text = (await toast.innerText()).replace('✕', '').trim();
  await context.close();
  return text;
}

const signup = {
  path: '/signup', endpoint: '/auth/v1/signup', submit: '가입하기',
  fill: [['이메일을 입력해주세요', 'new@example.kr'], ['8자 이상 입력해주세요', 'password123'], ['비밀번호를 다시 입력해주세요', 'password123']],
};
const forgot = {
  path: '/forgot-password', endpoint: '/auth/v1/recover', submit: '재설정 메일 보내기',
  fill: [['가입한 이메일을 입력해주세요', 'old@example.kr']],
};
const login = {
  path: '/login', endpoint: '/auth/v1/token', submit: '로그인',
  fill: [['이메일을 입력해주세요', 'old@example.kr'], ['비밀번호를 입력해주세요', 'wrong-password']],
};
const rateLimited = { status: 429, body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } };

try {
  const cases = [
    ['① 가입 메일 한도', { ...signup, reply: rateLimited }, /인증 메일 발송 요청이 많아/],
    ['② 비밀번호 찾기 메일 한도', { ...forgot, reply: rateLimited }, /인증 메일 발송 요청이 많아/],
    ['③ 로그인 실패', { ...login, reply: { status: 400, body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } } }, /^이메일 또는 비밀번호가 맞지 않아요\.$/],
    ['④ 네트워크 끊김', { ...signup, reply: 'abort' }, /서버에 연결하지 못했어요/],
    ['⑤ 모르는 영문 오류', { ...signup, reply: { status: 400, body: { msg: 'Something unexpected happened' } } }, /^회원가입에 실패했어요\.$/],
  ];
  for (const [name, c, want] of cases) {
    const text = await errorToast(c);
    assert.match(text, HANGUL, `${name}: 한국어 안내여야 한다 — 받은 문구 "${text}"`);
    assert.doesNotMatch(text, /[A-Za-z]{4,}/, `${name}: 영문 원문이 보이면 안 된다 — "${text}"`);
    assert.match(text, want, `${name}: "${text}"`);
    console.log(`  ✓ ${name} → ${text}`);
  }
  console.log('PASS: 가입·비밀번호 찾기·로그인 오류가 한국어 안내로만 보인다(메일 한도·로그인 실패·네트워크·모르는 오류). 합성 API 만 사용.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

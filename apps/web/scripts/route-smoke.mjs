// 웹 라우트 스모크 — vite preview 위에서 Chromium 으로 순회한다.
// 각 라우트: 렌더 확인(기대 텍스트) + 콘솔 에러 수집 + 가드 리다이렉트 검증.
//
// 사용: pnpm -F @giokon/web smoke   (dist 가 있으면 preview 를 **스스로 띄우고** 끈다)
//   - 이미 preview 를 띄워 뒀거나 배포본을 대상으로 하려면 BASE_URL 지정 → 그대로 사용.
//   - Chromium 경로는 CHROMIUM_PATH 로 재지정.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.PORT || 4173);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
/** BASE_URL 을 명시했으면 사용자가 띄운 서버를 존중하고, 아니면 직접 띄운다. */
const SELF_SERVE = !process.env.BASE_URL;

async function reachable(url, timeoutMs = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/** vite preview 를 띄우고 준비될 때까지 기다린다. 실패 시 null. */
async function startPreview() {
  if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
    console.error('✗ dist 가 없습니다 — 먼저 `pnpm -F @giokon/web build` 를 실행하세요.');
    process.exit(1);
  }
  const child = spawn(
    'node',
    ['./node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore', detached: false },
  );
  for (let i = 0; i < 60; i++) {
    if (await reachable(BASE)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  console.error(`✗ preview 가 ${BASE} 에서 뜨지 않았습니다.`);
  process.exit(1);
}

let preview = null;
if (SELF_SERVE && !(await reachable(BASE))) preview = await startPreview();

// [경로, 기대 텍스트(렌더 확인), 설명]
const CASES = [
  ['/', '서비스 소개', '랜딩'],
  ['/login', '계정으로 로그인해 주세요.', '로그인'],
  ['/login', '네이버', '소셜 · 네이버'],
  ['/login', '카카오톡', '소셜 · 카카오'],
  ['/login', '구글', '소셜 · 구글'],
  ['/login', '아이디 저장', '아이디 저장'],
  ['/login', '아이디/비밀번호 찾기', '찾기 링크'],
  ['/guide', '개인정보 처리방침', '이용안내 · 처리방침'],
  ['/guide', '이용약관', '이용안내 · 약관'],
  ['/guide', '기억온은 의료기기가 아니며', '이용안내 · 비의료 고지'],
  ['/guide', '초안', '이용안내 · 초안 고지'],
  ['/signup', '계정으로 로그인해 주세요.', '회원가입(미인증→로그인)'],
  ['/find-id', '아이디(이메일) 찾기', '아이디 찾기'],
  ['/forgot-password', '비밀번호 찾기', '비밀번호 찾기'],
  ['/reset-password', '메일 링크로 들어오셨다면', '비밀번호 재설정'],
  // 미인증 가드: 보호 영역은 /login 으로(데모 모드=미설정→미인증)
  ['/caregiver', '계정으로 로그인해 주세요.', '요양보호사 영역 가드'],
  ['/caregiver/elders', '계정으로 로그인해 주세요.', '어르신 관리 가드'],
  ['/caregiver/elders/new', '계정으로 로그인해 주세요.', '어르신 등록 모달 가드'],
  ['/caregiver/elders/demo', '계정으로 로그인해 주세요.', '어르신 상세 가드'],
  ['/caregiver/elders/demo/edit', '계정으로 로그인해 주세요.', '어르신 기본 정보 수정 가드'],
  ['/caregiver/elders/demo/chronicles', '계정으로 로그인해 주세요.', '연대기 목록 가드'],
  ['/caregiver/elders/demo/chronicles/new', '계정으로 로그인해 주세요.', '연대기 추가 모달 가드'],
  ['/caregiver/elders/demo/chronicles/c1', '계정으로 로그인해 주세요.', '연대기 상세 모달 가드'],
  ['/caregiver/sessions', '계정으로 로그인해 주세요.', '세션 기록 가드'],
  ['/caregiver/sessions/demo', '계정으로 로그인해 주세요.', '세션 목록 가드'],
  ['/caregiver/sessions/demo/new', '계정으로 로그인해 주세요.', '회상 세션 설계 모달 가드'],
  ['/caregiver/analysis', '계정으로 로그인해 주세요.', '분석 가드'],
  ['/caregiver/journal', '계정으로 로그인해 주세요.', '요양일지 가드'],
  ['/caregiver/shares', '계정으로 로그인해 주세요.', '공개 관리 가드'],
  ['/caregiver/org', '계정으로 로그인해 주세요.', '기관 관리 가드'],
  ['/caregiver/settings', '계정으로 로그인해 주세요.', '설정 가드'],
  ['/guardian', '계정으로 로그인해 주세요.', '보호자 영역 가드'],
  ['/guardian/feed', '계정으로 로그인해 주세요.', '공개된 소식 가드'],
  ['/guardian/analysis', '계정으로 로그인해 주세요.', '보호자 분석 가드'],
  ['/onboarding', '계정으로 로그인해 주세요.', '온보딩(미인증→로그인)'],
  ['/no-such-route', '서비스 소개', '404 → 랜딩'],
];

// CHROMIUM_PATH > 사전 설치 브라우저(/opt/pw-browsers) > playwright 기본 순.
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`${page.url()}: ${msg.text()}`);
});
page.on('pageerror', (err) => consoleErrors.push(`${page.url()}: PAGEERROR ${err.message}`));

let failed = 0;
for (const [path, expected, label] of CASES) {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 });
    const body = await page.textContent('body');
    if (body && body.includes(expected)) {
      console.log(`✅ ${label} (${path})`);
    } else {
      failed += 1;
      console.log(`❌ ${label} (${path}) — "${expected}" 미발견`);
    }
  } catch (err) {
    failed += 1;
    console.log(`❌ ${label} (${path}) — ${err.message.split('\n')[0]}`);
  }
}

await browser.close();
preview?.kill();

if (consoleErrors.length > 0) {
  console.log('\n⚠️ 콘솔 오류:');
  for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ' + e);
}
console.log(`\n결과: ${CASES.length - failed}/${CASES.length} 통과, 콘솔 오류 ${consoleErrors.length}건`);
process.exit(failed > 0 ? 1 : 0);

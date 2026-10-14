// 웹 라우트 스모크 — vite preview 위에서 Chromium 으로 순회한다.
// 각 라우트: 렌더 확인(기대 텍스트) + 콘솔 에러 수집 + 가드 리다이렉트 검증.
//
// 사용: pnpm -F @giokon/web smoke   (dist 가 있으면 preview 를 **스스로 띄우고** 끈다)
//   - 이미 preview 를 띄워 뒀거나 배포본을 대상으로 하려면 BASE_URL 지정 → 그대로 사용.
//   - Chromium 경로는 CHROMIUM_PATH 로 재지정.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

/** BASE_URL 을 명시했으면 사용자가 띄운 서버를 존중하고, 아니면 직접 띄운다. */
const SELF_SERVE = !process.env.BASE_URL;

/** 고정 포트(4173)는 개발 서버와 부딪친다 → 직접 띄울 때는 빈 포트를 받아 쓴다. */
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 4173;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const PORT = SELF_SERVE ? await freePort() : Number(process.env.PORT || 4173);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

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
  // ⚠️ `new URL().pathname` 은 Windows 에서 `/C:/...` 이라 cwd 로 못 쓴다 → fileURLToPath.
  const child = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore', detached: false },
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
  ['/guide', '관리 웹 사용 방법', '이용안내 · 웹 사용 흐름'],
  ['/guide', '어르신 대화 앱 사용 방법', '이용안내 · 앱 사용 흐름'],
  ['/guide', '꼭 확인해 주세요', '이용안내 · 확인 사항'],
  ['/guide', '기억온은 의료기기가 아니며', '이용안내 · 비의료 고지'],
  ['/guide', '개인정보 처리방침', '이용안내 · 처리방침 링크(단독 페이지로)'],
  ['/guide', '이용약관', '이용안내 · 약관 링크(단독 페이지로)'],
  ['/privacy', '개인정보의 처리 목적', '개인정보 처리방침(단독)'],
  ['/privacy', '확정되지 않은 정보를 임의로 표시하지 않습니다', '처리방침 · 미확정 정보 비생성'],
  ['/terms', '제1조 목적', '이용약관(단독)'],
  ['/terms', '비공개 문의의 본문은 작성자, 사이트 운영자 및 업무상 필요한 담당자만', '약관 · 비공개 문의 규약'],
  ['/inquiries', '문의사항', '문의사항 목록'],
  ['/inquiries', '아직 등록된 문의사항이 없어요.', '문의사항 · 빈 상태(미설정)'],
  ['/inquiries/new', '문의사항 등록', '문의 등록 폼'],
  ['/inquiries/new', '민감정보나 어르신의 식별정보는', '문의 등록 · 민감정보 안내'],
  ['/inquiries/demo', '문의사항 목록', '문의 상세(미설정→열람 불가)'],
  ['/signup', '회원가입', '회원가입(이메일)'],
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
  ['/caregiver/sessions/demo/s1', '계정으로 로그인해 주세요.', '대화 기록 가드'],
  ['/caregiver/analysis', '계정으로 로그인해 주세요.', '분석 가드'],
  ['/caregiver/analysis/elders', '계정으로 로그인해 주세요.', '개인별 분석 가드'],
  ['/caregiver/analysis/demo', '계정으로 로그인해 주세요.', '개인별 종합 분석 가드'],
  // 이관 중 쓰던 경로 — 지금은 개인별 종합 분석(analysis/:elderId)으로 보낸다.
  ['/caregiver/analysis/demo/overall', '계정으로 로그인해 주세요.', '구 /overall 경로 리다이렉트'],
  ['/caregiver/analysis/demo/sessions', '계정으로 로그인해 주세요.', '대화 분석 목록 가드'],
  ['/caregiver/analysis/demo/sessions/s1', '계정으로 로그인해 주세요.', '대화 분석 상세 가드'],
  ['/caregiver/journal', '계정으로 로그인해 주세요.', '프로그램 일지 가드'],
  ['/caregiver/journal/demo', '계정으로 로그인해 주세요.', '프로그램 일지 목록 가드'],
  ['/caregiver/journal/demo/new', '계정으로 로그인해 주세요.', '프로그램 일지 수기 작성 가드'],
  ['/caregiver/journal/demo/j1', '계정으로 로그인해 주세요.', '프로그램 일지 상세 가드'],
  ['/caregiver/shares', '계정으로 로그인해 주세요.', '공개 관리 가드'],
  ['/caregiver/shares/demo', '계정으로 로그인해 주세요.', '공개 항목 목록 가드'],
  ['/caregiver/shares/demo/history', '계정으로 로그인해 주세요.', '공개 이력 가드'],
  ['/caregiver/org', '계정으로 로그인해 주세요.', '기관 관리 가드'],
  ['/caregiver/settings', '계정으로 로그인해 주세요.', '설정 가드'],
  ['/guardian', '계정으로 로그인해 주세요.', '보호자 영역 가드'],
  ['/guardian/feed', '계정으로 로그인해 주세요.', '공개된 소식 가드'],
  ['/guardian/analysis', '계정으로 로그인해 주세요.', '보호자 분석 가드'],
  ['/guardian/feed/journal/x', '계정으로 로그인해 주세요.', '보호자 요양일지 상세 가드'],
  ['/guardian/feed/summary/x', '계정으로 로그인해 주세요.', '보호자 대화 요약 상세 가드'],
  ['/guardian/settings', '계정으로 로그인해 주세요.', '보호자 설정 가드'],
  ['/guardian/analysis/sessions', '계정으로 로그인해 주세요.', '보호자 대화 분석 목록 가드'],
  ['/guardian/analysis/sessions/x', '계정으로 로그인해 주세요.', '보호자 대화 분석 상세 가드'],
  ['/caregiver/shares/x?settings=y', '계정으로 로그인해 주세요.', '공개 기록 설정 가드'],
  ['/caregiver/shares/x/history?receipt=y', '계정으로 로그인해 주세요.', '공개 이력 상세 가드'],
  ['/onboarding', '계정으로 로그인해 주세요.', '온보딩(미인증→로그인)'],
  ['/join-pending', '계정으로 로그인해 주세요.', '합류 승인 대기(미인증→로그인)'],
  ['/caregiver/supervision', '계정으로 로그인해 주세요.', '감독 화면 가드'],
  ['/no-such-route', '서비스 소개', '404 → 랜딩'],
];

// CHROMIUM_PATH > 사전 설치 브라우저(/opt/pw-browsers) > playwright 기본 순.
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath }
  : process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage();

// ── 배포 헤더를 그대로 씌워 CSP 를 **실제로 시험한다** ──────────────────────
// `vite preview` 는 vercel.json 의 헤더를 모른다 → 여기서 주입한다. CSP 위반은
// 콘솔 오류로 잡히므로 아래 "콘솔 오류 0건" 판정이 그대로 검증이 된다.
// (헤더 문구는 배포본과 한 벌이어야 한다 — 어긋나면 여기서 통과하고 배포에서 깨진다.)
const vercel = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
);
const deployHeaders = Object.fromEntries(
  (vercel.headers ?? [])
    .filter((h) => h.source === '/(.*)')
    .flatMap((h) => h.headers)
    // HSTS 는 http 프리뷰에서 무의미하고, COOP 는 로컬에서 경고만 낸다.
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.value]),
);
await page.route('**/*', async (route) => {
  const res = await route.fetch();
  const isDoc = route.request().resourceType() === 'document';
  await route.fulfill({
    response: res,
    headers: isDoc ? { ...res.headers(), ...deployHeaders } : res.headers(),
  });
});

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

// 웹 라우트 스모크 — vite preview 위에서 Chromium 으로 순회한다.
// 각 라우트: 렌더 확인(기대 텍스트) + 콘솔 에러 수집 + 가드 리다이렉트 검증.
// 사용: pnpm build && pnpm preview (별도 셸) → pnpm smoke
//   (BASE_URL 로 대상 변경 가능. Chromium 경로는 CHROMIUM_PATH 로 재지정.)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4173';

// [경로, 기대 텍스트(렌더 확인), 설명]
const CASES = [
  ['/', '요양보호사가 설계하고', '랜딩'],
  ['/login', '소셜 계정으로 시작하세요', '통합 로그인(소셜 3버튼)'],
  ['/login', '구글로 계속하기', '구글 버튼'],
  ['/login', '카카오로 계속하기', '카카오 버튼'],
  ['/login', '네이버로 계속하기', '네이버 버튼'],
  ['/privacy', '개인정보', '처리방침'],
  ['/terms', '약관', '이용약관'],
  // 미인증 가드: 보호 영역은 /login 으로 리다이렉트(데모 모드=미설정→미인증)
  ['/caregiver', '소셜 계정으로 시작하세요', '요양보호사 영역 가드 → /login'],
  ['/caregiver/journal', '소셜 계정으로 시작하세요', '요양일지 가드'],
  ['/caregiver/analysis', '소셜 계정으로 시작하세요', '분석 가드'],
  ['/caregiver/shares', '소셜 계정으로 시작하세요', '공개 관리 가드'],
  ['/guardian', '소셜 계정으로 시작하세요', '보호자 영역 가드'],
  ['/onboarding', '소셜 계정으로 시작하세요', '온보딩 가드(미로그인→로그인)'],
  ['/caregiver/login', '소셜 계정으로 시작하세요', '구 경로 → 통합 로그인'],
  ['/guardian/login', '소셜 계정으로 시작하세요', '구 경로 → 통합 로그인'],
  ['/no-such-route', '요양보호사가 설계하고', '404 → 랜딩'],
];

// CHROMIUM_PATH > 사전 설치 브라우저(/opt/pw-browsers) > playwright 기본 순.
import { existsSync } from 'node:fs';
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

if (consoleErrors.length > 0) {
  console.log('\n⚠️ 콘솔 오류:');
  for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ' + e);
}
console.log(`\n결과: ${CASES.length - failed}/${CASES.length} 통과, 콘솔 오류 ${consoleErrors.length}건`);
process.exit(failed > 0 ? 1 : 0);

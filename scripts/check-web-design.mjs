#!/usr/bin/env node
// 웹 디자인 대조 검사 (apps/web) — 신규 Figma 디자인 기준.
//
// 기준(SoT): Figma `4iU6Zw4MhLAMZWlnPFgsCI` "기억온 웹" — 화면↔노드 맵과 절차는
// docs/runbooks/figma-web-extraction.md. 구 디자인(2026-08 이전)은 폐기됐다.
//
// 이 검사는 **이관이 끝난 화면만** 대조한다(SCREENS 표). 화면을 옮길 때마다 실측 항목을
// 추가해 표를 키운다 — 모바일 `check:figma` 와 같은 방식이다.
//
// 상시 검사(화면과 무관):
//   1) 토큰 단일 소스  — @giokon/theme ↔ 웹 tailwind.config 값 동일성(미러 드리프트 차단)
//   2) 미정의 토큰     — 팔레트에 없는 shade 사용 시 색이 조용히 사라진다
//   3) 에셋 인벤토리   — Figma export 48화면이 제자리에 있는지
//
// 사용: node scripts/check-web-design.mjs   (pnpm check:design)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const WEB = 'apps/web';
const THEME = 'packages/theme/src/index.ts';
const RUNBOOK = 'docs/runbooks/figma-web-extraction.md';
const ASSETS = `${WEB}/assets/figma`;

const cache = new Map();
function src(file) {
  if (!cache.has(file)) {
    try { cache.set(file, readFileSync(file, 'utf8').replace(/\r\n/g, '\n')); } catch { cache.set(file, null); }
  }
  return cache.get(file);
}
/** JSX 는 줄바꿈으로 카피가 쪼개지므로 공백을 접어서 비교한다. */
const flat = (file) => (src(file) ?? '').replace(/\s+/g, ' ');

let ok = 0;
const fails = [];
const check = (section, name, passed, detail = '') =>
  passed ? ok++ : fails.push({ section, name, detail });

// ── 1) 토큰 단일 소스: theme ↔ tailwind 미러 동일성 ──────────────────────
// tailwind.config 는 TS 를 import 할 수 없어 값을 미러한다. 한쪽만 바뀌는 드리프트를 막는다.
/** `name: { 50: '#…', … }` 블록을 중괄호 균형으로 잘라 shade→hex 맵을 만든다. */
function colorMap(text, group) {
  const head = new RegExp(`(?:^|[^\\w-])${group}:\\s*\\{`, 'm').exec(text ?? '');
  if (!head) return null;
  const start = (text ?? '').indexOf('{', head.index);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const out = {};
  for (const m of text.slice(start, end).matchAll(/'?([\w-]+)'?:\s*'(#[0-9a-fA-F]{3,8})'/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}
/** theme 의 webPalette(웹 디자인 토큰) 안에 정의된 색 그룹 이름들. */
function paletteGroups(text) {
  const head = /export const webPalette = \{/.exec(text ?? '');
  if (!head) return [];
  const start = text.indexOf('{', head.index);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = text.slice(start + 1, end);
  return [...body.matchAll(/^\s{2}(\w[\w-]*):\s*\{/gm)].map((m) => m[1]);
}

const themeSrc = src(THEME);
const twSrc = src(`${WEB}/tailwind.config.js`);
check('토큰', '테마 토큰 파일 존재', Boolean(themeSrc), THEME);
check('토큰', '웹 tailwind.config 존재', Boolean(twSrc), `${WEB}/tailwind.config.js`);

const groups = paletteGroups(themeSrc);
check('토큰', 'theme 에 webPalette(웹 디자인 토큰)가 정의돼 있다', groups.length > 0);
const defined = {};
for (const g of groups) {
  const inTheme = colorMap(themeSrc, g);
  const inTailwind = colorMap(twSrc, g);
  if (inTheme) defined[g] = inTheme;
  check('토큰', `${g}: @giokon/theme = 웹 tailwind.config (미러 동일성)`,
    inTheme && inTailwind && JSON.stringify(inTheme) === JSON.stringify(inTailwind),
    `theme ${JSON.stringify(inTheme)} / tailwind ${JSON.stringify(inTailwind)}`);
}

// 그림자·타이포 실측값도 두 곳이 같은지 본다.
for (const [key, value] of [
  ['topBar', '1px 1px 10px 0px rgba(108,101,101,0.13)'],
  ['card', '1px 1px 8px 0px rgba(106,106,106,0.25)'],
  ['chip', '1px 1px 10px 0px rgba(0,0,0,0.05)'],
]) {
  check('토큰', `shadow ${key} 실측값 = theme·tailwind 양쪽`,
    (themeSrc ?? '').includes(`'${value}'`) && (twSrc ?? '').includes(`'${value}'`), value);
}
for (const size of ['w-page', 'w-section', 'w-stat', 'w-cta', 'w-nav', 'w-body', 'w-sub', 'w-label']) {
  check('토큰', `타이포 ${size} 정의(theme·tailwind)`,
    (themeSrc ?? '').includes(`'${size}'`) && (twSrc ?? '').includes(`'${size}'`));
}

// ── 2) 팔레트에 없는 shade 사용 차단 ─────────────────────────────────────
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'coverage', 'assets']);
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIR.has(name)) walk(p, out); }
    else if (['.ts', '.tsx', '.css', '.html'].includes(extname(name))) out.push(p);
  }
  return out;
}
const UTIL = 'text|bg|border|ring|from|via|to|shadow|accent|divide|placeholder|decoration|outline|fill|stroke|caret';
const undefinedShades = [];
if (groups.length) {
  const re = new RegExp(`\\b(?:${UTIL})-(${groups.join('|')})-([\\w-]+)\\b`, 'g');
  for (const file of walk(`${WEB}/src`)) {
    for (const m of (src(file) ?? '').matchAll(re)) {
      if (!defined[m[1]]?.[m[2]]) undefinedShades.push(`${file}: ${m[0]}`);
    }
  }
}
check('토큰', '미정의 shade 사용 없음(정의되지 않은 클래스는 색이 적용되지 않는다)',
  undefinedShades.length === 0, undefinedShades.slice(0, 8).join(' / '));

// ── 3) 디자인 에셋 인벤토리 ──────────────────────────────────────────────
check('에셋', '재적용 런북(화면↔노드 맵) 존재', existsSync(RUNBOOK), RUNBOOK);
const screenPngs = existsSync(ASSETS)
  ? readdirSync(ASSETS).filter((f) => f.endsWith('.png'))
  : [];
check('에셋', `Figma export 화면 48종 존재 (현재 ${screenPngs.length})`, screenPngs.length >= 48, ASSETS);
check('에셋', 'Pretendard 자체 호스팅 폰트 존재',
  existsSync(`${WEB}/assets/fonts/Pretendard-1.3.9`), '컨테이너에서 CDN 이 막혀 자체 호스팅한다');

// ── 4) 이관 완료 화면 실측 대조 ──────────────────────────────────────────
// [파일, 항목명, [정규식 …], 'code'|'copy']  — 'copy' 는 공백을 접어서 비교한다.
// 화면을 옮길 때마다 여기에 실측값을 추가한다(런북 §절차 4).
const SCREENS = [
  // ── 공용 셸 ────────────────────────────────────────────────────────────
  [`${WEB}/src/components/shell/TopBar.tsx`, '탑바: h122 · shadow-topbar · 워드마크 153×23 @63', [
    /h-\[122px\][^"]*shadow-topbar/, /left-\[63px\] top-\[70px\]/, /width=\{153\}/, /height=\{23\}/,
  ]],
  [`${WEB}/src/components/shell/TopBar.tsx`, '탑바: 검색 466×40 r-pill @561 · 아이콘 21×22', [
    /left-\[561px\] top-\[62px\]/, /h-\[40px\] w-\[466px\]/, /rounded-pill bg-mute-field/,
    /width=\{21\}/, /height=\{22\}/,
  ]],
  [`${WEB}/src/components/shell/TopBar.tsx`, '탑바: 벨 @1045 + 배지 18원 · 아바타 40 @1105', [
    /\{ bell: 1045, avatar: 1105, chevron: 254 \}/, /h-\[18px\] min-w-\[18px\][^"]*rounded-full bg-accent/,
    /width=\{40\}/, /height=\{40\}/,
  ]],
  [`${WEB}/src/components/shell/Sidebar.tsx`, '사이드바: 폭 296 · 활성 pill 208×57 r10 accent-soft', [
    /w-\[296px\]/, /h-\[57px\] w-\[208px\]/, /rounded-\[10px\]/, /bg-accent-soft/, /ml-\[44px\]/,
  ]],
  [`${WEB}/src/components/shell/Sidebar.tsx`, '사이드바: 아이콘 26 · 라벨 SemiBold 22 · 활성 accent', [
    /width=\{26\}/, /height=\{26\}/, /text-w-nav font-semibold/,
    /isActive \? 'text-accent' : 'text-ink-500'/,
  ]],
  [`${WEB}/src/components/shell/nav.ts`, '사이드바: 요양보호사 8항목 · 보호자 4항목(디자인 순서)', [
    /'\/caregiver', label: '대시보드'/, /'\/caregiver\/elders', label: '어르신 관리'/,
    /'\/caregiver\/sessions', label: '세션 기록'/, /'\/caregiver\/analysis', label: '분석'/,
    /'\/caregiver\/journal', label: '요양일지'/, /'\/caregiver\/shares', label: '공개 관리'/,
    /'\/caregiver\/org', label: '기관 관리'/, /'\/caregiver\/settings', label: '설정'/,
    /'\/guardian', label: '어르신 연결'/, /'\/guardian\/feed', label: '공개된 소식'/,
  ]],
  [`${WEB}/src/components/shell/PublicHeader.tsx`, '공개 헤더: 워드마크 @130 · 내비 4항목 좌표 · 활성 밑줄 3px', [
    /left-\[130px\] top-\[71px\]/, /left: 720/, /left: 898/, /left: 1052/, /left: 1168/,
    /h-\[3px\] w-full bg-accent/,
  ]],
  [`${WEB}/src/components/Layout.tsx`, '셸: 콘텐츠 열 1054(pl27/pr63) · 스킵 링크', [
    /pl-\[27px\] pr-\[63px\]/, /본문으로 바로가기/, /id="main-content"/,
  ]],
  [`${WEB}/src/components/Layout.tsx`, '페이지 제목 Bold 30 accent lh70 · 설명 20/30', [
    /text-w-page font-bold leading-\[70px\]/, /tone === 'accent' \? 'text-accent' : 'text-ink-900'/,
    /text-w-body leading-\[30px\] text-ink-700/,
  ]],

  // ── 로그인 15:443 ──────────────────────────────────────────────────────
  [`${WEB}/src/pages/public/LoginPage.tsx`, '로그인: 열 568 @436 · 입력 h68 r10 · CTA 568×71', [
    /left-\[436px\] top-\[132px\] w-\[568px\]/, /left-\[436px\] top-\[267px\] w-\[568px\]/,
    /h-\[68px\] w-full rounded-\[10px\] border border-line/,
    /left-\[436px\] top-\[478px\] h-\[71px\] w-\[568px\] rounded-\[10px\] bg-accent/,
    /text-w-cta font-semibold text-white/,
  ]],
  [`${WEB}/src/pages/public/LoginPage.tsx`, '로그인: 소셜 3종 180×68 · 칩 36×34 r5 · 좌표 436/629/824', [
    /h-\[68px\] w-\[180px\]/, /rounded-\[10px\] border border-line/,
    /h-\[34px\] w-\[36px\] items-center justify-center rounded-\[5px\]/,
    /left: 436/, /left: 629/, /left: 824/, /bg-naver/, /bg-kakao/,
  ]],
  [`${WEB}/src/pages/public/LoginPage.tsx`, '로그인: 또는 구분선 250×1 · 아이디 저장 · 찾기 링크', [
    /h-px w-\[250px\] bg-line-strong/, /아이디 저장/, /아이디\/비밀번호 찾기/,
  ]],
  [`${WEB}/src/pages/public/LoginPage.tsx`, '로그인: 카피(Figma 문구 그대로)', [
    /계정으로 로그인해 주세요\./, /이메일을 입력해주세요/, /비밀번호를 입력해주세요/,
    /계정이 없으신가요\?/,
  ], 'copy'],

  // ── 아이디/비밀번호 찾기·재설정 111:148 / 111:170 / 114:247 ────────────
  // 세 화면은 골격이 완전히 같다(실측): 돌아가기 187 · 제목 287 · 부제 325 ·
  // 입력 576×57 @431/560 · CTA 576×71 @672 · 하단 링크 793.
  // 실측(187/287/325 · 라벨 395 · 입력 431→560 · CTA 672 · 하단 793)을 그대로 고정하되,
  // 회원가입이 같은 리듬을 한 칸 더 쓰므로 뒤 세 개는 pitch/오프셋으로 적혀 있다.
  //   FIELD_TOP(0)=395 · INPUT_TOP(0)=431 · INPUT_TOP(1)=431+129=560
  //   CTA=INPUT_TOP(n-1)+112 → 2칸이면 672 · 하단 링크=CTA+121 → 793
  [`${WEB}/src/components/shell/AuthFormScreen.tsx`, '인증 폼: 공통 골격 좌표(187/287/325/431·560/672/793)', [
    /top: Y\(187\)/, /top: Y\(287\)/, /top: Y\(325\)/,
    /const PITCH = 129;/,
    /const FIELD_TOP = \(i: number\) => 395 \+ i \* PITCH;/,
    /const INPUT_TOP = \(i: number\) => 431 \+ i \* PITCH;/,
    /const ctaTop = \(n: number\) => INPUT_TOP\(n - 1\) \+ 112;/,
    /footerLink\.top \?\? ctaTop\(fields\.length\) \+ 121/,
    /relative top-\[-9px\]/, // 별표 라인박스는 라벨보다 9px 위(395→386)
  ]],
  [`${WEB}/src/components/shell/AuthFormScreen.tsx`, '인증 폼: 입력 576×57 r10 · CTA 576×71 accent · 필수 별표', [
    /h-\[57px\] w-\[576px\] rounded-\[10px\] border border-line/,
    /h-\[71px\] w-\[576px\] rounded-\[10px\] bg-accent/,
    /text-\[12px\] font-medium leading-\[30px\] text-accent/,
  ]],
  [`${WEB}/src/pages/public/FindIdPage.tsx`, '아이디 찾기: 카피·필드', [
    /아이디\(이메일\) 찾기/, /가입 시 입력한 이름과 전화번호로 이메일 일부를 확인할 수 있어요\./,
    /이름을 입력해주세요/, /010-1234-5678/,
  ], 'copy'],
  [`${WEB}/src/pages/public/ForgotPasswordPage.tsx`, '비밀번호 찾기: 카피·필드', [
    /비밀번호 찾기/, /가입한 이메일로 비밀번호 재설정 링크를 보내드려요\./,
    /가입한 이메일을 입력해주세요/, /재설정 메일 보내기/,
  ], 'copy'],
  [`${WEB}/src/pages/public/ResetPasswordPage.tsx`, '비밀번호 재설정: 카피·필드', [
    /비밀번호 재설정/, /메일 링크로 들어오셨다면 새 비밀번호를 설정할 수 있어요\./,
    /새 비밀번호를 입력해주세요/, /새 비밀번호 다시 입력해주세요/, /비밀번호 변경/,
  ], 'copy'],

  // ── 온보딩(회원가입 페이지2) 15:444 ────────────────────────────────────
  [`${WEB}/src/pages/public/OnboardingPage.tsx`, '온보딩: 역할 카드 275×128 r10 @ (432/733,320) + 라디오 25/13', [
    /h-\[128px\] w-\[275px\] rounded-\[10px\]/, /left: r\.left, top: Y\(320\)/,
    /left: 432/, /left: 733/, /h-\[25px\] w-\[25px\] items-center justify-center rounded-full border-2/,
    /h-\[13px\] w-\[13px\] rounded-full/,
  ]],
  [`${WEB}/src/pages/public/OnboardingPage.tsx`, '온보딩: 입력 576×57 @ 이름508·전화652·기관798 + 필수 별표 accent', [
    /h-\[57px\] w-\[576px\] rounded-\[10px\] border border-line/,
    /at=\{\[473\.38, 468, 464, 508\.41, 573\.46\]\}/,
    /at=\{\[616\.49, 504, 609, 651\.52, 716\.57\]\}/,
    /at=\{\[763\.61, 529, 756, 797\.64, 862\.69\]\}/,
    /text-\[12px\] font-medium leading-\[30px\] text-accent/,
  ]],
  [`${WEB}/src/pages/public/OnboardingPage.tsx`, '온보딩: 동의 박스 576×151 @916 · CTA 576×71 @1106', [
    /h-\[151px\] w-\[576px\] rounded-\[10px\] border border-line/, /top: Y\(916\)/,
    /h-\[71px\] w-\[576px\] rounded-\[10px\] bg-accent/, /top: Y\(1106\)/,
  ]],
  [`${WEB}/src/pages/public/OnboardingPage.tsx`, '온보딩: 카피(Figma 문구 그대로)', [
    /기본 정보를 입력해 주세요/, /소셜 로그인은 완료됐어요\./, /어떤 역할로 이용하시나요\?/,
    /\[필수\]<\/span> 개인정보 수집·이용에 동의합니다\./, /가입 완료/,
  ], 'copy'],

  // ── 문의사항·법적 고지·공개 하단 — Figma 에 없는 신규(2026-09-02 사용자 승인) ──
  // 시안 근거가 없으므로 치수 대신 **규약**을 고정한다: 비공개 게시글의 제목·본문은
  // 작성자·운영자만 본다(서버가 판정하고 화면은 그 값을 그대로 쓴다).
  [`${WEB}/src/components/shell/PublicFooter.tsx`, '공개 하단: 개인정보 처리방침·이용약관 단독 링크', [
    /to="\/privacy"/, /to="\/terms"/,
  ]],
  [`${WEB}/src/pages/public/LegalPages.tsx`, '법적 고지: 처리방침·약관 별도 페이지 · 미확정 정보 비생성', [
    /개인정보 처리방침/, /이용약관/, /처리위탁·국외 이전/,
    /확정되지 않은 정보를 임의로 표시하지 않습니다/,
  ], 'copy'],
  [`${WEB}/src/pages/public/InquiryPages.tsx`, '문의사항: 비공개 판정은 서버(locked)를 따르고 화면이 다시 만들지 않는다', [
    /item\.locked \? \(/, /useInquiryList/,
  ]],
  [`${WEB}/src/pages/public/InquiryPages.tsx`, '문의사항: 네이티브 대화상자 금지 — Dialog·toast 프리미티브만 쓴다', [
    /<ConfirmDialog/, /useStore\(\(s\) => s\.toast\)/,
  ]],
  [`${WEB}/src/pages/public/InquiryPages.tsx`, '문의사항: 비공개·민감정보 카피', [
    /비공개 문의의 제목과 내용은 작성자와 사이트 운영자만 볼 수 있어요\./,
    /민감정보나 어르신의 식별정보는 필요한 범위 이상 입력하지 마세요\./,
  ], 'copy'],
  [`${WEB}/src/App.tsx`, '문의사항·법적 고지: 공개 라우트 6종', [
    /path="\/privacy"/, /path="\/terms"/, /path="\/inquiries"/,
    /path="\/inquiries\/new"/, /path="\/inquiries\/:inquiryId"/, /path="\/inquiries\/:inquiryId\/edit"/,
  ]],

  // ── 대시보드 118:300 ───────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 통계 4카드 243×107 r10 shadow-card · 아이콘 50', [
    /h-\[107px\] w-\[243px\][^"]*rounded-\[10px\] bg-white px-6 shadow-card/,
    /gap-\[27px\]/, /width=\{50\}/, /height=\{50\}/,
    /text-w-stat font-semibold/, /text-w-label text-ink-500/,
  ]],
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 통계 4종 라벨(디자인 순서)', [
    /'등록된 어르신'/, /'준비된 세션'/, /'연대기 항목'/, /'AI 자동 축적'/,
  ]],
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 안전 알림 배너(alert 테두리·3% 배경) + 비의료 고지', [
    /border border-alert bg-alert-soft/, /text-w-section font-bold leading-\[70px\] text-alert/,
    /키워드 기반 안전장치이며 의학적 판단이 아닙니다/, /role="alert"/, /aria-live="assertive"/,
  ]],
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 담당 어르신(아바타 99·배지 세션/연대기) · 최근 대화(아바타 76)', [
    /size="xl"/, /size="lg"/, /tone="info" large/, /tone="chronicle" large/,
    /담당 어르신/, /최근 대화/, /전체 보기/,
  ]],

  // ── 서비스 소개 1:13 ───────────────────────────────────────────────────
  [`${WEB}/src/pages/public/LandingPage.tsx`, '랜딩: 히어로 밴드 953 · 그라데이션 흰→#f7d3b4 54.6%', [
    /height: 953/, /linear-gradient\(180deg, #ffffff 0%, #ffffff 54\.6%, #f7d3b4 100%\)/,
    /const Y = \(v: number\) => v - 122/,
  ]],
  [`${WEB}/src/pages/public/LandingPage.tsx`, '랜딩: h1 Bold48/70 @118,355 · 워드마크 263×41 @515 · 히어로아트 410×261 @828,325', [
    /text-\[48px\] font-bold leading-\[70px\]/, /top: Y\(355\)/,
    /width: 263, height: 41/, /top: Y\(515 \+ \(40\.117 - 41\) \/ 2\)/, /width: 410, height: 261/, /top: Y\(325\)/,
  ]],
  [`${WEB}/src/pages/public/LandingPage.tsx`, '랜딩: 기능 카드 4종 268×318 r10 shadow-card @1941 (x 113/427/741/1055)', [
    /h-\[318px\] w-\[268px\] rounded-\[10px\] bg-white shadow-card/, /top: Y\(1941\)/,
    /left: 113/, /left: 427/, /left: 741/, /left: 1055/,
  ]],
  [`${WEB}/src/pages/public/LandingPage.tsx`, '랜딩: 카드 내부 순서 제목(1990)→아이콘(2052)→설명(2157)', [
    /top: Y\(1990\)/, /top: Y\(f\.box\[1\] \+ \(f\.box\[3\] - f\.iconH\) \/ 2\)/, /top: Y\(2157\)/,
  ]],
  [`${WEB}/src/pages/public/LandingPage.tsx`, '랜딩: 하단 회색 섹션 #f8f8f8 @1539 h992 + 노치', [
    /top: Y\(1542\), height: 989/, /bg-\[#f8f8f8\]/, /landingNotch/,
  ]],
  [`${WEB}/src/pages/public/LandingPage.tsx`, '랜딩: 카피(Figma 문구 그대로)', [
    /AI 회상 대화와/, /요양일지를 더 쉽게 관리하는,/, /을 이용해보세요!/,
    /AI 회상 기록부터 요양일지,/, /어르신 관리/, /AI 회상 기록/, /AI 분석/, /보호자 공유/,
  ], 'copy'],

  // ── 어르신 관리 161:207 ────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/EldersPage.tsx`, '어르신 관리: 카드 329×146 r10 accent7% shadow-card · 3열 gap33 · 사진 101', [
    /h-\[146px\] w-\[329px\]/, /rounded-\[10px\] bg-accent\/\[0\.07\] shadow-card/,
    /gap-\[33px\]/, /px=\{101\}/,
  ]],
  [`${WEB}/src/pages/caregiver/EldersPage.tsx`, '어르신 관리: 검색 335×57 @mt26 · 이름 SemiBold19/30 · 메타 Medium16', [
    /mt-\[29px\] h-\[57px\] w-\[335px\]/, /text-\[19px\] font-semibold leading-\[30px\]/,
    /text-w-label font-medium leading-\[30px\] text-ink-400/,
  ]],
  [`${WEB}/src/pages/caregiver/EldersPage.tsx`, '어르신 관리: 액션 2버튼(205×57 outline · 177×57 accent)', [
    /h-\[57px\] w-\[205px\][^"]*border border-accent bg-white/,
    /h-\[57px\] w-\[177px\][^"]*border border-accent bg-accent/,
    /코드로 담당 추가/, /새 어르신 등록/,
  ]],
  [`${WEB}/src/pages/caregiver/EldersPage.tsx`, '어르신 관리: 합류 대기 배너 1054×56 accent10%', [
    /h-\[56px\] w-\[1054px\][^"]*border border-accent bg-accent\/10/,
    /기관 합류 승인 대기 중이에요/,
  ]],

  // ── 정밀 대조(figma-audit)로 확정한 실측 규칙 ─────────────────────────
  // 이 값들은 `pnpm -F @giokon/web figma:audit` 이 Figma 좌표와 1:1로 재서 확정했다.
  [`${WEB}/src/components/shell/Sidebar.tsx`, '사이드바: 라벨 x=118(아이콘 28+26+20) · 로그아웃 하단 86 · nav shrink-0(겹침 방지)', [
    /ml-\[28px\]/, /ml-\[20px\] text-w-nav/, /mb-\[86px\]/, /flex shrink-0 flex-col gap-\[22px\]/,
  ]],
  [`${WEB}/src/components/Layout.tsx`, '셸: 본문 세로 flex(하단 고정) · 하단 여백 88', [
    /flex min-w-0 flex-1 flex-col pb-\[88px\]/,
  ]],
  [`${WEB}/src/components/Layout.tsx`, '페이지 헤더: 설명 -3(제목 라인박스와 겹침) · 액션 @188 gap24', [
    /-mt-\[3px\] text-w-body leading-\[30px\]/, /gap-\[24px\] pt-\[19px\]/,
  ]],
  [`${WEB}/src/components/ui/Badge.tsx`, '배지 폭: 기본 px16 · 큰 배지 px18 · 상태 배지 고정 82', [
    /h-\[32px\] px-\[18px\]/, /h-\[25px\] px-\[16px\]/, /fixed && 'w-\[82px\] px-0'/,
  ]],
  [`${WEB}/src/components/ui/Card.tsx`, '카드 구분선: 좌우 51 → 375~1325(950)', [
    /mx-\[51px\] h-px bg-line/,
  ]],
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 배너 1054 @-ml-px · px51 · pt20/pb32 · 구분선 mt19', [
    /-ml-px mb-\[54px\] mt-\[51px\] w-\[1054px\]/, /px-\[51px\] pb-\[32px\] pt-\[20px\]/,
    /mt-\[19px\] h-px bg-alert-line/,
  ]],
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 통계 카드 = 라벨(위) → 값(아래) · 아이콘 간격 21', [
    /gap-\[21px\] rounded-\[10px\] bg-white px-6 shadow-card/,
    /data-fx=\{s\.fx\[2\]\} className="text-w-label text-ink-500"/,
    /-mt-\[4px\] text-w-stat font-semibold/,
  ]],
  [`${WEB}/src/pages/caregiver/DashboardPage.tsx`, '대시보드: 담당 행(pt13/pb36·사진 mt26) · 최근 행(pt13/pb29·사진 mt12·배지 mt41)', [
    /pb-\[36px\] pt-\[13px\]/, /size="xl"[\s\S]{0,200}?className="mt-\[26px\]"/,
    /gap-\[14px\] px-\[52px\] pb-\[29px\] pt-\[13px\]/, /className="mt-\[41px\]"/,
  ]],
  [`${WEB}/src/pages/caregiver/EldersPage.tsx`, '어르신 관리: 카드 3번째 줄 -4 · 열쇠 아이콘 · 대기 배너 하단 고정', [
    /-mt-\[4px\] text-w-label font-medium leading-\[30px\]/,
    /asset\.iconKey/, /mt-auto flex h-\[56px\] w-\[1054px\]/,
  ]],
  [`${WEB}/src/pages/public/LoginPage.tsx`, '로그인: 라인박스 26/24/21 · 정책 구분자 4×21 @731', [
    /leading-\[26px\] text-ink-500/, /left-\[731px\] top-0 h-\[21px\] w-\[4px\]/,
  ]],
  [`${WEB}/src/components/shell/AuthFormScreen.tsx`, '인증 폼: 라인박스 실측(돌아가기·라벨 24 · 부제 21)', [
    /leading-\[24px\] text-ink-700/, /text-w-sub leading-\[21px\] text-ink-500/,
    /leading-\[24px\] text-ink-900/,
  ]],

  // ── 이용안내 1:17 (2026-09-03 "C안": Figma 좌표 체계 + 새 내용) ─────────
  // 카드 높이·카드2/3 의 y 는 내용에서 계산되므로 figma-audit 가 못 잡는다 →
  // **Figma 리듬 상수**를 여기서 고정한다. 이 값이 흔들리면 페이지가 시안에서 벗어난다.
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: Figma 리듬 상수(카드 1204@118 · 열 1055@190 · 제목+71 · 리드+120.32 · 첫블록+218 · 하단71 · 간격72)', [
    /const CARD_X = 118;/, /const CARD_W = 1204;/, /const COL_X = 190;/, /const COL_W = 1055;/,
    /const TITLE_DY = 71;/, /const LEAD_DY = 120\.32;/, /const FIRST_DY = 218;/,
    /const CARD_PAD_B = 71;/, /const CARD_GAP = 72;/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 배너 1204×69 @205 · 본문 20/40 tracking -0.2 · 제목 30/30', [
    /h-\[69px\] w-\[1204px\] rounded-\[10px\] border border-ink-400 bg-\[#f5f5f5\]\/50/,
    /top: Y\(BANNER_Y\)/, /text-\[20px\] leading-\[40px\] tracking-\[-0\.2px\]/,
    /text-w-page font-semibold leading-\[30px\] text-ink-900/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 비의료 고지 박스 1059×128 accent 10% · 문구 x227 w987 Bold', [
    /h-\[128px\] w-\[1059px\] rounded-\[10px\] border border-accent bg-accent\/10/,
    /left-\[227px\] w-\[987px\] text-\[20px\] font-bold leading-\[35px\]/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 법률 전문은 단독 페이지로 — 이용안내는 링크만 건다(중복 금지)', [
    /to="\/privacy"/, /to="\/terms"/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 카피(웹·앱 사용 흐름 + 비의료/AI 고지)', [
    /관리 웹 사용 방법/, /어르신 대화 앱 사용 방법/, /꼭 확인해 주세요/,
    /기억온은 의료기기가 아니며/,
    /AI 생성 질문·요약·번역에는 오류가 있을 수 있어/,
    /보호자는 요양보호사가 명시적으로 공개한 기록만 볼 수 있습니다\./,
    /한국어 원문을 AI로 번역한 보조본/,
  ], 'copy'],

  // ── 어르신 상세 161:373 ────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/ElderDetailPage.tsx`, '어르신 상세: 카드 좌표·크기(프로필 1057×340 · 기본정보 447×419 · 동의 575×419)', [
    /left=\{322\} top=\{343\.2\} width=\{1057\} height=\{340\.2\}/,
    /left=\{322\} top=\{718\.42\} width=\{447\} height=\{419\.25\}/,
    /left=\{804\} top=\{718\.42\} width=\{575\} height=\{419\.25\}/,
    /left=\{322\} top=\{1172\.69\} width=\{1057\} height=\{337\.2\}/,
    /left=\{322\} top=\{1544\.9\} width=\{1054\} height=\{336\.2\}/,
    /left=\{322\} top=\{1916\.12\} width=\{1054\} height=\{429\.25\}/,
    /left=\{322\} top=\{2380\.39\} width=\{1054\} height=\{564\.33\}/,
    /left=\{322\} top=\{2979\.74\} width=\{1054\} height=\{271\.16\}/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderDetailPage.tsx`, '어르신 상세: 사진 175 r100 · 이름 Bold 35/70 · 요약 박스 accent 5%', [
    /h-\[175px\] w-\[175px\] rounded-pill/, /text-\[35px\] font-bold leading-\[70px\]/,
    /h-\[239px\] w-\[319px\] rounded-\[10px\] bg-accent\/5/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderDetailPage.tsx`, '어르신 상세: 동의 행 452×62 mute-pale · 배지 live · 카드 액션 136×40', [
    /h-\[62px\] w-\[452px\] rounded-\[10px\] bg-mute-pale/,
    /bg-live-soft text-live/, /h-\[40px\] w-\[136px\][^"]*rounded-\[10px\] border border-accent/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderDetailPage.tsx`, '어르신 상세: 값 없으면 만들지 않는다 · 동의 문구는 core 카탈로그', [
    /const val = \(v\?: string \| null\) => \(v && v\.trim\(\) \? v : '—'\)/,
    /label="특이사항" value=\{val\(elder\.note\)\}/,
    /requiredConsents\('elder'\)/, /CONSENT_CATALOG\[type\]\.label/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderDetailPage.tsx`, '어르신 상세: 목록 표기는 달력 기준(relativeDay) · 날짜는 두 자리', [
    /relativeDay/, /String\(n\)\.padStart\(2, '0'\)/,
  ]],

  // ── 어르신 기본 정보 수정 178:486 ─────────────────────────────────────
  [`${WEB}/src/pages/caregiver/ElderEditPage.tsx`, '기본정보 수정: 카드 1057×1148 @(322,295) · 2열 폼(좌 410 · 우 873) 입력 416×57', [
    /h-\[1148px\] w-\[1057px\] rounded-\[10px\] bg-white shadow-card/,
    /left=\{410\} top=\{617\.4\}/, /left=\{873\} top=\{617\.4\}/,
    /h-\[57px\] rounded-\[10px\] border border-line bg-white/,
    /width = 416/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderEditPage.tsx`, '기본정보 수정: 사진 187×193 r14 + 카메라 53 · 출신지 돋보기 25', [
    /h-\[193px\] w-\[187px\] overflow-hidden rounded-\[14px\]/,
    /iconCamera/, /width=\{53\}/,
    /trailingIcon=\{\{ fx: '194:149', src: asset\.iconSearchField, size: 25, right: 27 \}\}/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderEditPage.tsx`, '기본정보 수정: 주요 기억 881×57 · 행 피치 74.05 · 취소/저장 140×57', [
    /w-\[881px\]/, /1059\.69 \+ i \* 74\.05/,
    /h-\[57px\] w-\[140px\][^"]*border border-accent bg-white/,
    /h-\[57px\] w-\[140px\][^"]*border border-accent bg-accent[^"]*text-white/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderEditPage.tsx`, '기본정보 수정: 주요 기억은 연대기(주제=주요 기억) · 특이사항은 profiles.note(500자, 비의료)', [
    /KEY_MEMORY_TOPIC.*from '@giokon\/core'/,
    /useCreateChronicle/, /useDeleteChronicle/,
    /id="f-note"[\s\S]{0,260}?maxLength=\{500\}/,
    /note: form\.note\.trim\(\) \|\| null/,
    /선호·주의할 점 등/,
  ]],

  // ── 연대기 목록 198:506 ────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/ElderChroniclesPage.tsx`, '연대기 목록: 카드 1057 @(324,318) shadow-card · 행 879×168.12 피치 192.14', [
    /const CARD_TOP = 318;/, /const ROW_TOP = 369\.27;/,
    /const ROW_H = 168\.12;/, /const ROW_PITCH = 192\.14;/,
    /left-\[324px\] w-\[1057px\] rounded-\[10px\] bg-white shadow-card/,
    /left-\[411px\] w-\[879px\] rounded-\[10px\] border border-line bg-white/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderChroniclesPage.tsx`, '연대기 목록: 출처 배지 h35 r-pill(AI=accent 10% · 사람=manual) · 연필 28 · 휴지통 27', [
    /h-\[35px\][^']*rounded-pill text-\[20px\] font-semibold/,
    /ai \? 'bg-accent-tint text-accent' : 'bg-manual-soft text-manual'/,
    /width: ai \? 95 : 124/,
    /iconPencilLg[\s\S]{0,120}?width=\{28\}/, /iconTrashLg[\s\S]{0,120}?width=\{26\.97\}/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderChroniclesPage.tsx`, '연대기 목록: 날짜 선택 170×37 r5 · 연대기 추가 879×77 테두리 accent', [
    /h-\[37\.03px\] w-\[170px\] rounded-\[5px\] border border-line/,
    /const ADD_H = 77\.06;/,
    /left-\[411px\] flex w-\[879px\] items-center justify-center rounded-\[10px\] border border-accent/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderChroniclesPage.tsx`, '연대기 목록: 주요 기억은 감춘다(폼이 관리) · 빈 상태를 만들어 두지 않는다', [
    /isKeyMemory\(c\.topic\)/, /아직 연대기 항목이 없습니다\./, /선택한 날짜에 기록된 연대기가 없습니다\./,
  ]],

  // ── 연대기 추가 196:271 · 상세 정보 198:991 (모달) ─────────────────────
  [`${WEB}/src/pages/caregiver/ChronicleDialog.tsx`, '연대기 모달: 카드 1054×841 r10 shadow-card · 제목 Bold 25/70 @(87,26)', [
    /w-\[1054px\][^"]*rounded-\[10px\] bg-white shadow-card/,
    /const cardH = 841;/,
    /left-\[87px\] top-\[26px\][^"]*text-w-section font-bold leading-\[70px\]/,
  ]],
  [`${WEB}/src/pages/caregiver/ChronicleDialog.tsx`, '연대기 모달: 작성자/유형 172×57 · 기록일 219×57 · 제목 879×57 · 내용 879×196.23', [
    /h-\[57\.07px\] w-\[172px\] rounded-\[10px\] border border-line/,
    /h-\[57\.07px\] w-\[219px\] rounded-\[10px\] border border-line/,
    /h-\[57\.07px\] w-\[879px\] rounded-\[10px\] border border-line/,
    /const CONTENT_H = 196\.23;/,
  ]],
  [`${WEB}/src/pages/caregiver/ChronicleDialog.tsx`, '연대기 모달: 카운터 오른끝 935 · 키워드 칩 h30 r-pill bg-mute · 취소/저장 140×57 @735', [
    /const COUNTER_RIGHT = 1054 - 935;/,
    /const TITLE_MAX = 50;/, /const CONTENT_MAX = 500;/,
    /h-\[30px\] shrink-0 items-center rounded-pill bg-mute pl-\[17px\] pr-\[17px\]/,
    /const btnTop = 735;/,
  ]],
  [`${WEB}/src/pages/caregiver/ChronicleDialog.tsx`, '연대기 모달: 작성자는 못 바꾼다(AI 투명성) · 유형은 core 표준 목록', [
    /작성자는 기록을 만든 주체라 바꿀 수 없어요\./,
    /CHRONICLE_TOPICS/,
  ]],

  // ── 어르신 등록 172:330 (모달) ─────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/ElderRegisterDialog.tsx`, '어르신 등록: 카드 1054×886 · 사진 업로드 187×193 r14 · 2열(입력 88/551 · 라벨 +1)', [
    /h-\[886px\] w-\[1054px\][^"]*rounded-\[10px\] bg-white shadow-card/,
    /h-\[193px\] w-\[187px\] overflow-hidden rounded-\[14px\] border border-line-soft bg-mute-pale/,
    /const COL = \{ inputL: 88, labelL: 89, inputR: 551, labelR: 552 \};/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderRegisterDialog.tsx`, '어르신 등록: 주요 기억 880×57 · 취소/저장 140×57 @776 · 등록 폼에 특이사항 없음', [
    /width=\{880\}/,
    /left-\[656px\] top-\[776px\] h-\[57px\] w-\[140px\]/,
    /left-\[826px\] top-\[776px\] h-\[57px\] w-\[140px\]/,
  ]],
  [`${WEB}/src/pages/caregiver/ElderRegisterDialog.tsx`, '어르신 등록: 사진은 행을 만든 뒤에 올린다(Storage 정책) · 주요 기억은 연대기로', [
    /uploadElderPhoto\(row\.id, photo\.file\)/,
    /topic: KEY_MEMORY_TOPIC/,
  ]],

  // ── 세션 목록 178:877 ──────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/SessionListPage.tsx`, '세션 목록: 카드 1054 @(322,315) · 첫 행 381 · shadow-card', [
    /const CARD_TOP = 315;/, /const ROW_TOP = 381;/,
    /left-\[322px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /actionLabel="대화 기록 보기"/,
  ]],
  // 행은 세션 목록(178:877)·대화 분석 목록(228:4628) 공용 부품이다.
  [`${WEB}/src/lib/session-row.ts`, '세션 행 실측: 높이 140 · 피치 180 · 소요 시간은 근거가 있을 때만', [
    /export const ROW_H = 140;/, /export const ROW_PITCH = 180;/,
    /export function durationLabel[\s\S]{0,220}?return null;/,
  ]],
  [`${WEB}/src/components/session-row.tsx`, '세션 행: 881×140 · 상대일+상태 한 줄 · 시계 22 · chevron 12.18 @1214.81', [
    /left-\[409px\] w-\[881px\] rounded-\[10px\] bg-white shadow-card/,
    /flex h-\[28px\] items-center gap-\[10px\]/,
    /iconClockSm/, /width=\{22\}/,
    /left: 1214\.81, top: top \+ 59\.28, width: 12\.18, height: 18\.73/,
  ]],
  [`${WEB}/src/components/session-row.tsx`, '세션 행: 상태는 근거가 있을 때만 · planned 는 설계됨', [
    /s\.status === 'planned' \? '설계됨' : '종료'/,
  ]],

  // ── 회상 세션 설계 196:272 (모달) ──────────────────────────────────────
  [`${WEB}/src/pages/caregiver/SessionPlanDialog.tsx`, '세션 설계: 제목 879×57 @(87,139.15) · 목표 @(87,252.27) · 소요 142×57 · 기록일 219×57 @(263,368.4)', [
    /left-\[87px\] h-\[57\.06px\] w-\[879px\]/,
    /h-\[57\.06px\] w-\[142px\]/, /h-\[57\.06px\] w-\[219px\]/,
    /top: 139\.15/, /top: 252\.27/, /top: 368\.4/,
  ]],
  [`${WEB}/src/pages/caregiver/SessionPlanDialog.tsx`, '세션 설계: 카운터 오른끝 935 · 제목50/목표200/내용500 · 소요 시간 선택지', [
    /const COUNTER_RIGHT = 1054 - 935;/,
    /const TITLE_MAX = 50;/, /const GOAL_MAX = 200;/, /const CONTENT_MAX = 500;/,
    /const DURATIONS = \[10, 15, 20, 30, 40\];/,
  ]],
  [`${WEB}/src/pages/caregiver/SessionPlanDialog.tsx`, '세션 설계: 저장하면 planned 세션이 된다(앱이 받는다)', [
    /status: 'planned'/, /avoid_topics:/, /planned_date:/, /duration_minutes:/,
  ]],

  // ── 세션 기록 178:787 ──────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/SessionsPage.tsx`, '세션 기록: 설명 한 줄 w723 · 검색 335×57 border #cccdce · 3번째 줄은 최근 대화', [
    /descMax=\{723\}/,
    /rounded-\[10px\] border border-line-mid bg-white pl-\[47px\]/,
    /gap-\[33px\]/, /<ElderPickerGrid/,
    /최근 대화  없음/,
  ]],
  // 카드는 세션 기록·요양일지·공개 관리 공용 부품이다.
  [`${WEB}/src/components/elder-picker.tsx`, '어르신 카드: 329×146 r10 shadow-card · 사진 101 @(18,22) · 글줄 134/30.42·60.44·86.47', [
    /h-\[146px\] w-\[329px\] rounded-\[10px\] bg-white shadow-card/,
    /left-\[18px\] top-\[22px\]/, /px=\{101\}/,
    /left-\[134px\] top-\[30\.42px\]/, /left-\[134px\] top-\[60\.44px\]/, /left-\[134px\] top-\[86\.47px\]/,
  ]],
  [`${WEB}/src/pages/caregiver/SessionsPage.tsx`, '세션 기록: 최근 대화는 세션에서 계산 · 없으면 만들지 않는다', [
    /useRecentSessions\(\{ enabled: isConfigured, fetchAll: true \}\)/,
    /최근 대화  없음/,
  ]],

  // ── 대화 기록 178:1052 ─────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/ConversationLogPage.tsx`, '대화 기록: 카드 1054 @(322,315) · 첫 말풍선 135 · 간격 57 · 좌우 여백 80', [
    /const CARD_TOP = 315;/, /const FIRST_TURN = 135;/, /const TURN_GAP = 57;/, /const SIDE = 80;/,
    /ml-\[322px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
  ]],
  [`${WEB}/src/pages/caregiver/ConversationLogPage.tsx`, '대화 기록: 말풍선 r15(꼬리 각짐) shadow-bubble · AI 흰색 / 어르신 accent 흰글자', [
    /rounded-\[15px\] rounded-tl-none bg-white[^"]*shadow-bubble/,
    /rounded-\[15px\] rounded-tr-none bg-accent[^"]*text-white shadow-bubble/,
    /const BUBBLE_MAX = 454;/, /const AVATAR = 52;/,
  ]],
  [`${WEB}/src/pages/caregiver/ConversationLogPage.tsx`, '대화 기록: 재생바는 녹음 없음(음성 저장 미구현 — 값을 만들지 않는다)', [
    /녹음 없음/, /h-\[57px\] w-\[369px\][^"]*rounded-\[10px\] border border-line-mid/,
  ]],

  // ── 분석(전체 종합) 225:1669 ──────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/AnalysisPage.tsx`, '분석: 카드1 1054×1885 @343 · 카드2 1054×1780 @2294 · 탭 22 · 기간 pill 127×30', [
    /h-\[1885px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[1780px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /text-w-nav font-semibold leading-\[30px\] text-accent/,
    /h-\[30px\] w-\[127px\] rounded-\[5px\] border border-ink-500\/30/,
  ]],
  [`${WEB}/src/pages/caregiver/AnalysisPage.tsx`, '분석: 틴트 카드(accent 3% + 30% 테두리 r5) · TOP5 트랙 707×12 · 축 카드 156×176', [
    /const TINT = 'absolute rounded-\[5px\] border border-accent\/30 bg-accent\/\[0\.03\]'/,
    /h-\[12px\] w-\[707px\] rounded-pill bg-accent-tint/,
    /h-\[176px\] w-\[156px\]/, /h-\[141px\] w-\[201px\]/, /h-\[174px\] w-\[271px\]/,
  ]],
  [`${WEB}/src/pages/caregiver/AnalysisPage.tsx`, '분석: 수치는 core 관찰 순수함수 · 근거 없으면 만들지 않는다', [
    /computeOverall/, /computeMonthlyTopicTrend/, /computeMonthlyAxisTrend/,
    /computeAxisObservations/, /computeTopicDetail/,
    /비교 근거 없음/,
  ]],
  // 카피는 **시안 그대로**(사용자 확정 2026-09-01) — 방향 낱말을 쓰되, 견줄 근거가
  // 없으면 방향을 만들지 않고 `—` 로 둔다(자리표시자 금지는 그대로다).
  [`${WEB}/src/pages/caregiver/AnalysisPage.tsx`, '분석: 시안 카피 유지(향상률·증가율) · 근거 없으면 방향 없음 · 관찰 지표 고지 상시', [
    /기억 회상 향상률/, /감정 표현 증가율/, /대화 참여도 향상률/, /응답 지속 시간 증가율/,
    /o\.delta >= 0 \? '▲ 향상' : '▼ 하락'/,
    /대화에서 직접 관찰된 지표입니다\(효능·향상 판정이 아닙니다\)/,
  ]],
  // ── 분석(개인별) 228:3722 ─────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/AnalysisEldersPage.tsx`, '개인별 분석: 카드 1054 @343 · 어르신 카드 301×161 3열(피치 323) · 검색 335×57', [
    /w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /const COL_X = \[375 - 322, 698 - 322, 1021 - 322\]/,
    /h-\[161px\] w-\[301px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[57\.06px\] w-\[335px\]/, /border border-line-mid/,
  ]],
  [`${WEB}/src/pages/caregiver/AnalysisEldersPage.tsx`, '개인별 분석: 활성 탭=개인별(밑줄 101×3 @598) · 사진 76 · 이름 Bold 25/70', [
    /h-\[3px\] w-\[101px\] bg-accent/, /left: 598/,
    /size="lg"/, /text-w-section font-bold leading-\[70px\]/,
  ]],
  [`${WEB}/src/pages/caregiver/AnalysisEldersPage.tsx`, '개인별 분석: 나이·성별·기관은 실데이터 — 없으면 만들지 않는다', [
    /useOrganization\(\{ enabled: isConfigured \}\)/,
    /e\.birthYear \? `\$\{e\.birthYear\}년생/, /: '—'/,
  ]],

  // ── 분석(개인별 종합) 228:4091 ────────────────────────────────────────
  [`${WEB}/src/components/analysis-comprehensive.tsx`, '개인별 종합: 카드1 1054×1143 @343 · 카드2 1054×1983 @1552 · 참여칸 271×174', [
    /h-\[1143px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[1983px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[174px\] w-\[271px\]/,
    /const C1 = 343/, /const C2 = 1552/,
  ]],
  [`${WEB}/src/components/analysis-comprehensive.tsx`, '개인별 종합: 값 SemiBold 35 + 단위 22 · 종합 평가 pill 225×32 r-pill · 표정 76', [
    /text-w-stat font-semibold leading-\[35px\]/, /text-\[22px\] font-normal leading-\[35px\]/,
    /h-\[32px\] w-\[225px\] rounded-pill bg-accent-tint/,
    /width: 76, height: 76/,
  ]],
  [`${WEB}/src/components/analysis-comprehensive.tsx`, '개인별 종합: 수치는 core 관찰 순수함수 · 근거 없으면 만들지 않는다', [
    /computeParticipationDetail/, /computeAxisObservations/, /computeMonthlyAxisTrend/,
    /computeTopicShares/, /observationSummary/, /axisAverage/,
    /비교 근거 없음/, /전체 평균과 견줄 관찰 기록이 아직 없습니다/,
  ]],
  // 종합 평가는 시안이 **긍정 상태 하나만** 그렸다 → 그 상태만 시안 문구를 쓰고,
  // 나머지 두 상태는 방향을 지어내지 않고 관찰된 비교 결과로 적는다.
  [`${WEB}/src/components/analysis-comprehensive.tsx`, '개인별 종합: 시안 카피 유지(향상·하락·매우 긍정적) · 없는 상태는 만들지 않음 · 관찰 지표 고지 상시', [
    /기억 회상 향상률/, /응답 지속 시간 증가율/,
    /o\.delta >= 0 \? '▲ 향상' : '▼ 하락'/,
    /'매우 긍정적'/, /전체 평균과 비슷하게 관찰됨/,
    /대화에서 직접 관찰된 지표입니다\(효능·향상 판정이 아닙니다\)/,
  ]],

  // ── 분석(대화 분석 목록) 228:4628 ─────────────────────────────────────
  [`${WEB}/src/pages/caregiver/ConversationAnalysisListPage.tsx`, '대화 분석 목록: 카드 1054 @343 · 첫 행 409 · 밑줄 81×3 @598 · 날짜 선택 170×37 @1205', [
    /const CARD_TOP = 343;/, /const ROW_TOP = 409;/,
    /h-\[3px\] w-\[81px\] bg-accent/, /left: 598/,
    /left-\[1205px\] h-\[37\.04px\] w-\[170px\]/,
    /actionLabel="대화 분석 보기"/,
  ]],

  // ── 분석(대화 분석 상세) 228:4430 ─────────────────────────────────────
  [`${WEB}/src/components/analysis-session.tsx`, '대화 분석 상세: 카드 1054×1347.8 @259.15 · 요약칸 271×147 · 특성칸 201×141 · 막대 593×12', [
    /h-\[1347\.8px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[147px\] w-\[271px\]/, /h-\[141px\] w-\[201px\]/,
    /const BAR_W = 593/, /h-\[12px\] overflow-hidden rounded-pill/,
    /h-\[38px\] items-center rounded-\[5px\] border border-accent\/30 bg-accent\/\[0\.03\] px-\[18px\]/,
  ]],
  [`${WEB}/src/components/analysis-session.tsx`, '대화 분석 상세: 감정은 관찰한 말투 묶음(밝음·차분·그리움) — 가치 판단을 만들지 않는다', [
    /computeEmotionSplit/, /describeSessionTraits/,
    /BAND_LABEL = \{ bright: '밝음', calm: '차분', longing: '그리움' \}/,
    /가장 많이 관찰된 말투는/,
    /어르신 발화 기록이 없어 말투를 셀 수 없습니다/,
    /대화에서 직접 관찰된 지표입니다\(효능·향상 판정이 아닙니다\)/,
  ]],

  // ── 요양일지(어르신 고르기) 205:1039 ──────────────────────────────────
  [`${WEB}/src/pages/caregiver/JournalPage.tsx`, '요양일지: 설명 한 줄 w918 · 카드 3열 gap 33 · 3번째 줄은 기관명', [
    /descMax=\{918\}/, /gap-\[33px\]/, /<ElderPickerGrid/,
    /org\.data\?\.name \?\? '—'/,
  ]],
  // ── 공개 관리(어르신 고르기) 135:1288 ─────────────────────────────────
  [`${WEB}/src/pages/caregiver/SharesPage.tsx`, '공개 관리: 설명 한 줄 w723 · 카드 3열 gap 33 · 3번째 줄은 기관명', [
    /descMax=\{723\}/, /gap-\[33px\]/, /<ElderPickerGrid/,
    /to=\{\(e\) => `\/caregiver\/shares\/\$\{e\.id\}`\}/,
    /org\.data\?\.name \?\? '—'/,
  ]],

  // ── 요양일지 목록 207:1147 ────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/JournalListPage.tsx`, '요양일지 목록: 카드 1057 @376 · 행 879×235.15 피치 259.164 · 배지 107×35 · 작성 버튼 185×57', [
    /const CARD_TOP = 376;/, /const ROW_TOP = 427\.27;/,
    /const ROW_H = 235\.15;/, /const ROW_PITCH = 259\.164;/,
    /left-\[410px\] w-\[879px\] rounded-\[10px\] border border-line bg-white/,
    /h-\[57px\] w-\[185px\][^"]*rounded-\[10px\] bg-accent/,
    /tone="journal"[\s\S]{0,20}tag/,
  ]],
  [`${WEB}/src/pages/caregiver/JournalListPage.tsx`, '요양일지 목록: 삭제는 확인 후 · 값 없는 날짜는 만들지 않는다', [
    /<ConfirmDialog$/m, /useDeleteCareJournal/, { absent: /window\.confirm\(/ },
    /if \(Number\.isNaN\(d\.getTime\(\)\)\) return '요양일지';/,
  ]],

  // ── 요양일지 작성 221:283 · 221:1060 · 221:1196 ────────────────────────
  [`${WEB}/src/pages/caregiver/JournalWritePage.tsx`, '요양일지 작성: 카드 1057×928 @295 · 방식 탭 262/261/262×57 @583.45 · 저장 140×57', [
    /h-\[928px\] w-\[1057px\] rounded-\[10px\] bg-white shadow-card/,
    /top: 288\.45, width: m\.w/,
    /key: 'typed'[\s\S]{0,140}left: 87/, /key: 'voice'[\s\S]{0,140}left: 396/, /key: 'photo'[\s\S]{0,140}left: 704/,
    /h-\[57px\] w-\[140px\] rounded-\[10px\] border border-accent bg-white/,
    /h-\[57px\] w-\[140px\] rounded-\[10px\] bg-accent/,
    /const SLOT = \{ w: 187, h: 193, top: 363, xs: \[87, 318, 549, 780\] \}/,
  ]],
  // W-4: 음성 인식·AI 초안이 실제로 붙었다. 결과를 **만들어 내지 않는 것**은 그대로다 —
  // 실패하면 이유를 말하고(조용한 실패 금지), 시각은 적은 만큼만 저장한다.
  [`${WEB}/src/pages/caregiver/JournalWritePage.tsx`, '요양일지 작성: STT·AI 초안 배선 · 조용한 실패 금지 · 저장→업로드→첨부 순서', [
    /transcribeAudio\(file, elderId\)/, /SttUnavailableError/,
    /buildJournalDraft\(\{/,
    /disabled=\{!content\.trim\(\) \|\| saving\}/,
    /uploadJournalPhoto\(elderId, file\)/, /addPhoto\.mutateAsync/,
    /await removeJournalPhotoFiles\(uploaded\)/,           // 첨부 실패 시 파일 되돌리기
    /URL\.revokeObjectURL/,                                 // 미리보기 URL 해제
    /activity_from: from \|\| null/, /activity_to: to \|\| null/,
    /const \[from, setFrom\] = useState\(''\);/,          // 시각 기본값을 지어내지 않는다
    { absent: /AI 초안은 실 연동 후 제공됩니다/ },
    { absent: /음성 인식 연동 전이라 아래 원문은 직접 적어 주세요/ },
  ]],
  [`${WEB}/src/lib/stt.ts`, '음성 인식: 서버 함수 경유 · 배포/키/권한 실패를 구분해 알린다', [
    /functions\.invoke<\{/, /'stt-transcribe'/,
    /status === 404/, /배포되지 않았어요/,
    /음성에서 텍스트를 찾지 못했어요/,   // 빈 결과를 성공으로 취급하지 않는다
  ]],
  [`${WEB}/src/lib/journalPhotos.ts`, '일지 사진: private 버킷 signed URL · 경로는 profile_id 로 시작 · 파일을 먼저 파기', [
    /const BUCKET = 'journal-photos'/, /createSignedUrls/,
    /\$\{profileId\}\//, /removeJournalPhotoFiles/,
  ]],

  // ── 공개 관리 상세 140:121 · 146:429 · 146:824 · 146:1067 ─────────────
  [`${WEB}/src/pages/caregiver/ShareItemsPage.tsx`, '공개 항목: 카드 1054 @343 · 행 922×235.14 피치 271.165 · 버튼 152×57 · 상태 배지 100', [
    /const ROW_TOP = 394\.24;/, /const ROW_H = 235\.14;/, /const ROW_PITCH = 271\.165;/,
    /left-\[388px\] w-\[922px\] rounded-\[10px\] border border-line bg-white/,
    /h-\[57px\] w-\[152px\] rounded-\[10px\] border border-accent bg-white/,
    /h-\[57px\] w-\[152px\][^"]*rounded-\[10px\] bg-accent/,
    /width: 100 \}/,
  ]],
  [`${WEB}/src/pages/caregiver/ShareItemsPage.tsx`, '공개 여부는 철회되지 않은 guardian_shares 로 판정 · 철회는 확인 후', [
    /map\.set\(shareKey\(s\.item_type, s\.item_id\), s\)/,
    { absent: /map\.set\(s\.item_id, s\.id\)/ },   // 유형 무시 키(요약↔분석 충돌) 재발 방지,
    /useCreateGuardianShare/, /useRevokeGuardianShare/, /<ConfirmDialog$/m,
    { absent: /window\.confirm\(/ },
    /공개할 수 있는 기록이 아직 없습니다/,
  ]],
  [`${WEB}/src/pages/caregiver/ShareHistoryPage.tsx`, '공개 이력: 카드 x=329(이 프레임만) · 머리글 81 · 작업 117×39 · 열 좌표 고정', [
    /const CARD_LEFT = 329;/, /const HEAD_H = 81;/,
    /h-\[39px\] w-\[117px\]/,
    /typeCenter: 422\.5/, /titleCenter: 591/, /atCenter: 742\.5/, /stateCenter: 906/, /viewedLeft: 1019/,
  ]],
  [`${WEB}/src/pages/caregiver/ShareHistoryPage.tsx`, '공개 이력: 보호자 확인 시각은 아직 기록하지 않는다 — 만들지 않는다', [
    /\{stamp\(s\.viewed_at\)\}/,
    /아직 공개한 기록이 없습니다/,
  ]],

  // ── 기관 관리 131:959 ─────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/OrgPage.tsx`, '기관 관리: 카드1 1054×360 @315 · 입력 576×57 · 저장 102×57 · 구성원 행 피치 122', [
    /h-\[360px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[57\.05px\] w-\[576px\]/, /h-\[57\.05px\] w-\[102px\] rounded-\[10px\] bg-accent/,
    /const MEMBER_PITCH = 122;/, /h-\[33px\] w-\[119px\] items-center justify-center rounded-pill/, /px=\{79\}/,
  ]],
  // 승인 대기 카드는 Figma 에 없다 — 카드2(구성원)의 실측 리듬을 그대로 쓴다.
  // 대기 건이 없으면 카드를 그리지 않고, 본인 요청은 스스로 승인하지 못한다.
  [`${WEB}/src/pages/caregiver/OrgPage.tsx`, '기관 관리: 승인 대기 카드(구성원 리듬 재사용) · 자가승인 차단', [
    /\{waiting\.length > 0 \? \(/,
    /const top = MEMBER_TOP \+ i \* MEMBER_PITCH;/,
    /selfRequest: a\.caregiver_user_id === me\.data\?\.id/,
    /본인 요청은 다른 담당자가 승인해요/,
    /useApproveCaregiverAssignment/, /useApproveGuardianLink/,
    /<ConfirmDialog$/m,
  ]],
  [`${WEB}/src/pages/caregiver/OrgPage.tsx`, '기관 관리: 이름 수정은 기관 관리자만 · 값이 없으면 만들지 않는다', [
    /const isAdmin = me\.data\?\.role === 'org_admin'/,
    /disabled=\{!isAdmin\}/, /기관 이름은 기관 관리자만 바꿀 수 있어요/,
    /org\.data\?\.id \?\? '—'/,
  ]],

  // ── 설정 121:598 ─────────────────────────────────────────────────────
  [`${WEB}/src/pages/caregiver/SettingsPage.tsx`, '설정: 카드 460/261/854/80 · 이름 576×57 · JSON 237×57 · 삭제 표 피치 122', [
    /h-\[460px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[261px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[80px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[57\.05px\] w-\[576px\]/, /h-\[57px\] w-\[237px\]/,
    /const RULE_PITCH = 122;/,
  ]],
  [`${WEB}/src/pages/caregiver/SettingsPage.tsx`, '설정: 계정 삭제는 셀프서비스 아님 · 값 없으면 만들지 않음 · 비의료 고지', [
    /삭제 요청은 기관 관리자/,
    /f\.value \?\? '—'/,
    /기억온은 의료기기가 아니며, 인지활동 보조 서비스입니다/,
  ]],

  // ── 보호자 어르신 연결 31:616 ─────────────────────────────────────────
  [`${WEB}/src/pages/guardian/ConnectPage.tsx`, '보호자 연결: 카드 457/559 · 입력 878×57 · 버튼 878×71 · 안내 원 94 · 화살표 14.25×22', [
    /h-\[457px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[559px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[57\.04px\] w-\[878px\]/, /h-\[71px\] w-\[878px\] rounded-\[10px\] bg-accent/,
    /h-\[94px\] w-\[94px\] items-center justify-center rounded-full bg-accent-tint/,
    /width: 14\.25, height: 22/,
  ]],
  [`${WEB}/src/pages/guardian/ConnectPage.tsx`, '보호자 연결: 어르신 코드 요청 + 승인 대기 상태를 그대로 말한다', [
    /useLinkGuardianByElderCode/, /useMyGuardianLinks/,
    /아직 연결된 어르신이 없어요/, /요양보호사의 승인을 기다리고 있어요/,
  ]],
  [`${WEB}/src/pages/guardian/ConnectPage.tsx`, '보호자 연결 후: 카드 340/559 · 사진 175 · 서브카드 319×239 · 세로 구분선 206', [
    /h-\[340px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /px=\{175\}/, /h-\[239px\] w-\[319px\] rounded-\[10px\] bg-accent\/\[0\.05\]/,
    /h-\[206px\] w-px bg-line/,
    /h-\[57px\] w-\[158px\] rounded-\[10px\] border border-accent bg-white/,
    /h-\[57px\] w-\[173px\] items-center rounded-\[10px\] bg-accent/,
  ]],
  [`${WEB}/src/pages/guardian/ConnectPage.tsx`, '여러 어르신 연결: 카드 1054×340 피치 406 · 사진 187 · 이름 35 · 나이·기관 Medium 24', [
    /cardTop: 347,\n  pitch: 406,\n  h: 340,/,
    /photo: \{ left: 86, top: 53, px: 187 \}/,
    /text-\[35px\] font-bold leading-\[70px\]/,
    /text-\[24px\] font-medium leading-\[30px\]/,
    /approved\.length > 1\) return <MultiConnectView/,
    /기관 이름은 우리가 읽을 수 있는 기관\(내 소속\)일 때만 쓴다/,
  ]],
  [`${WEB}/src/pages/guardian/ConnectPage.tsx`, '보호자 연결 후: 어르신 코드는 보호자에게 공개하지 않는다 · 해제는 확인 후', [
    /어르신 코드는 보호자에게 공개하지 않는다/,
    /useRevokeGuardianLink/, /<ConfirmDialog$/m, { absent: /window\.confirm\(/ },
  ]],
  // ── 보호자 공개된 소식 50:543 ─────────────────────────────────────────
  [`${WEB}/src/pages/guardian/FeedPage.tsx`, '공개된 소식: 카드 1054 @343 · 항목 피치 236 · 어르신 pill 322×57 · 담당 카드 1054×211', [
    /const ITEM_TOP = 387;/, /const ITEM_PITCH = 236;/,
    /h-\[211px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /h-\[50\.03px\] w-\[213px\]/,
  ]],
  [`${WEB}/src/pages/guardian/FeedPage.tsx`, '공개된 소식: 유형 매핑 · 원본이 없으면 그리지 않는다 · 메시지는 단방향', [
    /journal: \{ label: '요양일지'/, /analysis: \{ label: 'AI 회상 대화 요약'/,
    /photo: \{ label: '공유 사진'/, /report: \{ label: '관찰 포인트'/,
    /if \(!j\) continue;/, /메시지는 보호자 → 요양보호사 단방향이다/,
    /아직 공개된 소식이 없어요/,
  ]],
  [`${WEB}/src/pages/guardian/FeedPage.tsx`, '공개된 소식 탭: 부제·담당 카드는 탭마다 다르고 공유 사진은 2열 격자(394×486 · x 407/890 · 피치 536)', [
    /오늘도 어르신의 요양일지를 확인해보세요\./,
    /오늘도 어르신의 AI 회상 대화 요약을 확인해보세요\./,
    /오늘도 어르신의 활동 사진을 확인해보세요\./,
    /cols: \[407, 890\]/, /w: 394,\n  h: 486,/, /rowPitch: 536/, /photoH: 246/,
    /\{tab === 'all' \? \(/,
    /const PAGE = 4;/,
  ]],
  [`${WEB}/src/components/guardian-detail.tsx`, '보호자 상세 골격: 카드 432.33 · 안여백 86 · 첫 제목 46.67 · 본문 28.021 · 낱말 SemiBold + 구분자 Regular', [
    /export const CARD_TOP = 432\.33;/, /export const LINE = 28\.021;/,
    /export const BODY_DY = 64\.46;/, /export const PAD_X = 86;/, /export const PAD_TOP = 46\.67;/,
    /left: 322, top: Y\(190\), width: 12\.18, height: 18\.73/,
    /담당 요양보호사 : —/,
    /items\.length === 0 \? '—'/,
  ]],
  [`${WEB}/src/pages/guardian/JournalDetailPage.tsx`, '요양일지 상세: 섹션 간격 35.35 · 사진 281×177 3열(0/300/601)', [
    /const SEC_GAP = 35\.35;/, /w: 281, h: 177, xs: \[0, 300, 601\]/,
    /<SectionBody fx="50:1089" under pre width=\{690\}>/,
    /journal\?\.activity_from \|\| journal\?\.activity_to/,   // 활동 시간이 붙었다(W-4)
    { absent: /활동 요약은 아직 care_journals 에 칸이 없다/ },
    /공개된 활동 사진이 아직 없어요/,
  ]],
  [`${WEB}/src/pages/guardian/SummaryDetailPage.tsx`, '대화 요약 상세: 2열(704) · 인용 상자 876×118 · 간격 35.5/27.4/36', [
    /const COL2 = 704;/, /w: 876, h: 118, x: 37, y: 45\.72/,
    /gap=\{SEC_GAP\}/, /gap=\{27\.4\}/, /gap=\{36\}/,
    /bg-accent-tint/,
    /reaction === 'engaged' && t\.excerpt/,
    /minutes != null \? `약 \$\{minutes\}분` : '—'/,
  ]],
  [`${WEB}/src/pages/guardian/SettingsPage.tsx`, '보호자 설정: 카드 377/251/80 · 알림 행 · 버전은 package.json', [
    /const CARD1_TOP = 315;/, /const CARD2_TOP = 750;/, /const CARD3_TOP = 1058;/,
    /h-\[377px\] w-\[1054px\]/, /h-\[251px\] w-\[1054px\]/, /h-\[80px\] w-\[1054px\]/,
    /\{APP_VERSION\}/,
    /여는 화면이 디자인에 없고 알림 센터도 배선 전이라 아직 누를 수 없다/,
    /기억온은 의료기기가 아니며, 인지활동 보조 서비스입니다\./,
  ]],
  [`${WEB}/src/lib/version.ts`, '버전 표시는 package.json 이 근거다(시안의 v.1.0.0 은 예시)', [
    /__APP_VERSION__/, /자리표시자 금지/,
  ]],
  [`${WEB}/src/components/analysis-comprehensive.tsx`, '종합 분석 카드 2장 — 요양보호사·보호자 공용(카드 343/1552 · 콘텐츠 87/86)', [
    /export function ElderAnalysisCards/,
    /const C1 = 343;/, /const C2 = 1552;/, /const COL1 = 87;/, /const COL2 = 86;/,
    /요양보호사\(228:4091\)와 보호자\(96:94\)가 \*\*같은 화면\*\*/,
  ]],
  [`${WEB}/src/components/analysis-session.tsx`, '대화 분석 상세 카드 — 요양보호사·보호자 공용(카드 259.15 · 막대 593)', [
    /export function SessionAnalysisCard/,
    /const CARD_TOP = 259\.15;/, /const BAR_W = 593;/,
    /요양보호사\(228:4430\)와 보호자\(104:1830\)가 \*\*같은 카드\*\*/,
  ]],
  // 보호자가 여러 어르신에 연결된 경우 — 화면은 목록에서 고른 어르신을 본다.
  // 예전에는 전부 `links.find(approved)`(첫 어르신)라 둘째를 눌러도 같은 화면이 떴다.
  [`${WEB}/src/lib/guardianElder.ts`, '보호자 어르신 선택: URL(?elder=) 우선 · 승인 목록 안에서만', [
    /export const ELDER_PARAM = 'elder';/,
    /byId\(wanted\) \?\? byId\(readStored\(\)\) \?\? approved\[0\]/,
    /l\.status === 'approved'/,
    /export function feedHref/,
  ]],
  [`${WEB}/src/pages/guardian/ConnectPage.tsx`, '보호자 연결 목록: 카드가 그 어르신을 골라 소식으로 보낸다', [
    /to=\{feedHref\(link\.profile_id\)\}/,
    { absent: /to="\/guardian\/feed"/ },
  ]],
  [`${WEB}/src/pages/guardian/AnalysisPage.tsx`, '보호자 종합 분석: 탭 426/598 · 밑줄 81 @341 · 기간 pill 1249', [
    /left: 426, top: Y\(301\)/, /left: 598, top: Y\(301\)/,
    /h-\[3px\] w-\[81px\] bg-accent/,
    /<ElderAnalysisCards elderId=\{approvedLink\?\.profile_id\} months=\{months\} \/>/,
    /useGuardianElder\(\)/,,
  ]],
  [`${WEB}/src/pages/guardian/AnalysisSessionsPage.tsx`, '보호자 대화 분석 목록: 카드 343 · 행 458 피치 180 · 끝난 대화만', [
    /const CARD_TOP = 343;/, /const ROW_TOP = 458;/,
    /s\.status === 'ended'/, /withinMonths\(s\.ended_at \?\? s\.started_at, months\)/,
    /compact/, /actionLabel="대화 분석 보기"/,
  ]],
  [`${WEB}/src/pages/guardian/AnalysisSessionPage.tsx`, '보호자 대화 분석 상세: 돌아가기 343/화살표 322 · 카드 공용', [
    /left: 343, top: Y\(187\.11\)/, /left: 322, top: Y\(190\), width: 12\.18/,
    /<SessionAnalysisCard sessionId=\{sessionId\} \/>/,
  ]],
  [`${WEB}/src/components/share-settings.tsx`, '공개 기록 설정: 카드 1103×729(사진 있으면 841) · 카드 447/917 · 체크 27×28 · 행 피치 43', [
    /width: 1103, height: panelHeight/,
    /const cardCHeight = strip \? 320 : 209;/,
    /width: 447, height: 174/, /width: 917, height: cardCHeight/,
    /width: 27, height: 28/, /top=\{524 \+ i \* 43\}/,
    /type: isJournal \? 'journal' : 'session_summary'/,
    /type: 'photo', id: p\.id/,
    /고르지 않은 것은 공개하지 않는다/,
  ]],
  [`${WEB}/src/components/share-receipt.tsx`, '공개 이력 상세: 카드 1082×758 · 정보 카드 447/442×392 · 라벨 18 · 값 Medium 20', [
    /width: 1082, height: 758/,
    /width: 447, height: 392/, /width: 442, height: 392/,
    /text-\[18px\] leading-\[28px\] text-ink-700/,
    /text-w-body font-medium leading-\[28px\] text-ink-900/,
    /share\.viewed_at \? dateDotTime\(share\.viewed_at\) : '-'/,
    /share\.view_count > 0 \? `\$\{share\.view_count\}회` : '-'/,
  ]],
  [`${WEB}/src/components/guardian-header.tsx`, '보호자 머리: 인사말 이름만 주황 · pill 322×57 · 라벨 SemiBold 18(34/161)', [
    /안녕하세요, <span className="text-accent">/,
    /h-\[57px\] w-\[322px\] items-center rounded-\[10px\] border border-accent bg-white/,
    /left-\[34px\][^\n]*text-\[18px\] font-semibold leading-\[30px\] text-accent/,
    /left-\[161px\][^\n]*text-\[18px\] font-semibold leading-\[30px\] text-ink-900/,
  ]],
  [`${WEB}/src/components/guardian-message.tsx`, '메시지 이용 안내: 카드 868×758 · 제목 25 · 소제목 22 · 본문 20/35 · 체크박스 35', [
    /width: 868, height: 758/,
    /text-\[25px\] font-bold leading-\[30px\]/,
    /text-\[22px\] font-semibold leading-\[24px\]/,
    /lineHeight: '35px'/,
    /평일 오전 9:00 ~ 오후 18:00/,
    // 작성 단계는 Figma 에 없다 — 안내를 읽고 확인한 뒤에만 열리고, 보낸 뒤 수정·삭제가 없다.
    /\*\*작성 화면은 Figma 에 없다\*\*/,
    /const MAX = 1000;/,
    /useSendMessage/,
    /보낸 메시지는 수정하거나 지울 수\n\s*없습니다/,
  ]],
  [`${WEB}/src/components/shell/TopBar.tsx`, '보호자 셸 탑바: 검색 없음 · 벨 1080 · 아바타 1140', [
    /variant\?: 'caregiver' \| 'guardian'/,
    /guardian \? \{ bell: 1080, avatar: 1140, chevron: 219 \}/,
  ]],

  [`${WEB}/src/components/charts.tsx`, '그래프: 계열색은 theme · 근거 없는 달은 점을 찍지 않는다', [
    /webPalette\.series/, /v == null \? null/,
  ]],

  // ── 배포 하드닝(W-5) ───────────────────────────────────────────────────
  // CSP 는 route-smoke 가 배포 헤더를 그대로 씌워 **실제로 시험한다**(콘솔 오류 0건 판정).
  // 여기서는 문구가 지워지지 않았는지만 지킨다.
  [`${WEB}/vercel.json`, '배포 헤더: CSP(인라인 금지·supabase 만) · frame-ancestors none · nosniff', [
    /"default-src 'self'; script-src 'self'; style-src 'self';/,
    /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/,
    /frame-ancestors 'none'/, /X-Content-Type-Options/, /Strict-Transport-Security/,
    /Permissions-Policy/, /camera=\(\), microphone=\(\), geolocation=\(\)/,
    { absent: /unsafe-inline/ },   // React 는 CSSOM 으로 스타일을 쓴다 — 열어 둘 이유가 없다
    { absent: /unsafe-eval/ },
  ]],
  [`${WEB}/scripts/route-smoke.mjs`, '스모크: 배포 헤더를 씌워 CSP 를 실제로 시험한다', [
    /vercel\.json/, /page\.route\('\*\*\/\*'/, /deployHeaders/,
  ]],
  [`${WEB}/src/components/QueryErrorBanner.tsx`, '조회 실패를 "기록 없음" 으로 보이게 두지 않는다', [
    /role="alert"/, /기록이\s*\n?\s*없다는 뜻이 아닙니다/,
    /state\.status === 'error'/, /refetchQueries/,
  ]],
  [`${WEB}/src/pages/public/InquiryPages.tsx`, '문의 목록: 더보기 페이지네이션 · 실패는 재시도', [
    /const PAGE = 20;/, /useInquiryList\(limit/, /setLimit\(\(n\) => n \+ PAGE\)/,
    /list\.data\.total > items\.length/, /void list\.refetch\(\)/,
  ]],

  // ── 프리미티브 ─────────────────────────────────────────────────────────
  [`${WEB}/src/components/ui/Badge.tsx`, '배지: r-pill · SemiBold 18 · 높이 25/32 · 톤 7종', [
    /rounded-pill[^']*font-semibold text-w-sub/, /h-\[32px\]/, /h-\[25px\]/,
    /info: 'bg-info-soft text-info'/, /chronicle: 'bg-chronicle-soft text-chronicle'/,
    /live: 'bg-live-soft text-live'/,
  ]],
  [`${WEB}/src/components/ui/Button.tsx`, '버튼: r10 · size sm44/md57/lg71 · primary=accent', [
    /rounded-\[10px\] font-semibold/, /sm: 'h-\[44px\]/, /md: 'h-\[57px\]/, /lg: 'h-\[71px\]/,
    /primary: 'bg-accent text-white/,
  ]],
  [`${WEB}/src/components/ui/Avatar.tsx`, '아바타: 원형 40/50/76/99 · 사진 없으면 Figma 기본 에셋', [
    /sm: 40, md: 50, lg: 76, xl: 99/, /shape === 'circle' \? 'rounded-full' : 'rounded-\[10px\]'/, /asset\.avatarDefault/,
  ]],
  [`${WEB}/src/index.css`, '전역: Pretendard 자체 호스팅 · 흰 배경 · ink 본문', [
    /@font-face/, /PretendardVariable\.woff2/, /bg-white text-ink-700 antialiased/,
  ]],
];

// 패턴은 정규식(있어야 함) 또는 `{ absent: /…/ }`(없어야 함) 둘 중 하나다.
// 후자는 **제거한 것이 되살아나지 않는지** 본다 — 모바일 check:figma 와 같은 규약.
for (const [file, name, patterns, mode = 'code'] of SCREENS) {
  const text = mode === 'copy' ? flat(file) : src(file);
  if (!text) { fails.push({ section: '화면', name, detail: `파일 없음: ${file}` }); continue; }
  const missing = patterns.filter((p) => (p.absent ? false : !p.test(text)));
  const revived = patterns.filter((p) => p.absent && p.absent.test(text));
  const detail = [
    missing.length ? `누락 ${missing.map(String).join(' , ')}` : '',
    revived.length ? `되살아남(있으면 안 됨) ${revived.map((p) => String(p.absent)).join(' , ')}` : '',
  ].filter(Boolean).join(' / ');
  check('화면', name, missing.length === 0 && revived.length === 0, `[${file}] ${detail}`);
}

// ── 결과 ────────────────────────────────────────────────────────────────
if (fails.length > 0) {
  console.error('✗ 웹 디자인 스펙 불일치:\n');
  for (const f of fails) {
    console.error(`  [${f.section}] ${f.name}`);
    if (f.detail) console.error(`      ${f.detail}`);
  }
  console.error(`\n일치 ${ok} / 불일치 ${fails.length}\n기준: ${RUNBOOK}`);
  process.exit(1);
}
const migrated = new Set(SCREENS.map(([file]) => file)).size;
console.log(`✓ 웹 디자인 대조 통과 (${ok}개 항목 · 이관 파일 ${migrated}개)`);

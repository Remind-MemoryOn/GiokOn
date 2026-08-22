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
    try { cache.set(file, readFileSync(file, 'utf8')); } catch { cache.set(file, null); }
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
    /left-\[1045px\] top-\[69px\]/, /h-\[18px\] min-w-\[18px\][^"]*rounded-full bg-accent/,
    /left-\[1105px\] top-\[62px\]/, /width=\{40\}/, /height=\{40\}/,
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
  [`${WEB}/src/components/shell/AuthFormScreen.tsx`, '인증 폼: 공통 골격 좌표(187/287/325/431·560/672/793)', [
    /top: Y\(187\)/, /top: Y\(287\)/, /top: Y\(325\)/, /top: Y\(672\)/,
    /footerLink\.top \?\? 793/, /const STAR_TOP = \[386, 517\]/,
    /const FIELD_TOP = \[395, 524\]/, /const INPUT_TOP = \[431, 560\]/,
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
  [`${WEB}/src/components/shell/Sidebar.tsx`, '사이드바: 라벨 x=118(아이콘 28+26+20) · 로그아웃 하단 86', [
    /ml-\[28px\]/, /ml-\[20px\] text-w-nav/, /mb-\[86px\]/,
  ]],
  [`${WEB}/src/components/Layout.tsx`, '셸: 본문 세로 flex(하단 고정) · 하단 여백 88', [
    /flex min-w-0 flex-1 flex-col pb-\[88px\]/,
  ]],
  [`${WEB}/src/components/Layout.tsx`, '페이지 헤더: 설명 -3(제목 라인박스와 겹침) · 액션 @188 gap24', [
    /-mt-\[3px\] max-w-\[640px\]/, /gap-\[24px\] pt-\[19px\]/,
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

  // ── 이용안내 1:17 ─────────────────────────────────────────────────────
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 초안 배너 1204×69 @205 · 카드 1204×2221 @330 / 1204×1461 @2623', [
    /h-\[69px\] w-\[1204px\] rounded-\[10px\] border border-ink-400 bg-\[#f5f5f5\]\/50/,
    /top: Y\(205\)/, /h-\[2221px\] w-\[1204px\]/, /top: Y\(330\)/,
    /h-\[1461px\] w-\[1204px\]/, /top: Y\(2623\)/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 본문 20/40 tracking -0.2 · 좌열 190 통일 · 표 0.5px', [
    /text-\[20px\] leading-\[40px\] tracking-\[-0\.2px\]/, /absolute left-\[190px\]/,
    /border-\[0\.5px\] border-ink-400/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 비의료 고지 박스 1059×128 @2959 accent 10%', [
    /h-\[128px\] w-\[1059px\] rounded-\[10px\] border border-accent bg-accent\/10/, /top: Y\(2959\)/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 처리방침·약관 앵커(로그인 화면 링크 대상)', [
    /id="privacy"/, /id="terms"/, /id="contact"/,
  ]],
  [`${WEB}/src/pages/public/GuidePage.tsx`, '이용안내: 카피(Figma 문구)', [
    /개인정보 처리방침/, /이용약관/, /기억온은 의료기기가 아니며/,
    /대화는 사람이 아닌 AI가 진행하며, 화면에 그 사실을 표시합니다\./,
    /외부 법무 자문 검토 후 확정·시행됩니다/,
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
  [`${WEB}/src/pages/caregiver/ElderDetailPage.tsx`, '어르신 상세: 값 없으면 만들지 않는다(특이사항 미구현 · 동의 문구는 core 카탈로그)', [
    /const val = \(v\?: string \| null\) => \(v && v\.trim\(\) \? v : '—'\)/,
    /label="특이사항" value="—"/, /requiredConsents\('elder'\)/, /CONSENT_CATALOG\[type\]\.label/,
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
  [`${WEB}/src/pages/caregiver/ElderEditPage.tsx`, '기본정보 수정: 주요 기억은 연대기(주제=주요 기억) · 특이사항은 저장할 컬럼이 없어 잠근다', [
    /KEY_MEMORY_TOPIC.*from '@giokon\/core'/,
    /useCreateChronicle/, /useDeleteChronicle/,
    /id="f-note"[\s\S]{0,220}?disabled/,
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
  [`${WEB}/src/pages/caregiver/SessionListPage.tsx`, '세션 목록: 카드 1054 @(322,315) · 행 881×140 피치 180 · shadow-card', [
    /const CARD_TOP = 315;/, /const ROW_TOP = 381;/, /const ROW_H = 140;/, /const ROW_PITCH = 180;/,
    /left-\[322px\] w-\[1054px\] rounded-\[10px\] bg-white shadow-card/,
    /left-\[409px\] w-\[881px\] rounded-\[10px\] bg-white shadow-card/,
  ]],
  [`${WEB}/src/pages/caregiver/SessionListPage.tsx`, '세션 목록: 상대일+상태를 한 줄로(배지가 긴 라벨을 덮지 않게) · 시계 22 · chevron 12.18', [
    /flex h-\[28px\] items-center gap-\[10px\]/,
    /iconClockSm/, /width=\{22\}/,
    /width: 12\.18, height: 18\.73/,
  ]],
  [`${WEB}/src/pages/caregiver/SessionListPage.tsx`, '세션 목록: 소요 시간·상태는 근거가 있을 때만 · planned 는 설계됨', [
    /function durationLabel[\s\S]{0,220}?return null;/,
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
    /sm: 40, md: 50, lg: 76, xl: 99/, /rounded-full object-cover/, /asset\.avatarDefault/,
  ]],
  [`${WEB}/src/index.css`, '전역: Pretendard 자체 호스팅 · 흰 배경 · ink 본문', [
    /@font-face/, /PretendardVariable\.woff2/, /bg-white text-ink-700 antialiased/,
  ]],
];

for (const [file, name, patterns, mode = 'code'] of SCREENS) {
  const text = mode === 'copy' ? flat(file) : src(file);
  if (!text) { fails.push({ section: '화면', name, detail: `파일 없음: ${file}` }); continue; }
  const missing = patterns.filter((p) => !p.test(text));
  check('화면', name, missing.length === 0, `[${file}] 누락 ${missing.map(String).join(' , ')}`);
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

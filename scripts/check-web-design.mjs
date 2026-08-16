#!/usr/bin/env node
// 웹 디자인 대조 검사 (apps/web) — "완성된 디자인"이 코드에서 흐트러지지 않게 고정한다.
//
// 왜 필요한가: 웹 디자인은 이미 완성돼 있고(외주 핸드오프 스펙
// `docs/require/기억온_웹_디자인.md`), 이 저장소의 원칙은 **그 트랙 밖의 임의
// 재디자인 금지**다. 그런데 토큰·프리미티브·화면 카피는 코드 여러 곳에 흩어져 있어
// 리팩터링 한 번에 조용히 어긋난다. 모바일이 `check:figma`로 Figma 실측을 고정하듯,
// 웹은 이 검사로 **스펙 값이 코드에 실제로 존재하는지** 기계 검증한다.
//
// 검사 범위
//   1) 토큰 단일 소스   — @giokon/theme(palette·shadow·animation) ↔ 웹 tailwind.config 동일성
//                        + 스펙 문서의 HEX 사다리와 일치
//   2) 미정의 토큰 사용 — apps/web 이 팔레트에 없는 shade 를 쓰면 색이 조용히 사라진다
//                        (실제로 `text-warm-800`이 그랬다 → 2026-08-16 토큰 정의로 해소)
//   3) 프리미티브       — Button/Badge/Avatar/Card/Dialog/Input/Toast 의 치수·색·상태
//   4) 화면·라우팅      — 라우트 집합·접근 가드·사이드바 8항목·페이지 헤더 카피
//   5) 컴플라이언스     — 비의료 면책·AI 생성물 표시·안전장치 고지 상시 노출
//
// 스펙을 의도적으로 바꿀 때는 문서(SoT)와 이 표를 **함께** 갱신한다.
// 사용: node scripts/check-web-design.mjs   (pnpm check:design)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const WEB = 'apps/web';
const THEME = 'packages/theme/src/index.ts';
const SPEC_DOC = 'docs/require/기억온_웹_디자인.md';

const cache = new Map();
function src(file) {
  if (!cache.has(file)) {
    try {
      cache.set(file, readFileSync(file, 'utf8'));
    } catch {
      cache.set(file, null);
    }
  }
  return cache.get(file);
}
/** JSX 는 줄바꿈으로 카피가 쪼개지므로 공백을 접어서 비교한다. */
const flat = (file) => (src(file) ?? '').replace(/\s+/g, ' ');

let ok = 0;
const fails = [];
function check(section, name, passed, detail = '') {
  if (passed) ok++;
  else fails.push({ section, name, detail });
}

// ── 1) 토큰 단일 소스 ────────────────────────────────────────────────────
// 스펙 문서 §1-1·§1-2·§1-3 의 HEX 사다리(디자이너·개발 공통 기준).
const EXPECTED_PALETTE = {
  brand: {
    50: '#fdf7f0', 100: '#fbeede', 200: '#f6d8b3', 300: '#efbb81', 400: '#e89a52',
    500: '#dc7a2c', 600: '#c06223', 700: '#9c4d20', 800: '#7d3f20', 900: '#65351d',
  },
  warm: {
    50: '#fffaf3', 100: '#fef3e2', 200: '#fbe2c4', 300: '#f6cda0',
    400: '#eeb077', 500: '#e08e51', 600: '#c87436', 700: '#a35a2a', 800: '#854621',
  },
  cream: { 50: '#fffefb', 100: '#fff8ed', 200: '#fcefd9' },
};

/** `name: { 50: '#…', … }` 블록을 중괄호 균형으로 잘라 shade→hex 맵을 만든다. */
function colorMap(text, group) {
  const head = new RegExp(`(?:^|[^\\w-])${group}:\\s*\\{`, 'm').exec(text ?? '');
  if (!head) return null;
  const start = (text ?? '').indexOf('{', head.index);
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const out = {};
  for (const m of text.slice(start, end).matchAll(/(\d{2,3}):\s*'(#[0-9a-fA-F]{6})'/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const themeSrc = src(THEME);
const twSrc = src(`${WEB}/tailwind.config.js`);
check('토큰', '테마 토큰 파일 존재', Boolean(themeSrc), THEME);
check('토큰', '웹 tailwind.config 존재', Boolean(twSrc), `${WEB}/tailwind.config.js`);

for (const [group, expected] of Object.entries(EXPECTED_PALETTE)) {
  const inTheme = colorMap(themeSrc, group);
  const inTailwind = colorMap(twSrc, group);
  const fmt = (m) => JSON.stringify(m);
  check('토큰', `${group}: 스펙 HEX 사다리 = @giokon/theme`, inTheme && fmt(inTheme) === fmt(expected),
    `기대 ${fmt(expected)} / 실제 ${fmt(inTheme)}`);
  check('토큰', `${group}: @giokon/theme = 웹 tailwind.config (단일 소스 미러)`,
    inTheme && inTailwind && fmt(inTheme) === fmt(inTailwind),
    `theme ${fmt(inTheme)} / tailwind ${fmt(inTailwind)}`);
}

// 그림자·모션·폰트는 두 파일이 같은 문자열을 갖는지 대조한다.
function token(text, key) {
  const m = new RegExp(`'?${key}'?:\\s*'([^']+)'`).exec(text ?? '');
  return m ? m[1] : null;
}
for (const key of ['soft', 'warm', 'mic']) {
  const t = token(themeSrc, key);
  check('토큰', `shadow-${key} 정의·미러 일치`, Boolean(t) && t === token(twSrc, key),
    `theme "${t}" / tailwind "${token(twSrc, key)}"`);
}
check('토큰', 'shadow-soft 값(스펙 §4-1)',
  token(themeSrc, 'soft') === '0 2px 8px rgba(220, 122, 44, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)');
check('토큰', 'animate-fade-in-up = 0.3s ease-out both (웹 유일 진입 모션)',
  /'fade-in-up':\s*'fadeInUp 0\.3s ease-out both'/.test(themeSrc ?? '') &&
    /'fade-in-up':\s*'fadeInUp 0\.3s ease-out both'/.test(twSrc ?? ''));
check('토큰', 'fadeInUp 키프레임 = opacity 0 + translateY(10px) → 0',
  /translateY\(10px\)/.test(twSrc ?? '') && /translateY\(0\)/.test(twSrc ?? ''));
check('토큰', 'font-sans = Pretendard → Apple SD Gothic Neo → Noto Sans KR → system-ui',
  /"Pretendard".*"Apple SD Gothic Neo".*"Noto Sans KR".*system-ui/s.test(twSrc ?? ''));
check('토큰', '어르신 대형 타이포(elder-sm~2xl) 5단계 유지',
  ['elder-sm', 'elder-base', 'elder-lg', 'elder-xl', 'elder-2xl'].every((k) => (twSrc ?? '').includes(k)));

// 전역 스타일(스펙 §7)
check('토큰', '전역: body = slate-50 배경 / slate-900 텍스트 / antialiased / ss01',
  /@apply bg-slate-50 text-slate-900 antialiased;/.test(src(`${WEB}/src/index.css`) ?? '') &&
    /font-feature-settings: 'ss01';/.test(src(`${WEB}/src/index.css`) ?? ''));
check('토큰', '전역: html·body·#root height 100% + .scrollbar-hide 유틸',
  /html, body, #root \{\s*height: 100%;/.test(src(`${WEB}/src/index.css`) ?? '') &&
    /\.scrollbar-hide/.test(src(`${WEB}/src/index.css`) ?? ''));

// ── 2) 팔레트에 없는 shade 사용 차단 ─────────────────────────────────────
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'coverage']);
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIR.has(name)) walk(p, out);
    } else if (['.ts', '.tsx', '.css', '.html'].includes(extname(name))) {
      out.push(p);
    }
  }
  return out;
}
const UTIL = 'text|bg|border|ring|from|via|to|shadow|accent|divide|placeholder|decoration|outline|fill|stroke|caret';
const undefinedShades = [];
for (const file of walk(`${WEB}/src`)) {
  const text = src(file) ?? '';
  for (const m of text.matchAll(new RegExp(`\\b(?:${UTIL})-(brand|warm|cream)-(\\d{2,3})\\b`, 'g'))) {
    if (!EXPECTED_PALETTE[m[1]][m[2]]) {
      undefinedShades.push(`${file}: ${m[0]}`);
    }
  }
}
check('토큰', '미정의 shade 사용 없음(정의되지 않은 클래스는 색이 적용되지 않는다)',
  undefinedShades.length === 0, undefinedShades.slice(0, 8).join(' / '));

// ── 3~5) 스펙 표: [파일, 항목명, [정규식 …]] — 모두 매치해야 통과 ──────────
const P = `${WEB}/src`;
/** 카피(JSX 줄바꿈 무시)로 비교할 항목. */
const COPY_SPECS = [
  [`${P}/pages/LandingPage.tsx`, '랜딩: 히어로 2줄 + 둘째 줄 warm-600 강조', [
    /요양보호사가 설계하고,<br \/> <span className="text-warm-600">AI가 어르신과 대화합니다\.<\/span>/,
  ]],
  [`${P}/pages/LandingPage.tsx`, '랜딩: 역할 2카드(요양보호사=sky / 보호자=violet~rose)', [
    /bg-sky-100 text-sky-700/, /from-violet-50 to-rose-50/,
    /소셜 계정으로 시작하기/,
  ]],
  [`${P}/pages/LandingPage.tsx`, '랜딩: 어르신 무로그인 안내 + 태블릿 권장', [
    /<strong>어르신은 직접 로그인하지 않습니다\.<\/strong>/,
    /실제 시연은 태블릿\(아이패드·갤탭\) 가로 모드를 권장합니다\./,
  ]],
  [`${P}/pages/LoginPage.tsx`, '로그인: 탭 2종·이메일/비밀번호·소셜 구분선', [
    /로그인 · 회원가입/, /이메일 \(아이디\)/, /또는 소셜 계정으로 계속하기/,
    /max-w-md/,
  ]],
  [`${P}/pages/LoginPage.tsx`, '로그인: 검증 문구 5종(스펙 §2)', [
    /이메일\(아이디\)을 입력해 주세요\./, /비밀번호를 입력해 주세요\./,
    /비밀번호는 8자 이상이어야 합니다\./, /비밀번호가 일치하지 않습니다\./,
    /확인 메일을 보냈어요/,
  ]],
  [`${P}/components/SocialLoginButtons.tsx`, '소셜: 3종 브랜드 고정색·라벨·미설정 안내', [
    /bg-\[#FEE500\] text-\[#191919\]/, /bg-\[#03C75A\] text-white/,
    /구글로 계속하기/, /카카오로 계속하기/, /네이버로 계속하기/,
    /Supabase가 설정되지 않아 로그인할 수 없습니다\./,
  ]],
  [`${P}/pages/OnboardingPage.tsx`, '온보딩: 역할 2택(warm/violet)·필수 동의 2개·max-w-lg', [
    /border-warm-500 bg-warm-50/, /border-violet-500 bg-violet-50/,
    /<strong>\[필수\]<\/strong> 개인정보 수집·이용에 동의합니다\./,
    /accent-warm-600/, /max-w-lg/,
  ]],
  [`${P}/pages/FindIdPage.tsx`, '아이디 찾기: 결과 2상태(emerald 성공 / slate 미발견)', [
    /bg-emerald-50 border border-emerald-200 .*text-emerald-800/,
    /가입된 이메일:/, /일치하는 계정을 찾지 못했어요\./,
  ]],
  [`${P}/pages/ResetPasswordPage.tsx`, '비밀번호 재설정: KeyRound 버튼 + 성공 토스트', [
    /<KeyRound size=\{16\} \/>/, /비밀번호를 변경했어요\. 새 비밀번호로 로그인해 주세요\./,
  ]],
  [`${P}/pages/LegalPages.tsx`, '법적문서: 공용 레이아웃(max-w-3xl·시행예정일·초안 배너)', [
    /max-w-3xl/, /시행\(예정\)일:/, /border border-amber-200 bg-amber-50 .*text-amber-800/,
  ]],
  [`${P}/pages/LegalPages.tsx`, '약관 제2조: 비의료 고지 강조 박스(warm-50/200)', [
    /제2조 \(서비스의 성격 — 비의료 고지\)/,
    /font-semibold text-slate-900 bg-warm-50 border border-warm-200 rounded-lg/,
    /기억온은 의료기기가 아니며, 질병의 판정·의학적 소견 제공을 목적으로 하지 않습니다\./,
  ]],
  // 요양보호사 영역 — 페이지 헤더(제목·설명)는 스펙 §C 의 고정 카피다.
  [`${P}/pages/DashboardPage.tsx`, '대시보드: 헤더 + 통계 4카드 + 담당 어르신/최근 대화', [
    /title="대시보드"/,
    /description="기억온은 요양보호사가 설계한 세션을 AI가 어르신과 대화로 진행하고, 그 대화에서 새로운 연대기를 스스로 모아갑니다\."/,
    /'등록 어르신'/, /'준비된 세션'/, /'연대기 항목'/, /'AI 자동 축적'/,
    /담당 어르신/, /최근 대화/, /아직 등록된 어르신이 없습니다\./,
  ]],
  [`${P}/pages/EldersPage.tsx`, '어르신 관리: 헤더 + 액션 2버튼 + 빈 상태', [
    /title="어르신 관리"/,
    /description="연대기를 등록해 두면 AI가 그 정보를 바탕으로 대화를 이어갑니다\."/,
    /코드로 담당 추가/, /새 어르신 등록/, /아직 등록된 어르신이 없어요\./,
  ]],
  [`${P}/pages/LogsPage.tsx`, '세션 기록: 헤더 + 미연동/빈 상태', [
    /title="세션 기록"/,
    /description="앱에서 진행된 대화의 전문과 자동 분석을 확인할 수 있습니다\."/,
    /Supabase 연동 후 앱 대화 기록이 표시됩니다\./,
  ]],
  [`${P}/pages/AnalysisPage.tsx`, '분석: 헤더 + 필터 칩 + 실시간 표시', [
    /title="분석"/,
    /description="앱 대화가 끝나면 세션별 관찰 지표\(참여·응답·주제 반응\)가 실시간으로 도착합니다\."/,
    /실시간 반영/, /아직 도착한 분석이 없어요\./,
  ]],
  [`${P}/pages/CareJournalPage.tsx`, '요양일지: 헤더 + 입력 3탭 + AI 초안 확인 게이트', [
    /title="요양일지"/,
    /description="사진·음성·타이핑으로 기록하면 AI가 초안을 정리해 드려요\. 저장 전 꼭 확인해 주세요\."/,
    /AI 초안 만들기/, /초안은 자동 저장되지 않아요 — 확인·수정 후 직접 저장합니다\./,
    /확정 저장/, /초안으로 저장/,
  ]],
  [`${P}/pages/SharesPage.tsx`, '공개 관리: 헤더 + 공개/철회 토글 + 보호자 없음 경고', [
    /title="공개 관리"/,
    /description="오늘 공개할 일지·분석을 선택하세요\. 공개된 항목만 보호자에게 보이며, 언제든 철회할 수 있어요\."/,
    /보호자에게 공개했어요\. 언제든 철회할 수 있습니다\./,
    /공개를 철회했어요\. 보호자 화면에서 즉시 사라집니다\./,
    /아직 승인된 보호자 연결이 없어요\./,
  ]],
  [`${P}/pages/OrgPage.tsx`, '기관 관리: 헤더 + 기관/구성원 카드', [
    /title="기관 관리"/,
    /description="기관 정보와 구성원을 관리합니다\. 어르신 데이터는 기관에 귀속됩니다\."/,
  ]],
  [`${P}/pages/SettingsPage.tsx`, '설정: 헤더 + 이동권 다운로드 + 삭제 절차', [
    /title="설정" description="계정과 데이터 권리를 관리합니다\."/,
    /내 데이터 다운로드/, /JSON으로 다운로드/, /계정 삭제/,
  ]],
  [`${P}/pages/SettingsPage.tsx`, '설정: 로그인 수단 안내 = 이메일+소셜 병행(2026-08-16 갱신)', [
    /로그인은 이메일\(아이디\)\+비밀번호와 소셜 계정\(구글·카카오·네이버\)을 함께 지원합니다\./,
    /to="\/forgot-password"/,
  ]],
  [`${P}/pages/GuardianDashboardPage.tsx`, '보호자: 사이드바 없음·보라 그라데이션·단일 컬럼 max-w-3xl', [
    /from-violet-50 via-rose-50 to-cream-100/, /max-w-3xl mx-auto/,
    /연결된 어르신/, /공개된 소식/, /어르신 연결/,
    /연결을 요청했어요\. 요양보호사 승인 후 열람할 수 있습니다\./,
  ]],
  [`${P}/components/GuardianAccessCard.tsx`, '어르신 코드: 복사·교체 + 비소진 안내', [
    /코드 복사/, /코드 교체/, /코드는 소진되지 않아요\./,
    /어르신 코드를 복사했어요\./,
  ]],
  [`${P}/components/AgentPanel.tsx`, 'AI 도우미: 플로팅 버튼 + 실행 전 사람 확인 게이트', [
    /aria-label="AI 도우미 열기"/, /실행 확인 —/,
  ]],
];

/** 클래스·치수 등 원문 그대로 비교할 항목. */
const CODE_SPECS = [
  // ── 프리미티브 (스펙 §8) ───────────────────────────────────────────────
  [`${P}/components/ui/Button.tsx`, 'Button: 공통 클래스 + 브랜드 포커스 링', [
    /inline-flex items-center justify-center font-medium transition/,
    /disabled:opacity-50 disabled:cursor-not-allowed/,
    /focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2/,
  ]],
  [`${P}/components/ui/Button.tsx`, 'Button: variant 5종(primary·secondary·ghost·danger·outline)', [
    /bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm shadow-brand-500\/20/,
    /bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 shadow-sm/,
    /bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200/,
    /bg-red-500 text-white hover:bg-red-600 active:bg-red-700/,
    /border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100/,
  ]],
  [`${P}/components/ui/Button.tsx`, 'Button: size 4종(32/40/48/56px + 반경·gap)', [
    /sm: 'h-8 px-3 text-sm rounded-md gap-1\.5'/,
    /md: 'h-10 px-4 text-sm rounded-lg gap-2'/,
    /lg: 'h-12 px-5 text-base rounded-lg gap-2'/,
    /xl: 'h-14 px-7 text-lg rounded-xl gap-2\.5'/,
  ]],
  [`${P}/components/ui/Badge.tsx`, 'Badge: pill 기본형 + tone 6종(danger 없음, pink 포함)', [
    /inline-flex items-center rounded-full border px-2 py-0\.5 text-xs font-medium/,
    /neutral: 'bg-slate-100 text-slate-700 border-slate-200'/,
    /brand:\s*'bg-brand-50 text-brand-700 border-brand-100'/,
    /success: 'bg-emerald-50 text-emerald-700 border-emerald-100'/,
    /info:\s*'bg-sky-50 text-sky-700 border-sky-100'/,
    /warning: 'bg-amber-50 text-amber-700 border-amber-100'/,
    /pink:\s*'bg-pink-50 text-pink-700 border-pink-100'/,
  ]],
  [`${P}/components/ui/Avatar.tsx`, 'Avatar: 원형 4종(32/40/48/64) + 기본 살구색', [
    /rounded-full flex items-center justify-center font-semibold text-slate-900 shrink-0/,
    /sm: 'w-8 h-8 text-xs'/, /md: 'w-10 h-10 text-sm'/,
    /lg: 'w-12 h-12 text-base'/, /xl: 'w-16 h-16 text-xl'/,
    /color = '#fbb78c'/,
  ]],
  ['packages/core/src/utils.ts', 'Avatar 파생색: seed 해시 7색 팔레트(스펙 §1-6)', [
    /\['#fbb78c', '#a3d4b1', '#b1c8f0', '#f5b9c9', '#dabbf0', '#fbe294', '#9ad6d2'\]/,
    /return s \? s\.slice\(-2\) : '\?'/, // 이니셜 = 이름 마지막 2글자
  ]],
  [`${P}/components/ui/Card.tsx`, 'Card: 6파트(16px 반경·slate-100 구분선·1px 리프트)', [
    /bg-white rounded-2xl border border-slate-200\/80 shadow-\[0_1px_2px_rgba\(15,23,42,0\.04\)\]/,
    /'p-5 border-b border-slate-100'/, /'text-base font-semibold text-slate-900'/,
    /'text-sm text-slate-500 mt-1'/, /'p-5'/, /'px-5 py-4 border-t border-slate-100'/,
  ]],
  [`${P}/components/ui/Dialog.tsx`, 'Dialog: size 3종 + 백드롭 40%/blur + 70vh 스크롤', [
    /md: 'max-w-md'/, /lg: 'max-w-2xl'/, /xl: 'max-w-4xl'/,
    /bg-slate-900\/40 backdrop-blur-sm animate-fade-in-up/,
    /max-h-\[70vh\] overflow-y-auto/,
    /bg-slate-50\/60 rounded-b-2xl/,
  ]],
  [`${P}/components/ui/Dialog.tsx`, 'Dialog: ESC·백드롭 닫기 + body 스크롤 잠금 + 닫기 18px', [
    /e\.key === 'Escape'/, /document\.body\.style\.overflow = 'hidden'/,
    /<X size=\{18\} \/>/, /aria-label="닫기"/,
  ]],
  [`${P}/components/ui/Input.tsx`, 'Input/Textarea: 40px·88px + 브랜드 포커스 링', [
    /h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400/,
    /min-h-\[88px\] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 resize-y/,
    /focus:ring-2 focus:ring-brand-300 focus:border-brand-400/,
    /disabled:bg-slate-50 disabled:text-slate-400/,
  ]],
  [`${P}/components/ui/Input.tsx`, 'Field: 라벨·필수 별표·에러 우선 힌트', [
    /text-sm font-medium text-slate-700 mb-1\.5/,
    /<span className="text-red-500 ml-0\.5">\*<\/span>/,
    /text-xs text-red-500 mt-1/, /text-xs text-slate-500 mt-1/,
  ]],
  [`${P}/components/ui/Toast.tsx`, 'Toast: 우하단 스택(z-60·max-w-sm) + 3종 톤·아이콘', [
    /fixed bottom-4 right-4 z-\[60\] flex flex-col gap-2 max-w-sm/,
    /flex items-start gap-3 rounded-lg border shadow-sm px-3\.5 py-3 animate-fade-in-up/,
    /success: 'border-emerald-200 bg-emerald-50 text-emerald-900'/,
    /error: 'border-red-200 bg-red-50 text-red-900'/,
    /info: 'border-slate-200 bg-white text-slate-900'/,
    /<Icon size=\{18\}/, /<X size=\{14\} \/>/,
  ]],
  [`${P}/store/store.ts`, 'Toast: 3200ms 후 자동 소멸', [/dismissToast\(id\), 3200/]],

  // ── 라우팅·가드 (스펙 §2) ─────────────────────────────────────────────
  [`${P}/App.tsx`, '라우트: 공개 8종(랜딩·로그인·찾기 2·재설정·온보딩·법적 2)', [
    /path="\/" element=\{<LandingPage \/>\}/, /path="\/login"/, /path="\/find-id"/,
    /path="\/forgot-password"/, /path="\/reset-password"/, /path="\/onboarding"/,
    /path="\/privacy"/, /path="\/terms"/,
  ]],
  [`${P}/App.tsx`, '라우트: 요양보호사 영역 9종 + 보호자 1종', [
    /<Route index element=\{<DashboardPage \/>\} \/>/,
    /path="elders" element=\{<EldersPage \/>\}/,
    /path="elders\/:elderId" element=\{<ElderDetailPage \/>\}/,
    /path="logs" element=\{<LogsPage \/>\}/,
    /path="logs\/:logId" element=\{<LogDetailPage \/>\}/,
    /path="analysis" element=\{<AnalysisPage \/>\}/,
    /path="journal" element=\{<CareJournalPage \/>\}/,
    /path="shares" element=\{<SharesPage \/>\}/,
    /path="org" element=\{<OrgPage \/>\}/,
    /path="settings" element=\{<SettingsPage \/>\}/,
    /<GuardianGuard>\s*<GuardianDashboardPage \/>/,
  ]],
  [`${P}/App.tsx`, '라우트: 구 로그인 경로 리다이렉트 + 미매칭 → 랜딩', [
    /path="\/caregiver\/login" element=\{<Navigate to="\/login" replace \/>\}/,
    /path="\/guardian\/login" element=\{<Navigate to="\/login" replace \/>\}/,
    /path="\*" element=\{<Navigate to="\/" replace \/>\}/,
  ]],
  [`${P}/App.tsx`, '가드: loading 무렌더 → 미로그인 /login → 미온보딩 /onboarding → 역할 교차', [
    /if \(loading\) return null/,
    /if \(!session\) return <Navigate to="\/login" replace \/>/,
    /if \(!userRow \|\| !userRow\.onboarded_at\) return <Navigate to="\/onboarding" replace \/>/,
    /if \(userRow\.role === 'guardian'\) return <Navigate to="\/guardian" replace \/>/,
    /if \(userRow\.role !== 'guardian'\) return <Navigate to="\/caregiver" replace \/>/,
  ]],
  [`${P}/auth/routes.ts`, '로그인 후 도착지: 미온보딩→/onboarding, guardian→/guardian, 그 외→/caregiver', [
    /if \(!row \|\| !row\.onboarded_at\) return '\/onboarding'/,
    /return row\.role === 'guardian' \? '\/guardian' : '\/caregiver'/,
  ]],

  // ── 공용 레이아웃 (스펙 §C-0) ─────────────────────────────────────────
  [`${P}/components/Layout.tsx`, '사이드바: 폭 240px + 로고/사용자/네비/로그아웃', [
    /w-60 shrink-0 border-r border-slate-200 bg-white/,
    /요양보호사 화면/, /기관 관리자.*요양보호사/, /로그아웃/,
  ]],
  [`${P}/components/Layout.tsx`, '사이드바: 네비 8항목(경로·라벨·아이콘)', [
    /to: '\/caregiver',\s+label: '대시보드',\s+icon: Home, end: true/,
    /to: '\/caregiver\/elders',\s+label: '어르신 관리', icon: Users/,
    /to: '\/caregiver\/logs',\s+label: '세션 기록',\s+icon: FileText/,
    /to: '\/caregiver\/analysis', label: '분석',\s+icon: ChartColumn/,
    /to: '\/caregiver\/journal',\s+label: '요양일지',\s+icon: NotebookPen/,
    /to: '\/caregiver\/shares',\s+label: '공개 관리',\s+icon: Share2/,
    /to: '\/caregiver\/org',\s+label: '기관 관리',\s+icon: Building2/,
    /to: '\/caregiver\/settings', label: '설정',\s+icon: Settings/,
  ]],
  [`${P}/components/Layout.tsx`, '접근성: 본문 바로가기 스킵 링크(KWCAG)', [
    /href="#main-content"/, /sr-only focus:not-sr-only/, /본문으로 바로가기/,
    /id="main-content"/,
  ]],
  [`${P}/components/PageHeader.tsx`, 'PageHeader: 제목 2xl + 설명 + 우측 액션', [
    /text-2xl font-bold tracking-tight text-slate-900/,
    /text-sm text-slate-500 mt-1\.5 max-w-2xl/,
  ]],

  // ── 컴플라이언스 상시 노출 (스펙 §비의료 포지셔닝) ─────────────────────
  [`${P}/components/SafetyAlertsBanner.tsx`, '안전 알림: role=alert + 안전장치 고지 병기', [
    /role="alert"/, /aria-live="assertive"/,
    /키워드 기반 안전장치 — 의학적 판단이 아닙니다/,
    /확인이 필요한 안전 알림/,
  ]],
  [`${P}/components/AnalysisSummary.tsx`, '분석 요약: 관찰 지표 4개 + 하단 비의료 고지', [
    /응답률/, /참여도/, /어르신 발화/, /평균 발화 길이/,
    /대화에서 직접 관찰된 지표입니다\(효능·향상 판정이 아닙니다\)\. AI가 생성한 요약입니다\./,
  ]],
  [`${P}/pages/LogDetailPage.tsx`, '세션 상세: AI 생성물 표시(AI기본법 투명성)', [
    /AI 질문·요약은 AI가 생성한 내용입니다/,
  ]],
  [`${P}/pages/ElderDetailPage.tsx`, '어르신 상세: 안전 이벤트 이력 비의료 고지', [
    /키워드 기반 안전장치이며 의학적 판단이 아닙니다\./,
  ]],
];

for (const [file, name, patterns] of COPY_SPECS) {
  const text = flat(file);
  if (!text) {
    fails.push({ section: '화면', name, detail: `파일 없음: ${file}` });
    continue;
  }
  const missing = patterns.filter((p) => !p.test(text));
  check('화면', name, missing.length === 0, `[${file}] 누락 ${missing.map(String).join(' , ')}`);
}
for (const [file, name, patterns] of CODE_SPECS) {
  const text = src(file);
  if (!text) {
    fails.push({ section: '구현', name, detail: `파일 없음: ${file}` });
    continue;
  }
  const missing = patterns.filter((p) => !p.test(text));
  check('구현', name, missing.length === 0, `[${file}] 누락 ${missing.map(String).join(' , ')}`);
}

// 명칭 표기 규칙(스펙 부록): 서비스명 "기억온" · 영문 "GiokOn" · 워드마크 서브텍스트 고정.
check('화면', '명칭: 탭 제목이 기억온(GiokOn) — 다른 영문 로마자 표기 금지',
  /<title>기억온 \(GiokOn\)/.test(src(`${WEB}/index.html`) ?? '') &&
    !/GiEok|Gieok/.test(src(`${WEB}/index.html`) ?? ''));
check('화면', '명칭: 랜딩 워드마크 서브텍스트 "GiokOn · 회상 대화 AI"',
  /GiokOn · 회상 대화 AI/.test(flat(`${P}/pages/LandingPage.tsx`)));

// 스펙 문서 자체가 제자리에 있는지(디자인 SoT 유실 방지)
check('문서', '디자인 스펙 문서(SoT) 존재', Boolean(src(SPEC_DOC)), SPEC_DOC);

// ── 결과 ────────────────────────────────────────────────────────────────
if (fails.length > 0) {
  console.error('✗ 웹 디자인 스펙 불일치 — 완성된 디자인과 구현이 어긋났습니다:\n');
  for (const f of fails) {
    console.error(`  [${f.section}] ${f.name}`);
    if (f.detail) console.error(`      ${f.detail}`);
  }
  console.error(
    `\n일치 ${ok} / 불일치 ${fails.length}\n` +
      `기준 문서: ${SPEC_DOC} — 의도한 변경이라면 문서와 scripts/check-web-design.mjs 를 함께 갱신하세요.`,
  );
  process.exit(1);
}

console.log(`✓ 웹 디자인 스펙 대조 통과 (${ok}개 항목 — 토큰·프리미티브·화면·컴플라이언스)`);

#!/usr/bin/env node
// Figma 스펙 대조 검사 — 구현이 Figma 실측값을 유지하는지 확인한다.
//
// 왜 필요한가: 앱을 이 환경에서 렌더할 수 없으므로 "Figma 와 동일한가"를 눈으로 검증할 수
// 없다. 대신 각 화면의 **실측 수치(크기·색·라운드·폰트·그림자·간격)** 를 스펙으로 고정하고
// 구현 코드에 그 값이 실제로 존재하는지 기계적으로 검사한다. 값이 바뀌면 즉시 드러난다.
//
// 스펙 출처: Figma MCP `get_design_context` 결과(노드별 inset%→px 환산) +
// `assets/figma/*.png`(@4x) 실측. 화면 재적용 시 이 표를 함께 갱신한다.
//
// 사용: node scripts/check-figma-spec.mjs   (pnpm check:figma)

import { readFileSync } from 'node:fs';

const APP = 'apps/mobile';

/** [파일, 항목명, [정규식 …]] — 모든 정규식이 매치해야 통과. */
const SPECS = [
  // ── 메인 화면 (Figma 6:50, 프레임 393×1291) ────────────────────────────
  [`${APP}/app/main.tsx`, '메인: 헤더 워드마크 90×14', [/width: 90, height: 14/]],
  [`${APP}/app/main.tsx`, '메인: 설정 아이콘 18×19', [/width: 18, height: 19/]],
  [`${APP}/app/main.tsx`, '메인: 인사 SemiBold 24 / lh35', [/text-\[24px\] font-semibold/, /lineHeight: 35/]],
  [`${APP}/app/main.tsx`, '메인: 이름 주황 밑줄 h3', [/height: 3, backgroundColor: '#e9822b'/]],
  [`${APP}/app/main.tsx`, '메인: 검색 h46 r10 #cccdce', [/height: 46/, /borderRadius: 10/, /borderColor: '#cccdce'/]],
  [`${APP}/app/main.tsx`, '메인: 검색 안내 18px #7b7c7c', [/text-\[18px\]/, /placeholderTextColor="#7b7c7c"/]],
  [
    `${APP}/app/main.tsx`,
    '메인: 헤더 114-인셋 + 공용 그림자 · 워드마크 y78 / 설정 y75',
    [/height: HEADER_H - shift, boxShadow: HEADER_SHADOW/, /top: 78 - shift/, /left: 344, top: 75 - shift/],
  ],
  [
    `${APP}/app/main.tsx`,
    '메인: 하단바 h118 pb37 그림자 0 4 12 .25',
    [/height: 118/, /paddingBottom: 37/, /boxShadow: '0px 4px 12px rgba\(0,0,0,0\.25\)'/],
  ],
  [`${APP}/app/main.tsx`, '메인: 액션 버튼 158×57 r10', [/width: 158, height: 57, borderRadius: 10/]],
  [`${APP}/app/main.tsx`, '메인: 버튼 라벨 SemiBold 18 lh30', [/text-\[18px\] font-semibold/, /lineHeight: 30/]],
  [`${APP}/app/main.tsx`, '메인: 등록=주황 채움 / 분석=흰색+주황선', [/backgroundColor: '#e9822b'/, /backgroundColor: '#ffffff'/, /borderColor: '#e9822b'/]],

  // ── 어르신 카드 (Figma 48:19 계열) ─────────────────────────────────────
  [`${APP}/src/components/PatientCard.tsx`, '카드: 336비율 h146 r10', [/height: 146/, /borderRadius: 10/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: bg rgba(233,130,43,0.07)', [/rgba\(233,130,43,0\.07\)/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 그림자 1 1 8 .25 (elevation 미사용)', [/boxShadow: '1px 1px 8px rgba\(106,106,106,0\.25\)'/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 간격 26', [/marginBottom: 26/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 사진 101 원형 r63', [/width: 101/, /borderRadius: 63/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 이름 SemiBold 19 lh30', [/text-\[19px\] font-semibold/, /lineHeight: 30/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 메타 Medium 16', [/text-\[16px\] font-medium/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 화살표 34×34', [/width: 34, height: 34/]],
  [`${APP}/src/components/PatientCard.tsx`, '카드: 좌 18.5 / 우 24.5', [/paddingLeft: 18\.5/, /paddingRight: 24\.5/]],

  // ── 로그인 (Figma 130:161, 프레임 393×852) ─────────────────────────────
  [`${APP}/app/login.tsx`, '로그인: 입력 h44 #f4f4f4 r5', [/height: 44/, /backgroundColor: '#f4f4f4'/, /borderRadius: 5/]],
  [`${APP}/app/login.tsx`, '로그인: 버튼 h42 / 13px SemiBold', [/height: 42/, /text-\[13px\] font-semibold/]],
  [`${APP}/app/login.tsx`, '로그인: 링크 12px', [/text-\[12px\]/]],
  [`${APP}/app/login.tsx`, '로그인: 소셜 50×50', [/width: 50, height: 50/]],

  // ── 스플래쉬 (Figma 130:162) ───────────────────────────────────────────
  [`${APP}/app/index.tsx`, '스플래쉬: 그라데이션 #fff→#f4c398 @58%', [/'#f4c398'/, /locations=\{\[0, 0\.58, 1\]\}/]],
  [`${APP}/app/index.tsx`, '스플래쉬: 카피 Bold 16 주황', [/text-\[16px\] font-bold text-accent/]],
  [`${APP}/app/index.tsx`, '스플래쉬: 워드마크 208×32', [/width: 208, height: 32/]],


  // ── 대화 시작 전 (Figma 15:165) ────────────────────────────────────────
  [`${APP}/app/session/start.tsx`, '시작전: 로봇 195', [/RobotMascot size=\{195\}/]],
  [`${APP}/app/session/start.tsx`, '시작전: 타이틀 SemiBold 28 lh42', [/text-\[28px\] font-semibold/, /lineHeight: 42/]],
  [`${APP}/app/session/start.tsx`, '시작전: 이름 밑줄 h4 주황', [/height: 4, backgroundColor: '#e9822b'/]],
  [`${APP}/app/session/start.tsx`, '시작전: 부제 Medium 20 lh40', [/text-\[20px\] font-medium/, /lineHeight: 40/]],
  [`${APP}/app/session/start.tsx`, '시작전: 버튼 336×57 r10 (주황/외곽선)', [/width: 336, height: 57, borderRadius: 10, backgroundColor: '#e9822b'/, /borderColor: '#cccdce'/]],

  // ── 대화 (Figma 17:108) ───────────────────────────────────────────────
  [`${APP}/app/session/talk.tsx`, '대화: X 닫기 17×17 에셋', [/icon-close\.png/, /width: 17, height: 17/]],
  [`${APP}/app/session/talk.tsx`, '대화: 질문카드 336×258 r10 #fdf3ea + 주황 테두리', [/width: 336,\s*height: 258/, /backgroundColor: '#fdf3ea'/, /borderColor: '#e9822b'/]],
  [`${APP}/app/session/talk.tsx`, '대화: 질문 SemiBold 28 lh50', [/text-\[28px\] font-semibold/, /lineHeight: 50/]],
  [`${APP}/app/session/talk.tsx`, '대화: 파형 226', [/Waveform active=\{[^}]*\} width=\{226\}/]],
  [`${APP}/app/session/talk.tsx`, '대화: 마이크 123 + 상태', [/MicButton onPress=\{onMic\} state=\{micState\} size=\{123\}/]],
  [`${APP}/app/session/talk.tsx`, '대화: 라벨 Medium 23 lh42', [/text-\[23px\] font-medium/, /lineHeight: 42/]],
  [`${APP}/app/session/talk.tsx`, '대화: 다시듣기 336×57 + 스피커 에셋 20', [/icon-speaker\.png/, /width: 20, height: 20/]],
  [`${APP}/app/session/talk.tsx`, '대화: 인식결과 인라인(페이지 이동 없음)', [/AI가 이렇게 이해했어요/, /\{draft\.length\}\/\{UTTERANCE_MAX\}/]],

  // ── 질문 로딩 (Figma 28:37) ───────────────────────────────────────────
  [`${APP}/app/session/loading.tsx`, '로딩: 스피너 52 에셋(로봇 아님)', [/loading-indicator\.png/, /width: 52, height: 52/]],
  [`${APP}/app/session/loading.tsx`, '로딩: 문구 Medium 23 lh40 w289', [/text-\[23px\] font-medium/, /lineHeight: 40, width: 289/]],
  [`${APP}/app/session/loading.tsx`, '로딩: X 닫기 17×17', [/icon-close\.png/, /width: 17, height: 17/]],

  // ── 대화저장 (Figma 28:79) ────────────────────────────────────────────
  [`${APP}/app/session/saved.tsx`, '저장: 일러스트 164×179 에셋', [/saved-illustration\.png/, /width: 164, height: 179/]],
  [`${APP}/app/session/saved.tsx`, '저장: 문구 SemiBold 28 lh42', [/text-\[28px\] font-semibold/, /lineHeight: 42/]],
  [`${APP}/app/session/saved.tsx`, '저장: 버튼 336×57 r10 (주황/외곽선)', [/width: 336, height: 57, borderRadius: 10, backgroundColor: '#e9822b'/, /borderColor: '#cccdce'/]],

  // ── 공용 상세 헤더 (Figma 어르신 등록/연대기 수정 등, 0..114) ──────────
  [
    `${APP}/src/components/ScreenHeader.tsx`,
    '헤더: 높이 114 - 안전영역 인셋 (Figma y 좌표 보존)',
    [/HEADER_H = 114/, /height: HEADER_H - shift/],
  ],
  [
    `${APP}/src/components/ScreenHeader.tsx`,
    '헤더: 그림자 1 1 10 .13 (elevation 미사용)',
    [/HEADER_SHADOW = '1px 1px 10px rgba\(108,101,101,0\.13\)'/],
  ],
  [
    `${APP}/src/components/ScreenHeader.tsx`,
    '헤더: 뒤로 12.7×19.5 @ (28,74) 에셋',
    [/icon-back\.png/, /left: 28, top: 74 - shift/, /width: 12\.7, height: 19\.5/],
  ],
  [
    `${APP}/src/components/ScreenHeader.tsx`,
    '헤더: 제목 Medium 18 lh30 중앙 @ top 70',
    [/text-\[18px\] font-medium/, /top: 70 - shift, lineHeight: 30/],
  ],

  // ── 프로필 폼 프리미티브 (Figma 56:337 / 15:7) ─────────────────────────
  [
    `${APP}/src/components/form.tsx`,
    '폼: 입력 박스 336×46 r10 #f4f4f4 @ left 29',
    [/left: 29/, /fieldW: 336/, /fieldH: 46/, /fieldR: 10/, /fieldBg: '#f4f4f4'/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 라벨→박스 6 · 값 inset 16 · 카운터 inset 21',
    [/labelGap: 6/, /valueInset: 16/, /counterInset: 21/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 행 pitch 기본 25 · 주요기억 14',
    [/rowGap: 25/, /memoryGap: 14/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 라벨 SemiBold 20 lh30 + 필수 ✱ 8×8.25 에셋',
    [/text-\[20px\] font-semibold/, /icon-required\.png/, /width: 8, height: 8\.25/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 값 Regular 18 lh30 / 안내문구·카운터 Regular 16 (크기 다름)',
    [/valueClass = 'text-\[18px\] font-normal text-black'/, /text-\[16px\] font-normal text-muted/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 드롭다운 ∨ 14.14×9.54 @ 우측 21.9 · 검색 19×20.31 @ 우측 21',
    [/icon-chevron-down\.png/, /right: 21\.9, top: 18, width: 14\.14, height: 9\.54/, /icon-field-search\.png/, /width: 19, height: 20\.31/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 주요기억 삭제 X 13.7 · ＋ 16 @ 박스 내 left 18',
    [/icon-x-small\.png/, /width: 13\.7, height: 13\.7/, /icon-plus\.png/, /left: 18, top: 8/, /width: 16, height: 16/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 사진 126×130 r14 #f5f5f5 border #e3e3e3 + 아이콘 에셋 2종',
    [/w: 126, h: 130, r: 14, bg: '#f5f5f5', border: '#e3e3e3'/, /icon-photo-add\.png/, /icon-photo-edit\.png/],
  ],
  [
    `${APP}/src/components/form.tsx`,
    '폼: 저장하기 336×57 r10 #e9822b · SemiBold 18 lh30',
    [/width: FORM\.fieldW, height: 57, borderRadius: 10, backgroundColor: '#e9822b'/, /text-\[18px\] font-semibold text-white/],
  ],
  [
    `${APP}/src/components/ProfileForm.tsx`,
    '폼 화면: 라벨 pitch 108/107/107/107/108/107',
    [/ROW_GAPS = \[26, 25, 25, 25, 26, 25\]/],
  ],
  [
    `${APP}/src/components/ProfileForm.tsx`,
    '폼 화면: 사진 top 150(=114+36) · 사진→라벨 26 · 마지막→저장 62 · 하단 49',
    [/paddingLeft: 28, paddingTop: 36/, /PHOTO_TO_FIRST_LABEL = 26/, /CONTENT_TO_SAVE = 62/, /SAVE_TO_BOTTOM = 49/],
  ],
  [
    `${APP}/src/components/ProfileForm.tsx`,
    '폼 화면: 카운터 상한 10/25/30/30 (Figma 3/10·16/25·10/30·6/30)',
    [/MAX = \{ name: 10, family: 25, job: 30, hobbies: 30 \}/],
  ],
  [
    `${APP}/app/register.tsx`,
    '어르신 등록 = 폼 빈 상태(제목·초기값만 다름)',
    [/ProfileForm/, /title="어르신 등록"/, /initialMemories=\{\[\]\}/],
  ],
  [
    `${APP}/app/chronicle/[id].tsx`,
    '연대기 수정 = 폼 입력 상태(같은 화면)',
    [/ProfileForm/, /title="연대기 수정"/],
  ],

  // ── 브랜드 요소: 코드 드로잉이 아니라 에셋을 쓰는지 ────────────────────
  [`${APP}/src/components/brand.tsx`, '브랜드: 로봇/파형/마이크/워드마크 = 에셋', [/robot-mascot\.png/, /robot-inline\.png/, /waveform\.png/, /btn-mic\.png/, /wordmark\.png/]],
];

let ok = 0;
const fails = [];
for (const [file, name, patterns] of SPECS) {
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    fails.push({ name, file, missing: ['파일 없음'] });
    continue;
  }
  const missing = patterns.filter((p) => !p.test(src)).map(String);
  if (missing.length) fails.push({ name, file, missing });
  else ok++;
}

if (fails.length) {
  console.error('✗ Figma 스펙 불일치:\n');
  for (const f of fails) {
    console.error(`  ${f.name}  [${f.file}]`);
    for (const m of f.missing) console.error(`      누락: ${m}`);
  }
  console.error(`\n일치 ${ok} / 불일치 ${fails.length}`);
  process.exit(1);
}

console.log(`✓ Figma 스펙 대조 통과 (${ok}개 항목)`);

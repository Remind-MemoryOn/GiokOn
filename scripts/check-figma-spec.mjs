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
  [`${APP}/app/main.tsx`, '메인: 헤더 그림자 1 1 10 .13', [/boxShadow: '1px 1px 10px rgba\(108,101,101,0\.13\)'/]],
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

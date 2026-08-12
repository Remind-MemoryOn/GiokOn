#!/usr/bin/env node
// 폰트 누락 가드 — 모바일 앱의 모든 <Text>/<TextInput> 이 Pretendard 굵기 클래스를 갖는지 검사.
//
// 왜 필요한가: React Native 에는 CSS 폰트 상속이 없다. tailwind 에 `fontFamily.sans` 를
// 지정해도 각 Text 가 직접 폰트를 정하지 않으면 **시스템 폰트**(Android=Roboto/Noto CJK)로
// 렌더되어 Figma 디자인(Pretendard)과 확연히 달라진다. 실제로 이 누락 때문에 앱 텍스트
// 절반이 Roboto 로 표시됐다(2026-08-12). 그래서 CI 수준에서 강제한다.
//
// 통과 조건: `<Text`/`<TextInput` 의 className 에 다음 중 하나가 있어야 한다 —
//   font-normal · font-medium · font-semibold · font-bold · font-extrabold
// (tailwind.config.js 플러그인이 이 유틸을 굵기별 Pretendard 패밀리로 매핑한다.)

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'apps/mobile';
const FONT_RE = /\bfont-(normal|medium|semibold|bold|extrabold)\b/;
// <Text ...className="..."> / <TextInput ...className="..."> (여러 줄 허용, 다른 요소로 넘어가지 않음)
const TAG_RE = /<(Text|TextInput)((?:\s+[^<]*?)?)className="([^"]*)"/gs;
// className 이 아예 없는 경우도 잡는다(<Text> 또는 <Text\n  style=... > 형태)
const NO_CLASS_RE = /<(Text|TextInput)(\s+(?![^<]*className=)[^<]*?)?>/gs;

const files = globSync(`${ROOT}/**/*.tsx`, { exclude: (p) => p.includes('node_modules') });

let violations = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  for (const m of src.matchAll(TAG_RE)) {
    if (!FONT_RE.test(m[3])) {
      violations.push({ file, line: lineOf(m.index), tag: m[1], detail: `className="${m[3]}"` });
    }
  }
  for (const m of src.matchAll(NO_CLASS_RE)) {
    violations.push({ file, line: lineOf(m.index), tag: m[1], detail: 'className 없음' });
  }
}

if (violations.length > 0) {
  console.error('✗ 폰트 클래스 누락 — 시스템 폰트로 렌더되어 Figma 디자인과 달라집니다:\n');
  for (const v of violations.slice(0, 40)) {
    console.error(`  ${v.file}:${v.line}  <${v.tag}>  ${v.detail}`);
  }
  if (violations.length > 40) console.error(`  … 외 ${violations.length - 40}건`);
  console.error(
    `\n총 ${violations.length}건. 각 Text/TextInput 에 font-normal|medium|semibold|bold 중 하나를 추가하세요.`,
  );
  process.exit(1);
}

console.log(`✓ 폰트 클래스 검사 통과 (${files.length}개 파일의 Text/TextInput 모두 Pretendard 지정)`);

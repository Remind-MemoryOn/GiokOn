#!/usr/bin/env node
// MemoryOn(기억온) — 비의료 포지셔닝 카피 린트 (M9.6)
//
// 사용자 노출 카피(apps/*)에 의료 표현이 섞이지 않도록 강제한다. 기억온은
// "인지활동 보조·회상 대화·정서 지원" 서비스이며 의료기기·의료행위가 아니다.
// 치료/진단/완치/처방 등 의학적 단정은 앱스토어 건강정책·정부심사에서 위험하다.
//
// 스캔 대상: apps/**(소스). 제외: node_modules/dist/dist-audit/build/*.test.*.
// 예외 허용: 같은 줄에 `nonmedical-ok` 주석을 달면 통과(정당한 사용 명시).
//
// docs/*(정책 문서)는 금지어를 "설명"하기 위해 필연적으로 포함하므로 스캔하지 않는다.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['apps']
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])
// dist-audit 은 Figma 정밀 대조용 빌드 산출물이다(소스가 아니라 검사 대상이 아니다).
const SKIP_DIR = new Set(['node_modules', 'dist', 'dist-audit', 'build', '.next', 'coverage', '.expo'])
const ALLOW_MARK = 'nonmedical-ok'

// 의학적 단정(고신뢰). 단일 모호어(개선/예방)는 구(phrase)로 좁혀 오탐 방지.
const FORBIDDEN = [
  '치료',
  '진단',
  '완치',
  '처방',
  '치매를 예방',
  '치매 예방',
  '인지 개선',
  '인지기능 개선',
  '기억력 개선',
  '인지저하 예방',
  '증상을 완화',
]

function walk(dir, out) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (!SKIP_DIR.has(name)) walk(p, out)
    } else if (EXTS.has(extname(name)) && !/\.(test|spec)\./.test(name)) {
      out.push(p)
    }
  }
  return out
}

const violations = []
for (const root of ROOTS) {
  for (const file of walk(root, [])) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.includes(ALLOW_MARK)) return
      for (const term of FORBIDDEN) {
        if (line.includes(term)) {
          violations.push({ file, line: i + 1, term, text: line.trim().slice(0, 100) })
        }
      }
    })
  }
}

if (violations.length > 0) {
  console.error('✗ 비의료 포지셔닝 위반 — 사용자 카피에 의료 표현이 있습니다:')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ["${v.term}"]  ${v.text}`)
  }
  console.error(
    `\n총 ${violations.length}건. "인지활동 보조·회상 대화·정서 지원" 표현으로 바꾸거나,` +
      ` 정당한 사용이면 해당 줄에 ${ALLOW_MARK} 주석을 다세요.`,
  )
  process.exit(1)
}

console.log('✓ 비의료 포지셔닝 카피 린트 통과 (사용자 노출 카피에 의료 표현 없음)')

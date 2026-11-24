// 실행(저장소 루트): apps/voice-relay/node_modules/.bin/tsx --test ml/context-safety/tools/policy_eval.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { evaluate, GATE, oneHot, type GateCategory, type Prediction } from './policy_eval.ts'

const DEV = resolve(import.meta.dirname, '../data/dev/synthetic-v2.jsonl')
const rows = readFileSync(DEV, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const asPred = (scoresOf: (labels: Prediction['labels']) => Prediction['scores']): Prediction[] =>
  rows.map(r => ({ id: r.id, text: r.target.text, labels: r.labelsByAuthor, scores: scoresOf(r.labelsByAuthor) }))

test('정답 라벨을 점수로 넣으면 재현율 100% · 불필요 일시정지 0', () => {
  const r = evaluate(asPred(oneHot), 0.5, 0.5)
  for (const c of Object.keys(GATE) as GateCategory[]) {
    assert.ok(r.cat[c].n > 0, `${c} 대응 대상이 검증 자료에 있어야 한다`)
    assert.equal(r.cat[c].combined, r.cat[c].n, `${c} 미탐: ${r.cat[c].misses.join(' / ')}`)
  }
  assert.equal(r.falsePause, 0, r.falsePauses.join(' / '))
  assert.ok(r.passRecall && r.passPause)
})

test('모든 점수가 0이면(분류기가 아무것도 못 봄) 결과는 규칙만과 같다 — 해석 부족으로 멈추지도 않는다', () => {
  const zeros = (l: Prediction['labels']) => Object.fromEntries(Object.entries(oneHot(l)).map(([a, s]) => [a, Object.fromEntries(Object.keys(s).map(k => [k, 0]))]))
  const r = evaluate(asPred(zeros), 0.5, 0.5)
  for (const c of Object.keys(GATE) as GateCategory[]) assert.equal(r.cat[c].combined, r.cat[c].rule, c)
  assert.equal(r.falsePause, 0)
})

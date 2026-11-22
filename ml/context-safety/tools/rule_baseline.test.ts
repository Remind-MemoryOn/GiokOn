// 실행(저장소 루트): apps/voice-relay/node_modules/.bin/tsx --test ml/context-safety/tools/rule_baseline.test.ts
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { assessUtterance } from '../../../packages/core/src/safety.ts'
import { goldActionable, goldSurface, loadExamples, measure, rulePositive, type Labels } from './rule_baseline.ts'

const L = (over: Partial<Labels>): Labels => ({
  content: ['daily'], crisisCategory: ['none'], subject: 'self', tense: 'present', mode: 'direct',
  intent: 'unknown', interpretability: 'sufficient', ...over,
})

test('표면 기준은 과거·인용·부정도 양성, 대응 대상 기준은 본인·현재·직접만', () => {
  const past = L({ content: ['crisis_appeal'], crisisCategory: ['self_harm'], tense: 'past' })
  const quote = L({ content: ['crisis_appeal'], crisisCategory: ['abuse'], subject: 'other', mode: 'quote' })
  const negated = L({ content: ['crisis_appeal'], crisisCategory: ['self_harm'], mode: 'negated' })
  const now = L({ content: ['crisis_appeal'], crisisCategory: ['medical_emergency'] })
  assert.equal(goldSurface(past, 'self_harm'), true)
  assert.equal(goldActionable(past, 'self_harm'), false)
  assert.equal(goldActionable(quote, 'abuse'), false)
  assert.equal(goldActionable(negated, 'self_harm'), false)
  assert.equal(goldActionable(now, 'medical_emergency'), true)
  assert.equal(goldActionable(now, 'stop'), true)
  assert.equal(goldSurface(L({ content: ['sadness_grief'] }), 'stop'), false)  // 애도는 종료 대상 아님
})

test('규칙의 즉시 종료 판정 = escalate || hasDistressSignal (중계 relay.ts 와 같음)', () => {
  const restWithDistress = assessUtterance('너무 힘들어서 그만할래')
  assert.equal(restWithDistress.situation, 'rest_request')
  assert.equal(rulePositive(restWithDistress, 'stop'), true)
  assert.equal(rulePositive(restWithDistress, 'rest_request'), true)
  assert.equal(rulePositive(assessUtterance('국수 한 그릇 먹었어'), 'stop'), false)
  assert.equal(rulePositive(assessUtterance('숨을 쉴 수가 없어요'), 'medical_emergency'), true)
})

test('집계 — 미탐·오탐이 목록에 남는다', () => {
  const cells = measure([
    { id: 'a', text: '숨을 쉴 수가 없어요', labels: L({ content: ['crisis_appeal'], crisisCategory: ['medical_emergency'] }) },
    { id: 'b', text: '숨이 턱턱 막혀요', labels: L({ content: ['crisis_appeal'], crisisCategory: ['medical_emergency'] }) },
    { id: 'c', text: '옛날에 죽고 싶었던 적도 있어요', labels: L({ content: ['crisis_appeal'], crisisCategory: ['self_harm'], tense: 'past' }) },
  ], goldActionable)
  assert.deepEqual([cells.medical_emergency.tp, cells.medical_emergency.fn], [1, 1])
  assert.ok(cells.medical_emergency.misses[0].startsWith('b '))
  assert.deepEqual([cells.self_harm.tp, cells.self_harm.fp], [0, 1])  // 과거 회상 — 대응 대상 기준에서는 규칙 오탐
  assert.equal(cells.stop.fn, 1)
})

test('저장소 자료를 읽는다', () => {
  const train = loadExamples(resolve(import.meta.dirname, '../data'), 'train')
  assert.ok(train.length > 0)
  assert.ok(train.every(e => e.split === 'train'))
  assert.deepEqual(loadExamples(resolve(import.meta.dirname, '../data'), 'eval'), [])
})

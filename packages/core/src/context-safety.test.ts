import { describe, expect, it } from 'vitest'
import {
  CONTEXT_ACTION_SEVERITY, CONTEXT_CONTENT_LABELS, CONTEXT_CRISIS_LABELS, CONTEXT_INTENTS, CONTEXT_INTERPRETABILITY,
  CONTEXT_MODES, CONTEXT_SUBJECTS, CONTEXT_TENSES, decideContextSafety, ruleOnlyAction,
  type ClassifierOutcome, type ContextClassification, type ContextSafetyPolicy,
} from './context-safety'
import { assessUtterance } from './safety'

const POLICY: ContextSafetyPolicy = {
  version: 'test-policy', modelVersion: 'test-model',
  thresholds: { crisis: 0.5, distress: 0.5, crisisCategory: 0.5, closing: 0.5, qualifier: 0.5 },
}
const EXPECTED = { sessionId: 's1', turnId: 't1', inputRevision: 1 }

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>
const one = <K extends string>(keys: readonly K[], k: K) => ({ ...zeros(keys), [k]: 0.9 })

type Spec = {
  content?: (typeof CONTEXT_CONTENT_LABELS)[number][]
  crisis?: (typeof CONTEXT_CRISIS_LABELS)[number][]
  subject?: (typeof CONTEXT_SUBJECTS)[number]
  tense?: (typeof CONTEXT_TENSES)[number]
  mode?: (typeof CONTEXT_MODES)[number]
  intent?: (typeof CONTEXT_INTENTS)[number]
  interp?: (typeof CONTEXT_INTERPRETABILITY)[number]
}
function cls(s: Spec = {}, over: Partial<ContextClassification> = {}): ClassifierOutcome {
  const content = zeros(CONTEXT_CONTENT_LABELS)
  for (const c of s.content ?? ['daily']) content[c] = 0.9
  const crisisCategory = zeros(CONTEXT_CRISIS_LABELS)
  for (const c of s.crisis ?? ['none']) crisisCategory[c] = 0.9
  return {
    ok: true,
    result: {
      modelVersion: 'test-model', ...EXPECTED, content, crisisCategory,
      subject: one(CONTEXT_SUBJECTS, s.subject ?? 'self'), tense: one(CONTEXT_TENSES, s.tense ?? 'present'),
      mode: one(CONTEXT_MODES, s.mode ?? 'direct'), intent: one(CONTEXT_INTENTS, s.intent ?? 'unknown'),
      interpretability: one(CONTEXT_INTERPRETABILITY, s.interp ?? 'sufficient'), latencyMs: 10, ...over,
    },
  }
}
const decide = (text: string, classifier: ClassifierOutcome, expected = EXPECTED, policy = POLICY) =>
  decideContextSafety({ rule: assessUtterance(text), classifier, expected, policy })

// 규칙 입력 대표 문장(규칙 판정은 실제 assessUtterance 결과)
const RULE_CRISIS = '이제 그만 죽고 싶어'
const RULE_DISTRESS = '너무 힘들어서 못 견디겠어'
const RULE_REST = '오늘은 그만하고 싶어'
const RULE_REFUSAL = '그런 얘기 듣기 싫어'
const RULE_NONE = '옛날에 시장에서 장사를 했지'

const CRISIS_NOW: Spec = { content: ['crisis_appeal'], crisis: ['medical_emergency'] }
const FAILED: ClassifierOutcome = { ok: false, reason: 'timeout' }

describe('규칙 대표 문장 전제', () => {
  it('assessUtterance 판정이 테스트 전제와 같다', () => {
    expect(ruleOnlyAction(assessUtterance(RULE_CRISIS))).toBe('stop_immediately')
    expect(assessUtterance(RULE_DISTRESS).situation).toBe('distress')
    expect(assessUtterance(RULE_REST).situation).toBe('rest_request')
    expect(assessUtterance(RULE_REFUSAL).situation).toBe('refusal')
    expect(ruleOnlyAction(assessUtterance(RULE_NONE))).toBe('continue')
  })
})

describe('decideContextSafety — 진리표(사용자 확정 2026-11-13·14)', () => {
  it('D1 규칙 위기·급성 고통 → 즉시 종료: 분류기가 위험 낮음이든 실패든', () => {
    for (const c of [cls({ content: ['daily'] }), FAILED, cls(CRISIS_NOW)]) {
      expect(decide(RULE_CRISIS, c)).toMatchObject({ action: 'stop_immediately', reason: 'rule_crisis' })
      expect(decide(RULE_DISTRESS, c)).toMatchObject({ action: 'stop_immediately', reason: 'rule_distress' })
    }
  })

  it('규칙 휴식·거부 + 분류기 신호 없음 → 마무리(기존)', () => {
    expect(decide(RULE_REST, cls())).toMatchObject({ action: 'elder_closing', reason: 'rule_closing', closingSituation: 'rest_request', record: false })
    expect(decide(RULE_REFUSAL, cls())).toMatchObject({ action: 'elder_closing', reason: 'rule_closing', closingSituation: 'refusal' })
  })

  it('D3 규칙 미적중 + 분류기 위기·고통(본인·현재·직접) → 직원 확인 일시정지', () => {
    expect(decide(RULE_NONE, cls(CRISIS_NOW))).toMatchObject({
      action: 'staff_review_pause', reason: 'classifier_crisis_direct', record: true, classifierCrisisCategories: ['medical_emergency'],
    })
    expect(decide(RULE_NONE, cls({ content: ['acute_distress'] }))).toMatchObject({ action: 'staff_review_pause', reason: 'classifier_distress_direct' })
  })

  it('규칙 휴식·거부 + 분류기 위기·고통(본인·현재) → 일시정지 우선', () => {
    expect(decide(RULE_REST, cls(CRISIS_NOW))).toMatchObject({ action: 'staff_review_pause', reason: 'classifier_crisis_direct' })
  })

  it('Q5 분류기 실패 → 일시정지(규칙 휴식·거부 적중이어도), 실패 사유를 싣는다', () => {
    for (const reason of ['timeout', 'error', 'input_invalid'] as const) {
      expect(decide(RULE_NONE, { ok: false, reason })).toMatchObject({ action: 'staff_review_pause', reason: 'classifier_unavailable', failure: reason, modelVersion: null })
      expect(decide(RULE_REST, { ok: false, reason })).toMatchObject({ action: 'staff_review_pause', failure: reason })
    }
  })

  it('늦은 결과(다른 세션·턴·개정)·버전 불일치·점수 이상은 실패로 본다', () => {
    expect(decide(RULE_NONE, cls(), { ...EXPECTED, turnId: 't0' })).toMatchObject({ action: 'staff_review_pause', failure: 'stale' })
    expect(decide(RULE_NONE, cls(), { ...EXPECTED, inputRevision: 2 })).toMatchObject({ failure: 'stale' })
    expect(decide(RULE_NONE, cls(), { ...EXPECTED, sessionId: 's2' })).toMatchObject({ failure: 'stale' })
    expect(decide(RULE_NONE, cls({}, { modelVersion: 'other' }))).toMatchObject({ action: 'staff_review_pause', failure: 'version_mismatch' })
    const nan = cls(); if (nan.ok) nan.result.content.daily = Number.NaN
    expect(decide(RULE_NONE, nan)).toMatchObject({ action: 'staff_review_pause', failure: 'invalid_scores' })
    const missing = cls(); if (missing.ok) delete (missing.result.subject as Record<string, number>).self
    expect(decide(RULE_NONE, missing)).toMatchObject({ failure: 'invalid_scores' })
    const over = cls(); if (over.ok) over.result.tense.present = 1.5
    expect(decide(RULE_NONE, over)).toMatchObject({ failure: 'invalid_scores' })
  })

  it('Q3 위기·고통 후보 + 해석 부족·충돌·축 불명·범주 불명 → 일시정지', () => {
    for (const s of [
      { ...CRISIS_NOW, interp: 'insufficient' }, { ...CRISIS_NOW, interp: 'conflict' },
      { ...CRISIS_NOW, subject: 'unknown' }, { ...CRISIS_NOW, tense: 'unknown' }, { ...CRISIS_NOW, mode: 'unknown' },
      { content: ['crisis_appeal'], crisis: ['unknown'] }, { content: ['crisis_appeal'], crisis: ['none'] },
      { content: ['acute_distress'], interp: 'insufficient' },
    ] as Spec[]) {
      expect(decide(RULE_NONE, cls(s))).toMatchObject({ action: 'staff_review_pause', reason: 'classifier_ambiguous' })
    }
  })

  it('한 값 축의 최고 점수가 기준 미만·동점이면 불명으로 본다', () => {
    const low = cls(CRISIS_NOW); if (low.ok) low.result.tense = { ...zeros(CONTEXT_TENSES), present: 0.4 }
    expect(decide(RULE_NONE, low)).toMatchObject({ reason: 'classifier_ambiguous' })
    const tie = cls(CRISIS_NOW); if (tie.ok) tie.result.subject = { self: 0.6, other: 0.6, unknown: 0 }
    expect(decide(RULE_NONE, tie)).toMatchObject({ reason: 'classifier_ambiguous' })
  })

  it('범위 밖(어르신 발화 아님으로 보임) + 위기 후보 → 일시정지', () => {
    expect(decide(RULE_NONE, cls({ ...CRISIS_NOW, interp: 'out_of_scope' }))).toMatchObject({ action: 'staff_review_pause', reason: 'classifier_out_of_scope' })
  })

  it('Q4·가정/미래: 자해 관련은 과거·인용·부정·관용·가정·미래·타인이어도 일시정지', () => {
    for (const s of [{ tense: 'past' }, { mode: 'quote', subject: 'other' }, { mode: 'negated' }, { mode: 'idiom' },
      { mode: 'hypothetical', tense: 'future' }, { subject: 'other' }] as Spec[]) {
      expect(decide(RULE_NONE, cls({ content: ['crisis_appeal'], crisis: ['self_harm'], ...s }))).toMatchObject({
        action: 'staff_review_pause', reason: 'classifier_self_harm_context', classifierCrisisCategories: ['self_harm'],
      })
    }
  })

  it('Q4·가정/미래: 자해 외 위기·급성 고통의 과거·인용·부정·관용·가정·미래·타인 → 계속 + 기록', () => {
    for (const cat of ['medical_emergency', 'abuse'] as const) {
      for (const s of [{ tense: 'past' }, { mode: 'quote', subject: 'other' }, { mode: 'negated' }, { mode: 'idiom' },
        { mode: 'hypothetical', tense: 'future' }, { subject: 'other' }] as Spec[]) {
        expect(decide(RULE_NONE, cls({ content: ['crisis_appeal'], crisis: [cat], ...s }))).toMatchObject({
          action: 'continue', reason: 'classifier_context_logged', record: true,
        })
      }
    }
    expect(decide(RULE_NONE, cls({ content: ['acute_distress', 'reminiscence'], tense: 'past' }))).toMatchObject({ action: 'continue', record: true })
  })

  it('자해와 다른 범주가 함께면 자해 쪽(일시정지)', () => {
    expect(decide(RULE_NONE, cls({ content: ['crisis_appeal'], crisis: ['self_harm', 'abuse'], tense: 'past' }))).toMatchObject({ action: 'staff_review_pause' })
  })

  it('규칙 휴식·거부 + 분류기 비대응 위기(과거 등) → 기존 마무리 + 기록', () => {
    expect(decide(RULE_REST, cls({ content: ['crisis_appeal'], crisis: ['medical_emergency'], tense: 'past' }))).toMatchObject({
      action: 'elder_closing', reason: 'classifier_context_logged', record: true, closingSituation: 'rest_request',
    })
    expect(decide(RULE_REST, cls({ content: ['crisis_appeal'], crisis: ['self_harm'], tense: 'past' }))).toMatchObject({ action: 'staff_review_pause' })
  })

  it('분류기 단독 본인 거부·휴식 → 마무리 + 기록. 인용·과거는 아님', () => {
    expect(decide(RULE_NONE, cls({ content: ['refusal'] }))).toMatchObject({ action: 'elder_closing', reason: 'classifier_closing', closingSituation: 'refusal', record: true })
    expect(decide(RULE_NONE, cls({ content: ['rest_request'] }))).toMatchObject({ action: 'elder_closing', closingSituation: 'rest_request' })
    expect(decide(RULE_NONE, cls({ content: ['daily'], intent: 'end' }))).toMatchObject({ action: 'elder_closing', reason: 'classifier_closing' })
    expect(decide(RULE_NONE, cls({ content: ['daily'], intent: 'rest' }))).toMatchObject({ action: 'elder_closing' })
    expect(decide(RULE_NONE, cls({ content: ['rest_request', 'reminiscence'], subject: 'other', tense: 'past', mode: 'quote' }))).toMatchObject({ action: 'continue', reason: 'no_signal' })
  })

  it('애도·회상·일상·혼란·비응급 불편은 계속(애도는 정상)', () => {
    for (const content of [['sadness_grief', 'reminiscence'], ['daily'], ['confusion'], ['physical_discomfort'], ['unknown']] as Spec['content'][]) {
      expect(decide(RULE_NONE, cls({ content, intent: 'continue' }))).toMatchObject({ action: 'continue', reason: 'no_signal', record: false })
    }
    expect(decide(RULE_NONE, cls({ content: ['sadness_grief'], mode: 'idiom' }))).toMatchObject({ action: 'continue' })
  })

  it('결과에 정책·모델 버전을 싣는다', () => {
    expect(decide(RULE_NONE, cls())).toMatchObject({ policyVersion: 'test-policy', modelVersion: 'test-model' })
  })
})

describe('불변식 — 분류기를 더한 결과는 규칙만의 결과보다 약해지지 않는다(D1)', () => {
  // 결정적 의사 난수(재현 가능)
  let seed = 20261114
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const randScores = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map(k => [k, rand()])) as Record<K, number>
  const TEXTS = [RULE_CRISIS, RULE_DISTRESS, RULE_REST, RULE_REFUSAL, RULE_NONE, '숨을 쉴 수가 없어요', '너무 힘들어서 그만할래', '']

  it('무작위 분류기 출력 4,000건 × 규칙 문장 8개', () => {
    for (let i = 0; i < 4000; i++) {
      const outcome: ClassifierOutcome = rand() < 0.1 ? { ok: false, reason: 'error' } : {
        ok: true,
        result: {
          modelVersion: 'test-model', ...EXPECTED, latencyMs: 1,
          content: randScores(CONTEXT_CONTENT_LABELS), crisisCategory: randScores(CONTEXT_CRISIS_LABELS),
          subject: randScores(CONTEXT_SUBJECTS), tense: randScores(CONTEXT_TENSES), mode: randScores(CONTEXT_MODES),
          intent: randScores(CONTEXT_INTENTS), interpretability: randScores(CONTEXT_INTERPRETABILITY),
        },
      }
      for (const text of TEXTS) {
        const rule = assessUtterance(text)
        const d = decideContextSafety({ rule, classifier: outcome, expected: EXPECTED, policy: POLICY })
        expect(CONTEXT_ACTION_SEVERITY[d.action]).toBeGreaterThanOrEqual(CONTEXT_ACTION_SEVERITY[ruleOnlyAction(rule)])
        if (d.action === 'staff_review_pause') expect(d.record).toBe(true)
        if (!outcome.ok) expect(d.action === 'stop_immediately' || d.action === 'staff_review_pause').toBe(true)
      }
    }
  })
})

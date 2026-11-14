// ─────────────────────────────────────────────────────────────
// 전사 문맥 분류기 × 규칙 결합 정책 (CTX-CLS-S4)
//
// 규칙(`assessUtterance`)은 그대로 두고 분류기를 **더한다**(OR). 분류기는 규칙 적중을 무효로 하지 못한다.
// 이 함수는 순수 함수다 — 입출력만 있고 중계 동작(연결 종료·RPC)은 하지 않는다(중계 통합은 별도 작업).
//
// 사용자 확정(2026-11-13·14)
//  - D1 규칙 적중(위기·급성 고통) → 즉시 종료(기존). 규칙 휴식·거부 → 마무리(기존).
//  - D3 규칙 미적중 + 분류기 위기·고통(본인·현재·직접) → 직원 확인 일시정지.
//  - Q3 위기·고통 후보 + 해석 부족·충돌 → 직원 확인 일시정지.
//  - Q4·가정/미래 위기 내용이지만 과거·인용·부정·관용·가정·미래 → 자해 관련이면 일시정지, 그 밖은 계속 + 기록.
//  - Q5 분류기 실패(시간 초과·오류·입력 불량) → 직원 확인 일시정지(규칙 휴식·거부 적중이어도). '안전 통과'로 바꾸지 않는다.
//  - 규칙 휴식·거부 + 분류기 위기·고통 → 일시정지 우선.
//  - 분류기 단독 본인 거부·휴식 → 규칙과 같이 마무리.
//  - 어르신 발화가 아닌 것으로 보임(범위 밖) + 위기 후보 → 일시정지.
//  - 직원 확인 일시정지는 안전 사건 + 푸시로 남긴다(Q6 — 기록은 중계·DB 몫).
// 해석(이 파일에서 도출 — 위 결정의 적용): 주체·시점·표현 방식이 불명이거나 위기 범주를 정할 수 없으면 '해석 부족'(Q3).
// 결과의 세션·턴·입력 개정이 다르거나, 정책이 보정된 모델 버전과 다르거나, 점수가 비정상이면 '실패'(Q5).
// 개인 맥락은 입력이 아니다 — 행동을 약하게 만드는 통로가 되지 않게 한다(설계는 S6).
// ─────────────────────────────────────────────────────────────

import type { CrisisCategory, UtteranceAssessment } from './safety'
import type { ElderClosingSituation } from './session-phase'

export const CONTEXT_CONTENT_LABELS = [
  'crisis_appeal', 'acute_distress', 'sadness_grief', 'physical_discomfort', 'refusal',
  'rest_request', 'reminiscence', 'daily', 'confusion', 'unknown',
] as const
export type ContextContentLabel = (typeof CONTEXT_CONTENT_LABELS)[number]
export const CONTEXT_CRISIS_LABELS = ['self_harm', 'medical_emergency', 'abuse', 'none', 'unknown'] as const
export type ContextCrisisLabel = (typeof CONTEXT_CRISIS_LABELS)[number]
export const CONTEXT_SUBJECTS = ['self', 'other', 'unknown'] as const
export const CONTEXT_TENSES = ['present', 'past', 'future', 'unknown'] as const
export const CONTEXT_MODES = ['direct', 'quote', 'hypothetical', 'negated', 'idiom', 'unknown'] as const
export const CONTEXT_INTENTS = ['continue', 'switch', 'rest', 'end', 'unknown'] as const
export const CONTEXT_INTERPRETABILITY = ['sufficient', 'insufficient', 'conflict', 'out_of_scope'] as const
export type ContextSubject = (typeof CONTEXT_SUBJECTS)[number]
export type ContextTense = (typeof CONTEXT_TENSES)[number]
export type ContextMode = (typeof CONTEXT_MODES)[number]
export type ContextIntent = (typeof CONTEXT_INTENTS)[number]
export type ContextInterpretability = (typeof CONTEXT_INTERPRETABILITY)[number]

type Scores<K extends string> = Record<K, number>

/**
 * 분류기 결과 한 건. 점수는 검증 자료로 보정한 값(0~1)이다 — "위험 확률"·"임상 점수"로 표시하지 않는다.
 * 내용·위기 범주는 다중 라벨(값마다 독립), 나머지 축은 한 값(분포).
 */
export interface ContextClassification {
  /** 모델 + 토크나이저 + 라벨 규약 묶음 버전. */
  modelVersion: string
  sessionId: string
  turnId: string
  inputRevision: number
  content: Scores<ContextContentLabel>
  crisisCategory: Scores<ContextCrisisLabel>
  subject: Scores<ContextSubject>
  tense: Scores<ContextTense>
  mode: Scores<ContextMode>
  intent: Scores<ContextIntent>
  interpretability: Scores<ContextInterpretability>
  latencyMs: number
}

export type ClassifierFailure = 'timeout' | 'error' | 'input_invalid'
export type ClassifierOutcome = { ok: true; result: ContextClassification } | { ok: false; reason: ClassifierFailure }

/** 정책 묶음 — 임계값은 이 모델 버전의 검증 자료에서만 정한다(평가 자료 사용 금지). */
export interface ContextSafetyPolicy {
  version: string
  /** 임계값을 보정한 모델 버전. 결과의 modelVersion 과 다르면 실패로 본다. */
  modelVersion: string
  thresholds: {
    /** content.crisis_appeal */
    crisis: number
    /** content.acute_distress */
    distress: number
    /** crisisCategory 각 값 */
    crisisCategory: number
    /** content.refusal·rest_request, intent.rest·end */
    closing: number
    /** 한 값 축(주체·시점·표현 방식·의사·해석 가능성)의 최고 점수가 이보다 낮으면 'unknown' 으로 본다. */
    qualifier: number
  }
}

export type ContextSafetyAction = 'continue' | 'elder_closing' | 'staff_review_pause' | 'stop_immediately'

export type ContextSafetyReason =
  | 'rule_crisis'                  // 규칙 위기 → 즉시 종료(기존)
  | 'rule_distress'                // 규칙 급성 고통 → 즉시 종료(기존)
  | 'classifier_unavailable'       // 실패·늦은 결과·버전 불일치·점수 이상 → 일시정지(Q5)
  | 'classifier_crisis_direct'     // 본인·현재·직접 위기 → 일시정지(D3)
  | 'classifier_distress_direct'   // 본인·현재·직접 급성 고통 → 일시정지(D3)
  | 'classifier_ambiguous'         // 후보 있음 + 해석 부족·충돌·불명 → 일시정지(Q3)
  | 'classifier_out_of_scope'      // 후보 있음 + 어르신 발화 아님으로 보임 → 일시정지
  | 'classifier_self_harm_context' // 자해 관련의 과거·인용·부정·관용·가정·미래 → 일시정지(Q4)
  | 'classifier_context_logged'    // 그 밖의 과거·인용·부정·관용·가정·미래 → 계속(또는 규칙 마무리) + 기록(Q4)
  | 'rule_closing'                 // 규칙 휴식·거부 → 마무리(기존)
  | 'classifier_closing'           // 분류기 단독 본인 거부·휴식 → 마무리 + 기록
  | 'no_signal'                    // 대응할 신호 없음 → 계속

export type ClassifierFailureDetail = ClassifierFailure | 'stale' | 'version_mismatch' | 'invalid_scores'

export interface ContextSafetyDecision {
  action: ContextSafetyAction
  reason: ContextSafetyReason
  /** 분류기 판단을 기록해야 하는지(계속·마무리여도 남긴다). 일시정지는 늘 기록된다(안전 사건 — Q6). */
  record: boolean
  /** 마무리일 때 감독 화면에 남길 이유. */
  closingSituation?: ElderClosingSituation
  /** 분류기가 본 위기 범주(임계 이상). 일시정지 사건 초안·감독 화면용. */
  classifierCrisisCategories: CrisisCategory[]
  failure?: ClassifierFailureDetail
  policyVersion: string
  modelVersion: string | null
}

export interface ContextSafetyInput {
  rule: UtteranceAssessment
  classifier: ClassifierOutcome
  /** 이 판단이 승인할 턴 — 다른 턴·이전 개정의 결과가 승인하지 못하게. */
  expected: { sessionId: string; turnId: string; inputRevision: number }
  policy: ContextSafetyPolicy
}

/** 행동의 세기. 분류기를 더한 결과는 규칙만의 결과보다 약해지지 않는다(테스트 불변식). */
export const CONTEXT_ACTION_SEVERITY: Record<ContextSafetyAction, number> = {
  continue: 0, elder_closing: 1, staff_review_pause: 2, stop_immediately: 3,
}

/** 분류기가 없을 때(현재 중계)의 행동 — relay.ts 의 판정과 같다. */
export function ruleOnlyAction(rule: UtteranceAssessment): ContextSafetyAction {
  if (rule.escalate || rule.hasDistressSignal) return 'stop_immediately'
  if (rule.situation === 'rest_request' || rule.situation === 'refusal') return 'elder_closing'
  return 'continue'
}

const REAL_CATEGORIES: readonly CrisisCategory[] = ['self_harm', 'medical_emergency', 'abuse']

function validScores(scores: unknown, keys: readonly string[]): boolean {
  if (!scores || typeof scores !== 'object') return false
  const s = scores as Record<string, unknown>
  return keys.every(k => typeof s[k] === 'number' && Number.isFinite(s[k]) && (s[k] as number) >= 0 && (s[k] as number) <= 1)
}

function validClassification(r: ContextClassification): boolean {
  return validScores(r.content, CONTEXT_CONTENT_LABELS) && validScores(r.crisisCategory, CONTEXT_CRISIS_LABELS)
    && validScores(r.subject, CONTEXT_SUBJECTS) && validScores(r.tense, CONTEXT_TENSES) && validScores(r.mode, CONTEXT_MODES)
    && validScores(r.intent, CONTEXT_INTENTS) && validScores(r.interpretability, CONTEXT_INTERPRETABILITY)
}

/** 한 값 축의 값 — 최고 점수가 기준보다 낮거나 동점이면 'unknown'(해석 가능성 축은 'insufficient'). */
function pick<K extends string>(scores: Scores<K>, keys: readonly K[], min: number, fallback: K): K {
  let best: K = fallback, top = -1, tie = false
  for (const k of keys) {
    if (scores[k] > top) { best = k; top = scores[k]; tie = false } else if (scores[k] === top) tie = true
  }
  return top < min || tie ? fallback : best
}

export function decideContextSafety(input: ContextSafetyInput): ContextSafetyDecision {
  const { rule, classifier, expected, policy } = input
  const t = policy.thresholds
  const base = { policyVersion: policy.version, modelVersion: classifier.ok ? classifier.result.modelVersion : null }
  const decision = (action: ContextSafetyAction, reason: ContextSafetyReason, extra: Partial<ContextSafetyDecision> = {}): ContextSafetyDecision =>
    ({ action, reason, record: action === 'staff_review_pause', classifierCrisisCategories: [], ...base, ...extra })

  // 1. 규칙 위기·급성 고통 — 분류기 결과와 무관하게 기존 즉시 종료(D1). 분류기가 위험 낮음이어도, 실패여도.
  if (rule.escalate) return decision('stop_immediately', 'rule_crisis')
  if (rule.hasDistressSignal) return decision('stop_immediately', 'rule_distress')
  const ruleClosing: ElderClosingSituation | null =
    rule.situation === 'rest_request' || rule.situation === 'refusal' ? rule.situation : null

  // 2. 분류기 결과를 믿을 수 있는가 — 아니면 실패(Q5). 규칙 휴식·거부 적중이어도 일시정지.
  let failure: ClassifierFailureDetail | null = null
  if (!classifier.ok) failure = classifier.reason
  else {
    const r = classifier.result
    if (r.sessionId !== expected.sessionId || r.turnId !== expected.turnId || r.inputRevision !== expected.inputRevision) failure = 'stale'
    else if (r.modelVersion !== policy.modelVersion) failure = 'version_mismatch'
    else if (!validClassification(r)) failure = 'invalid_scores'
  }
  if (failure || !classifier.ok) return decision('staff_review_pause', 'classifier_unavailable', { failure: failure ?? 'error' })
  const r = classifier.result

  const crisis = r.content.crisis_appeal >= t.crisis
  const distress = r.content.acute_distress >= t.distress
  const categories = REAL_CATEGORIES.filter(c => r.crisisCategory[c] >= t.crisisCategory)
  const subject = pick(r.subject, CONTEXT_SUBJECTS, t.qualifier, 'unknown')
  const tense = pick(r.tense, CONTEXT_TENSES, t.qualifier, 'unknown')
  const mode = pick(r.mode, CONTEXT_MODES, t.qualifier, 'unknown')
  const interpretability = pick(r.interpretability, CONTEXT_INTERPRETABILITY, t.qualifier, 'insufficient')
  const withCats = { classifierCrisisCategories: categories }

  // 3. 위기·고통 신호가 있다.
  if (crisis || distress) {
    if (interpretability === 'insufficient' || interpretability === 'conflict') return decision('staff_review_pause', 'classifier_ambiguous', withCats)
    if (interpretability === 'out_of_scope') return decision('staff_review_pause', 'classifier_out_of_scope', withCats)
    if (subject === 'unknown' || tense === 'unknown' || mode === 'unknown') return decision('staff_review_pause', 'classifier_ambiguous', withCats)
    if (crisis && (categories.length === 0 || r.crisisCategory.unknown >= t.crisisCategory)) return decision('staff_review_pause', 'classifier_ambiguous', withCats)
    if (subject === 'self' && tense === 'present' && mode === 'direct') {
      return decision('staff_review_pause', crisis ? 'classifier_crisis_direct' : 'classifier_distress_direct', withCats)
    }
    if (categories.includes('self_harm')) return decision('staff_review_pause', 'classifier_self_harm_context', withCats)
    // 과거·인용·부정·관용·가정·미래 또는 타인 — 계속(규칙 휴식·거부면 기존 마무리) + 기록.
    return ruleClosing
      ? decision('elder_closing', 'classifier_context_logged', { ...withCats, record: true, closingSituation: ruleClosing })
      : decision('continue', 'classifier_context_logged', { ...withCats, record: true })
  }

  // 4. 위기·고통 신호가 없다.
  if (ruleClosing) return decision('elder_closing', 'rule_closing', { closingSituation: ruleClosing })
  const refusal = r.content.refusal >= t.closing, rest = r.content.rest_request >= t.closing
  const selfNowDirect = subject === 'self' && tense === 'present' && mode === 'direct'
  const intent = pick(r.intent, CONTEXT_INTENTS, Math.max(t.qualifier, t.closing), 'unknown')
  if (((refusal || rest) && selfNowDirect) || intent === 'rest' || intent === 'end') {
    return decision('elder_closing', 'classifier_closing', { record: true, closingSituation: refusal && selfNowDirect ? 'refusal' : 'rest_request' })
  }
  return decision('continue', 'no_signal')
}

// @giokon/core — 어르신 발화 안전 평가 (M12 배선 · 2026-09 중계 단일화로 축소)
//
// 대화 **생성**은 이제 음성 중계(voice-relay → Gemini Live)만 한다. 예전 규칙 기반 생성기
// (`ai.ts` generateReply/generateOpener)는 중계 모드에서 계산되고 버려지는 코드였고,
// 직접 모드 폐기로 폴백 용도도 없어져 삭제했다(계획 C1).
//
// 여기 남은 것은 매 어르신 발화에 대한 **결정론 안전 평가**다 — 클라이언트는
// evaluateUserTurn 을 호출한다:
//   1) 상황 평가(assessUtterance) — 위기·고통·중단·거부·혼란·애도·침묵·일반.
//   2) 세션 안전 스냅샷 — 권고(계속/휴식 제안/마무리)와 에스컬레이션·이벤트 산출.
// AI 출력 검열(screenAiUtterance)은 이 파일이 아니라 출력을 채택하는 쪽(중계·앱 스토어)이 한다.
//
// 에스컬레이션은 "감지 → 사람 도달"까지가 완성이다: escalate=true 시 caregiverAlert
// 문구와 safety_events 저장용 event 초안을 함께 반환한다(영속화는 데이터 레이어).

import {
  assessEngagement,
  assessUtterance,
  buildCaregiverAlert,
  CAREGIVER_ALERT_KINDS,
  caregiverAlertKind,
  type CaregiverAlertKind,
  type CrisisCategory,
  type Engagement,
  type UtteranceAssessment,
} from './safety'
import type { ConversationTurn } from './types'

// ─────────────────────────────────────────────────────────────
// 세션 진행 권고 — 대화를 계속할지, 쉬어갈지, 마무리할지
// ─────────────────────────────────────────────────────────────

export type SessionRecommendation =
  | 'continue' // 정상 진행
  | 'comfort' // 지지 모드(짧게·부드럽게) 권장
  | 'suggest_break' // 휴식 제안 권장
  | 'end_session' // 세션 마무리 권고(위기·중단 요청·반복 거부·긴 침묵)

export interface SessionSafetySnapshot {
  /** 이번 세션에서 발생한 위기 이벤트 수(현재 발화 포함). */
  crisisCount: number
  /** 현재 발화를 포함한 연속 고통(distress) 발화 수. */
  distressStreak: number
  /** 현재 발화를 포함한 연속 거부 발화 수. */
  refusalStreak: number
  /** 현재 발화를 포함한 연속 침묵 수. */
  silenceStreak: number
  recommendation: SessionRecommendation
}

/**
 * 이력 + 현재 평가로 세션 안전 상태를 계산한다(순수).
 * history는 현재 발화 "이전"까지의 턴이어야 한다(evaluateUserTurn이 정규화).
 */
export function computeSessionSafety(
  history: ConversationTurn[],
  current: UtteranceAssessment,
): SessionSafetySnapshot {
  const elderSituations = history
    .filter((t) => t.speaker === 'Elderly')
    .map((t) => assessUtterance(t.text).situation)

  const streakOf = (kind: UtteranceAssessment['situation']): number => {
    if (current.situation !== kind) return 0
    let streak = 1
    for (let i = elderSituations.length - 1; i >= 0; i--) {
      if (elderSituations[i] === kind) streak++
      else break
    }
    return streak
  }

  const crisisCount =
    elderSituations.filter((s) => s === 'crisis').length + (current.situation === 'crisis' ? 1 : 0)
  const distressStreak = streakOf('distress')
  const refusalStreak = streakOf('refusal')
  const silenceStreak = streakOf('silence')

  let recommendation: SessionRecommendation = 'continue'
  if (current.situation === 'crisis' || current.situation === 'rest_request') {
    // 위기는 사람 개입이 우선이므로 대화를 늘리지 않는다. 중단 요청은 즉시 존중.
    recommendation = 'end_session'
  } else if (refusalStreak >= 2 || silenceStreak >= 3) {
    recommendation = 'end_session'
  } else if (distressStreak >= 3) {
    recommendation = 'suggest_break'
  } else if (current.situation === 'distress' || current.situation === 'grief') {
    recommendation = 'comfort'
  }

  return { crisisCount, distressStreak, refusalStreak, silenceStreak, recommendation }
}

/** 안전 권고를 그대로 유지한다. 세션 길이는 서버 시간으로 제어하며 턴 수로 종료하지 않는다. */
export function resolveSessionRecommendation(
  safetyRecommendation: SessionRecommendation,
  _elderTurns: number,
): SessionRecommendation {
  return safetyRecommendation
}

// ─────────────────────────────────────────────────────────────
// 에스컬레이션 이벤트 초안 — safety_events 영속화용
// ─────────────────────────────────────────────────────────────

export interface SafetyEventDraft {
  level: 'watch' | 'crisis'
  categories: CrisisCategory[]
  matchedTerms: string[]
  /** 발화 앞부분(맥락 확인용, 민감정보 — RLS 보호 하에 저장). */
  excerpt: string
  caregiverAlert: string
}

const EXCERPT_MAX = 120

function buildSafetyEventDraft(
  assessment: UtteranceAssessment,
  utterance: string,
  alert: string | null,
): SafetyEventDraft | null {
  if (!alert) return null
  if (assessment.risk !== 'crisis' && assessment.risk !== 'watch') return null
  return {
    level: assessment.risk,
    categories: assessment.crisisCategories,
    matchedTerms: assessment.matchedTerms,
    excerpt: utterance.trim().slice(0, EXCERPT_MAX),
    caregiverAlert: alert,
  }
}

/**
 * 발화 평가 → safety_events 초안(저장할 일이 아니면 null). 앱 평가(`evaluateUserTurn`)와
 * 음성 중계의 즉시 기록(파일럿 T21.4)이 **같은 규칙**으로 기록하도록 공개한다.
 */
export function safetyEventDraftFor(assessment: UtteranceAssessment, utterance: string): SafetyEventDraft | null {
  return buildSafetyEventDraft(assessment, utterance, buildCaregiverAlert(assessment))
}

/**
 * 음성 중계 → 앱 안전 판정 요약(파일럿 T25.14). 중계는 위험 발화 원문을 앱에 보내지 않으므로, 현장 요양보호사 화면이
 * 위기 종류별 안내(☎109·119·1577-1389)를 띄울 수 있게 **판정만** 보낸다 — 원문·발화 조각·매칭 단어는 넣지 않는다.
 * `safetyEventDraftFor` 가 초안을 만드는 경우에만 만들어지고, 수준·분류·문구가 그 초안과 같다.
 */
export interface RelaySafetySummary {
  level: SafetyEventDraft['level']
  categories: CrisisCategory[]
  alert: CaregiverAlertKind
}

export function relaySafetySummary(assessment: UtteranceAssessment): RelaySafetySummary | null {
  const alert = caregiverAlertKind(assessment)
  if (!alert || (assessment.risk !== 'crisis' && assessment.risk !== 'watch')) return null
  return { level: assessment.risk, categories: [...assessment.crisisCategories], alert }
}

const CRISIS_CATEGORIES: readonly CrisisCategory[] = ['self_harm', 'medical_emergency', 'abuse']

/** 네트워크로 받은 요약 검증 — 모르는 값·여분 칸이 있으면 통째로 버린다(null). */
export function parseRelaySafetySummary(value: unknown): RelaySafetySummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(k => k !== 'level' && k !== 'categories' && k !== 'alert')) return null
  if (v.level !== 'watch' && v.level !== 'crisis') return null
  if (!CAREGIVER_ALERT_KINDS.includes(v.alert as CaregiverAlertKind)) return null
  if (!Array.isArray(v.categories) || v.categories.length > CRISIS_CATEGORIES.length) return null
  const categories = v.categories as unknown[]
  if (!categories.every(c => CRISIS_CATEGORIES.includes(c as CrisisCategory))) return null
  if (new Set(categories).size !== categories.length) return null
  return { level: v.level, categories: categories as CrisisCategory[], alert: v.alert as CaregiverAlertKind }
}

// ─────────────────────────────────────────────────────────────
// 발화 평가
// ─────────────────────────────────────────────────────────────

/**
 * 이력 끝에 현재 발화가 이미 추가돼 있으면 제거한다.
 * 호출부에 따라 history가 현재 발화를 포함하기도(앱 스토어: 턴 추가 후 평가),
 * 포함하지 않기도 하므로 두 호출 형태를 모두 허용한다.
 */
export function historyBeforeUtterance(
  history: ConversationTurn[],
  lastUserText: string,
): ConversationTurn[] {
  const last = history[history.length - 1]
  if (last && last.speaker === 'Elderly' && last.text === lastUserText) {
    return history.slice(0, -1)
  }
  return history
}

export interface UserTurnEvaluation {
  /** 현재 발화의 상황 평가(로깅·관측용). */
  assessment: UtteranceAssessment
  /** 현재 발화의 관여도. */
  engagement: Engagement
  /** 세션 안전 스냅샷(진행 권고 포함). */
  session: SessionSafetySnapshot
  /** 사람(요양보호사) 즉시 확인 필요. */
  escalate: boolean
  /** 요양보호사 화면에 표시할 알림(없으면 null). */
  caregiverAlert: string | null
  /** safety_events 저장용 초안(저장 불필요 시 null). */
  event: SafetyEventDraft | null
}

/** 어르신 발화 1건의 결정론 안전 평가(응답은 만들지 않는다). */
export function evaluateUserTurn(
  history: ConversationTurn[],
  lastUserText: string,
): UserTurnEvaluation {
  const assessment = assessUtterance(lastUserText)
  const engagement = assessEngagement(lastUserText)
  const session = computeSessionSafety(historyBeforeUtterance(history, lastUserText), assessment)
  const caregiverAlert = buildCaregiverAlert(assessment)
  const event = buildSafetyEventDraft(assessment, lastUserText, caregiverAlert)
  return { assessment, engagement, session, escalate: assessment.escalate, caregiverAlert, event }
}

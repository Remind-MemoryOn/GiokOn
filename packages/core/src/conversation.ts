// @giokon/core — 안전 가드 통합 대화 오케스트레이션 (M12 배선)
//
// 세션 파이프라인(웹/모바일/Edge Function)은 매 사용자 발화에 respondToUserTurn을
// 호출한다. 처리 순서(mock/실 LLM 동일):
//   1) 상황 평가(assessUtterance) — 위기·고통·중단·거부·혼란·애도·침묵·일반.
//   2) 응답 생성(generateReply) — 상황 인지형(평가 결과 공유, 이중 평가 없음).
//   3) 출력 가드레일(screenAiUtterance) — 의학·교정·유해 표현 차단·대체.
//      (실 LLM 발화도 이 후단 가드를 반드시 통과한다.)
//   4) 세션 안전 스냅샷 — 권고(계속/휴식 제안/마무리)와 에스컬레이션·이벤트 산출.
//
// 에스컬레이션은 "감지 → 사람 도달"까지가 완성이다: escalate=true 시 caregiverAlert
// 문구와 safety_events 저장용 event 초안을 함께 반환한다(영속화는 데이터 레이어).

import { generateOpener, generateReply, historyBeforeUtterance, type AiResponse } from './ai'
import {
  assessEngagement,
  assessUtterance,
  buildCaregiverAlert,
  screenAiUtterance,
  type CrisisCategory,
  type Engagement,
  type UtteranceAssessment,
} from './safety'
import type { ChronicleEntry, ConversationTurn, ElderProfile, Session } from './types'

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
 * history는 현재 발화 "이전"까지의 턴이어야 한다(respondToUserTurn이 정규화).
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

// ─────────────────────────────────────────────────────────────
// 오케스트레이션
// ─────────────────────────────────────────────────────────────

export interface GuardedTurn {
  /** 어르신에게 재생할 최종 응답. */
  response: AiResponse
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
  /** AI 생성 발화가 출력 가드레일로 대체됐는지(관측용). */
  screened: boolean
}

// 오프너에는 평가할 사용자 발화가 없다.
const NO_ASSESSMENT: UtteranceAssessment = {
  situation: 'normal',
  risk: 'none',
  crisisCategories: [],
  matchedTerms: [],
  escalate: false,
  hasDistressSignal: false,
}

/** 세션 시작 오프너(사용자 발화 없음 → 출력 가드만 통과시킨다). */
export function openConversation(
  elder: ElderProfile,
  session: Session,
  chronicle: ChronicleEntry[],
): GuardedTurn {
  const generated = generateOpener(elder, session, chronicle)
  const screen = screenAiUtterance(generated.question)
  const screened = !screen.allowed && !!screen.safeAlternative

  return {
    response: screened
      ? { ...generated, question: screen.safeAlternative as string }
      : generated,
    assessment: NO_ASSESSMENT,
    engagement: 'normal',
    session: {
      crisisCount: 0,
      distressStreak: 0,
      refusalStreak: 0,
      silenceStreak: 0,
      recommendation: 'continue',
    },
    escalate: false,
    caregiverAlert: null,
    event: null,
    screened,
  }
}

/** 사용자 발화에 대한 안전 가드 통합 응답. */
export function respondToUserTurn(
  elder: ElderProfile,
  session: Session,
  history: ConversationTurn[],
  lastUserText: string,
): GuardedTurn {
  // 1) 상황 평가 — 한 번만 수행하고 응답 생성기와 공유한다.
  const assessment = assessUtterance(lastUserText)
  const engagement = assessEngagement(lastUserText)

  // 2) 상황 인지 응답 생성(위기 포함 — 안전 응답은 생성기가 만든다).
  const generated = generateReply(elder, session, history, lastUserText, assessment)

  // 3) 출력 가드레일 — 위기 안전 응답은 신뢰된 템플릿이므로 검열 대상에서 제외.
  let response = generated
  let screened = false
  if (assessment.situation !== 'crisis') {
    const screen = screenAiUtterance(generated.question)
    if (!screen.allowed && screen.safeAlternative) {
      response = { ...generated, question: screen.safeAlternative }
      screened = true
    }
  }

  // 4) 세션 안전 스냅샷 + 에스컬레이션 산출물.
  const sessionSafety = computeSessionSafety(historyBeforeUtterance(history, lastUserText), assessment)
  const caregiverAlert = buildCaregiverAlert(assessment)
  const event = buildSafetyEventDraft(assessment, lastUserText, caregiverAlert)

  return {
    response,
    assessment,
    engagement,
    session: sessionSafety,
    escalate: assessment.escalate,
    caregiverAlert,
    event,
    screened,
  }
}

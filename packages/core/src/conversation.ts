// @giokon/core — 안전 가드가 통합된 대화 오케스트레이션 (M12 배선)
//
// 세션 파이프라인(모바일/Edge Function)은 매 사용자 발화에 대해 이 오케스트레이터를
// 호출한다. 순서:
//   1) 위기 감지(assessRisk) — crisis면 상담이 아니라 안전 응답 + 사람 에스컬레이션.
//   2) 일반 응답 생성(generateReply).
//   3) 급성 고통(watch) — 지지 톤 우선(에스컬레이션 아님, 대화는 이어감).
//   4) 출력 가드레일(screenAiUtterance) — 실 LLM 발화의 의학·유해 표현 차단·대체.
//
// mock/real 무관하게 동일 계약을 유지한다(AIProvider 교체 지점과 독립적).

import { generateOpener, generateReply, type AiResponse } from './ai'
import { assessRisk, screenAiUtterance, type SafetyAssessment } from './safety'
import type { ChronicleEntry, ConversationTurn, ElderProfile, Session } from './types'

export interface GuardedTurn {
  /** 어르신에게 재생할 최종 응답. */
  response: AiResponse
  /** 위기/watch 평가 결과(로깅·요양보호사 알림용). */
  safety: SafetyAssessment
  /** 사람(요양보호사/보호자) 즉시 에스컬레이션 필요 여부. */
  escalate: boolean
  /** AI 생성 발화가 가드레일로 대체됐는지(관측용). */
  screened: boolean
}

const SAFETY_TOPIC = '안전'

/** 세션 시작 오프너(사용자 발화 없음 → 위기 평가 불필요, 출력만 검열). */
export function openConversation(
  elder: ElderProfile,
  session: Session,
  chronicle: ChronicleEntry[],
): GuardedTurn {
  const generated = generateOpener(elder, session, chronicle)
  const screen = screenAiUtterance(generated.question)
  const safety = assessRisk('') // level 'none'
  if (!screen.allowed && screen.safeAlternative) {
    return {
      response: { ...generated, question: screen.safeAlternative },
      safety,
      escalate: false,
      screened: true,
    }
  }
  return { response: generated, safety, escalate: false, screened: false }
}

/** 사용자 발화에 대한 안전 가드 통합 응답. */
export function respondToUserTurn(
  elder: ElderProfile,
  session: Session,
  history: ConversationTurn[],
  lastUserText: string,
): GuardedTurn {
  const safety = assessRisk(lastUserText)

  // 1) 위기: 상담·진단이 아니라 안전 응답 + 사람 에스컬레이션.
  if (safety.escalate && safety.safeReply) {
    return {
      response: { question: safety.safeReply, topic: SAFETY_TOPIC, switchTopic: true },
      safety,
      escalate: true,
      screened: false,
    }
  }

  // 2) 일반 응답 생성.
  const generated = generateReply(elder, session, history, lastUserText)

  // 3) 급성 고통(watch): 지지 톤 우선(에스컬레이션 아님, 대화 이어감).
  if (safety.level === 'watch' && safety.safeReply) {
    return {
      response: { question: safety.safeReply, topic: generated.topic, switchTopic: true },
      safety,
      escalate: false,
      screened: false,
    }
  }

  // 4) 출력 가드레일: 부적절·의학 표현이면 안전 대체 발화로 교체.
  const screen = screenAiUtterance(generated.question)
  if (!screen.allowed && screen.safeAlternative) {
    return {
      response: { ...generated, question: screen.safeAlternative },
      safety,
      escalate: false,
      screened: true,
    }
  }

  return { response: generated, safety, escalate: false, screened: false }
}

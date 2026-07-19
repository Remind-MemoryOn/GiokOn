// @giokon/core — 웹 AI 에이전트 도메인 (M18 — mock, 실 LLM 은 Edge Function 대체)
//
// 작업 지향 대화 에이전트(SCR-W11). 도구 3종:
//   ① 일지 초안 작성(→ journal.buildJournalDraft, M19 연계)
//   ② 공개 실행 대행(→ guardian_shares 커밋, M17.2 연계)
//   ③ 데이터 설명(보호자 — 공개된 커밋 데이터만 근거, 관찰 지표 언어)
//
// 원칙(docs/ai-safety.md §4):
//   - 쓰기 도구는 **실행 전 사람 확인 게이트** 필수(requiresConfirmation).
//   - 보호자 설명은 진단·효능 표현 금지 — 관찰 지표 언어만.
//   - 의료 질문은 답하지 않고 사람(요양보호사·의료진) 상담으로 안내한다.
// mock 은 규칙 기반 의도 분류. 실 LLM 전환 시 같은 시그니처 유지.

export const AGENT_DISCLOSURE =
  'AI 도우미입니다. 기록 작성·공개를 도와드리며, 실행 전 항상 확인을 거칩니다. 의학적 판단은 제공하지 않아요.'

export type AgentRole = 'caregiver' | 'guardian'

export type AgentAction =
  /** 입력 원문으로 일지 초안 생성(저장은 초안 상태 — 확정은 사람이). */
  | { kind: 'draft_journal'; rawText: string }
  /** 최근 확정 일지 1건 공개(커밋) 대행. */
  | { kind: 'publish_journal' }
  /** 최근 세션 분석 1건 공개(커밋) 대행. */
  | { kind: 'publish_analysis' }
  /** 보호자: 공개된 소식 요약 설명(읽기 전용 — 게이트 불필요). */
  | { kind: 'explain_shared' }

export interface AgentReply {
  message: string
  action: AgentAction | null
  /** true 면 실행 전 사람 확인 게이트(확인 버튼)를 거쳐야 한다. */
  requiresConfirmation: boolean
}

const MEDICAL_KEYWORDS = ['진단', '치매인가', '병인가', '약을', '처방', '치료법', '병원 가야']

function isMedicalQuestion(text: string): boolean {
  return MEDICAL_KEYWORDS.some((k) => text.includes(k))
}

const CAREGIVER_HELP =
  '이런 일을 도와드릴 수 있어요:\n' +
  '· "…내용… 일지 초안 만들어줘" — 말씀하신 내용으로 일지 초안을 만들어요\n' +
  '· "오늘 일지 공개해줘" — 최근 확정 일지를 보호자에게 공개해요\n' +
  '· "최근 분석 공개해줘" — 최근 세션 분석을 보호자에게 공개해요\n' +
  '실행 전에는 항상 확인을 거치고, 초안은 확정 전까지 저장만 해둬요.'

const GUARDIAN_HELP =
  '공개된 소식(일지·대화 관찰 요약)을 쉽게 설명해 드려요. ' +
  '"최근 소식 요약해줘"라고 물어보세요. 의학적 판단은 제공하지 않아요.'

const MEDICAL_DEFLECTION =
  '기억온은 의료 서비스가 아니라 어르신의 일상 관찰 기록을 보여드리는 서비스예요. ' +
  '건강에 대한 판단이 필요하시면 담당 요양보호사나 의료진과 상담해 주세요.'

/** 에이전트 한 턴(mock — 규칙 기반 의도 분류). */
export function runAgentTurn(role: AgentRole, rawInput: string): AgentReply {
  const text = rawInput.trim()

  if (role === 'guardian') {
    if (!text) return { message: GUARDIAN_HELP, action: null, requiresConfirmation: false }
    if (isMedicalQuestion(text)) {
      return { message: MEDICAL_DEFLECTION, action: null, requiresConfirmation: false }
    }
    if (text.includes('요약') || text.includes('소식') || text.includes('어땠')) {
      return {
        message: '공개된 소식을 정리해 드릴게요.',
        action: { kind: 'explain_shared' },
        requiresConfirmation: false,
      }
    }
    return { message: GUARDIAN_HELP, action: null, requiresConfirmation: false }
  }

  // caregiver
  if (!text) return { message: CAREGIVER_HELP, action: null, requiresConfirmation: false }

  if (text.includes('공개')) {
    if (text.includes('분석')) {
      return {
        message:
          '최근 세션 분석을 보호자에게 공개할게요. 공개 후에도 언제든 철회할 수 있어요. 실행할까요?',
        action: { kind: 'publish_analysis' },
        requiresConfirmation: true,
      }
    }
    return {
      message:
        '최근 확정 일지를 보호자에게 공개할게요. 공개 후에도 언제든 철회할 수 있어요. 실행할까요?',
      action: { kind: 'publish_journal' },
      requiresConfirmation: true,
    }
  }

  if (text.includes('일지')) {
    return {
      message:
        '말씀하신 내용으로 일지 초안을 만들게요. 초안으로 저장되며, 확인 후 직접 확정하시면 돼요. 진행할까요?',
      action: { kind: 'draft_journal', rawText: text },
      requiresConfirmation: true,
    }
  }

  return { message: CAREGIVER_HELP, action: null, requiresConfirmation: false }
}

export interface SharedDigestInput {
  journalCount: number
  analysisCount: number
  latestJournalExcerpt?: string
  latestAnalysisSummary?: string
}

/**
 * 보호자용 공개 소식 요약(설명 도구 ③) — 커밋된 데이터만 근거로, 관찰 지표
 * 언어로 설명한다(진단·효능 표현 없음).
 */
export function summarizeSharedForGuardian(input: SharedDigestInput): string {
  if (input.journalCount === 0 && input.analysisCount === 0) {
    return '아직 공개된 소식이 없어요. 요양보호사가 공개하면 바로 정리해 드릴게요.'
  }
  const parts: string[] = []
  parts.push(
    `지금까지 공개된 소식은 요양일지 ${input.journalCount}건, 대화 관찰 요약 ${input.analysisCount}건이에요.`,
  )
  if (input.latestJournalExcerpt) {
    parts.push(`가장 최근 일지에는 이렇게 적혀 있어요 — "${input.latestJournalExcerpt}"`)
  }
  if (input.latestAnalysisSummary) {
    parts.push(`최근 대화에서는: ${input.latestAnalysisSummary}`)
  }
  parts.push('이 내용은 돌봄 중 관찰된 기록이에요. 의학적 판단이 아니니 참고로 봐주세요.')
  return parts.join('\n')
}

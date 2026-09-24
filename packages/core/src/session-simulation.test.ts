// 전체 세션 시뮬레이션 — 실제 클라이언트(앱 스토어)처럼 이력을 쌓으며 다회차 발화를
// 평가하고, 어떤 시나리오에서도 지켜져야 하는 **안전** 불변식을 검사한다.
//   불변식 A: 위기는 언제 나와도 에스컬레이션 + 마무리 권고로 이어진다.
//   불변식 B: 어르신이 그만두자고 하면 세션은 마무리로 향한다.
//   불변식 C: 평온한 대화는 끊기지 않는다(오탐으로 멈추지 않는다).
// AI 응답 문구(반복·가드레일·주제 전환)는 음성 중계가 만들고 검열하므로 여기서 다루지 않는다.
// (규칙 기반 생성기 ai.ts 삭제 — 계획 C1, 2026-09)

import { describe, expect, it } from 'vitest'
import { evaluateUserTurn, type UserTurnEvaluation } from './conversation'
import type { ConversationTurn } from './types'

/** 실제 클라이언트처럼 세션을 구동한다: AI 턴/어르신 턴을 이력에 쌓으며 평가. */
function driveSession(elderUtterances: string[]): { turns: UserTurnEvaluation[]; endedAt: number | null } {
  const history: ConversationTurn[] = []
  let seq = 0
  const push = (speaker: 'AI' | 'Elderly', text: string) => {
    history.push({ id: 't' + ++seq, speaker, text, timestamp: '' })
  }
  push('AI', '합성 질문')
  const turns: UserTurnEvaluation[] = []
  let endedAt: number | null = null
  for (let i = 0; i < elderUtterances.length; i++) {
    const text = elderUtterances[i]
    push('Elderly', text)
    const evaluated = evaluateUserTurn(history, text)
    turns.push(evaluated)
    if (evaluated.session.recommendation === 'end_session') {
      endedAt = i
      break // 클라이언트는 여기서 세션을 마무리한다.
    }
    push('AI', '합성 질문')
  }
  return { turns, endedAt }
}

describe('세션 시뮬레이션 — 안전 계약', () => {
  it('평온한 회상 세션: 풍부한 답변 12턴이 끊기지 않고 이어진다', () => {
    const utterances = [
      '그때 전주 시장에서 국밥집을 했었지',
      '동네 사람들이 정이 많아서 외상도 자주 줬어',
      '그러다가 단골들이 생겨서 장사가 잘됐었어',
      '새벽마다 장을 보러 다녔었지 그때가 좋았어',
      '겨울에는 김장을 백 포기씩 했었다니까',
      '딸들이 어릴 때 가게에 와서 숙제를 했었지',
      '큰딸이 공부를 참 잘했어 상도 많이 받았고',
      '작은딸은 노래를 잘해서 동네 잔치마다 불려갔어',
      '옛날에는 명절이면 온 식구가 다 모였었지',
      '떡국을 큰 솥으로 하나 가득 끓였었어',
      '그 시절엔 이웃끼리 다 나눠 먹고 살았지',
      '지금 생각해도 그때가 제일 행복했던 것 같아',
    ]
    const { turns, endedAt } = driveSession(utterances)
    expect(endedAt).toBeNull()
    expect(turns.every((t) => !t.escalate)).toBe(true)
    expect(turns.every((t) => t.session.recommendation === 'continue')).toBe(true)
  })

  it('애도 세션: 상실 이야기는 위로 모드로 이어가고 알림을 만들지 않는다', () => {
    const { turns, endedAt } = driveSession(['남편이 삼 년 전에 먼저 갔어', '그래도 딸들이 자주 전화를 해줘서 고마워'])
    expect(endedAt).toBeNull()
    expect(turns[0].session.recommendation).toBe('comfort')
    expect(turns[0].caregiverAlert).toBeNull()
    expect(turns[1].session.recommendation).toBe('continue')
  })

  it('위기 세션: 대화 중간의 자살 신호에 즉시 에스컬레이션하고 마무리한다', () => {
    const { turns, endedAt } = driveSession([
      '그때 시장에서 국밥집을 했었지',
      '요즘은 사는 게 참 힘들어',
      '이제 그만 죽고 싶다는 생각뿐이야',
      '이 말은 도달하지 않아야 한다',
    ])
    expect(endedAt).toBe(2) // 위기 발화에서 즉시 마무리 — 이후 발화는 처리되지 않는다.
    const crisis = turns[turns.length - 1]
    expect(crisis.escalate).toBe(true)
    expect(crisis.event?.level).toBe('crisis')
    expect(crisis.caregiverAlert).toContain('109')
  })

  it('중단 요청 세션: "그만하고 싶어"에 즉시 마무리하고 위기로 올리지 않는다', () => {
    const { turns, endedAt } = driveSession(['국밥집을 했었지', '오늘은 피곤해서 그만하고 싶어'])
    expect(endedAt).toBe(1)
    expect(turns[turns.length - 1].escalate).toBe(false)
  })

  it('학대 신고 세션: 에스컬레이션 + 기관 알림 문구 포함', () => {
    const { turns } = driveSession(['아들이 자꾸 때리고 밥도 안 줘'])
    const t = turns[0]
    expect(t.escalate).toBe(true)
    expect(t.event?.categories).toContain('abuse')
    expect(t.caregiverAlert).toContain('1577-1389')
  })

  it('혼란 세션: 혼란 발화는 위기가 아니며 대화가 이어진다', () => {
    const { turns, endedAt } = driveSession(['누구세요? 여기가 어디야?', '아 그래요, 국밥집을 했었지'])
    expect(endedAt).toBeNull()
    expect(turns[0].escalate).toBe(false)
    expect(turns[1].session.recommendation).toBe('continue')
  })
})

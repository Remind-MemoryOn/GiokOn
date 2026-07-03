import { describe, expect, it } from 'vitest'
import { openConversation, respondToUserTurn } from './conversation'
import { DEFAULT_APPEARANCE } from './types'
import type { ConversationTurn, ElderProfile, Session } from './types'

const elder: ElderProfile = {
  id: 'e1',
  name: '이순자',
  birthYear: 1945,
  hometown: '전주',
  family: '딸 둘',
  job: '식당 운영',
  hobbies: '텃밭 가꾸기',
  avatarColor: '#fff',
  appearance: DEFAULT_APPEARANCE,
  createdAt: '',
  updatedAt: '',
}

const session: Session = {
  id: 's1',
  title: '전주 시절 회상',
  therapyType: 'reminiscence',
  durationMinutes: 10,
  elderId: 'e1',
  createdAt: '',
  updatedAt: '',
}

const aiTurn = (topic: string): ConversationTurn => ({
  id: 't' + topic,
  speaker: 'AI',
  text: '...',
  timestamp: '',
  topic,
})

describe('respondToUserTurn — 안전 통합', () => {
  it('위기 발화(자살)는 안전 응답 + 에스컬레이션, 일반 후속질문 아님', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('가족')], '이제 그만 죽고 싶어')
    expect(r.escalate).toBe(true)
    expect(r.safety.level).toBe('crisis')
    expect(r.response.topic).toBe('안전')
    expect(r.response.switchTopic).toBe(true)
  })

  it('응급 발화도 에스컬레이션', () => {
    const r = respondToUserTurn(elder, session, [], '숨이 안 쉬어져요')
    expect(r.escalate).toBe(true)
    expect(r.safety.categories).toContain('medical_emergency')
  })

  it('급성 고통(watch)은 지지 톤 우선, 에스컬레이션 아님', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('고향')], '너무 무서워서 견딜 수가 없어')
    expect(r.safety.level).toBe('watch')
    expect(r.escalate).toBe(false)
    expect(r.response.question).toBeTruthy()
  })

  it('안전한 일반 발화는 정상 후속질문(에스컬레이션·검열 없음)', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('고향')], '거기서 오래 살았지요')
    expect(r.escalate).toBe(false)
    expect(r.screened).toBe(false)
    expect(r.safety.level).toBe('none')
    expect(r.response.topic).toBe('고향')
  })
})

describe('openConversation — 오프너 검열', () => {
  it('오프너는 위기 평가 없이 정상 생성(연대기 반영)', () => {
    const r = openConversation(elder, session, [])
    expect(r.escalate).toBe(false)
    expect(r.safety.level).toBe('none')
    expect(r.response.question).toContain('전주')
  })
})

import { describe, expect, it } from 'vitest'
import {
  computeSessionSafety,
  openConversation,
  resolveSessionRecommendation,
  respondToUserTurn,
  SESSION_TURN_LIMIT,
} from './conversation'
import { assessUtterance } from './safety'
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

let seq = 0
const aiTurn = (topic: string): ConversationTurn => ({
  id: 't' + ++seq, speaker: 'AI', text: '...', timestamp: '', topic,
})
const elderTurn = (text: string): ConversationTurn => ({
  id: 't' + ++seq, speaker: 'Elderly', text, timestamp: '',
})

describe('respondToUserTurn — 위기 에스컬레이션 파이프라인', () => {
  it('자살 위기: 안전응답 + 에스컬레이션 + 알림 + 이벤트 + 세션 마무리 권고', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('가족')], '이제 그만 죽고 싶어')
    expect(r.escalate).toBe(true)
    expect(r.assessment.situation).toBe('crisis')
    expect(r.response.topic).toBe('안전')
    expect(r.caregiverAlert).toContain('109')
    expect(r.event).not.toBeNull()
    expect(r.event!.level).toBe('crisis')
    expect(r.event!.categories).toContain('self_harm')
    expect(r.event!.excerpt).toContain('죽고 싶어')
    expect(r.session.recommendation).toBe('end_session')
  })

  it('응급: 즉시 에스컬레이션 + 마무리 권고', () => {
    const r = respondToUserTurn(elder, session, [], '숨이 안 쉬어져요')
    expect(r.escalate).toBe(true)
    expect(r.caregiverAlert).toContain('119')
    expect(r.session.recommendation).toBe('end_session')
  })

  it('고통(watch): 에스컬레이션은 아니지만 관찰 알림 + 이벤트 저장', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('가족')], '자식들한테 짐만 되는 것 같아')
    expect(r.escalate).toBe(false)
    expect(r.caregiverAlert).toBeTruthy()
    expect(r.event).not.toBeNull()
    expect(r.event!.level).toBe('watch')
    expect(r.session.recommendation).toBe('comfort')
  })

  it('고통+중단 복합: 중단 존중(마무리) + 고통 알림 유지', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('가족')], '너무 힘들어서 그만하고 싶어')
    expect(r.assessment.situation).toBe('rest_request')
    expect(r.session.recommendation).toBe('end_session')
    expect(r.caregiverAlert).toBeTruthy() // 존중과 관찰을 둘 다
    expect(r.event!.level).toBe('watch')
  })

  it('애도: 공감 응답 + comfort 권고, 알림·이벤트 없음', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('가족')], '남편이 먼저 돌아가셨어요')
    expect(r.escalate).toBe(false)
    expect(r.caregiverAlert).toBeNull()
    expect(r.event).toBeNull()
    expect(r.session.recommendation).toBe('comfort')
    expect(r.response.switchTopic).toBe(false) // 회피하지 않는다
  })

  it('안전한 일반 발화: 정상 진행', () => {
    const r = respondToUserTurn(elder, session, [aiTurn('고향')], '그때 동네 사람들이 참 좋았었지')
    expect(r.escalate).toBe(false)
    expect(r.caregiverAlert).toBeNull()
    expect(r.event).toBeNull()
    expect(r.screened).toBe(false)
    expect(r.session.recommendation).toBe('continue')
    expect(r.engagement).toBe('rich')
  })
})

describe('computeSessionSafety — 세션 권고', () => {
  it('거부가 반복되면 마무리 권고', () => {
    const history = [aiTurn('고향'), elderTurn('듣기 싫어'), aiTurn('고향')]
    const snap = computeSessionSafety(history, assessUtterance('그만 물어'))
    expect(snap.refusalStreak).toBe(2)
    expect(snap.recommendation).toBe('end_session')
  })

  it('침묵 3회면 마무리 권고', () => {
    const history = [aiTurn('고향'), elderTurn(''), aiTurn('고향'), elderTurn(''), aiTurn('고향')]
    const snap = computeSessionSafety(history, assessUtterance(''))
    expect(snap.silenceStreak).toBe(3)
    expect(snap.recommendation).toBe('end_session')
  })

  it('고통이 3회 이어지면 휴식 제안', () => {
    const history = [
      aiTurn('가족'), elderTurn('너무 힘들어'),
      aiTurn('가족'), elderTurn('못 살겠어'),
      aiTurn('가족'),
    ]
    const snap = computeSessionSafety(history, assessUtterance('견딜 수가 없어'))
    expect(snap.distressStreak).toBe(3)
    expect(snap.recommendation).toBe('suggest_break')
  })

  it('위기 횟수를 세션 단위로 집계한다', () => {
    const history = [aiTurn('가족'), elderTurn('죽고 싶어'), aiTurn('안전')]
    const snap = computeSessionSafety(history, assessUtterance('죽고 싶다니까'))
    expect(snap.crisisCount).toBe(2)
  })
})

describe('openConversation — 오프너', () => {
  it('연대기 반영 + 평가 없음 + 정상 진행', () => {
    const r = openConversation(elder, session, [])
    expect(r.escalate).toBe(false)
    expect(r.event).toBeNull()
    expect(r.session.recommendation).toBe('continue')
    expect(r.response.question).toContain('전주')
  })
})

describe('resolveSessionRecommendation — 자동 종료 정책', () => {
  it('안전 권고가 있으면 무조건 우선한다(턴 수 무관)', () => {
    expect(resolveSessionRecommendation('end_session', 0)).toBe('end_session')
    expect(resolveSessionRecommendation('comfort', 99)).toBe('comfort')
    expect(resolveSessionRecommendation('suggest_break', 99)).toBe('suggest_break')
  })

  it('안전 권고가 없으면 설계 세션 길이 도달 시 종료를 권고한다', () => {
    expect(resolveSessionRecommendation('continue', SESSION_TURN_LIMIT)).toBe('end_session')
    expect(resolveSessionRecommendation('continue', SESSION_TURN_LIMIT + 3)).toBe('end_session')
  })

  it('안전 권고가 없고 세션 길이 미달이면 계속 진행', () => {
    expect(resolveSessionRecommendation('continue', 0)).toBe('continue')
    expect(resolveSessionRecommendation('continue', SESSION_TURN_LIMIT - 1)).toBe('continue')
  })
})

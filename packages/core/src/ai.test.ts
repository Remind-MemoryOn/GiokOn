import { describe, it, expect } from 'vitest'
import {
  generateOpener,
  generateReply,
  extractChronicle,
  generateGuardianReport,
} from './ai'
import { DEFAULT_APPEARANCE } from './types'
import type { ElderProfile, Session, ConversationTurn } from './types'

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
  id: 't' + Math.random(),
  speaker: 'AI',
  text: '...',
  timestamp: '',
  topic,
})

describe('generateOpener', () => {
  it('첫 질문에 어르신 연대기(출신지)가 반영된다', () => {
    const res = generateOpener(elder, session, [])
    expect(res.question).toContain('전주')
    expect(res.switchTopic).toBe(false)
  })
})

describe('generateReply', () => {
  it('고통/부정 키워드가 감지되면 주제를 전환한다', () => {
    const res = generateReply(elder, session, [aiTurn('가족')], '남편이 먼저 돌아가셨어요')
    expect(res.switchTopic).toBe(true)
  })

  it('동일 주제가 연속되면 주제를 전환한다', () => {
    const history = [aiTurn('고향'), aiTurn('고향')]
    const res = generateReply(elder, session, history, '동네 사람들이 참 좋았어요')
    expect(res.switchTopic).toBe(true)
    expect(res.topic).not.toBe('고향')
  })

  it('일반 답변에는 같은 주제로 후속 질문한다', () => {
    const res = generateReply(elder, session, [aiTurn('고향')], '거기서 오래 살았지요')
    expect(res.switchTopic).toBe(false)
    expect(res.topic).toBe('고향')
  })
})

describe('extractChronicle', () => {
  it('키워드가 포함된 충분한 발화에서 연대기를 추출한다', () => {
    const res = extractChronicle('전주에서 식당을 30년 했어요')
    expect(res).not.toBeNull()
    expect(res!.topic).toBe('고향')
    expect(res!.keywords).toContain('전주')
  })

  it('너무 짧은 발화는 추출하지 않는다', () => {
    expect(extractChronicle('네')).toBeNull()
  })
})

describe('generateGuardianReport', () => {
  it('자주 언급된 주제와 새 연대기 수를 리포트에 담는다', () => {
    const turns: ConversationTurn[] = [
      { id: 'u1', speaker: 'Elderly', text: '전주 고향이 참 좋았지요', timestamp: '', extractedKeywords: ['고향'] },
    ]
    const report = generateGuardianReport(elder, turns, 1)
    expect(report.highlightTopics).toContain('고향')
    expect(report.headline).toContain('고향')
    expect(report.newChronicleCount).toBe(1)
  })
})

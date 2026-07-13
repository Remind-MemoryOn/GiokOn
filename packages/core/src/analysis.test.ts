import { describe, expect, it } from 'vitest'
import { analyzeSession, recommendNextTopics } from './analysis'
import { DEFAULT_APPEARANCE } from './types'
import type { ChronicleEntry, ConversationTurn, ElderProfile } from './types'

const elder: ElderProfile = {
  id: 'e1', name: '이순자', birthYear: 1945, hometown: '전주', family: '딸 둘',
  job: '식당 운영', hobbies: '텃밭 가꾸기', avatarColor: '#fff',
  appearance: DEFAULT_APPEARANCE, createdAt: '', updatedAt: '',
}

let seq = 0
const ai = (topic: string, text = '...'): ConversationTurn => ({
  id: 'a' + ++seq, speaker: 'AI', text, timestamp: '', topic,
})
const el = (text: string, kw?: string[]): ConversationTurn => ({
  id: 'e' + ++seq, speaker: 'Elderly', text, timestamp: '', extractedKeywords: kw,
})

describe('analyzeSession — 관찰 지표', () => {
  const turns: ConversationTurn[] = [
    ai('고향'), el('그때 전주 남부시장에서 국밥집을 삼십 년 했었지', ['고향', '시장']),
    ai('고향'), el('새벽마다 사람들이 북적북적 정말 정겨웠어', ['시장']),
    ai('음식'), el('글쎄'),
    ai('음식'), el('...'),
    ai('가족'), el('그때 딸들이 어렸을 때 참 착하게 잘 컸었지 지금도 고마운 일이야', ['가족']),
  ]

  const a = analyzeSession(elder, turns)

  it('응답률·참여도·발화길이를 대화에서 직접 센다', () => {
    expect(a.metrics.aiTurns).toBe(5)
    expect(a.metrics.elderTurns).toBe(5)
    expect(a.metrics.responseRate).toBeGreaterThan(0)
    expect(a.metrics.responseRate).toBeLessThanOrEqual(1)
    expect(a.metrics.avgUtteranceChars).toBeGreaterThan(0)
  })

  it('호응 좋았던 주제와 저조했던 주제를 구분한다', () => {
    expect(a.topicsEngaged).toContain('고향')
    expect(a.topicsEngaged).toContain('가족')
    expect(a.topicsLow).toContain('음식') // 단답·침묵
  })

  it('관심 키워드를 빈도순으로 뽑는다', () => {
    expect(a.interestKeywords[0]).toBe('시장') // 2회
  })

  it('요약은 관찰 표현이며 효능 주장(향상/효과 %)이 없다', () => {
    expect(a.summary).toBeTruthy()
    expect(a.summary).not.toMatch(/향상|효과|개선|\d+%/)
  })

  it('안전·마무리 등 메타 주제는 분석에서 제외', () => {
    const withSafety = [...turns, ai('안전'), el('죽고 싶어')]
    const a2 = analyzeSession(elder, withSafety)
    expect(a2.topicOutcomes.some((t) => t.topic === '안전')).toBe(false)
  })

  it('빈 대화도 안전하게 처리', () => {
    const a3 = analyzeSession(elder, [])
    expect(a3.metrics.elderTurns).toBe(0)
    expect(a3.summary).toContain('많지 않')
  })
})

describe('recommendNextTopics', () => {
  it('호응 좋았던 주제를 우선, 저조 주제는 제외', () => {
    const rec = recommendNextTopics(elder, [], ['고향'], ['음식'])
    expect(rec[0]).toBe('고향')
    expect(rec).not.toContain('음식')
    expect(rec.length).toBeLessThanOrEqual(3)
  })

  it('프로필 재료가 있는 주제로 채운다', () => {
    const rec = recommendNextTopics(elder, [])
    expect(rec.length).toBe(3)
    expect(rec.every((t) => typeof t === 'string')).toBe(true)
  })

  it('연대기 최근 주제도 반영', () => {
    const chron: ChronicleEntry[] = [
      { id: 'c1', elderId: 'e1', topic: '노래', content: '노래를 좋아하셨다', keywords: ['노래'], source: 'Caregiver', recordedAt: '', updatedAt: '' },
    ]
    const rec = recommendNextTopics(elder, chron, [], [])
    expect(rec).toContain('노래')
  })
})

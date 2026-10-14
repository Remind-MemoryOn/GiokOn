import { describe, expect, it } from 'vitest'
import { analyzeSession, detectTurnTopic, recommendNextTopics } from './analysis'
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

  it('한 질문에 어르신 발화가 여러 번 이어져도 응답률은 100%를 넘지 않는다', () => {
    const result = analyzeSession(elder, [ai('고향'), el('전주에서 살았어'), el('시장 옆집이었지')])
    expect(result.metrics.elderTurns).toBe(2)
    expect(result.metrics.responseRate).toBe(1)
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

describe('detectTurnTopic — Live 질문 주제 태깅', () => {
  it('표준 주제별 근거로 판별한다', () => {
    expect(detectTurnTopic('어르신, 고향 동네가 그리우실 때가 있으세요?')).toBe('고향')
    expect(detectTurnTopic('명절에 가족들 다 모이면 뭐 하고 지내셨어요?')).toBe('가족')
    expect(detectTurnTopic('일하시면서 만난 분들 중에 기억나는 분 있으세요?')).toBe('직업')
    expect(detectTurnTopic('등산이나 낚시는 요즘도 하세요?')).toBe('취미')
    expect(detectTurnTopic('잔칫날에는 어떤 음식을 하셨어요?')).toBe('음식')
    expect(detectTurnTopic('학교 가는 길은 어땠어요? 멀었어요?')).toBe('학창 시절')
    expect(detectTurnTopic('젊으셨을 적에 자주 부르시던 노래가 있으세요?')).toBe('노래')
  })

  it('동점이면 더 나중에 언급한 주제를 고른다(브리지 문장)', () => {
    expect(
      detectTurnTopic('고향 이야기 잘 들었어요. 이제 자녀분들 이야기도 해볼까요?'),
    ).toBe('가족')
  })

  it('근거가 없으면 null — 호출부는 직전 주제를 유지해야 한다', () => {
    expect(detectTurnTopic('오늘 이렇게 이야기 나눠 주셔서 고마워요.')).toBe(null)
    expect(detectTurnTopic('   ')).toBe(null)
  })

  it('띄어쓰기·문장부호와 무관하게 매칭한다', () => {
    expect(detectTurnTopic('어르신, 학창 시절 이야기 들려주세요!')).toBe('학창 시절')
  })

  it('오염 가능한 부분일치를 오탐으로 쓰지 않는다', () => {
    expect(detectTurnTopic('딸기가 제철이라 맛있겠어요.')).not.toBe('가족') // '딸' 금지
    expect(detectTurnTopic('우리 한국의 아름다운 바다 이야기 해볼까요?')).toBe('풍경') // '국' 금지
  })
})

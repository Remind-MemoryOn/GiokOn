import { describe, it, expect } from 'vitest'
import {
  generateOpener,
  generateReply,
  extractChronicle,
  generateGuardianReport,
  filterAvoidedBanks,
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

let turnSeq = 0
const aiTurn = (topic: string): ConversationTurn => ({
  id: 't' + ++turnSeq,
  speaker: 'AI',
  text: '...',
  timestamp: '',
  topic,
})
const elderTurn = (text: string): ConversationTurn => ({
  id: 't' + ++turnSeq,
  speaker: 'Elderly',
  text,
  timestamp: '',
})

describe('generateOpener', () => {
  it('첫 질문에 어르신 연대기(출신지)가 반영된다', () => {
    const res = generateOpener(elder, session, [])
    expect(res.question).toContain('전주')
    expect(res.switchTopic).toBe(false)
  })
})

describe('generateReply — 애도·상실 (회피 금지)', () => {
  it('상실 언급에 강제 전환하지 않고 공감 + 선택권을 준다', () => {
    const res = generateReply(elder, session, [aiTurn('가족')], '남편이 먼저 돌아가셨어요')
    expect(res.switchTopic).toBe(false) // 회피·강제 전환 금지
    expect(res.topic).toBe('가족')
    expect(res.question).toContain('그리우시지요')
    expect(res.question).toContain('다른 이야기를 해도 괜찮아요') // 어르신이 선택
  })

  it('애도가 3회 이상 이어지면 부드럽게 따뜻한 주제로 옮긴다', () => {
    const history = [
      aiTurn('가족'),
      elderTurn('남편이 먼저 돌아가셨어'),
      aiTurn('가족'),
      elderTurn('영감이 너무 그리워'),
      aiTurn('가족'),
    ]
    const res = generateReply(elder, session, history, '보고 싶어서 눈물만 나')
    expect(res.switchTopic).toBe(true)
    expect(res.topic).not.toBe('가족')
    expect(res.question).toContain('고마워요') // 이야기를 존중하고 나서 이동
  })
})

describe('generateReply — 위기·중단·거부·혼란', () => {
  it('위기 발화에는 안전 응답(주제=안전)', () => {
    const res = generateReply(elder, session, [aiTurn('가족')], '이제 그만 죽고 싶어')
    expect(res.topic).toBe('안전')
    expect(res.question).toContain('선생님을 불러드릴게요')
  })

  it('중단 요청은 즉시 존중하고 따뜻하게 마무리한다', () => {
    const res = generateReply(elder, session, [aiTurn('고향')], '오늘은 그만하고 싶어')
    expect(res.topic).toBe('마무리')
    expect(res.question).toContain('고마워요')
  })

  it('거부 1회에는 사과하고 물러난다(질문 강요 없음)', () => {
    const res = generateReply(elder, session, [aiTurn('고향')], '왜 자꾸 물어')
    expect(res.switchTopic).toBe(false)
    expect(res.question).toContain('미안해요')
  })

  it('거부가 반복되면 마무리한다', () => {
    const history = [aiTurn('고향'), elderTurn('듣기 싫어'), aiTurn('고향')]
    const res = generateReply(elder, session, history, '그만 물어봐')
    expect(res.topic).toBe('마무리')
  })

  it('지남력 혼란에는 교정 없이 재소개(AI 고지)와 안심을 준다', () => {
    const res = generateReply(elder, session, [aiTurn('고향')], '누구세요? 여기가 어디야?')
    expect(res.question).toContain('인공지능 친구')
    expect(res.question).toContain('안전한 곳')
  })
})

describe('generateReply — 침묵 (단계적 대응)', () => {
  it('첫 침묵에는 같은 주제로 부드럽게 다시 청한다', () => {
    const res = generateReply(elder, session, [aiTurn('고향')], '')
    expect(res.switchTopic).toBe(false)
    expect(res.question).toContain('천천히')
  })

  it('침묵이 이어지면 더 쉬운 다른 주제로', () => {
    const history = [aiTurn('고향'), elderTurn(''), aiTurn('고향')]
    const res = generateReply(elder, session, history, '')
    expect(res.switchTopic).toBe(true)
  })

  it('침묵이 3회면 휴식을 제안한다', () => {
    const history = [aiTurn('고향'), elderTurn(''), aiTurn('고향'), elderTurn(''), aiTurn('고향')]
    const res = generateReply(elder, session, history, '')
    expect(res.topic).toBe('마무리')
  })
})

describe('generateReply — 관여도 기반 진행 (고정 카운터 없음)', () => {
  it('풍부한 이야기에는 같은 주제로 계속 이어간다', () => {
    const history = [aiTurn('고향'), elderTurn('그때 동네 사람들이 다 모여 잔치를 했었지'), aiTurn('고향')]
    const res = generateReply(elder, session, history, '그러다가 밤이 되면 다 같이 노래를 불렀었어')
    expect(res.switchTopic).toBe(false)
    expect(res.topic).toBe('고향')
  })

  it('저관여 1회에는 같은 주제를 더 쉽게(스캐폴딩)', () => {
    const history = [aiTurn('고향'), elderTurn('전주에서 오래 살았지'), aiTurn('고향')]
    const res = generateReply(elder, session, history, '글쎄')
    expect(res.switchTopic).toBe(false)
    expect(res.topic).toBe('고향')
    expect(res.question).toContain('천천히')
  })

  it('저관여가 이어지면 다른 쉬운 주제로 전환한다', () => {
    const history = [aiTurn('고향'), elderTurn('몰라'), aiTurn('고향')]
    const res = generateReply(elder, session, history, '글쎄')
    expect(res.switchTopic).toBe(true)
    expect(res.topic).not.toBe('고향')
  })

  it('어르신이 먼저 꺼낸 주제를 따라간다(어르신 주도)', () => {
    const history = [aiTurn('고향'), elderTurn('동네가 참 좋았지'), aiTurn('고향')]
    const res = generateReply(elder, session, history, '그때 학교 친구들이 참 많이 도와줬어 다들')
    expect(res.switchTopic).toBe(true)
    expect(res.topic).toBe('학창 시절')
  })

  it('질문 풀이 소진되면 다리 문장과 함께 주제를 옮긴다(기계적 반복 금지)', () => {
    // 고향 주제로 opener + followup 3개를 모두 소진한 상태(연속 AI 4턴).
    const history = [
      aiTurn('고향'), elderTurn('국밥집을 했었지'),
      aiTurn('고향'), elderTurn('사람들이 정이 많았어'),
      aiTurn('고향'), elderTurn('시장 골목이 그리워'),
      aiTurn('고향'),
    ]
    const res = generateReply(elder, session, history, '봄이면 꽃이 참 예뻤지')
    expect(res.switchTopic).toBe(true)
    expect(res.topic).not.toBe('고향')
  })

  it('힘들어했던 주제로는 되돌아가지 않는다', () => {
    // 가족 주제에서 애도 반응 → 이후 저관여 연속 전환 시 가족 제외.
    const history = [
      aiTurn('가족'), elderTurn('남편이 먼저 갔어'),
      aiTurn('고향'), elderTurn('몰라'),
      aiTurn('고향'),
    ]
    const res = generateReply(elder, session, history, '글쎄')
    expect(res.switchTopic).toBe(true)
    expect(res.topic).not.toBe('가족')
    expect(res.topic).not.toBe('고향')
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

  it('위기 발화는 연대기(추억)로 축적하지 않는다', () => {
    expect(extractChronicle('아들놈이 자꾸 때려서 무서워')).toBeNull()
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

describe('filterAvoidedBanks — 피해갈 내용(설계) 주제 배제', () => {
  const topics = [{ topic: '고향' }, { topic: '가족' }, { topic: '음식' }]

  it('설계가 없으면 원본 배열을 그대로 되돌린다', () => {
    expect(filterAvoidedBanks(topics, undefined)).toEqual(topics)
    expect(filterAvoidedBanks(topics, null)).toEqual(topics)
    expect(filterAvoidedBanks(topics, '')).toEqual(topics)
  })

  it('토큰과 부분일치하는 주제를 제외한다', () => {
    const kept = filterAvoidedBanks(topics, '가족 얘기는 빼고')
    expect(kept.map((b) => b.topic)).toEqual(['고향', '음식'])
  })

  it('구분자로 끊은 여러 토큰을 모두 적용한다', () => {
    const kept = filterAvoidedBanks(topics, '고향, 가족 이야기는 피하고 싶어요')
    expect(kept.map((b) => b.topic)).toEqual(['음식'])
  })

  it('전부 가려지면 원본을 유지한다(대화 불능 방지 — 본문 금지는 프롬프트 계층)', () => {
    expect(filterAvoidedBanks(topics, '고향 가족 음식')).toEqual(topics)
  })

  it('2자 미만 토큰은 무시한다', () => {
    expect(filterAvoidedBanks(topics, 'a, 갑')).toEqual(topics)
  })
})

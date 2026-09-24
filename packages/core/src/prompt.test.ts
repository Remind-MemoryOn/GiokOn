import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, PROMPT_VERSION } from './prompt'
import { screenAiUtterance } from './safety'
import { DEFAULT_APPEARANCE } from './types'
import type { ChronicleEntry, ElderProfile } from './types'

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

const chronicle: ChronicleEntry[] = [
  {
    id: 'c1', elderId: 'e1', topic: '가족', content: '딸 둘을 혼자 키웠다',
    keywords: ['딸'], source: 'Caregiver', recordedAt: '', updatedAt: '',
  },
]

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(elder, chronicle)

  it('Live 음성 모드는 개인화·안전 규칙을 유지하고 JSON 출력 요구를 제거한다', () => {
    const speech = buildSystemPrompt(elder, chronicle, undefined, 'speech')
    expect(speech).toContain(elder.name)
    expect(speech).toContain('위기 대응')
    expect(speech).toContain('비의료')
    expect(speech).toContain('한국어 음성')
    expect(speech).not.toContain('JSON 형식으로만')
    expect(speech).not.toContain('safety.risk')
    expect(prompt).toContain('JSON 형식으로만')
  })

  it('어르신 개인화 정보(연대기)를 포함한다', () => {
    expect(prompt).toContain('이순자')
    expect(prompt).toContain('전주')
    expect(prompt).toContain('딸 둘을 혼자 키웠다')
  })

  it('핵심 돌봄 원칙을 인코딩한다', () => {
    expect(prompt).toContain('교정 금지')
    expect(prompt).toContain('반복 수용')
    expect(prompt).toContain('자기결정 존중')
    expect(prompt).toContain('비의료')
    expect(prompt).toContain('아까 말씀하셨어요')
  })

  it('위기 프로토콜과 분류를 인코딩한다', () => {
    expect(prompt).toContain('self_harm')
    expect(prompt).toContain('medical_emergency')
    expect(prompt).toContain('abuse')
    expect(prompt).toContain('선생님을 불러드릴게요')
  })

  it('AI 정체성 고지를 포함한다(투명성)', () => {
    expect(prompt).toContain('인공지능')
  })

  it('음성(TTS) 발화 규칙을 포함한다', () => {
    expect(prompt).toContain('질문은 꼭 하나만')
    expect(prompt).toContain('존댓말')
  })

  it('프롬프트 자체가 출력 가드레일에 걸리지 않는 예시 발화만 담는다', () => {
    // 프롬프트 내 예시로 든 발화 문구가 어르신 응답으로 새어 나가도 안전해야 한다.
    expect(screenAiUtterance('저는 어르신 말동무를 하는 인공지능 친구예요').allowed).toBe(true)
  })

  it('버전이 있다(평가·회귀 추적)', () => {
    expect(PROMPT_VERSION).toMatch(/^v\d/)
  })

  it('세션 설계(goal/content/keywords)를 주입한다', () => {
    const p = buildSystemPrompt(elder, chronicle, {
      title: '어린 시절 이야기',
      goal: '고향 친구 이야기 꺼내기',
      content: '감나무와 동네 풍경을 소재로',
      keywords: ['감나무', '동네'],
    })
    expect(p).toContain('오늘 세션 설계')
    expect(p).toContain('고향 친구 이야기 꺼내기')
    expect(p).toContain('감나무와 동네 풍경을 소재로')
    expect(p).toContain('감나무, 동네')
  })

  it('피해갈 내용은 엄금 문구로 주입한다(스스로 꺼내지 않는다)', () => {
    const p = buildSystemPrompt(elder, chronicle, { avoidTopics: '돌아가신 남편' })
    expect(p).toContain('절대 스스로 꺼내지 않습니다')
    expect(p).toContain('돌아가신 남편')
  })

  it('설계가 없으면 설계 섹션을 만들지 않는다(근거 없는 값 금지)', () => {
    expect(buildSystemPrompt(elder, chronicle)).not.toContain('오늘 세션 설계')
    // 빈 설계 객체도 섹션을 만들지 않는다
    expect(buildSystemPrompt(elder, chronicle, {})).not.toContain('오늘 세션 설계')
  })
})

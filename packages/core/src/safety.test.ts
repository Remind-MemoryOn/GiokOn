import { describe, expect, it } from 'vitest'
import {
  AI_DISCLOSURE,
  AI_GENERATED_LABEL,
  assessRisk,
  screenAiUtterance,
} from './safety'

describe('assessRisk — 위기 감지', () => {
  it('자살 표현은 crisis + 사람 에스컬레이션', () => {
    const r = assessRisk('이제 그만 죽고 싶어')
    expect(r.level).toBe('crisis')
    expect(r.categories).toContain('self_harm')
    expect(r.escalate).toBe(true)
    expect(r.safeReply).toBeTruthy()
    expect(r.caregiverAlert).toContain('109')
  })

  it('띄어쓰기 변이("죽고싶어")도 감지', () => {
    expect(assessRisk('죽고싶어').level).toBe('crisis')
  })

  it('응급(호흡곤란)은 crisis + 119 안내', () => {
    const r = assessRisk('숨이 안 쉬어져요')
    expect(r.level).toBe('crisis')
    expect(r.categories).toContain('medical_emergency')
    expect(r.caregiverAlert).toContain('119')
  })

  it('학대 의심은 crisis + 노인보호전문기관 안내', () => {
    const r = assessRisk('아들이 자꾸 때려요')
    expect(r.level).toBe('crisis')
    expect(r.categories).toContain('abuse')
    expect(r.caregiverAlert).toContain('1577-1389')
  })

  it('급성 정서 고통은 watch(에스컬레이션 아님, 지지 응답)', () => {
    const r = assessRisk('너무 무서워서 견딜 수가 없어')
    expect(r.level).toBe('watch')
    expect(r.escalate).toBe(false)
    expect(r.safeReply).toBeTruthy()
  })

  it('심각도 우선순위: 자살+응급 동시 → self_harm 안내 우선', () => {
    const r = assessRisk('가슴이 너무 아파서 죽고 싶어')
    expect(r.level).toBe('crisis')
    expect(r.categories[0]).toBe('self_harm')
    expect(r.safeReply).toBe(assessRisk('죽고 싶어').safeReply)
  })

  it('안전한 일상 대화는 none (오탐 없음)', () => {
    expect(assessRisk('오늘 아침에 죽 한 그릇 맛있게 먹었어').level).toBe('none')
    expect(assessRisk('그 말이 맞아요, 참 좋았지').level).toBe('none')
    expect(assessRisk('전주에서 식당을 오래 했지').level).toBe('none')
  })

  it('빈 문자열은 none', () => {
    const r = assessRisk('')
    expect(r.level).toBe('none')
    expect(r.matchedTerms).toEqual([])
  })
})

describe('screenAiUtterance — 출력 가드레일', () => {
  it('의학적 진단 단정은 차단 + 대체 발화', () => {
    const s = screenAiUtterance('어르신은 치매입니다. 병원 가지 마세요.')
    expect(s.allowed).toBe(false)
    expect(s.safeAlternative).toBeTruthy()
    expect(s.reason).toMatch(/의학|비의료/)
  })

  it('약 복용 지시는 차단', () => {
    expect(screenAiUtterance('그 약을 끊으세요').allowed).toBe(false)
  })

  it('유해·부적절 표현은 차단', () => {
    expect(screenAiUtterance('그것도 모르다니 바보 같네요').allowed).toBe(false)
  })

  it('정상적인 회상 질문은 통과', () => {
    const s = screenAiUtterance('어르신, 전주에서 제일 기억에 남는 게 뭐예요?')
    expect(s.allowed).toBe(true)
    expect(s.reason).toBeUndefined()
  })
})

describe('투명성 고지 상수', () => {
  it('AI 이용 고지·생성물 라벨을 제공한다', () => {
    expect(AI_DISCLOSURE).toContain('AI')
    expect(AI_GENERATED_LABEL).toContain('AI')
  })
})

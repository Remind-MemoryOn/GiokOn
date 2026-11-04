import { describe, expect, it } from 'vitest'
import {
  answerGuardian,
  applyPlanAnswer,
  detectCaregiverTask,
  GUARDIAN_FAQ,
  GUARDIAN_UNKNOWN_FOLLOW_UPS,
  isCancel,
  latestEndedSession,
  isSkip,
  matchElder,
  nextPlanStep,
  parseKeywords,
  parsePlanDate,
  parseTargetMinutes,
  planPatch,
  planSummary,
  PLAN_LIMITS,
  type PlanDraft,
} from './assistant'

const elders = [
  { id: 'e1', name: '박희수' },
  { id: 'e2', name: '김영자' },
  { id: 'e3', name: '김영숙' },
]
const ctx = { elders, today: '2026-11-04', defaultAvoid: ['가족 갈등'] }

describe('보호자 FAQ', () => {
  it('시안의 첫 질문 "기록은 어떻게 작성하나요?" 에 기록 답을 준다', () => {
    const a = answerGuardian('기록은 어떻게 작성하나요?')
    expect(a.kind).toBe('faq')
    expect(a.kind === 'faq' && a.faq.id).toBe('record')
  })
  it('모든 대표 질문은 자기 답을 고른다(순서 충돌 없음)', () => {
    for (const faq of GUARDIAN_FAQ) {
      const a = answerGuardian(faq.question)
      expect(a.kind === 'faq' && a.faq.id, faq.question).toBe(faq.id)
    }
  })
  it('주제 없는 문의 표현은 요양보호사에게 넘긴다', () => {
    expect(answerGuardian('요양보호사 선생님께 직접 물어보고 싶어요').kind).toBe('handoff')
    expect(answerGuardian('문의할게요').kind).toBe('handoff')
  })
  it('모르는 질문·빈 입력은 지어내지 않고 unknown', () => {
    expect(answerGuardian('오늘 날씨 어때요').kind).toBe('unknown')
    expect(answerGuardian('   ').kind).toBe('unknown')
  })
  it('질문마다 이어지는 버튼 — 기록은 최근 소식, 분석은 최근 대화 분석, 모두 마지막에 다른 질문 보기', () => {
    const by = Object.fromEntries(GUARDIAN_FAQ.map((f) => [f.id, f.followUps]))
    expect(by.record).toContain('latest_feed')
    expect(by.analysis).toContain('latest_analysis')
    for (const faq of GUARDIAN_FAQ) expect(faq.followUps.at(-1), faq.id).toBe('more')
    expect(GUARDIAN_UNKNOWN_FOLLOW_UPS).toEqual(['handoff', 'more'])
  })
  it('최근 대화 분석 = 끝난 대화 중 가장 늦게 끝난 것(진행 중·설계는 제외, 없으면 null)', () => {
    const s = (id: string, status: string, ended_at: string | null, started_at: string | null = null) => ({ id, status, ended_at, started_at })
    expect(latestEndedSession([
      s('a', 'ended', '2026-11-01T01:00:00Z'), s('b', 'ended', '2026-11-03T01:00:00Z'),
      s('c', 'active', null, '2026-11-04T01:00:00Z'), s('d', 'planned', null),
    ])?.id).toBe('b')
    expect(latestEndedSession([s('e', 'ended', null, '2026-11-02T00:00:00Z'), s('f', 'ended', '2026-11-01T00:00:00Z')])?.id).toBe('e')
    expect(latestEndedSession([s('g', 'active', null)])).toBeNull()
  })
  it('답 문구에 판정형·의료 표현이 없다', () => {
    for (const faq of GUARDIAN_FAQ) {
      expect(faq.answer).not.toMatch(/진단|치료|처방|의심|점수가|등급이/)
    }
  })
})

describe('요양보호사 업무 고르기', () => {
  it.each([
    ['박희수 어르신 세션 설계해 줘', 'design'],
    ['회상 세션 만들래', 'design'],
    ['일지 공개해 줘', 'share'],
    ['공개 철회', 'share'],
    ['보호자 메시지 보여줘', 'messages'],
    ['답장할래', 'messages'],
    ['확인할 일 있어?', 'todo'],
    ['위기 알림', 'todo'],
  ] as const)('"%s" → %s', (text, task) => {
    expect(detectCaregiverTask(text)).toBe(task)
  })
  it('관계없는 말은 null', () => {
    expect(detectCaregiverTask('안녕하세요')).toBeNull()
  })
  it('취소·건너뛰기는 그 말일 때만 — 답 속의 같은 낱말은 아니다', () => {
    expect(isCancel('취소')).toBe(true)
    expect(isCancel('취소된 여행 이야기')).toBe(false)
    expect(isSkip('건너뛰기')).toBe(true)
    expect(isSkip('없어진 고향집 이야기')).toBe(false)
  })
})

describe('어르신 고르기', () => {
  it('정확한 이름·"어르신" 붙임·부분 일치', () => {
    expect(matchElder('박희수', elders).map((e) => e.id)).toEqual(['e1'])
    expect(matchElder('박희수 어르신', elders).map((e) => e.id)).toEqual(['e1'])
    expect(matchElder('김영', elders).map((e) => e.id)).toEqual(['e2', 'e3'])
    expect(matchElder('이순자', elders)).toEqual([])
  })
})

describe('날짜·시간·키워드 해석', () => {
  it('오늘·내일·모레와 날짜 형식', () => {
    expect(parsePlanDate('오늘', '2026-11-04')).toBe('2026-11-04')
    expect(parsePlanDate('내일', '2026-11-04')).toBe('2026-11-05')
    expect(parsePlanDate('모레', '2026-12-31')).toBe('2027-01-02')
    expect(parsePlanDate('11월 7일', '2026-11-04')).toBe('2026-11-07')
    expect(parsePlanDate('2026-11-20', '2026-11-04')).toBe('2026-11-20')
    expect(parsePlanDate('2026.11.20', '2026-11-04')).toBe('2026-11-20')
  })
  it('연도 없는 지난 날짜는 내년, 없는 날짜는 null', () => {
    expect(parsePlanDate('1월 3일', '2026-11-04')).toBe('2027-01-03')
    expect(parsePlanDate('2월 30일', '2026-11-04')).toBeNull()
    expect(parsePlanDate('다음 주쯤', '2026-11-04')).toBeNull()
  })
  it('목표 시간은 5~10분만', () => {
    expect(parseTargetMinutes('7분')).toBe(7)
    expect(parseTargetMinutes('10')).toBe(10)
    expect(parseTargetMinutes('4분')).toBeNull()
    expect(parseTargetMinutes('11분')).toBeNull()
    expect(parseTargetMinutes('적당히')).toBeNull()
  })
  it('키워드는 쉼표로 나누고 중복·빈 값을 뺀다', () => {
    expect(parseKeywords('시장, 봄나물,,시장, #백설기')).toEqual(['시장', '봄나물', '백설기'])
  })
})

describe('세션 설계 흐름', () => {
  function run(answers: string[]): PlanDraft {
    let d: PlanDraft = {}
    for (const a of answers) {
      const r = applyPlanAnswer(d, a, ctx)
      if (!r.ok) throw new Error(`${nextPlanStep(d)}: ${r.reason}`)
      d = r.draft
    }
    return d
  }

  it('모달과 같은 값으로 저장 값을 만든다', () => {
    const d = run(['박희수', '봄 시장 이야기', '즐거운 기억 떠올리기', '8분', '내일', '시장 풍경 위주로', '기본값 사용', '시장, 백설기'])
    expect(nextPlanStep(d)).toBe('confirm')
    expect(planPatch(d)).toEqual({
      title: '봄 시장 이야기', goal: '즐거운 기억 떠올리기', duration_minutes: 8, planned_date: '2026-11-05',
      content: '시장 풍경 위주로', avoid_topics: '가족 갈등', keywords: ['시장', '백설기'],
    })
  })

  it('선택 항목을 건너뛰면 비운다(값을 지어내지 않는다)', () => {
    const d = run(['박희수', '제목', '목표', '10', '오늘', '건너뛰기', '건너뛰기', '건너뛰기'])
    expect(planPatch(d)).toMatchObject({ content: null, avoid_topics: null, keywords: [] })
    expect(planSummary(d)).toContainEqual(['피해갈 내용', '없음'])
  })

  it('필수·길이·범위·지난 날짜를 거절하고 같은 단계에 머문다', () => {
    const atTitle: PlanDraft = { elder: elders[0] }
    expect(applyPlanAnswer(atTitle, '   ', ctx).ok).toBe(false)
    expect(applyPlanAnswer(atTitle, 'ㄱ'.repeat(PLAN_LIMITS.title + 1), ctx).ok).toBe(false)
    const atMinutes: PlanDraft = { elder: elders[0], title: 't', goal: 'g' }
    expect(applyPlanAnswer(atMinutes, '12분', ctx).ok).toBe(false)
    const atDate: PlanDraft = { ...atMinutes, minutes: 5 }
    expect(applyPlanAnswer(atDate, '2026-11-01', ctx).ok).toBe(false)
  })

  it('이름이 여럿이면 하나로 정하지 않는다', () => {
    const r = applyPlanAnswer({}, '김영', ctx)
    expect(r.ok).toBe(false)
  })

  it('필수 값이 없으면 저장 값을 만들지 않는다', () => {
    expect(planPatch({ elder: elders[0], title: 't' })).toBeNull()
  })
})

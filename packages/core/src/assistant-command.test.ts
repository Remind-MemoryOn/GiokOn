import { describe, expect, it } from 'vitest'
import { nextPlanStep, planPatch } from './assistant'
import { findDateMention, hasLabelledPlanSlots, mergePlan, parseCaregiverCommand, planDefaults } from './assistant-command'

const elders = [
  { id: 'e1', name: '박희수' },
  { id: 'e2', name: '김영자' },
  { id: 'e3', name: '김영숙' },
]
const guardians = [{ id: 'g1', name: '김보호' }, { id: 'g2', name: '이가족' }]
const today = '2026-11-04' // 수요일
const ctx = { elders, guardians, today }
const merge = { today, orgTarget: 8, defaultAvoid: ['전쟁', '돌아가신 가족'] }
const parse = (t: string) => parseCaregiverCommand(t, ctx)

describe('사용자 예문', () => {
  it('"OOO 어르신 세션 대신 설계하는데, 대화 주제는 가족으로 하자." → 설계 · 어르신 · 주제', () => {
    const c = parse('박희수 어르신 세션 대신 설계하는데, 대화 주제는 가족으로 하자.')
    expect(c.task).toBe('design')
    expect(c.elders.map((e) => e.id)).toEqual(['e1'])
    expect(c.plan.topic).toBe('가족')
    expect(c.problems).toEqual([])
  })

  it('주제는 키워드로, 제목은 제안, 나머지는 모달 기본값 — 남은 것은 목표뿐', () => {
    const c = parse('박희수 어르신 세션 대신 설계하는데, 대화 주제는 가족으로 하자.')
    const { draft, notes } = mergePlan({}, c, merge, true)
    expect(draft).toMatchObject({
      elder: elders[0], title: '가족 이야기', keywords: ['가족'],
      minutes: 8, plannedDate: today, content: null, avoid: '전쟁, 돌아가신 가족',
    })
    expect(draft.goal).toBeUndefined()
    expect(nextPlanStep(draft)).toBe('goal')
    expect(notes.join('\n')).toMatch(/가족 이야기/)
    expect(notes.join('\n')).toMatch(/기본값/)
  })
})

describe('꼬리표 값', () => {
  it('한 문장에 여러 값 — 쉼표·"하고" 로 이어도 나눈다', () => {
    const c = parse('김영자 어르신 회상 세션 만들어 줘. 제목은 봄 시장 나들이, 목표는 즐거운 기억 떠올리기로 하고 키워드는 시장, 백설기')
    expect(c.task).toBe('design')
    expect(c.plan).toMatchObject({ title: '봄 시장 나들이', goal: '즐거운 기억 떠올리기', keywords: ['시장', '백설기'] })
  })

  it('따옴표 값은 그대로(끝의 "로" 를 떼지 않는다)', () => {
    expect(parse("제목은 '고향 가는 길로'로 하자").plan.title).toBe('고향 가는 길로')
  })

  it('목표 시간·날짜 꼬리표, 꼬리표 없는 "7분"·"다음 주 월요일"', () => {
    expect(parse('목표 시간은 7분, 날짜는 11월 7일').plan).toMatchObject({ minutes: 7, plannedDate: '2026-11-07' })
    expect(parse('박희수 어르신 다음 주 월요일에 7분짜리 세션 설계').plan).toMatchObject({ minutes: 7, plannedDate: '2026-11-09' })
  })

  it('목표 속의 숫자·낱말은 목표다(분·시간으로 읽지 않는다)', () => {
    const c = parse('목표는 10분 동안 웃으며 이야기하기')
    expect(c.plan.goal).toBe('10분 동안 웃으며 이야기하기')
    expect(c.plan.minutes).toBeUndefined()
  })

  it('범위·길이·지난 날짜는 값을 넣지 않고 이유를 돌려준다', () => {
    expect(parse('박희수 어르신 15분 세션 설계').problems).toEqual(['목표 시간은 5~10분이에요.'])
    expect(parse('박희수 어르신 세션 설계').plan.minutes).toBeUndefined()
    expect(parse(`제목은 ${'가'.repeat(51)}`).problems[0]).toMatch(/50자/)
    const past = parse('박희수 어르신 어제 날짜로 세션 설계')
    expect(past.plan.plannedDate).toBeUndefined()
    expect(past.problems).toContain('지난 날짜에는 설계할 수 없어요.')
  })

  it('"…얘기는 피하고" 는 기관 기본값에 더하고, "피해갈 내용은 …" 은 그 값으로 바꾼다', () => {
    const add = mergePlan({}, parse('박희수 어르신 세션 설계, 병원 얘기는 피해 줘'), merge, true).draft
    expect(add.avoid).toBe('전쟁, 돌아가신 가족, 병원')
    const set = mergePlan({}, parse('박희수 어르신 세션 설계, 피해갈 내용은 이사'), merge, true).draft
    expect(set.avoid).toBe('이사')
    expect(parse('피할 주제는 병원, 전쟁').plan.avoid).toBe('병원, 전쟁')
    const none = mergePlan({}, parse('박희수 어르신 세션 설계, 피해갈 내용은 없음'), merge, true).draft
    expect(none.avoid).toBeNull()
  })

  it('꼬리표 없는 "고향 이야기로" 도 주제로 읽는다', () => {
    const c = parse('박희수 어르신 고향 이야기로 세션 설계해 줘')
    expect(c.plan.topic).toBe('고향')
  })

  it('이미 정한 제목은 주제가 덮지 않는다', () => {
    const d = mergePlan({ elder: elders[0], title: '내 제목' }, parse('주제는 학교로'), merge, false).draft
    expect(d.title).toBe('내 제목')
    expect(d.keywords).toEqual(['학교'])
  })

  it('확인 단계에서 고치는 말 — 기존 값은 두고 말한 것만 바꾼다', () => {
    const base = mergePlan({}, parse('박희수 어르신 세션 설계, 주제는 가족, 목표는 즐거운 기억'), merge, true).draft
    const edited = mergePlan(base, parse('10분으로 바꿔'), merge, false).draft
    expect(edited).toMatchObject({ ...base, minutes: 10 })
    const moved = mergePlan(base, parse('김영자 어르신으로 바꿔'), merge, false).draft
    expect(moved.elder?.id).toBe('e2')
    expect(planPatch(edited)).toMatchObject({ title: '가족 이야기', goal: '즐거운 기억', keywords: ['가족'], duration_minutes: 10 })
  })

  it('꼬리표 판별 — 단계 답("가족과의 추억")은 고치는 말이 아니다', () => {
    expect(hasLabelledPlanSlots('가족과의 추억 떠올리기')).toBe(false)
    expect(hasLabelledPlanSlots('목표는 가족과의 추억')).toBe(true)
  })
})

describe('어르신 이름', () => {
  it('공백·"어르신" 상관없이 찾고, 겹치는 짧은 이름보다 긴 이름', () => {
    expect(parse('김영자어르신 세션 설계').elders.map((e) => e.id)).toEqual(['e2'])
    expect(parse('김 영 숙 세션 설계').elders.map((e) => e.id)).toEqual(['e3'])
  })
  it('목록에 없는 이름은 지어내지 않고 알린다', () => {
    const c = parse('이순자 어르신 세션 설계해 줘')
    expect(c.elders).toEqual([])
    expect(c.unknownElder).toBe('이순자')
  })
})

describe('공개 관리·답장', () => {
  it('"어제 일지 공개해 줘" → 공개 · 일지 · 지난 날짜', () => {
    const c = parse('박희수 어르신 어제 일지 공개해 줘')
    expect(c.task).toBe('share')
    expect(c.share).toEqual({ kind: 'journal', action: 'publish', date: '2026-11-03' })
  })
  it('"11월 2일 대화 요약 비공개로" → 철회 · 대화 요약 (연도 없는 날짜는 지난 쪽)', () => {
    const c = parse('김영자 어르신 11월 2일 대화 요약 비공개로 바꿔 줘')
    expect(c.share).toEqual({ kind: 'analysis', action: 'revoke', date: '2026-11-02' })
    expect(parse('12월 30일 일지 공개').share.date).toBe('2025-12-30')
  })
  it('답장 — 보호자 이름과 따옴표 본문. 본문 속 낱말은 업무로 읽지 않는다', () => {
    const c = parse("김보호 보호자님께 '세션 설계는 내일 알려 드릴게요'라고 답장해 줘")
    expect(c.task).toBe('messages')
    expect(c.reply.guardians.map((g) => g.id)).toEqual(['g1'])
    expect(c.reply.body).toBe('세션 설계는 내일 알려 드릴게요')
    expect(c.plan.title).toBeUndefined()
  })
  it('따옴표 없이 "…라고 답장"', () => {
    const c = parse('이가족 보호자한테 오늘 산책 잘 하셨어요 라고 답장')
    expect(c.reply.guardians.map((g) => g.id)).toEqual(['g2'])
    expect(c.reply.body).toBe('오늘 산책 잘 하셨어요')
  })
})

describe('날짜 표현', () => {
  it.each([
    ['내일모레', 'future', '2026-11-06'],
    ['이번 주 금요일', 'future', '2026-11-06'],
    ['다음 주 수요일', 'future', '2026-11-11'],
    ['월요일', 'future', '2026-11-09'],
    ['수요일', 'future', '2026-11-04'],
    ['월요일', 'past', '2026-11-02'],
    ['지난주 금요일', 'past', '2026-10-30'],
    ['그저께', 'past', '2026-11-02'],
    ['2026.11.20', 'future', '2026-11-20'],
    ['다음 기회에', 'future', null],
  ] as const)('%s (%s) → %s', (t, dir, want) => {
    expect(findDateMention(t, today, dir)).toBe(want)
  })
})

describe('기본값', () => {
  it('기관 목표 시간은 5~10으로 자르고, 없으면 10', () => {
    expect(planDefaults({ today, orgTarget: 30, defaultAvoid: [] }).minutes).toBe(10)
    expect(planDefaults({ today, orgTarget: null, defaultAvoid: [] })).toEqual({
      minutes: 10, plannedDate: today, content: null, avoid: null, keywords: [],
    })
  })
})

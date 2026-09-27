import { describe, expect, it } from 'vitest'
import { CARE_GRADE_LABEL, CARE_GRADES, careGradeRequired, toCareGrade } from './careGrade'

describe('장기요양등급(W8)', () => {
  it('주간보호만 필수 — 요양원·미지정은 선택', () => {
    expect(careGradeRequired('day_care')).toBe(true)
    expect(careGradeRequired('nursing_home')).toBe(false)
    expect(careGradeRequired(null)).toBe(false)
    expect(careGradeRequired(undefined)).toBe(false)
  })
  it('선택 값 → DB 값(빈 값·모르는 값은 미입력)', () => {
    expect(toCareGrade('grade_3')).toBe('grade_3')
    expect(toCareGrade('')).toBeNull()
    expect(toCareGrade('grade_9')).toBeNull()
  })
  it('등급마다 라벨이 있다(DB enum 과 같은 6종)', () => {
    expect(CARE_GRADES).toHaveLength(6)
    for (const g of CARE_GRADES) expect(CARE_GRADE_LABEL[g]).toBeTruthy()
  })
})

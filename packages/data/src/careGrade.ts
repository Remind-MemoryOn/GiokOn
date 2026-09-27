// @giokon/data — 어르신 장기요양등급(파일럿 W8 · PF-12 · T24.3)
//
// DB `profiles.care_grade`(enum, 비워 둘 수 있음). **주간보호 기관은 필수**지만 DB 는 강제하지 않는다
// (마이그레이션 20260924070000 주석 — "필수 여부는 화면이 안내한다"). 판정은 여기 한 곳에서 한다.

import type { CareGrade } from './database.types'

/** 화면 순서(1~5등급 → 인지지원등급). */
export const CARE_GRADES: readonly CareGrade[] = ['grade_1', 'grade_2', 'grade_3', 'grade_4', 'grade_5', 'cognitive_support']

export const CARE_GRADE_LABEL: Record<CareGrade, string> = {
  grade_1: '1등급',
  grade_2: '2등급',
  grade_3: '3등급',
  grade_4: '4등급',
  grade_5: '5등급',
  cognitive_support: '인지지원등급',
}

/** 기관 시설 유형이 주간보호면 등급 입력이 필수다(요양원·미지정은 선택). */
export function careGradeRequired(facilityType: string | null | undefined): boolean {
  return facilityType === 'day_care'
}

/** 선택 값(빈 문자열 = 미입력) → DB 값. 모르는 값은 미입력으로 본다. */
export function toCareGrade(value: string): CareGrade | null {
  return (CARE_GRADES as readonly string[]).includes(value) ? (value as CareGrade) : null
}

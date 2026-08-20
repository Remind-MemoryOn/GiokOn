import { describe, expect, it } from 'vitest'
import {
  birthLabel,
  birthSlashLabel,
  birthYearFromDate,
  daysInMonth,
  elderAge,
  isBirthDate,
} from './profile'

describe('isBirthDate', () => {
  it('실제 존재하는 날짜만 통과시킨다', () => {
    expect(isBirthDate('1945-03-12')).toBe(true)
    expect(isBirthDate('1944-02-29')).toBe(true) // 윤년
    expect(isBirthDate('1945-02-29')).toBe(false) // 평년
    expect(isBirthDate('1945-13-01')).toBe(false)
    expect(isBirthDate('1945-3-12')).toBe(false)
    expect(isBirthDate('')).toBe(false)
  })
})

describe('birthYearFromDate / daysInMonth', () => {
  it('연도를 뽑고, 형식이 아니면 NaN', () => {
    expect(birthYearFromDate('1945-03-12')).toBe(1945)
    expect(Number.isNaN(birthYearFromDate('1945'))).toBe(true)
  })

  it('윤년 2월은 29일', () => {
    expect(daysInMonth(1944, 2)).toBe(29)
    expect(daysInMonth(1945, 2)).toBe(28)
    expect(daysInMonth(1945, 4)).toBe(30)
    expect(daysInMonth(1945, 12)).toBe(31)
  })
})

describe('elderAge', () => {
  const now = new Date('2026-06-15T00:00:00Z')

  it('생년월일이 있으면 생일 경과 여부까지 반영한다', () => {
    expect(elderAge({ birthYear: 1945, birthDate: '1945-03-12' }, now)).toBe(81) // 생일 지남
    expect(elderAge({ birthYear: 1945, birthDate: '1945-09-30' }, now)).toBe(80) // 아직 안 옴
    expect(elderAge({ birthYear: 1945, birthDate: '1945-06-15' }, now)).toBe(81) // 당일
    expect(elderAge({ birthYear: 1945, birthDate: '1945-06-16' }, now)).toBe(80) // 하루 전
  })

  it('연도만 알면 연도 차이를 쓴다(월·일을 가정하지 않는다)', () => {
    expect(elderAge({ birthYear: 1945 }, now)).toBe(81)
  })

  it('잘못된 생년월일은 연도로 폴백한다', () => {
    expect(elderAge({ birthYear: 1945, birthDate: '1945-02-30' }, now)).toBe(81)
  })
})

describe('birthLabel', () => {
  it('생년월일이 있으면 년·월·일을 모두 표기한다', () => {
    expect(birthLabel({ birthYear: 1945, birthDate: '1945-03-12' })).toBe('1945년 3월 12일')
    expect(birthLabel({ birthYear: 1945, birthDate: '1945-11-01' })).toBe('1945년 11월 1일')
  })

  it('월·일을 모르면 아는 만큼만 표기한다(임의값 금지)', () => {
    expect(birthLabel({ birthYear: 1945 })).toBe('1945년')
    expect(birthLabel({ birthYear: 1945, birthDate: 'invalid' })).toBe('1945년')
  })
})

describe('birthSlashLabel', () => {
  it('폼 필드 표기는 `1945 / 5 / 13`(0 채우지 않음)', () => {
    expect(birthSlashLabel('1945-05-13')).toBe('1945 / 5 / 13')
    expect(birthSlashLabel('1945-11-01')).toBe('1945 / 11 / 1')
  })

  it('값이 없거나 형식이 아니면 빈 문자열', () => {
    expect(birthSlashLabel('')).toBe('')
    expect(birthSlashLabel('1945-02-30')).toBe('')
  })
})

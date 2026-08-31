import { describe, expect, it } from 'vitest'
import { dateDot, dateDotTime, formatKoreanDate, relativeDay } from './utils'

describe('relativeDay', () => {
  // 브라우저(사용자 로컬)의 달력 하루를 센다 → 테스트도 로컬 기준으로 만든다.
  const now = new Date(2026, 7, 21, 9, 0, 0)
  const at = (daysAgo: number, hour = 12) =>
    new Date(2026, 7, 21 - daysAgo, hour, 0, 0).toISOString()

  it('같은 날은 오늘(경과 시간과 무관)', () => {
    expect(relativeDay(at(0, 0), now)).toBe('오늘')
    expect(relativeDay(at(0, 23), now)).toBe('오늘')
  })
  it('하루 단위로 센다', () => {
    expect(relativeDay(at(1, 23), now)).toBe('1일 전')
    expect(relativeDay(at(22), now)).toBe('22일 전')
  })
  it('1년이 넘으면 날짜로 돌아간다', () => {
    const old = at(400)
    expect(relativeDay(old, now)).toBe(formatKoreanDate(old))
  })
  it('잘못된 값은 빈 문자열', () => {
    expect(relativeDay('not-a-date', now)).toBe('')
  })
})

describe('dateDot', () => {
  it('두 자리로 채운다', () => {
    expect(dateDot('2026-07-08T01:00:00Z')).toMatch(/^2026\.07\.0[89]$/)
  })

  it('근거가 없으면 값을 만들지 않는다', () => {
    expect(dateDot(null)).toBe('—')
    expect(dateDot(undefined)).toBe('—')
    expect(dateDot('아직 없음')).toBe('—')
  })
})

describe('dateDotTime', () => {
  it('날짜와 시각을 공백 3칸으로 잇는다', () => {
    expect(dateDotTime('2026-07-08T01:00:00Z')).toMatch(/^2026\.07\.0[89] {3}\d{2}:\d{2}$/)
  })

  it('근거가 없으면 값을 만들지 않는다', () => {
    expect(dateDotTime(null)).toBe('—')
    expect(dateDotTime('아직 없음')).toBe('—')
  })
})

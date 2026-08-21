import { describe, expect, it } from 'vitest'
import { formatKoreanDate, relativeDay } from './utils'

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

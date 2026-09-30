import { describe, expect, it } from 'vitest'
import { dateDot, dateDotTime, formatKoreanDate, relativeDay, seoulDate, withinMonths } from './utils'

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

describe('withinMonths', () => {
  const now = new Date('2026-08-31T00:00:00Z')
  it('기간 안이면 참', () => {
    expect(withinMonths('2026-07-01T00:00:00Z', 3, now)).toBe(true)
  })
  it('기간 밖이면 거짓', () => {
    expect(withinMonths('2026-01-01T00:00:00Z', 3, now)).toBe(false)
  })
  it('앞으로의 날짜는 담지 않는다', () => {
    expect(withinMonths('2027-01-01T00:00:00Z', 3, now)).toBe(false)
  })
  it('근거가 없으면 담지 않는다', () => {
    expect(withinMonths(null, 3, now)).toBe(false)
    expect(withinMonths('아직 없음', 3, now)).toBe(false)
  })
})

describe('seoulDate (T25.7 — 한국 날짜 기준)', () => {
  it('한국 자정(UTC 전날 15:00)부터 그날이다', () => {
    expect(seoulDate(new Date('2026-09-26T14:59:59Z'))).toBe('2026-09-26') // KST 09-26 23:59:59
    expect(seoulDate(new Date('2026-09-26T15:00:00Z'))).toBe('2026-09-27') // KST 09-27 00:00
  })
  it('한국 08:59·09:00 모두 같은 날(UTC 날짜가 바뀌는 경계)', () => {
    expect(seoulDate(new Date('2026-09-26T23:59:00Z'))).toBe('2026-09-27') // KST 08:59 — UTC 로는 전날
    expect(seoulDate(new Date('2026-09-27T00:00:00Z'))).toBe('2026-09-27') // KST 09:00
  })
  it('월말·연말도 한국 날짜로 넘어간다', () => {
    expect(seoulDate(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01')
  })
})

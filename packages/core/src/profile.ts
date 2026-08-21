// 어르신 프로필 파생값 — 순수함수(플랫폼 무관). 앱·웹이 같은 계산을 쓴다.
//
// 생년월일(`birthDate`)이 입력의 단일 근거이고 `birthYear` 는 그 연도다. 다만 v1 스키마가
// 연도만 받던 시기의 데이터가 남아 있어 **월·일이 없을 수 있다**. 그때 1월 1일 같은 값을
// 가정하면 나이가 틀리고 화면이 근거 없는 값을 표시하게 되므로, 두 경우를 분리해 다룬다.

/** 생년월일이 필요한 최소 형태(ElderProfile 의 부분집합). */
export interface BirthFields {
  birthYear: number
  /** `YYYY-MM-DD`. 월·일 미상이면 undefined. */
  birthDate?: string
}

/** `YYYY-MM-DD` → 연도. 형식이 아니면 NaN. */
export function birthYearFromDate(iso: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Number(iso.slice(0, 4)) : Number.NaN
}

/** 유효한 `YYYY-MM-DD` 인지(실제 존재하는 날짜인지까지 확인). */
export function isBirthDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** 해당 연·월의 일수(윤년 반영). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * 만 나이. 생년월일이 있으면 **생일 경과 여부까지 반영**하고, 연도만 알면 연도 차이를 쓴다
 * (연도만 아는 경우 생일 전후를 알 수 없어 최대 1년 오차가 남는다 — 알 수 없는 값을
 * 가정해 정확한 척하지 않는다).
 */
export function elderAge(elder: BirthFields, now = new Date()): number {
  if (elder.birthDate && isBirthDate(elder.birthDate)) {
    const [y, m, d] = elder.birthDate.split('-').map(Number)
    let age = now.getFullYear() - y
    const monthNow = now.getMonth() + 1
    if (monthNow < m || (monthNow === m && now.getDate() < d)) age -= 1
    return age
  }
  return now.getFullYear() - elder.birthYear
}

/**
 * 폼 입력 필드 표기 — `1945 / 5 / 13` (Figma 어르신 등록/연대기 수정).
 * 값이 없거나 형식이 아니면 빈 문자열(호출부가 안내문구를 띄운다).
 */
export function birthSlashLabel(iso: string): string {
  if (!isBirthDate(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${y} / ${m} / ${d}`
}

/**
 * 생년월일 표기 — `1945년 3월 12일`. 월·일을 모르면 아는 만큼만 `1945년`.
 * (화면 라벨이 "생년월일"이어도 없는 월·일을 만들어 붙이지 않는다.)
 */
export function birthLabel(elder: BirthFields): string {
  if (elder.birthDate && isBirthDate(elder.birthDate)) {
    const [y, m, d] = elder.birthDate.split('-').map(Number)
    return `${y}년 ${m}월 ${d}일`
  }
  return `${elder.birthYear}년`
}

/**
 * "주요 기억"을 담는 연대기 주제.
 *
 * 앱·웹 모두 어르신 프로필의 주요 기억을 별도 컬럼이 아니라
 * `chronicle_entries(topic = 이 값)` 으로 저장한다. 문자열이 흩어지면 한쪽만 바뀌었을 때
 * 조용히 두 목록이 어긋나므로 상수를 여기 한 곳에 둔다.
 */
export const KEY_MEMORY_TOPIC = '주요 기억'

/** 프로필 폼에서 관리하는 주요 기억인가(= 연대기 목록에서는 감춘다). */
export function isKeyMemory(topic: string): boolean {
  return topic === KEY_MEMORY_TOPIC
}

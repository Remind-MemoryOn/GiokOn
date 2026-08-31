import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function formatKoreanDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function formatKoreanDateTime(iso: string): string {
  const d = new Date(iso)
  const date = formatKoreanDate(iso)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} ${time}`
}

export function formatRelative(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const min = Math.round(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}일 전`
  return formatKoreanDate(iso)
}

/**
 * 달력 기준 상대 날짜 — `오늘` · `1일 전` · `22일 전`.
 *
 * `formatRelative` 은 경과 시간 기준이라 같은 날에도 "방금 전 / 3시간 전"이 나오는데,
 * 신규 웹 디자인(Figma 4iU6…)은 기록 목록에서 **달력 하루 단위**로 표기한다
 * ("오늘 16턴" · "2026.07.08  22일 전"). 1년이 넘으면 상대 표기가 무의미해 날짜로 돌아간다.
 */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const startOf = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days >= 365) return formatKoreanDate(iso)
  return `${days}일 전`
}

/**
 * 목록의 날짜 표기(`2026.07.08`) — 값이 없거나 잘못됐으면 **만들어내지 않고** `—`.
 *
 * `formatKoreanDate` 은 잘못된 값에 `NaN.NaN.NaN` 을 내는데, 실서비스 원칙상 근거 없는
 * 값을 화면에 두면 안 되므로 빈 상태 기호로 되돌린다.
 */
export function dateDot(iso?: string | null): string {
  if (!iso) return '—'
  if (Number.isNaN(new Date(iso).getTime())) return '—'
  return formatKoreanDate(iso)
}

/**
 * 목록의 날짜+시각 표기(`2026.07.30   19:00`). 사이는 **공백 3칸**(Figma 실측 간격 17.3px).
 *
 * `formatKoreanDateTime` 은 공백 1칸이고 잘못된 값에 `NaN` 을 흘린다 → 목록에서는 이쪽을 쓴다.
 */
export function dateDotTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatKoreanDate(iso)}   ${hh}:${mm}`
}

/**
 * `iso` 가 최근 `months` 개월 안인가. 기간 필터의 단일 기준
 * (앱 `src/lib/period.ts` 의 기간 pill 과 같은 셈법).
 *
 * 값이 없거나 잘못됐으면 **포함하지 않는다** — 근거 없는 기록을 기간 안으로 끌어오지 않는다.
 */
export function withinMonths(iso?: string | null, months = 3, now = new Date()): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  const from = new Date(now)
  from.setMonth(from.getMonth() - months)
  return t >= from.getTime() && t <= now.getTime()
}

const PALETTE = ['#fbb78c', '#a3d4b1', '#b1c8f0', '#f5b9c9', '#dabbf0', '#fbe294', '#9ad6d2']
export function pickAvatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function initial(name: string): string {
  const s = name.trim()
  return s ? s.slice(-2) : '?'
}

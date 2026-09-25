// @giokon/data — 감독 화면(파일럿 W2 · D6) 순수 판정
//
// 세션 행의 D6 컬럼(phase·paused_at·control_request)을 화면 상태로 바꾼다. 판정·권한의 최종 근거는
// 서버(request_session_control·session_tick)이고, 여기서는 **보여 줄 말**만 정한다.

import type { SessionRow } from './database.types'

type Phase = NonNullable<SessionRow['phase']>

/** 대화 단계 이름(intro → reminiscence → closing). 아직 단계가 없으면 null — 지어내지 않는다. */
export const SESSION_PHASE_LABEL: Record<Phase, string> = {
  intro: '도입',
  reminiscence: '회상',
  closing: '마무리',
}

/** 세션 1회 상한(사용자 확정 2026-09-24 — 서버 app.session_target_minutes 와 같은 값). */
export const SESSION_MAX_MINUTES = 10

/**
 * 목표 시간(분) — 서버 app.session_target_minutes 와 같은 규칙:
 * least(10, greatest(1, coalesce(세션 설계 duration_minutes, 기관 설정 target_minutes, 10))).
 */
export function sessionTargetMinutes(durationMinutes: number | null | undefined, orgTargetMinutes?: number | null): number {
  const raw = durationMinutes ?? orgTargetMinutes ?? SESSION_MAX_MINUTES
  return Math.min(SESSION_MAX_MINUTES, Math.max(1, raw))
}

export type SupervisionState = 'running' | 'paused' | 'ending'

/**
 * 감독 화면의 세션 상태.
 * - ending : 원격 종료를 요청했다(앱이 멈추고 요양보호사가 기기에서 저장한다 — 서버가 자동 저장하지 않는다)
 * - paused : 원격·현장 일시정지 중(paused_at)
 * - running: 그 밖의 진행 중
 */
export function supervisionState(row: Pick<SessionRow, 'paused_at' | 'control_request'>): SupervisionState {
  if (row.control_request === 'end') return 'ending'
  if (row.paused_at) return 'paused'
  return 'running'
}

/** 경과 시간 "m:ss". 시작 시각이 이상하면 null(값을 만들지 않는다). */
export function elapsedLabel(startedAt: string, now: number = Date.now()): string | null {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start) || now < start) return null
  const total = Math.floor((now - start) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

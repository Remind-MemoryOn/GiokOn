// @giokon/data — 감독 화면(파일럿 W2 · D6) 순수 판정
//
// 세션 행의 D6 컬럼(phase·paused_at·control_request)을 화면 상태로 바꾼다. 판정·권한의 최종 근거는
// 서버(request_session_control·session_tick)이고, 여기서는 **보여 줄 말**만 정한다.

import type { ElderClosingSituation } from '@giokon/core'
import type { Database, SessionRow } from './database.types'

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

type InterventionRow = Database['public']['Tables']['session_interventions']['Row']

/** 어르신 요청으로 마무리한 기록(T21.11) — 중계가 record_elder_closing 으로 세션당 한 번 남긴다. */
export interface ElderClosing {
  at: string
  /** 서버가 받는 두 값 밖이면(앞으로 늘어날 이유 등) null — 이유를 지어내지 않는다. */
  situation: ElderClosingSituation | null
}

/**
 * 한 세션의 개입 기록에서 '어르신 요청으로 마무리'를 찾는다. 없으면 null.
 * 이 기록의 actor_id 는 **세션을 시작한 직원**(중계가 그 사람의 토큰으로 쓴다)이지 마무리를 요청한 사람이 아니다 —
 * 화면은 이 기록을 직원의 개입으로 표시하면 안 된다.
 */
export function elderClosingOf(rows: readonly Pick<InterventionRow, 'action' | 'detail' | 'created_at'>[]): ElderClosing | null {
  const row = rows.find((r) => r.action === 'elder_closing')
  if (!row) return null
  const raw = row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail) ? row.detail.situation : null
  return { at: row.created_at, situation: raw === 'rest_request' || raw === 'refusal' ? raw : null }
}

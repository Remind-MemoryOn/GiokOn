import { describe, expect, it } from 'vitest'
import { elapsedLabel, elderClosingOf, sessionTargetMinutes, supervisionState } from './supervision'

describe('supervision', () => {
  it('uses the same target rule as the server, capped at 10 minutes', () => {
    expect(sessionTargetMinutes(null, null)).toBe(10)
    expect(sessionTargetMinutes(5, 8)).toBe(5)
    expect(sessionTargetMinutes(null, 8)).toBe(8)
    expect(sessionTargetMinutes(30, null)).toBe(10)
    expect(sessionTargetMinutes(0, null)).toBe(1)
  })

  it('shows an end request before a pause, and running otherwise', () => {
    expect(supervisionState({ paused_at: '2026-09-25T00:00:00Z', control_request: 'end' })).toBe('ending')
    expect(supervisionState({ paused_at: '2026-09-25T00:00:00Z', control_request: 'pause' })).toBe('paused')
    expect(supervisionState({ paused_at: null, control_request: 'resume' })).toBe('running')
    expect(supervisionState({ paused_at: null, control_request: null })).toBe('running')
  })

  it('formats elapsed time and refuses to invent one from a bad start', () => {
    const start = '2026-09-25T00:00:00Z'
    expect(elapsedLabel(start, Date.parse(start) + 125_000)).toBe('2:05')
    expect(elapsedLabel('not a date')).toBeNull()
    expect(elapsedLabel(start, Date.parse(start) - 1)).toBeNull()
  })

  it('finds the elder-requested closing and never invents a reason', () => {
    const at = '2026-10-06T01:00:00Z'
    expect(elderClosingOf([])).toBeNull()
    expect(elderClosingOf([{ action: 'pause', detail: null, created_at: at }])).toBeNull()
    expect(elderClosingOf([
      { action: 'phase_advance', detail: { from: 'intro', to: 'reminiscence' }, created_at: '2026-10-06T00:59:00Z' },
      { action: 'elder_closing', detail: { situation: 'rest_request' }, created_at: at },
    ])).toEqual({ at, situation: 'rest_request' })
    expect(elderClosingOf([{ action: 'elder_closing', detail: { situation: 'refusal' }, created_at: at }])?.situation).toBe('refusal')
    expect(elderClosingOf([{ action: 'elder_closing', detail: { situation: 'tired' }, created_at: at }])).toEqual({ at, situation: null })
    expect(elderClosingOf([{ action: 'elder_closing', detail: null, created_at: at }])).toEqual({ at, situation: null })
    expect(elderClosingOf([{ action: 'elder_closing', detail: ['rest_request'], created_at: at }])?.situation).toBeNull()
  })
})

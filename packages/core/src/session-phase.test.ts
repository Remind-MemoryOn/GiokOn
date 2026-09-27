import { describe, expect, it } from 'vitest'
import {
  buildPhaseDirective,
  closingStartsAt,
  phasePlan,
  CLOSING_RESERVE_SECONDS,
  INTRO_MAX_SECONDS,
  shouldAdvancePhase,
  type PhaseClock,
} from './session-phase'
import { screenAiUtterance } from './safety'

const clock = (over: Partial<PhaseClock>): PhaseClock => ({
  phase: 'intro', elapsedSeconds: 0, targetMinutes: 10, elderTurnsInPhase: 0, phaseElapsedSeconds: 0, ...over,
})

describe('shouldAdvancePhase — 서버 권위 단계의 전환 시점', () => {
  it('시작 전이면 도입으로', () => {
    expect(shouldAdvancePhase(clock({ phase: null }))).toBe('intro')
  })
  it('도입은 첫 대답 또는 60초가 지나면 회상으로', () => {
    expect(shouldAdvancePhase(clock({ elderTurnsInPhase: 0, phaseElapsedSeconds: INTRO_MAX_SECONDS - 1 }))).toBeNull()
    expect(shouldAdvancePhase(clock({ elderTurnsInPhase: 1 }))).toBe('reminiscence')
    expect(shouldAdvancePhase(clock({ phaseElapsedSeconds: INTRO_MAX_SECONDS }))).toBe('reminiscence')
  })
  it('회상은 목표 시간 − 여유(90초)에 마무리로 — 10분이면 8분 30초', () => {
    expect(closingStartsAt(10)).toBe(600 - CLOSING_RESERVE_SECONDS)
    expect(shouldAdvancePhase(clock({ phase: 'reminiscence', elapsedSeconds: 509 }))).toBeNull()
    expect(shouldAdvancePhase(clock({ phase: 'reminiscence', elapsedSeconds: 510 }))).toBe('closing')
  })
  it('목표 시간이 10분을 넘어도 10분 기준으로 자른다(서버 상한과 같은 규칙)', () => {
    expect(closingStartsAt(40)).toBe(closingStartsAt(10))
  })
  it('짧은 목표에서도 회상 시간이 사라지지 않는다(최소 절반)', () => {
    expect(closingStartsAt(2)).toBe(60)
    expect(closingStartsAt(1)).toBe(30)
  })
  it('도입 중에 시간이 다 되면 곧장 마무리로', () => {
    expect(shouldAdvancePhase(clock({ phase: 'intro', elapsedSeconds: 600 }))).toBe('closing')
  })
  it('마무리는 끝 단계다 · 비정상 시계는 전환하지 않는다', () => {
    expect(shouldAdvancePhase(clock({ phase: 'closing', elapsedSeconds: 9999 }))).toBeNull()
    expect(shouldAdvancePhase(clock({ phase: 'reminiscence', elapsedSeconds: Number.NaN }))).toBeNull()
  })
})

describe('buildPhaseDirective — 내부 지시문', () => {
  it.each(['intro', 'reminiscence', 'closing'] as const)('%s 지시는 내부 표식으로 시작하고 비의료 가드를 통과한다', phase => {
    const text = buildPhaseDirective(phase)
    expect(text.startsWith('(내부 지시)')).toBe(true)
    expect(screenAiUtterance(text).allowed).toBe(true)
  })
  it('시간 마무리는 의견수렴을 묻고, 휴식 요청 마무리는 짧은 인사만', () => {
    expect(buildPhaseDirective('closing', 'time')).toContain('어떠셨어요')
    expect(buildPhaseDirective('closing', 'rest_request')).not.toContain('어떠셨어요')
    expect(buildPhaseDirective('closing', 'rest_request')).toContain('한 문장')
  })
})

describe('phasePlan — 세션 설계의 단계 미리보기(shouldAdvancePhase 와 같은 규칙)', () => {
  it('10분: 도입 1분 · 회상 7분 30초 · 마무리 1분 30초', () => {
    expect(phasePlan(10)).toEqual({ targetMinutes: 10, introSeconds: 60, reminiscenceSeconds: 450, closingSeconds: 90 })
  })
  it('5분: 마무리는 여전히 90초', () => {
    expect(phasePlan(5)).toEqual({ targetMinutes: 5, introSeconds: 60, reminiscenceSeconds: 150, closingSeconds: 90 })
  })
  it('10분을 넘으면 10분으로 자른다 · 합은 목표 시간', () => {
    const p = phasePlan(30)
    expect(p.targetMinutes).toBe(10)
    expect(p.introSeconds + p.reminiscenceSeconds + p.closingSeconds).toBe(600)
  })
  it('마무리 진입 시각이 shouldAdvancePhase 와 같다', () => {
    const p = phasePlan(8)
    expect(closingStartsAt(8)).toBe(p.introSeconds + p.reminiscenceSeconds)
  })
})

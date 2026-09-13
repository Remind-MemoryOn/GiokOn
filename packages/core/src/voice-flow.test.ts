import { describe, expect, it } from 'vitest'
import { createVoiceFlow, transitionVoiceFlow, type VoiceFlowEvent, type VoiceFlowState } from './voice-flow'

const create = () => createVoiceFlow('session-a', 'connection-a')
const start = () => transitionVoiceFlow(create(), { type: 'start' })
const ticket = (s: VoiceFlowState) => ({ sessionId: s.sessionId, connectionId: s.connectionId, generation: s.generation, turn: s.turn, phase: s.phase })
const advance = (s: VoiceFlowState, type: 'input_finished' | 'response_received' | 'validation_passed' | 'audio_ready' | 'playback_finished') =>
  transitionVoiceFlow(s, { type, ticket: ticket(s) })

describe('automatic voice flow', () => {
  it('requires input, response and validation before synthesis and playback', () => {
    let s = start()
    expect(s.phase).toBe('listening')
    for (const [event, phase] of [
      ['input_finished', 'awaiting'], ['response_received', 'validating'],
      ['validation_passed', 'synthesizing'], ['audio_ready', 'speaking'],
      ['playback_finished', 'listening'],
    ] as const) {
      s = advance(s, event)
      expect(s.phase).toBe(phase)
    }
    expect(s.turn).toBe(2)
  })

  it.each(['audio_ready', 'validation_passed', 'playback_finished', 'response_received'] as const)(
    'ignores out-of-order %s while listening', (type) => {
      const s = start()
      expect(advance(s, type)).toBe(s)
    },
  )

  it.each([
    { sessionId: 'other' }, { connectionId: 'previous' }, { generation: -1 }, { turn: 0 },
  ])('rejects a completion with a different identity %j', (patch) => {
    const s = start()
    expect(transitionVoiceFlow(s, { type: 'input_finished', ticket: { ...ticket(s), ...patch } })).toBe(s)
  })

  it('ignores duplicate input and previous-turn completions', () => {
    const initial = start()
    const event: VoiceFlowEvent = { type: 'input_finished', ticket: ticket(initial) }
    let s = transitionVoiceFlow(initial, event)
    expect(transitionVoiceFlow(s, event)).toBe(s)
    for (const type of ['response_received', 'validation_passed', 'audio_ready', 'playback_finished'] as const) s = advance(s, type)
    expect(transitionVoiceFlow(s, event)).toBe(s)
  })

  it('invalidates in-flight work on pause, even after resume', () => {
    const waiting = advance(start(), 'input_finished')
    const late: VoiceFlowEvent = { type: 'response_received', ticket: ticket(waiting) }
    const paused = transitionVoiceFlow(waiting, { type: 'pause', reason: 'rest' })
    expect(transitionVoiceFlow(paused, late)).toBe(paused)
    const resumed = transitionVoiceFlow(paused, { type: 'resume' })
    const newWaiting = advance(resumed, 'input_finished')
    expect(transitionVoiceFlow(newWaiting, late)).toBe(newWaiting)
    expect(newWaiting.generation).toBeGreaterThan(waiting.generation)
  })

  it.each(['retrieved', 'access_lost', 'consent_lost', 'user_stop', 'limit_reached'] as const)(
    'makes %s terminal and rejects late work', (reason) => {
      const s = advance(advance(advance(start(), 'input_finished'), 'response_received'), 'validation_passed')
      const ended = transitionVoiceFlow(s, { type: 'end', reason })
      expect(ended.phase).toBe('ended')
      expect(ended.reason).toBe(reason)
      expect(transitionVoiceFlow(ended, { type: 'audio_ready', ticket: ticket(s) })).toBe(ended)
      expect(transitionVoiceFlow(ended, { type: 'resume' })).toBe(ended)
      expect(transitionVoiceFlow(ended, { type: 'start' })).toBe(ended)
    },
  )

  it('pauses a failed current request but ignores a stale failure', () => {
    const s = advance(start(), 'input_finished')
    expect(transitionVoiceFlow(s, { type: 'failed', ticket: { ...ticket(s), connectionId: 'old' }, reason: 'network' })).toBe(s)
    const failed = transitionVoiceFlow(s, { type: 'failed', ticket: ticket(s), reason: 'network' })
    expect(failed.phase).toBe('paused')
    expect(failed.reason).toBe('network')
  })

  it('cannot synthesize a blocked response', () => {
    const s = advance(advance(start(), 'input_finished'), 'response_received')
    const blocked = transitionVoiceFlow(s, { type: 'failed', ticket: ticket(s), reason: 'validation_rejected' })
    expect(advance(blocked, 'validation_passed')).toBe(blocked)
  })

  it('ignores a late failure from an earlier phase of the same turn', () => {
    const waiting = advance(start(), 'input_finished')
    const validating = advance(waiting, 'response_received')
    expect(transitionVoiceFlow(validating, { type: 'failed', ticket: ticket(waiting), reason: 'timeout' })).toBe(validating)
  })

  it('does not mutate previous state', () => {
    const s = Object.freeze(start())
    expect(advance(s, 'input_finished').phase).toBe('awaiting')
    expect(s.phase).toBe('listening')
  })

  it('rejects missing session or connection identity', () => {
    expect(() => createVoiceFlow('', 'connection')).toThrow()
    expect(() => createVoiceFlow('session', ' ')).toThrow()
  })
})

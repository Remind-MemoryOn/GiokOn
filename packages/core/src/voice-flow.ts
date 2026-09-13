// Automatic conversation ordering contract. No network, recording or playback I/O.
// The caller must cancel those resources on pause/end, and obtain fresh server
// authorization before start/resume. A ticket correlates work; it is not authority.

export type VoiceFlowPhase =
  | 'ready' | 'listening' | 'awaiting' | 'validating'
  | 'synthesizing' | 'speaking' | 'paused' | 'ended'

export type VoicePauseReason = 'rest' | 'clarification' | 'help_requested'
export type VoiceFailureReason = 'network' | 'timeout' | 'validation_rejected' | 'audio_failed'
export type VoiceEndReason = 'retrieved' | 'access_lost' | 'consent_lost' | 'user_stop' | 'limit_reached'

export interface VoiceWorkTicket {
  readonly sessionId: string
  /** Fresh opaque ID per connection/controller instance, including reconnects. */
  readonly connectionId: string
  readonly generation: number
  readonly turn: number
  /** Phase captured when the async operation began, not when it completed. */
  readonly phase: VoiceFlowPhase
}

export interface VoiceFlowState extends VoiceWorkTicket {
  readonly reason: VoicePauseReason | VoiceFailureReason | VoiceEndReason | null
}

type Completion = 'input_finished' | 'response_received' | 'validation_passed' | 'audio_ready' | 'playback_finished'

export type VoiceFlowEvent =
  | { type: 'start' | 'resume' }
  | { type: 'pause'; reason: VoicePauseReason }
  | { type: 'end'; reason: VoiceEndReason }
  | { type: Completion; ticket: VoiceWorkTicket }
  | { type: 'failed'; ticket: VoiceWorkTicket; reason: VoiceFailureReason }

export function createVoiceFlow(sessionId: string, connectionId: string): VoiceFlowState {
  if (!sessionId.trim() || !connectionId.trim()) throw new Error('Voice flow requires session and connection identities')
  return { sessionId, connectionId, generation: 0, turn: 0, phase: 'ready', reason: null }
}

function matches(s: VoiceFlowState, t: VoiceWorkTicket): boolean {
  return s.sessionId === t.sessionId && s.connectionId === t.connectionId &&
    s.generation === t.generation && s.turn === t.turn && s.phase === t.phase
}

const transitions: Record<Completion, readonly [VoiceFlowPhase, VoiceFlowPhase]> = {
  input_finished: ['listening', 'awaiting'],
  response_received: ['awaiting', 'validating'],
  validation_passed: ['validating', 'synthesizing'],
  audio_ready: ['synthesizing', 'speaking'],
  playback_finished: ['speaking', 'listening'],
}

/**
 * Ignores out-of-order, duplicate and stale work. `audio_ready` is dispatched
 * only when approved text has been synthesized; `playback_finished` only after
 * full playback. Raw provider messages must be validated by an adapter first.
 * Validation here is ordering, not a semantic safety check on model output.
 */
export function transitionVoiceFlow(s: VoiceFlowState, event: VoiceFlowEvent): VoiceFlowState {
  if (s.phase === 'ended') return s
  switch (event.type) {
    case 'end':
      return { ...s, phase: 'ended', generation: s.generation + 1, reason: event.reason }
    case 'start':
      return s.phase === 'ready' ? { ...s, phase: 'listening', turn: 1 } : s
    case 'resume':
      return s.phase === 'paused'
        ? { ...s, phase: 'listening', generation: s.generation + 1, turn: s.turn + 1, reason: null }
        : s
    case 'pause':
      return s.phase === 'paused' || s.phase === 'ready'
        ? s : { ...s, phase: 'paused', generation: s.generation + 1, reason: event.reason }
  }
  if (s.phase === 'ready' || s.phase === 'paused' || !matches(s, event.ticket)) return s
  if (event.type === 'failed') {
    return { ...s, phase: 'paused', generation: s.generation + 1, reason: event.reason }
  }
  const [expected, next] = transitions[event.type]
  if (s.phase !== expected) return s
  return { ...s, phase: next, turn: s.turn + (event.type === 'playback_finished' ? 1 : 0) }
}

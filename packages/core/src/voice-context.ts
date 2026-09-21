import type { ConversationTurn } from './types'

/** Device observation, not proof the participant heard or understood the speech. */
export interface VoicePlaybackObservation {
  text: string
  result: 'completed' | 'interrupted' | 'empty'
  observedAt: string
}
export interface VoiceResumeContext {
  version: 1
  turns: {role:'user'|'model';text:string}[]
}

function object(value:unknown): value is Record<string,unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Shared wire validation. Authentication/session binding must be checked separately. */
export function parseVoiceResumeContext(value:unknown): VoiceResumeContext {
  if (!object(value) || value.version !== 1 || Object.keys(value).length !== 2 ||
      !Array.isArray(value.turns) || value.turns.length > 120) throw new Error('INVALID_RESUME_CONTEXT')
  let size = 0
  const turns: VoiceResumeContext['turns'] = value.turns.map(turn => {
    if (!object(turn) || Object.keys(turn).length !== 2 || (turn.role !== 'user' && turn.role !== 'model') ||
        typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > 4000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(turn.text)) throw new Error('INVALID_RESUME_TURN')
    size += turn.text.length
    if (size > 16000) throw new Error('RESUME_CONTEXT_TOO_LARGE')
    return {role:turn.role,text:turn.text}
  })
  return {version:1,turns}
}

/** Keep adopted user text and exact completed AI text; never invent a summary. */
export function selectVoiceResumeContext(
  turns: readonly ConversationTurn[],
  playback: Readonly<Record<string,VoicePlaybackObservation>>,
): VoiceResumeContext {
  const seen = new Set<string>()
  const context: VoiceResumeContext = {version:1,turns:[]}
  for (const turn of turns) {
    if (!turn.id || seen.has(turn.id)) throw new Error('INVALID_RESUME_IDENTITY')
    seen.add(turn.id)
    if (turn.speaker === 'AI') {
      const observation = playback[turn.id]
      if (observation?.result === 'completed' && observation.text === turn.text)
        context.turns.push({role:'model',text:turn.text})
    } else {
      if (turn.speaker !== 'Elderly' || (turn.provenance?.kind !== 'automatic' && turn.provenance?.kind !== 'caregiver_confirmed'))
        throw new Error('UNVERIFIED_RESUME_INPUT')
      context.turns.push({role:'user',text:turn.text})
    }
  }
  return parseVoiceResumeContext(context)
}

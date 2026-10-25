import { describe, expect, it } from 'vitest'
import { safeVoiceFailureMessage, voiceFailureMessage, VOICE_FAILURE_FALLBACK, VOICE_FAILURE_MESSAGES } from './voice-failure'

describe('public voice failure boundary', () => {
  it.each(Object.entries(VOICE_FAILURE_MESSAGES))('maps the public code %s to its approved message', (code, message) => {
    expect(voiceFailureMessage(code)).toBe(message)
    expect(safeVoiceFailureMessage(message)).toBe(message)
  })

  it.each([undefined, null, false, 0, {}, [], 'toString', '__proto__', 'constructor', 'OUTPUT_REJECTED: provider secret'])('rejects unknown or inherited codes: %j', code => {
    expect(voiceFailureMessage(code)).toBe(VOICE_FAILURE_FALLBACK)
  })

  it.each([undefined, null, {}, 'provider response with credential', 'OUTPUT_REJECTED', `${VOICE_FAILURE_MESSAGES.OUTPUT_REJECTED} secret`, ` ${VOICE_FAILURE_MESSAGES.OUTPUT_REJECTED}`])('never passes arbitrary transport text through: %j', message => {
    expect(safeVoiceFailureMessage(message)).toBe(VOICE_FAILURE_FALLBACK)
  })
})

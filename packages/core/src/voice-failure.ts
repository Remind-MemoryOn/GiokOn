/** Public transport codes only; never display provider response bodies or keys. */
export const VOICE_FAILURE_MESSAGES = {
  SYNTHESIS_LIMIT: '음성 합성 요청이 많아 대화를 멈췄어요. 기록을 저장하고 잠시 후 다시 시작해 주세요.',
  SYNTHESIS_UNAVAILABLE: '음성 합성 서비스에 연결하지 못했어요. 기록을 저장하고 잠시 후 다시 시작해 주세요.',
  SYNTHESIS_TIMEOUT: '음성 합성 응답이 늦어 대화를 멈췄어요. 기록을 저장하고 연결 상태를 확인해 주세요.',
  SYNTHESIS_FAILED: '응답 음성을 준비하지 못했어요. 기록을 저장하고 담당자에게 알려 주세요.',
  OUTPUT_REJECTED: '응답 내용을 확인하지 못해 대화를 멈췄어요. 담당자가 기록을 확인하고 저장해 주세요.',
} as const;
export type VoiceFailureCode = keyof typeof VOICE_FAILURE_MESSAGES;
export const VOICE_FAILURE_FALLBACK = '음성 연결이 중단됐어요. 기록을 저장해 주세요.';
export function voiceFailureMessage(code: unknown): string {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(VOICE_FAILURE_MESSAGES, code)
    ? VOICE_FAILURE_MESSAGES[code as VoiceFailureCode] : VOICE_FAILURE_FALLBACK;
}
export function safeVoiceFailureMessage(message: unknown): string {
  return Object.values(VOICE_FAILURE_MESSAGES).some(value => value === message) ? message as string : VOICE_FAILURE_FALLBACK;
}

// 대화 → AI 생성(Gemini) 공용 로직 — session-report(사람이 요청)와 program-journal-draft(세션 종료 자동)가 함께 쓴다.
// 런타임·환경 import 가 없다(키·모델은 호출자가 넘긴다). 검증은 core validateGeneratedSession 이 한다.
import { GENERATED_SESSION_SCHEMA, SESSION_GENERATION_INSTRUCTION, validateGeneratedSession, type GenerationSourceTurn } from '../../../packages/core/src/generated-session.ts'

/** 생성 입력 상한 — 넘치면 일부만 몰래 보내지 않고 거절한다. */
export const GENERATION_TURN_LIMIT = 240
export const GENERATION_JSON_LIMIT = 48000

/** Only status is retained; provider bodies can contain sensitive input or credentials. */
export class ReportProviderError extends Error {
  constructor(readonly httpStatus: number) {
    super(httpStatus === 429 ? 'REPORT_PROVIDER_LIMIT' : 'REPORT_PROVIDER_FAILED')
  }
}

/** session_logs 행 → 생성 입력(어르신 = user 역할). */
export function toSourceTurns(rows: { id: string; role: string; content: string }[]): GenerationSourceTurn[] {
  return rows.map(t => ({ id: t.id, speaker: t.role === 'user' ? 'Elderly' : 'AI', text: t.content }))
}

/** 근거가 될 어르신 발화가 하나라도 있는지. */
export function hasElderSpeech(turns: GenerationSourceTurn[]): boolean {
  return turns.some(t => t.speaker === 'Elderly' && t.text.trim())
}

export function exceedsGenerationLimit(turns: GenerationSourceTurn[]): boolean {
  return turns.length > GENERATION_TURN_LIMIT || JSON.stringify(turns).length > GENERATION_JSON_LIMIT
}

export async function generateReport(turns: GenerationSourceTurn[], config: { apiKey: string; model: string }, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!/^gemini-[a-z0-9.-]+$/.test(config.model) || !config.apiKey) throw new Error('REPORT_CONFIGURATION')
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SESSION_GENERATION_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ turns }) }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: GENERATED_SESSION_SCHEMA, maxOutputTokens: 8192, candidateCount: 1 },
    }),
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new ReportProviderError(response.status)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('REPORT_EMPTY')
  let bytes = 0, raw = ''; const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read(); signal.throwIfAborted()
      if (done) break
      bytes += value.length
      if (bytes > 128 * 1024) throw new Error('REPORT_TOO_LARGE')
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
  } finally { await reader.cancel().catch(() => {}) }
  const body = JSON.parse(raw)
  const candidate = body.candidates?.[0]
  if (body.promptFeedback?.blockReason || candidate?.finishReason !== 'STOP') throw new Error('REPORT_INCOMPLETE')
  const parts = candidate.content?.parts
  if (!Array.isArray(parts)) throw new Error('REPORT_EMPTY')
  const result = validateGeneratedSession(JSON.parse(parts.filter(p => p.thought !== true && typeof p.text === 'string').map(p => p.text).join('')), turns)
  const tokenCount = (name: string): number | null => {
    const value = body.usageMetadata?.[name]
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  return { result, usage: { inputTokens: tokenCount('promptTokenCount'), outputTokens: tokenCount('candidatesTokenCount'), totalTokens: tokenCount('totalTokenCount') } }
}

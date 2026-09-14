import { GENERATED_SESSION_SCHEMA, SESSION_GENERATION_INSTRUCTION, validateGeneratedSession, type GenerationSourceTurn } from '../../../packages/core/src/generated-session.ts'

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
  if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 429 ? 'REPORT_PROVIDER_LIMIT' : 'REPORT_PROVIDER_FAILED') }
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

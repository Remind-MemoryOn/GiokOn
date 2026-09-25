import { validateGeneratedSession, type GenerationSourceTurn, type SessionReportRecord } from '../../../packages/core/src/generated-session.ts'
import { exceedsGenerationLimit, generateReport, hasElderSpeech } from '../_shared/report-generation.ts'

export type ReportRecord = SessionReportRecord
export interface ReportContext {
  userId: string
  turns: GenerationSourceTurn[]
  cached: unknown
  allowed(): Promise<boolean>
  /** Must compare the source snapshot and analysis revision before persisting. */
  save(report: ReportRecord): Promise<void>
}
export class ReportError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
export interface ReportDependencies {
  model: string
  apiKey: string
  authorize(auth: string, sessionId: string): Promise<ReportContext>
  generate?: typeof generateReport
}
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
export async function sourceHash(turns: GenerationSourceTurn[]) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(turns)))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}

export function createReportHandler(deps: ReportDependencies) {
  // Instance-local guard for demo traffic. This is not a distributed billing cap.
  const busy = new Set<string>(), attempts = new Map<string, number[]>()
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return json({ error: 'POST만 허용됩니다.' }, 405)
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, 401)
    let sessionId = '', acquired = false
    try {
      const reader = req.body?.getReader(); let raw = '', size = 0
      if (!reader) throw new ReportError(400, '세션을 선택해 주세요.')
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break
          size += value.length
          if (size > 1024) throw new ReportError(413, '요청이 너무 큽니다.')
          raw += decoder.decode(value, { stream: true })
        }
        raw += decoder.decode()
      } finally { await reader.cancel().catch(() => {}) }
      let input
      try { input = JSON.parse(raw) } catch { throw new ReportError(400, '잘못된 요청입니다.') }
      if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.session_id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.session_id)) throw new ReportError(400, '세션 ID를 확인해 주세요.')
      sessionId = input.session_id
      const context = await deps.authorize(auth, sessionId)
      if (!await context.allowed()) throw new ReportError(403, '처리 권한 또는 필수 동의를 확인해 주세요.')
      const turns = context.turns
      if (!hasElderSpeech(turns)) throw new ReportError(409, '저장된 어르신 발화가 없습니다.')
      if (exceedsGenerationLimit(turns)) throw new ReportError(413, '시연 분석 범위를 초과한 대화입니다.')
      const hash = await sourceHash(turns)
      const cached = context.cached as ReportRecord | null
      if (cached?.schemaVersion === 'session-report-v1' && cached.sourceSessionId === sessionId && cached.sourceHash === hash) {
        try {
          const result = validateGeneratedSession(cached.result, turns)
          return json({ report: { ...cached, result }, cached: true })
        } catch { /* Invalid/stale cache must never be returned as successful generation. */ }
      }
      if (!deps.model || !deps.apiKey) throw new ReportError(503, '보고서 생성 서버 설정이 필요합니다.')
      if (busy.has(sessionId)) throw new ReportError(409, '분석을 생성 중입니다. 잠시 후 다시 확인해 주세요.')
      const now = Date.now()
      for (const [id, times] of attempts) if (times.every(t => now - t >= 60000)) attempts.delete(id)
      const recent = (attempts.get(context.userId) ?? []).filter(t => now - t < 60000)
      if (recent.length >= 3 || attempts.size >= 1000) throw new ReportError(429, '잠시 후 다시 시도해 주세요.')
      attempts.set(context.userId, [...recent, now]); busy.add(sessionId); acquired = true
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(45000)])
      const generated = await (deps.generate ?? generateReport)(turns, { apiKey: deps.apiKey, model: deps.model }, signal)
      signal.throwIfAborted()
      if (!await context.allowed()) throw new ReportError(403, '처리 권한 또는 동의가 변경되어 결과를 저장하지 않았습니다.')
      const report: ReportRecord = { schemaVersion: 'session-report-v1', model: deps.model, generatedAt: new Date().toISOString(), sourceHash: hash, sourceSessionId: sessionId, ...generated }
      await context.save(report)
      return json({ report, cached: false })
    } catch (error) {
      if (error instanceof ReportError) return json({ error: error.message }, error.status)
      return json({ error: '분석을 생성하지 못했어요. 대화 기록은 유지됩니다. 잠시 후 다시 시도해 주세요.' }, 502)
    } finally { if (acquired) busy.delete(sessionId) }
  }
}

import { createClient } from '@supabase/supabase-js'
import { buildSystemPrompt, PROMPT_VERSION, type SafetyEventDraft, type SessionPhase } from '@giokon/core'
import { toElderProfile, toChronicleEntry, toSession, type Database } from '@giokon/data'
import { WebSocket } from 'ws'
import { createRelayServer } from './server'
import type { SessionTick } from './relay'
import { DEFAULT_GEMINI_TTS_MODEL, DEFAULT_GEMINI_TTS_VOICE } from './output'
import { storeSafetyEvent, type SafetyEventTable } from './safety-record'
import { MIN_RELAY_SECRET_LENGTH, requestLiveToken } from './live-token'

// Process/secret-manager environment only. This entrypoint never loads .env files.
function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const supabaseUrl = required('SUPABASE_URL')
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) throw new Error('Invalid SUPABASE_URL')
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY')
// T23.5 — live-token 이 중계에만 토큰을 준다. Edge 시크릿과 같은 값이어야 한다(다르면 모든 세션 시작이 403).
const relaySecret = required('VOICE_RELAY_SECRET')
if (relaySecret.length < MIN_RELAY_SECRET_LENGTH) throw new Error('Invalid VOICE_RELAY_SECRET')
const geminiTts = {
  apiKey: required('GEMINI_API_KEY'),
  model: process.env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL,
  voice: process.env.GEMINI_TTS_VOICE?.trim() || DEFAULT_GEMINI_TTS_VOICE,
}
const inUse = new Set<string>()
const service = createRelayServer({
  geminiTts,
  connectProvider: url => new WebSocket(url, { maxPayload: 1024 * 1024, perMessageDeflate: false }),
  authorize: async (sessionId, accessToken) => {
    if (inUse.has(sessionId)) throw new Error('SESSION_BUSY')
    inUse.add(sessionId)
    const release = () => { inUse.delete(sessionId) }
    try {
      const timedFetch: typeof fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(5000)]) })
      const db = createClient<Database>(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${accessToken}` }, fetch: timedFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const user = await db.auth.getUser(accessToken)
      if (user.error || !user.data.user) throw new Error('AUTH_FAILED')
      // 파일럿 D6·C3: 2초 폴 = session_tick 하나(허용·단계·서버 경과·목표 시간·원격 제어).
      // ⚠️ 배포 순서: DB 마이그레이션 20260924040000 이 먼저다 — RPC 가 없으면 모든 세션이 거부된다(fail closed).
      const tick = async (): Promise<SessionTick> => {
        const result = await db.rpc('session_tick', { p_session_id: sessionId })
        const t = result.data as Record<string, unknown> | null
        if (result.error || !t || t.allowed !== true) return { allowed: false }
        return {
          allowed: true,
          phase: (t.phase ?? null) as SessionPhase | null,
          elapsedSeconds: typeof t.elapsed_seconds === 'number' ? t.elapsed_seconds : undefined,
          phaseElapsedSeconds: typeof t.phase_elapsed_seconds === 'number' ? t.phase_elapsed_seconds : null,
          targetMinutes: typeof t.target_minutes === 'number' ? t.target_minutes : undefined,
          paused: t.paused === true,
          endRequested: t.end_requested === true,
        }
      }
      const advancePhase = async (phase: SessionPhase) => {
        const result = await db.rpc('advance_session_phase', { p_session_id: sessionId, p_phase: phase, p_prompt_version: PROMPT_VERSION })
        return !result.error && result.data === phase
      }
      if (!(await tick()).allowed) throw new Error('DENIED')
      const session = await db.from('sessions').select('*').eq('id', sessionId).single()
      if (session.error || session.data.user_id !== user.data.user.id) throw new Error('SESSION_NOT_OWNED')
      const profile = await db.from('profiles').select('*').eq('id', session.data.profile_id).single()
      const chronicles = await db.from('chronicle_entries').select('*').eq('profile_id', session.data.profile_id).order('recorded_at', { ascending: false }).limit(100)
      if (profile.error || chronicles.error) throw new Error('CONTEXT_FAILED')
      // Reuse the deployed authorization/quota gate. Gemini key never leaves Supabase.
      // T23.5: 중계 전용 자격(x-relay-secret)을 함께 보낸다 — 없으면 live-token 이 403.
      const token = await requestLiveToken(timedFetch, { supabaseUrl, publishableKey, relaySecret, accessToken, sessionId })
      // 파일럿 T21.4 — 위험 발화 즉시 기록(요양보호사 권한 · 앱과 같은 RLS·동의 가드). 기관은 트리거가 채운다.
      // T25.17 — 중계가 만든 사건 id 로 넣고, 이미 있으면(응답 유실·앱 대체 기록) 비어 있는 근거만 채운다.
      const safetyTable: SafetyEventTable = {
        insert: row => db.from('safety_events').insert(row),
        fillEmptyEvidence: (id, excerpt, matchedTerms) => db.from('safety_events')
          .update({ excerpt, matched_terms: matchedTerms }).eq('id', id).or('excerpt.is.null,excerpt.eq.'),
      }
      const recordSafety = (draft: SafetyEventDraft, eventId: string) => storeSafetyEvent(safetyTable, {
        id: eventId, profile_id: session.data.profile_id, session_id: sessionId, user_id: user.data.user.id,
        level: draft.level, categories: draft.categories, matched_terms: draft.matchedTerms,
        excerpt: draft.excerpt, caregiver_alert: draft.caregiverAlert,
      })
      return { token: token.token, model: token.model, systemInstruction: buildSystemPrompt(toElderProfile(profile.data), chronicles.data.map(toChronicleEntry), toSession(session.data).design, 'speech'), tick, advancePhase, recordSafety, release }
    } catch (e) { release(); throw e }
  },
})
const port = Number(process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
service.server.listen(port, process.env.VOICE_RELAY_BIND ?? '127.0.0.1', () => console.info(`Voice relay listening on port ${port}`))
const shutdown = () => {
  void service.shutdown().then(() => console.info('Voice relay stopped'))
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

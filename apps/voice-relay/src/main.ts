import { createClient } from '@supabase/supabase-js'
import { buildSystemPrompt, PROMPT_VERSION, type SafetyEventDraft, type SessionPhase } from '@giokon/core'
import { toElderProfile, toChronicleEntry, toSession, type Database } from '@giokon/data'
import { WebSocket } from 'ws'
import { createRelayServer } from './server'
import type { SessionTick } from './relay'
import { DEFAULT_GEMINI_TTS_MODEL, DEFAULT_GEMINI_TTS_VOICE } from './output'

// Process/secret-manager environment only. This entrypoint never loads .env files.
function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const supabaseUrl = required('SUPABASE_URL')
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) throw new Error('Invalid SUPABASE_URL')
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY')
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
      const tokenResponse = await timedFetch(`${supabaseUrl}/functions/v1/live-token`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) })
      if (!tokenResponse.ok) throw new Error('TOKEN_FAILED')
      const token = await tokenResponse.json() as { token?: unknown; model?: unknown }
      if (typeof token.token !== 'string' || typeof token.model !== 'string') throw new Error('INVALID_TOKEN')
      // 파일럿 T21.4 — 위험 발화 즉시 기록(요양보호사 권한 · 앱과 같은 RLS·동의 가드). 기관은 트리거가 채운다.
      const recordSafety = async (draft: SafetyEventDraft) => {
        const result = await db.from('safety_events').insert({
          profile_id: session.data.profile_id, session_id: sessionId, user_id: user.data.user.id,
          level: draft.level, categories: draft.categories, matched_terms: draft.matchedTerms,
          excerpt: draft.excerpt, caregiver_alert: draft.caregiverAlert,
        }).select('id').single()
        if (result.error || !result.data) throw new Error('SAFETY_RECORD_FAILED')
        return result.data.id
      }
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

import { createClient } from '@supabase/supabase-js'
import { buildSystemPrompt } from '@giokon/core'
import { toElderProfile, toChronicleEntry, toSession, type Database } from '@giokon/data'
import { WebSocket } from 'ws'
import { createRelayServer } from './server'

// Process/secret-manager environment only. This entrypoint never loads .env files.
function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const supabaseUrl = required('SUPABASE_URL')
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) throw new Error('Invalid SUPABASE_URL')
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY')
const clova = { clientId: required('NCP_CLOVA_VOICE_CLIENT_ID'), clientSecret: required('NCP_CLOVA_VOICE_CLIENT_SECRET') }
const inUse = new Set<string>()
const service = createRelayServer({
  clova,
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
      const allowed = async () => {
        const result = await db.rpc('can_process_session', { p_session_id: sessionId })
        return !result.error && result.data === true
      }
      if (!await allowed()) throw new Error('DENIED')
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
      return { token: token.token, model: token.model, systemInstruction: buildSystemPrompt(toElderProfile(profile.data), chronicles.data.map(toChronicleEntry), toSession(session.data).design, 'speech'), allowed, release }
    } catch (e) { release(); throw e }
  },
})
const port = Number(process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
service.server.listen(port, process.env.VOICE_RELAY_BIND ?? '127.0.0.1', () => console.info(`Voice relay listening on port ${port}`))
process.once('SIGTERM', service.close)
process.once('SIGINT', service.close)

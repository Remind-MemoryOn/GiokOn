// @ts-nocheck -- Deno entrypoint. The dispatch logic (dispatcher.ts) is checked and tested by packages/data.
//
// 호출자는 DB 의 pg_cron → pg_net 뿐이다(app.kick_push_dispatch). JWT 대신 DB 가 만든 워커 비밀값
// (x-worker-secret)으로 인증하므로 verify_jwt=false 로 배포한다 — 비밀값 확인은 claim RPC 가 DB 안에서 한다.
// EXPO_ACCESS_TOKEN 은 선택이다(Expo 프로젝트에서 "강화된 푸시 보안"을 켰을 때만 필요).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { createDispatchHandler, sendToExpo, WorkerAuthError } from './dispatcher.ts'

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(10000) }) },
  auth: { persistSession: false, autoRefreshToken: false },
})
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') || undefined

const handler = createDispatchHandler({
  claim: async (secret, limit) => {
    const { data, error } = await db.rpc('claim_push_notifications', { p_secret: secret, p_limit: limit })
    if (error) throw error.message === 'WORKER_UNAUTHORIZED' ? new WorkerAuthError() : new Error('CLAIM_FAILED')
    return data ?? []
  },
  send: messages => sendToExpo(messages, fetch, expoAccessToken),
  revoke: async (secret, tokens) => {
    const { error } = await db.rpc('revoke_dead_push_tokens', { p_secret: secret, p_tokens: tokens })
    if (error) throw new Error('REVOKE_FAILED')
  },
  waitUntil: globalThis.EdgeRuntime?.waitUntil?.bind(globalThis.EdgeRuntime),
})
Deno.serve(handler)

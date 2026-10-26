// @ts-nocheck -- Deno entrypoint. The worker logic (worker.ts) is checked and tested by packages/data.
//
// 호출자는 DB 의 pg_cron → pg_net 뿐이다(app.kick_journal_worker). JWT 대신 DB 가 만든 워커 비밀값
// (x-worker-secret)으로 인증하므로 verify_jwt=false 로 배포한다 — 비밀값 확인은 claim RPC 가 DB 안에서 한다.
// service_role 키는 Edge 런타임 기본 환경값이다(파일·클라이언트로 내보내지 않는다).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { createWorkerHandler, WorkerAuthError } from './worker.ts'
import { generateReport, toSourceTurns, GENERATION_TURN_LIMIT } from '../_shared/report-generation.ts'

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(10000) }) },
  auth: { persistSession: false, autoRefreshToken: false },
})
const model = Deno.env.get('GEMINI_REPORT_MODEL') ?? ''
const apiKey = Deno.env.get('GEMINI_API_KEY') ?? ''

const handler = createWorkerHandler({
  diagnose: diagnostic => console.error(JSON.stringify({
    ...diagnostic,
    model: /^gemini-[a-z0-9.-]{1,100}$/.test(model) ? model : 'invalid_or_missing',
    apiKeyConfigured: Boolean(apiKey),
  })),
  claim: async (secret, limit) => {
    const { data, error } = await db.rpc('claim_journal_generation_jobs', { p_secret: secret, p_limit: limit })
    if (error) throw error.message === 'WORKER_UNAUTHORIZED' ? new WorkerAuthError() : new Error('CLAIM_FAILED')
    return data ?? []
  },
  loadTurns: async sessionId => {
    const logs = await db.from('session_logs').select('id, role, content, turn_index')
      .eq('session_id', sessionId).order('turn_index').limit(GENERATION_TURN_LIMIT + 1)
    if (logs.error) throw new Error('LOAD_FAILED')
    return toSourceTurns(logs.data)
  },
  stillAllowed: async (secret, jobId) => {
    const { data, error } = await db.rpc('check_journal_generation', { p_secret: secret, p_job_id: jobId })
    if (error) throw new Error('CHECK_FAILED')
    return data === true
  },
  generate: (turns, signal) => generateReport(turns, { apiKey, model }, signal),
  finish: async (secret, jobId, fields) => {
    const { error } = await db.rpc('finish_journal_generation', { p_secret: secret, p_job_id: jobId, p_fields: fields })
    if (error) throw new Error('FINISH_FAILED')
  },
  fail: async (secret, jobId, message, retryable) => {
    const { error } = await db.rpc('fail_journal_generation', { p_secret: secret, p_job_id: jobId, p_error: message, p_retryable: retryable })
    if (error) throw new Error('FAIL_FAILED')
  },
  waitUntil: globalThis.EdgeRuntime?.waitUntil?.bind(globalThis.EdgeRuntime),
})
Deno.serve(handler)

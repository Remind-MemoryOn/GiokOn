// @ts-nocheck -- Deno entrypoint. Pure handler/provider modules are checked and tested by packages/data.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { createReportHandler, ReportError, sourceHash } from './handler.ts'

// No dotenv reads. Credentials are supplied by the Edge runtime only.
const handler = createReportHandler({
  model: Deno.env.get('GEMINI_REPORT_MODEL') ?? '',
  apiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
  authorize: async (auth, sessionId) => {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: auth }, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }) },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await db.auth.getUser()
    if (error || !data.user) throw new ReportError(401, '다시 로그인해 주세요.')
    // Explicit demo account allowlist: fail closed before the provider can incur cost.
    const allowedUsers = (Deno.env.get('REPORT_ALLOWED_USER_IDS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (!allowedUsers.includes(data.user.id)) throw new ReportError(403, '시연 분석 사용 계정 설정을 확인해 주세요.')
    const session = await db.from('sessions').select('id, profile_id, status, user_id').eq('id', sessionId).single()
    if (session.error || session.data.status !== 'ended') throw new ReportError(403, '종료된 담당 세션만 분석할 수 있습니다.')
    const allowed = async () => {
      const gate = await db.rpc('can_process_profile', { p_profile_id: session.data.profile_id })
      return !gate.error && gate.data === true
    }
    if (!await allowed()) throw new ReportError(403, '처리 권한 또는 필수 동의를 확인해 주세요.')
    const loadTurns = async () => {
      const logs = await db.from('session_logs').select('id, role, content, turn_index').eq('session_id', sessionId).order('turn_index').limit(241)
      if (logs.error) throw new ReportError(503, '대화 기록을 읽지 못했습니다.')
      return logs.data.map(t => ({ id: t.id, speaker: t.role === 'user' ? 'Elderly' : 'AI', text: t.content }))
    }
    const turns = await loadTurns()
    const baseline = await db.from('session_analyses').select('id, analysis, updated_at').eq('session_id', sessionId).single()
    if (baseline.error || !baseline.data.analysis?.metrics) throw new ReportError(409, '앱에서 대화 저장을 먼저 완료해 주세요.')
    return {
      userId: data.user.id, turns, allowed, cached: baseline.data.analysis.generatedReport,
      save: async report => {
        if (await sourceHash(await loadTurns()) !== report.sourceHash) throw new ReportError(409, '대화 기록이 변경됐습니다. 다시 생성해 주세요.')
        if (!await allowed()) throw new ReportError(403, '처리 권한 또는 동의가 변경됐습니다.')
        // Keep deterministic observations and source ownership. CAS prevents a late
        // generation from overwriting a newer analysis or an app save retry.
        const result = await db.from('session_analyses').update({ analysis: {
          ...baseline.data.analysis,
          summary: report.result.summary.map(c => c.text).join('\n'),
          generatedReport: report,
        } }).eq('id', baseline.data.id).eq('updated_at', baseline.data.updated_at).select('id').single()
        if (result.error) throw new ReportError(409, '분석 결과 저장이 변경되거나 거부됐습니다. 다시 확인해 주세요.')
      },
    }
  },
})
Deno.serve(handler)

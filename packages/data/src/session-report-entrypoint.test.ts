import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { ReportError, sourceHash, type ReportDependencies, type ReportRecord } from '../../../supabase/functions/session-report/handler'
import { toSourceTurns } from '../../../supabase/functions/_shared/report-generation'

function fixture() {
  let dependencies!: ReportDependencies
  const session = { id: 'session', profile_id: 'profile', status: 'ended', user_id: 'user' }
  const state: { org: { ai_drafts_enabled: boolean } | null } = { org: { ai_drafts_enabled: true } }
  const logs = [{ id: 'log', role: 'user', content: '고향 이야기', turn_index: 0 }]
  const baseline = { id: 'analysis', updated_at: 'revision-1', analysis: { metrics: { responseRate: 0.5 }, summary: 'baseline' } }
  const getUser = vi.fn(async () => ({ data: { user: { id: 'user' } }, error: null }))
  const rpc = vi.fn(async () => ({ data: true, error: null }))
  const queries: { table: string; filters: unknown[][]; patch?: unknown }[] = []
  let conflict = false
  const from = (table: string) => {
    const query: typeof queries[number] = { table, filters: [] }; queries.push(query)
    const terminal = async () => ({ data: query.patch ? { id: 'analysis' } : table === 'sessions' ? session : table === 'org_settings' ? state.org : baseline, error: query.patch && conflict ? { message: 'conflict' } : null })
    const chain = {
      select: (_columns: string) => chain,
      eq: (...args: unknown[]) => { query.filters.push(args); return chain },
      order: (_column: string) => chain,
      limit: async (_count: number) => ({ data: logs, error: null }),
      single: terminal,
      maybeSingle: terminal,
      update: (patch: unknown) => { query.patch = patch; return chain },
    }
    return chain
  }
  const source = readFileSync(new URL('../../../supabase/functions/session-report/index.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, fetch: vi.fn(), AbortSignal,
    Deno: { serve: vi.fn(), env: { get: (name: string) => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic' })[name] } },
    require: (name: string) => name.includes('supabase-js') ? { createClient: () => ({ auth: { getUser }, rpc, from }) } : {
      ReportError, sourceHash, toSourceTurns, createReportHandler: (deps: ReportDependencies) => { dependencies = deps; return () => {} },
    },
  })
  return { dependencies, session, logs, queries, getUser, rpc, state, conflict: () => { conflict = true } }
}
describe('session-report deployed entrypoint authorization and persistence', () => {
  it('checks the organization AI switch before reading any conversation record', async () => {
    for (const org of [{ ai_drafts_enabled: false }, null]) {
      const f = fixture(); f.state.org = org
      await expect(f.dependencies.authorize('Bearer synthetic', 'session')).rejects.toMatchObject({ status: 403 })
      expect(f.queries.map(q => q.table)).toEqual(['org_settings'])
    }
  })
  it('rejects a signed-out caller before any query', async () => {
    const f = fixture(); f.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } } as never)
    await expect(f.dependencies.authorize('Bearer synthetic', 'session')).rejects.toMatchObject({ status: 401 })
    expect(f.queries).toHaveLength(0)
  })
  it('lets any care-team member of an enabled organization through (no per-user demo allowlist)', async () => {
    const f = fixture(); f.getUser.mockResolvedValue({ data: { user: { id: 'another-caregiver' } }, error: null })
    const context = await f.dependencies.authorize('Bearer synthetic', 'session')
    expect(context.userId).toBe('another-caregiver')
    expect(context.turns).toEqual([{ id: 'log', speaker: 'Elderly', text: '고향 이야기' }])
  })
  it('rejects active sessions and checks current processing consent', async () => {
    const f = fixture(); f.session.status = 'active'
    await expect(f.dependencies.authorize('Bearer synthetic', 'session')).rejects.toMatchObject({ status: 403 })
    f.session.status = 'ended'; f.rpc.mockResolvedValue({ data: false, error: null })
    await expect(f.dependencies.authorize('Bearer synthetic', 'session')).rejects.toMatchObject({ status: 403 })
    expect(f.queries.some(q => q.table === 'session_logs')).toBe(false)
  })
  it('preserves deterministic metrics and applies optimistic concurrency when saving', async () => {
    const f = fixture(); const context = await f.dependencies.authorize('Bearer synthetic', 'session')
    const report = { sourceHash: await sourceHash(context.turns), result: { summary: [{ text: 'generated' }] } } as ReportRecord
    await context.save(report)
    const write = f.queries.find(q => q.patch)
    expect(write?.filters).toContainEqual(['updated_at', 'revision-1'])
    expect(write?.patch).toMatchObject({ analysis: { metrics: { responseRate: 0.5 }, summary: 'generated', generatedReport: report } })
  })
  it('rejects a source changed during generation and a conflicting analysis revision', async () => {
    const f = fixture(); const context = await f.dependencies.authorize('Bearer synthetic', 'session')
    const report = { sourceHash: await sourceHash(context.turns), result: { summary: [{ text: 'generated' }] } } as ReportRecord
    f.logs[0].content = '수정된 대화'
    await expect(context.save(report)).rejects.toMatchObject({ status: 409 })
    expect(f.queries.some(q => q.patch)).toBe(false)
    f.logs[0].content = '고향 이야기'; f.conflict()
    await expect(context.save(report)).rejects.toMatchObject({ status: 409 })
  })
})

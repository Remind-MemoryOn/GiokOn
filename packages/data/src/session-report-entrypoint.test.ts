import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { ReportError, sourceHash, type ReportDependencies, type ReportRecord } from '../../../supabase/functions/session-report/handler'

function fixture() {
  let dependencies!: ReportDependencies
  const session = { id: 'session', profile_id: 'profile', status: 'ended', user_id: 'user' }
  const logs = [{ id: 'log', role: 'user', content: '고향 이야기', turn_index: 0 }]
  const baseline = { id: 'analysis', updated_at: 'revision-1', analysis: { metrics: { responseRate: 0.5 }, summary: 'baseline' } }
  const getUser = vi.fn(async () => ({ data: { user: { id: 'user' } }, error: null }))
  const rpc = vi.fn(async () => ({ data: true, error: null }))
  const queries: { table: string; filters: unknown[][]; patch?: unknown }[] = []
  let conflict = false
  const from = (table: string) => {
    const query: typeof queries[number] = { table, filters: [] }; queries.push(query)
    const terminal = async () => ({ data: query.patch ? { id: 'analysis' } : table === 'sessions' ? session : baseline, error: query.patch && conflict ? { message: 'conflict' } : null })
    const chain = {
      select: (_columns: string) => chain,
      eq: (...args: unknown[]) => { query.filters.push(args); return chain },
      order: (_column: string) => chain,
      limit: async (_count: number) => ({ data: logs, error: null }),
      single: terminal,
      update: (patch: unknown) => { query.patch = patch; return chain },
    }
    return chain
  }
  const source = readFileSync(new URL('../../../supabase/functions/session-report/index.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, fetch: vi.fn(), AbortSignal,
    Deno: { serve: vi.fn(), env: { get: (name: string) => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic', REPORT_ALLOWED_USER_IDS: 'user' })[name] } },
    require: (name: string) => name.includes('supabase-js') ? { createClient: () => ({ auth: { getUser }, rpc, from }) } : {
      ReportError, sourceHash, createReportHandler: (deps: ReportDependencies) => { dependencies = deps; return () => {} },
    },
  })
  return { dependencies, session, logs, queries, getUser, rpc, conflict: () => { conflict = true } }
}
describe('session-report deployed entrypoint authorization and persistence', () => {
  it('checks user identity before querying records and rejects unlisted callers', async () => {
    const f = fixture(); f.getUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null })
    await expect(f.dependencies.authorize('Bearer synthetic', 'session')).rejects.toMatchObject({ status: 403 })
    expect(f.queries).toHaveLength(0)
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

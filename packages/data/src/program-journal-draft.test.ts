import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  createWorkerHandler, JOBS_PER_RUN, processJob, WorkerAuthError, WORKER_MESSAGES,
  type ClaimedJob, type WorkerDeps,
} from '../../../supabase/functions/program-journal-draft/worker'
import { GENERATION_TURN_LIMIT } from '../../../supabase/functions/_shared/report-generation'

const job: ClaimedJob = { job_id: 'job-1', journal_id: 'journal-1', session_id: 'session-1', attempt: 1 }
const turns = [
  { id: 't0', speaker: 'AI', text: '고향이 어디세요?' },
  { id: 't1', speaker: 'Elderly', text: '전주에서 자랐어요. 시장에서 어머니랑 장을 봤지요.' },
]
const claim = (text: string) => ({ text, evidence: [{ turnId: 't1', quote: '전주에서 자랐어요' }] })
const generated = {
  summary: [claim('전주에서 자란 이야기를 하셨다.')],
  topics: [],
  journal: [claim('고향 전주와 시장 이야기를 회상하셨다.')],
  participantResponse: [claim('시장 이야기를 이어서 말씀하셨다.')],
  opinion: [],
  guardianText: '오늘 고향 전주 이야기를 들려주셨어요.',
}

function deps(over: Partial<WorkerDeps> = {}) {
  const d = {
    claim: vi.fn(async () => [job]),
    loadTurns: vi.fn(async () => turns),
    generate: vi.fn(async () => ({ result: generated })),
    finish: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    ...over,
  }
  return d as typeof d & WorkerDeps
}
const post = (secret?: string) => new Request('https://synthetic.invalid', {
  method: 'POST', headers: secret ? { 'x-worker-secret': secret } : {}, body: '{}',
})

describe('program-journal-draft worker — one job', () => {
  it('maps the generated session to journal fields and stops at pending review', async () => {
    const d = deps()
    expect(await processJob(job, 's', d)).toBe('finished')
    expect(d.finish).toHaveBeenCalledExactlyOnceWith('s', 'job-1', {
      activity_content: '고향 전주와 시장 이야기를 회상하셨다.',
      participant_response: '시장 이야기를 이어서 말씀하셨다.',
      opinion_collected: null,
      overall_evaluation: null,
      next_plan: null,
      guardian_text: '오늘 고향 전주 이야기를 들려주셨어요.',
    })
    expect(d.fail).not.toHaveBeenCalled()
    expect(vi.mocked(d.generate).mock.calls[0][0]).toBe(turns)
  })

  it('clears only the field that carries a diagnostic expression', async () => {
    const d = deps({ generate: vi.fn(async () => ({ result: { ...generated, guardianText: '요즘 우울해 보이셔서 병원 진료를 권합니다.' } })) })
    await processJob(job, 's', d)
    const fields = vi.mocked(d.finish).mock.calls[0][2]
    expect(fields.guardian_text).toBeNull()
    expect(fields.activity_content).toBe('고향 전주와 시장 이야기를 회상하셨다.')
  })

  it('retries when the elder speech is not saved yet, without calling the AI', async () => {
    const d = deps({ loadTurns: vi.fn(async () => [turns[0], { id: 't2', speaker: 'Elderly', text: '  ' }]) })
    expect(await processJob(job, 's', d)).toBe('retry')
    expect(d.fail).toHaveBeenCalledExactlyOnceWith('s', 'job-1', WORKER_MESSAGES.noSpeech, true)
    expect(d.generate).not.toHaveBeenCalled()
  })

  it('fails permanently (no retry) when the conversation exceeds the generation limit', async () => {
    const many = Array.from({ length: GENERATION_TURN_LIMIT + 1 }, (_, i) => ({ id: `t${i}`, speaker: 'Elderly', text: '네' }))
    const d = deps({ loadTurns: vi.fn(async () => many) })
    expect(await processJob(job, 's', d)).toBe('failed')
    expect(d.fail).toHaveBeenCalledExactlyOnceWith('s', 'job-1', WORKER_MESSAGES.tooLong, false)
    expect(d.generate).not.toHaveBeenCalled()
  })

  it.each([
    ['load', { loadTurns: vi.fn(async () => { throw new Error('db down') }) }, WORKER_MESSAGES.loadFailed],
    ['generate', { generate: vi.fn(async () => { throw new Error('REPORT_PROVIDER_LIMIT: raw provider text') }) }, WORKER_MESSAGES.generateFailed],
    ['finish', { finish: vi.fn(async () => { throw new Error('constraint') }) }, WORKER_MESSAGES.saveFailed],
  ] as const)('a %s error becomes a retryable failure with a caregiver-facing message', async (_, over, message) => {
    const d = deps(over as Partial<WorkerDeps>)
    expect(await processJob(job, 's', d)).toBe('retry')
    expect(d.fail).toHaveBeenCalledExactlyOnceWith('s', 'job-1', message, true)
  })

  it('never throws even when reporting the failure fails (the DB reclaims stuck jobs)', async () => {
    const d = deps({ generate: vi.fn(async () => { throw new Error('x') }), fail: vi.fn(async () => { throw new Error('rpc down') }) })
    await expect(processJob(job, 's', d)).resolves.toBe('retry')
  })

  it('bounds the generation wait with a timeout signal', async () => {
    const d = deps({ generationTimeoutMs: 5 })
    await processJob(job, 's', d)
    const signal: AbortSignal = vi.mocked(d.generate).mock.calls[0][1]
    await new Promise(r => setTimeout(r, 20))
    expect(signal.aborted).toBe(true)
  })
})

describe('program-journal-draft worker — HTTP handler', () => {
  it('rejects requests without the worker secret or with a wrong one, claiming nothing', async () => {
    const d = deps()
    expect((await createWorkerHandler(d)(post())).status).toBe(401)
    expect(d.claim).not.toHaveBeenCalled()
    const wrong = deps({ claim: vi.fn(async () => { throw new WorkerAuthError() }) })
    expect((await createWorkerHandler(wrong)(post('bad'))).status).toBe(401)
    expect(wrong.loadTurns).not.toHaveBeenCalled()
    expect((await createWorkerHandler(d)(new Request('https://synthetic.invalid', { method: 'GET' }))).status).toBe(405)
  })

  it('answers 202 right after claiming and keeps processing in the background', async () => {
    let background: Promise<unknown> | undefined
    const d = deps({ waitUntil: p => { background = p } })
    const res = await createWorkerHandler(d)(post('s'))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ claimed: 1 })
    expect(d.claim).toHaveBeenCalledExactlyOnceWith('s', JOBS_PER_RUN)
    await background
    expect(d.finish).toHaveBeenCalledTimes(1)
  })

  it('processes claimed jobs concurrently and isolates their failures', async () => {
    const jobs = [job, { ...job, job_id: 'job-2', session_id: 'session-2' }]
    const d = deps({
      claim: vi.fn(async () => jobs),
      loadTurns: vi.fn(async (sid: string) => { if (sid === 'session-2') throw new Error('x'); return turns }),
    })
    const res = await createWorkerHandler(d)(post('s'))
    expect(await res.json()).toEqual({ claimed: 2, outcomes: ['finished', 'retry'] })
  })

  it('reports 503 (not 401) when the claim fails for another reason', async () => {
    const d = deps({ claim: vi.fn(async () => { throw new Error('network') }) })
    expect((await createWorkerHandler(d)(post('s'))).status).toBe(503)
  })
})

describe('program-journal-draft deployed entrypoint', () => {
  function load(rpcError: { message: string } | null = null) {
    let captured!: WorkerDeps
    const rpc = vi.fn(async () => ({ data: [job], error: rpcError }))
    const createClient = vi.fn((..._args: unknown[]) => ({ rpc, from: () => ({}) }))
    const source = readFileSync(new URL('../../../supabase/functions/program-journal-draft/index.ts', import.meta.url), 'utf8')
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports: {}, fetch: vi.fn(), AbortSignal, globalThis: {},
      Deno: { serve: vi.fn(), env: { get: (name: string) => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_REPORT_MODEL: 'gemini-test', GEMINI_API_KEY: 'k' })[name] } },
      require: (name: string) => name.includes('supabase-js') ? { createClient } : name.includes('worker')
        ? { WorkerAuthError, createWorkerHandler: (d: WorkerDeps) => { captured = d; return () => {} } }
        : { generateReport: vi.fn(), toSourceTurns: (r: unknown[]) => r, GENERATION_TURN_LIMIT },
    })
    return { deps: captured, rpc, createClient }
  }

  it('uses the service role key from the runtime and passes the secret to the claim RPC', async () => {
    const { deps: d, rpc, createClient } = load()
    expect(createClient.mock.calls[0][1]).toBe('service')
    expect(await d.claim('s', 3)).toEqual([job])
    expect(rpc).toHaveBeenCalledWith('claim_journal_generation_jobs', { p_secret: 's', p_limit: 3 })
  })

  it('maps the DB secret rejection to WorkerAuthError', async () => {
    const { deps: d } = load({ message: 'WORKER_UNAUTHORIZED' })
    await expect(d.claim('bad', 3)).rejects.toBeInstanceOf(WorkerAuthError)
  })
})

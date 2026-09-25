// 프로그램 일지 초안 워커 로직(파일럿 C4 · T20.6) — 런타임·환경 import 없음(packages/data 가 테스트한다).
//
// 흐름: pg_cron(30초) → pg_net POST(x-worker-secret) → claim(비밀값 확인 + 작업 잡기) → 202 응답
//       → 백그라운드: 대화 기록 → Gemini 생성·검증 → 칸 매핑·진단표현 칸 비우기 → finish(확인 대기)
//       실패는 fail(재시도 가능 여부)로 넘긴다 — 백오프·최대 6회·failed 전환은 DB 가 정한다.
// 원칙: 확정하지 않는다(DB 가드가 서비스 계정 확정을 막는다) · 오류 문구는 요양보호사가 읽는다(원문·내부 코드 노출 금지).
import type { GeneratedSession, GenerationSourceTurn } from '../../../packages/core/src/generated-session.ts'
import { mapAnalysisToJournalFields, screenJournalDraft, type JournalDraftFields } from '../../../packages/core/src/program-journal.ts'
import { exceedsGenerationLimit, hasElderSpeech } from '../_shared/report-generation.ts'

export interface ClaimedJob { job_id: string; journal_id: string; session_id: string; attempt: number }

export class WorkerAuthError extends Error {}

export interface WorkerDeps {
  /** 비밀값이 틀리면 WorkerAuthError. */
  claim(secret: string, limit: number): Promise<ClaimedJob[]>
  loadTurns(sessionId: string): Promise<GenerationSourceTurn[]>
  generate(turns: GenerationSourceTurn[], signal: AbortSignal): Promise<{ result: GeneratedSession }>
  finish(secret: string, jobId: string, fields: JournalDraftFields): Promise<void>
  fail(secret: string, jobId: string, message: string, retryable: boolean): Promise<void>
  /** 응답 뒤에도 처리를 이어 가게 한다(Supabase EdgeRuntime.waitUntil). 없으면 응답 전에 끝낸다. */
  waitUntil?(promise: Promise<unknown>): void
  /** 한 작업의 생성 대기 상한(ms). */
  generationTimeoutMs?: number
}

/** 한 번 호출에 잡는 작업 수 — 동시에 처리한다(각 45초 상한 → Edge 실행 시간 안). */
export const JOBS_PER_RUN = 3

/** 요양보호사에게 보이는 실패 문구(program_journals.last_error). */
export const WORKER_MESSAGES = {
  noSpeech: '대화 기록이 아직 저장되지 않았어요. 잠시 후 다시 시도합니다.',
  tooLong: '대화가 길어 AI 초안 범위를 넘었어요. 직접 작성해 주세요.',
  loadFailed: '대화 기록을 읽지 못했어요. 잠시 후 다시 시도합니다.',
  generateFailed: 'AI 초안을 만들지 못했어요. 잠시 후 다시 시도합니다.',
  saveFailed: 'AI 초안을 저장하지 못했어요. 잠시 후 다시 시도합니다.',
} as const

type Outcome = 'finished' | 'retry' | 'failed'

/** 작업 하나 — 어떤 경우에도 finish 나 fail 중 하나로 끝낸다(던지지 않는다). */
export async function processJob(job: ClaimedJob, secret: string, deps: WorkerDeps): Promise<Outcome> {
  const fail = async (message: string, retryable: boolean): Promise<Outcome> => {
    try { await deps.fail(secret, job.job_id, message, retryable) } catch { /* 멈춘 작업은 DB 가 5분 뒤 회수한다 */ }
    return retryable ? 'retry' : 'failed'
  }
  let turns: GenerationSourceTurn[]
  try {
    turns = await deps.loadTurns(job.session_id)
  } catch {
    return fail(WORKER_MESSAGES.loadFailed, true)
  }
  // 앱이 기록을 다 올리기 전에 세션이 끝났을 수 있다 → 재시도.
  if (!hasElderSpeech(turns)) return fail(WORKER_MESSAGES.noSpeech, true)
  if (exceedsGenerationLimit(turns)) return fail(WORKER_MESSAGES.tooLong, false)

  let fields: JournalDraftFields
  try {
    const { result } = await deps.generate(turns, AbortSignal.timeout(deps.generationTimeoutMs ?? 45000))
    fields = screenJournalDraft(mapAnalysisToJournalFields(result)).fields
  } catch {
    // 공급자 오류·한도·불완전 출력·근거 없는 인용·판정 표현 — 다음 시도는 통과할 수 있다.
    return fail(WORKER_MESSAGES.generateFailed, true)
  }
  try {
    await deps.finish(secret, job.job_id, fields)
    return 'finished'
  } catch {
    return fail(WORKER_MESSAGES.saveFailed, true)
  }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export function createWorkerHandler(deps: WorkerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    const secret = req.headers.get('x-worker-secret') ?? ''
    if (!secret) return json({ error: 'unauthorized' }, 401)
    let jobs: ClaimedJob[]
    try {
      jobs = await deps.claim(secret, JOBS_PER_RUN)
    } catch (error) {
      if (error instanceof WorkerAuthError) return json({ error: 'unauthorized' }, 401)
      return json({ error: 'claim failed' }, 503)
    }
    const work = Promise.allSettled(jobs.map(job => processJob(job, secret, deps)))
    if (deps.waitUntil) {
      deps.waitUntil(work)
      return json({ claimed: jobs.length }, 202)
    }
    const outcomes = await work
    return json({ claimed: jobs.length, outcomes: outcomes.map(o => (o.status === 'fulfilled' ? o.value : 'retry')) }, 200)
  }
}

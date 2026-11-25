// 분류기를 별도 스레드(worker_threads)에서 돌리는 래퍼 — CTX-CLS-S5.
// 중계는 이 클래스만 쓴다. 결과는 core 의 ClassifierOutcome 그대로이고, 실패를 '안전 통과'로 바꾸지 않는다(Q5):
//  - 시간 초과(timeoutMs — 값은 R5 결정 대기라 호출 쪽이 반드시 준다) → { ok:false, reason:'timeout' }
//  - 모델 불러오기 실패·스레드 오류·종료 → { ok:false, reason:'error' }
//  - 대상 턴이 빔 → { ok:false, reason:'input_invalid' }
// 시간 초과가 나면 스레드를 끝내고 다음 호출 때 새로 띄운다(멈춘 추론이 뒤 턴을 막지 않게). 늦게 온 결과는 버린다.
// result.latencyMs 는 호출부터 결과까지(대기 포함)로 바꿔 싣는다 — 시간 초과와 같은 기준이다.

import { Worker } from 'node:worker_threads'
import type { ClassifierOutcome } from '@giokon/core'
import type { ClassifierInput, LoadOptions } from './classifier.ts'

export interface WorkerOptions extends LoadOptions {
  /** 호출부터 결과까지 허용 시간(ms). 기본값 없음 — R5(사용자 결정). */
  timeoutMs: number
  /** 스레드 실행 인자. 기본 = 이 프로세스의 execArgv(중계는 `node --import tsx` 라 .ts 워커가 그대로 뜬다). */
  execArgv?: string[]
}

type Reply = { id: number; ok: true; result: import('@giokon/core').ContextClassification } | { id: number; ok: false; reason: 'error' | 'input_invalid'; message?: string }
type Pending = { resolve: (o: ClassifierOutcome) => void; timer: NodeJS.Timeout; started: number }

export class ClassifierWorker {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private closed = false
  /** 마지막 스레드 오류(진단용 — 사용자 화면에 보이지 않는다). */
  lastError: string | null = null

  constructor(private readonly o: WorkerOptions) {
    if (!(Number.isFinite(o.timeoutMs) && o.timeoutMs > 0)) throw new Error('timeoutMs 가 필요하다(R5)')
  }

  /** 모델을 미리 불러온다(중계 시작 때). 실패하면 던진다 — 그 뒤 호출은 'error' 로 끝난다. */
  async warmup(): Promise<void> {
    await this.spawn()
  }

  classify(input: ClassifierInput): Promise<ClassifierOutcome> {
    if (this.closed) return Promise.resolve({ ok: false, reason: 'error' })
    if (typeof input?.text !== 'string' || input.text.trim() === '') return Promise.resolve({ ok: false, reason: 'input_invalid' })
    const id = this.nextId++
    const started = performance.now()
    return new Promise<ClassifierOutcome>(resolve => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return
        resolve({ ok: false, reason: 'timeout' })
        this.reset('timeout')
      }, this.o.timeoutMs)
      this.pending.set(id, { resolve, timer, started })
      this.spawn().then(
        () => this.worker?.postMessage({ id, input }),
        () => this.finish(id, { ok: false, reason: 'error' }),
      )
    })
  }

  async close(): Promise<void> {
    this.closed = true
    this.failAll()
    const w = this.worker
    this.worker = null; this.ready = null
    if (w) await w.terminate()
  }

  private spawn(): Promise<void> {
    if (this.ready) return this.ready
    const { timeoutMs: _t, execArgv, ...load } = this.o
    const w = new Worker(new URL('./worker-entry.ts', import.meta.url), { workerData: load, execArgv: execArgv ?? process.execArgv })
    this.worker = w
    this.ready = new Promise<void>((resolve, reject) => {
      w.once('message', (m: { type: string; message?: string }) => {
        if (m.type === 'ready') { resolve(); w.on('message', (r: Reply) => this.onReply(r)) }
        else { this.lastError = m.message ?? 'load_error'; reject(new Error(this.lastError)); this.reset('load_error') }
      })
      w.once('error', e => { this.lastError = String(e); reject(e); this.reset('error') })
      w.once('exit', code => { if (this.worker === w) { this.lastError ??= `exit ${code}`; reject(new Error(`exit ${code}`)); this.reset('exit') } })
    })
    this.ready.catch(() => {})
    return this.ready
  }

  private onReply(r: Reply): void {
    const p = this.pending.get(r.id)
    if (!p) return // 이미 시간 초과로 끝난 호출의 늦은 결과
    if (r.ok) this.finish(r.id, { ok: true, result: { ...r.result, latencyMs: performance.now() - p.started } })
    else { if (r.message) this.lastError = r.message; this.finish(r.id, { ok: false, reason: r.reason }) }
  }

  private finish(id: number, o: ClassifierOutcome): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    p.resolve(o)
  }

  private failAll(): void {
    for (const id of [...this.pending.keys()]) this.finish(id, { ok: false, reason: 'error' })
  }

  /** 스레드를 버린다 — 기다리던 다른 호출은 'error'. 다음 호출 때 새로 띄운다. */
  private reset(_why: string): void {
    const w = this.worker
    this.worker = null; this.ready = null
    this.failAll()
    if (w) void w.terminate()
  }
}

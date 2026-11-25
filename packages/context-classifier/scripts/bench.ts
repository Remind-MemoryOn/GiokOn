// 지연·메모리 실측(CTX-CLS-S5). 모델 폴더 + parity_fixture.json(검증 문장) 필요.
// 실행(저장소 루트 · Linux 1코어 고정 예): cd packages/context-classifier && taskset -c 0 node --import tsx scripts/bench.ts <모델 폴더> [model.fp32.onnx]
// 입력은 R4 모양(직전 AI 질문 + 어르신 최근 1턴 + 이번 턴)으로 만든다. 동시 4건(중계 연결 상한)도 잰다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClassifierWorker } from '../src/worker.ts'

const dir = process.argv[2]; const modelFile = process.argv[3] ?? 'model.fp32.onnx'
if (!dir) throw new Error('모델 폴더가 필요하다')
type Row = { id: string; context: { speaker: 'ai'; text: string }[]; text: string }
const rows = JSON.parse(readFileSync(join(dir, 'parity_fixture.json'), 'utf8')) as Row[]
const inputs = rows.map((r, i) => ({
  sessionId: 's', turnId: r.id, inputRevision: 0, text: r.text,
  context: [...r.context, { speaker: 'elder' as const, text: rows[(i + 37) % rows.length].text }],
}))
const mb = () => Math.round(process.memoryUsage().rss / 1048576)
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1)

const rss0 = mb()
const w = new ClassifierWorker({ modelDir: dir, modelVersion: 'bench', modelFile, timeoutMs: 60_000 }) // 실측은 시간 초과 없이
const t0 = performance.now(); await w.warmup(); const load = performance.now() - t0
for (const x of inputs.slice(0, 20)) await w.classify(x)
const seq: number[] = []
for (const x of inputs) { const o = await w.classify(x); if (!o.ok) throw new Error(o.reason); seq.push(o.result.latencyMs) }
const rssSeq = mb()
const conc: number[] = []
for (let i = 0; i + 4 <= 400; i += 4) {
  const os = await Promise.all(inputs.slice(i, i + 4).map(x => w.classify(x)))
  for (const o of os) { if (!o.ok) throw new Error(o.reason); conc.push(o.result.latencyMs) }
}
const longest = inputs.map(x => ({ ...x, context: [{ speaker: 'ai' as const, text: '오늘은 무슨 이야기 해 볼까요? '.repeat(20) }], text: '요즘 몸은 좀 어떠세요 하면 그냥 그래 하고 넘어가는데 사실은 밤마다 잠이 안 와서 많이 힘들어' }))
const lng: number[] = []
for (const x of longest.slice(0, 200)) { const o = await w.classify(x); if (!o.ok) throw new Error(o.reason); lng.push(o.result.latencyMs) }
await w.close()
console.log(JSON.stringify({
  modelFile, rows: inputs.length, loadMs: Math.round(load), rssMB: { before: rss0, afterLoadAndRun: rssSeq, peak: Math.round(process.resourceUsage().maxRSS / 1024) },
  sequentialMs: { p50: pct(seq, 0.5), p95: pct(seq, 0.95), p99: pct(seq, 0.99), max: Math.max(...seq).toFixed(1) },
  concurrent4Ms: { p50: pct(conc, 0.5), p95: pct(conc, 0.95), p99: pct(conc, 0.99), max: Math.max(...conc).toFixed(1) },
  maxLen128Ms: { p50: pct(lng, 0.5), p95: pct(lng, 0.95), max: Math.max(...lng).toFixed(1) },
}, null, 1))

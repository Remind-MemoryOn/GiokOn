/**
 * 정책 단위 평가 — 분류기 점수를 **core 의 실제 결합 정책**(decideContextSafety)과 규칙(assessUtterance)에 넣어
 * 게이트 기준(사용자 확정 R1 2026-11-22)으로 잰다. CTX-CLS-S3·S7.
 *
 *  - 기대 행동 = 같은 정책에 **정답 라벨(원핫)** 을 분류기 결과로 넣은 행동. 예측 행동 = 보정된 점수를 넣은 행동.
 *  - 범주별 재현율(대응 대상 = 본인·현재 또는 최근·직접): 자해·신체 응급·학대·급성 고통은 예측 행동이 일시정지 이상,
 *    휴식·거부는 마무리 이상이면 적중. 기준 = 자해·신체 응급·학대 ≥ 0.96, 급성 고통·휴식·거부 ≥ 0.90.
 *  - 불필요한 일시정지 = 기대 행동이 계속·마무리인데 예측이 직원 확인 일시정지인 비율(규칙 즉시 종료는 제외). 기준 ≤ 1%.
 *  - 비교: 규칙만(ruleOnlyAction)의 같은 재현율.
 * 검증(dev) 예측은 임계값 선택에만 쓴다 — 게이트 판정은 사람이 쓴 평가(eval) 자료로만 한다.
 *
 * 실행: tsx ml/context-safety/tools/policy_eval.ts <dev_predictions.json> [--grid] [--t 0.5 --q 0.5]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CONTEXT_ACTION_SEVERITY, CONTEXT_CONTENT_LABELS, CONTEXT_CRISIS_LABELS, CONTEXT_INTENTS, CONTEXT_INTERPRETABILITY,
  CONTEXT_MODES, CONTEXT_SUBJECTS, CONTEXT_TENSES, decideContextSafety, ruleOnlyAction,
  type ClassifierOutcome, type ContextSafetyAction, type ContextSafetyPolicy,
} from '../../../packages/core/src/context-safety.ts'
import { assessUtterance } from '../../../packages/core/src/safety.ts'

type Labels = Record<string, string | string[]>
export type Prediction = { id: string; text: string; labels: Labels; scores: Record<string, Record<string, number>> }

export const GATE = { self_harm: 0.96, medical_emergency: 0.96, abuse: 0.96, acute_distress: 0.9, rest_request: 0.9, refusal: 0.9 } as const
export type GateCategory = keyof typeof GATE
export const MAX_UNNECESSARY_PAUSE = 0.01
const EXPECTED = { sessionId: 's', turnId: 't', inputRevision: 0 }

const AXES = {
  content: CONTEXT_CONTENT_LABELS, crisisCategory: CONTEXT_CRISIS_LABELS, subject: CONTEXT_SUBJECTS, tense: CONTEXT_TENSES,
  mode: CONTEXT_MODES, intent: CONTEXT_INTENTS, interpretability: CONTEXT_INTERPRETABILITY,
} as const

function outcome(scores: Record<string, Record<string, number>>): ClassifierOutcome {
  const r: Record<string, Record<string, number>> = {}
  for (const [axis, keys] of Object.entries(AXES)) r[axis] = Object.fromEntries(keys.map(k => [k, scores[axis]?.[k] ?? 0]))
  return { ok: true, result: { modelVersion: 'eval', ...EXPECTED, latencyMs: 0, ...r } as never }
}

/** 정답 라벨 → 원핫 점수. */
export function oneHot(labels: Labels): Record<string, Record<string, number>> {
  const s: Record<string, Record<string, number>> = {}
  for (const [axis, keys] of Object.entries(AXES)) {
    const v = labels[axis]
    s[axis] = Object.fromEntries(keys.map(k => [k, (Array.isArray(v) ? v.includes(k) : v === k) ? 1 : 0]))
  }
  return s
}

export function policyOf(t: number, q: number): ContextSafetyPolicy {
  return { version: 'eval', modelVersion: 'eval', thresholds: { crisis: t, distress: t, crisisCategory: t, closing: t, qualifier: q } }
}

export function isActionable(l: Labels, c: GateCategory): boolean {
  const content = l.content as string[], crisis = l.crisisCategory as string[]
  const surface = c === 'self_harm' || c === 'medical_emergency' || c === 'abuse' ? crisis.includes(c) : content.includes(c)
  return surface && l.subject === 'self' && (l.tense === 'present' || l.tense === 'recent') && l.mode === 'direct'
}

const reached = (a: ContextSafetyAction, c: GateCategory) =>
  CONTEXT_ACTION_SEVERITY[a] >= CONTEXT_ACTION_SEVERITY[c === 'rest_request' || c === 'refusal' ? 'elder_closing' : 'staff_review_pause']

export function evaluate(preds: Prediction[], t: number, q: number) {
  const policy = policyOf(t, q), gold = policyOf(0.5, 0.5)
  const cat = Object.fromEntries(Object.keys(GATE).map(c => [c, { n: 0, combined: 0, rule: 0, misses: [] as string[] }])) as Record<GateCategory, { n: number; combined: number; rule: number; misses: string[] }>
  let neg = 0, falsePause = 0
  const falsePauses: string[] = []
  for (const p of preds) {
    const rule = assessUtterance(p.text)
    const expected = decideContextSafety({ rule, classifier: outcome(oneHot(p.labels)), expected: EXPECTED, policy: gold }).action
    const got = decideContextSafety({ rule, classifier: outcome(p.scores), expected: EXPECTED, policy }).action
    const ruleOnly = ruleOnlyAction(rule)
    for (const c of Object.keys(GATE) as GateCategory[]) {
      if (!isActionable(p.labels, c)) continue
      const x = cat[c]; x.n++
      if (reached(got, c)) x.combined++; else x.misses.push(`${p.id} ${p.text}`)
      if (reached(ruleOnly, c)) x.rule++
    }
    if ((expected === 'continue' || expected === 'elder_closing') && ruleOnly !== 'stop_immediately') {
      neg++
      if (got === 'staff_review_pause') { falsePause++; falsePauses.push(`${p.id} ${p.text}`) }
    }
  }
  const recall = Object.fromEntries((Object.keys(GATE) as GateCategory[]).map(c => [c, cat[c].n ? cat[c].combined / cat[c].n : null]))
  const passRecall = (Object.keys(GATE) as GateCategory[]).every(c => cat[c].n === 0 || cat[c].combined / cat[c].n >= GATE[c])
  const pauseRate = neg ? falsePause / neg : 0
  return { t, q, cat, recall, passRecall, neg, falsePause, pauseRate, passPause: pauseRate <= MAX_UNNECESSARY_PAUSE, falsePauses }
}

function main(argv: string[]) {
  const file = argv.find(a => !a.startsWith('--'))
  if (!file) throw new Error('dev_predictions.json 경로가 필요합니다')
  const preds = JSON.parse(readFileSync(file, 'utf8')) as Prediction[]
  const arg = (k: string, d: number) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d }
  const pct = (x: number | null) => (x === null ? '—' : (x * 100).toFixed(1) + '%')
  const show = (r: ReturnType<typeof evaluate>) => {
    console.log(`임계값 t=${r.t} q=${r.q} · 재현율 기준 ${r.passRecall ? '충족' : '미달'} · 불필요 일시정지 ${pct(r.pauseRate)} (${r.falsePause}/${r.neg}) ${r.passPause ? '충족' : '미달'}`)
    console.log('| 범주 | 대응 대상 수 | 규칙 OR 분류기 | 규칙만 | 기준 |'); console.log('|---|---|---|---|---|')
    for (const c of Object.keys(GATE) as GateCategory[]) {
      const x = r.cat[c]; console.log(`| ${c} | ${x.n} | ${pct(x.n ? x.combined / x.n : null)} | ${pct(x.n ? x.rule / x.n : null)} | ≥${GATE[c] * 100}% |`)
    }
    for (const c of Object.keys(GATE) as GateCategory[]) for (const m of r.cat[c].misses) console.log(`- 미탐 ${c}: ${m}`)
    for (const f of r.falsePauses) console.log(`- 불필요 일시정지: ${f}`)
  }
  if (argv.includes('--grid')) {
    const rows: ReturnType<typeof evaluate>[] = []
    for (const t of [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) for (const q of [0.3, 0.4, 0.5]) rows.push(evaluate(preds, t, q))
    console.log('| t | q | 재현율 충족 | 불필요 일시정지 | 최저 재현율 범주 |'); console.log('|---|---|---|---|---|')
    for (const r of rows) {
      const worst = (Object.entries(r.recall).filter(([, v]) => v !== null) as [string, number][]).sort((a, b) => a[1] - b[1])[0]
      console.log(`| ${r.t} | ${r.q} | ${r.passRecall ? '✓' : '✗'} | ${pct(r.pauseRate)} | ${worst ? `${worst[0]} ${pct(worst[1])}` : '—'} |`)
    }
    // 고르기: 재현율 기준 충족 중 불필요 일시정지 최소, 같으면 t 큰 쪽(보수적으로 덜 멈춤). 충족이 없으면 최저 재현율이 가장 높은 것.
    const ok = rows.filter(r => r.passRecall)
    const pick = ok.length
      ? ok.sort((a, b) => a.pauseRate - b.pauseRate || b.t - a.t)[0]
      : rows.sort((a, b) => Math.min(...Object.values(b.recall).filter((v): v is number => v !== null)) - Math.min(...Object.values(a.recall).filter((v): v is number => v !== null)))[0]
    console.log(`\n선택: t=${pick.t} q=${pick.q}${ok.length ? '' : ' (재현율 기준을 충족하는 조합 없음)'}\n`)
    show(pick)
  } else show(evaluate(preds, arg('--t', 0.5), arg('--q', 0.5)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2))

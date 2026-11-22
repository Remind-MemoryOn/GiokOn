/**
 * 현재 규칙(`assessUtterance`)의 기준선 — CTX-CLS-S2.
 *
 * 같은 평가 자료에 규칙을 돌려 범주별 재현율·정밀도·미탐·오탐을 낸다. 분류기 효과는 나중에
 * "규칙 단독" 대비 "규칙 OR 분류기"로 보고한다(게이트 보고서 S7).
 *
 * 정답(양성)은 두 기준을 나란히 계산한다(어느 하나로 정하지 않는다).
 *  - 표면 기준: 그 내용이 언급되면 양성(과거·인용·부정·관용 포함)
 *  - 대응 대상 기준: 표면 양성 ∧ 주체 self ∧ 시점 present ∧ 표현 direct
 * 규칙 입력은 대상 턴 전사 하나다(중계는 연결 단위 누적 창으로 검사한다 — 차이는 보고서 머리말에 적는다).
 *
 * 실행(저장소 루트):
 *   apps/voice-relay/node_modules/.bin/tsx ml/context-safety/tools/rule_baseline.ts --split eval
 *   … --split train --labels author   (검수 전 라벨로 도구만 점검 — 기준선이 아님)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assessUtterance, type UtteranceAssessment } from '../../../packages/core/src/safety.ts'

export type Labels = {
  content: string[]
  crisisCategory: string[]
  subject: string
  tense: string
  mode: string
  intent: string
  interpretability: string
}
export type Example = {
  id: string
  split: string
  status: string
  target: { text: string }
  labelsByAuthor: Labels
  final: Labels | null
}

export const CATEGORIES = ['self_harm', 'medical_emergency', 'abuse', 'acute_distress', 'rest_request', 'refusal', 'stop'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_NAME: Record<Category, string> = {
  self_harm: '자해 관련', medical_emergency: '신체 응급', abuse: '학대 관련', acute_distress: '급성 고통',
  rest_request: '휴식 요청', refusal: '거부', stop: '즉시 종료 대상(위기 ∪ 급성 고통)',
}

/** 정답 — 표면 기준. */
export function goldSurface(l: Labels, c: Category): boolean {
  switch (c) {
    case 'self_harm': case 'medical_emergency': case 'abuse': return l.crisisCategory.includes(c)
    case 'acute_distress': case 'rest_request': case 'refusal': return l.content.includes(c)
    case 'stop': return l.content.includes('crisis_appeal') || l.content.includes('acute_distress')
  }
}

/** 정답 — 대응 대상 기준(본인·현재·직접). */
export function goldActionable(l: Labels, c: Category): boolean {
  return goldSurface(l, c) && l.subject === 'self' && l.tense === 'present' && l.mode === 'direct'
}

/** 규칙 판정. 규칙은 상황 하나만 돌려준다(위기 > 휴식 요청 > 급성 고통 > 거부) — 위기와 함께 나온 휴식 요청은 휴식으로 안 잡힌다. */
export function rulePositive(a: UtteranceAssessment, c: Category): boolean {
  switch (c) {
    case 'self_harm': case 'medical_emergency': case 'abuse': return a.crisisCategories.includes(c)
    case 'acute_distress': return a.hasDistressSignal
    case 'rest_request': case 'refusal': return a.situation === c
    case 'stop': return a.escalate || a.hasDistressSignal  // 중계 relay.ts 의 즉시 종료 조건과 같다
  }
}

export type Cell = { tp: number; fp: number; fn: number; tn: number; misses: string[]; falseAlarms: string[] }

export function measure(items: { id: string; text: string; labels: Labels }[], gold: (l: Labels, c: Category) => boolean) {
  const cells = Object.fromEntries(CATEGORIES.map(c => [c, { tp: 0, fp: 0, fn: 0, tn: 0, misses: [], falseAlarms: [] } as Cell])) as Record<Category, Cell>
  for (const it of items) {
    const a = assessUtterance(it.text)
    for (const c of CATEGORIES) {
      const g = gold(it.labels, c), r = rulePositive(a, c), cell = cells[c]
      if (g && r) cell.tp++
      else if (!g && r) { cell.fp++; cell.falseAlarms.push(`${it.id} ${it.text}`) }
      else if (g && !r) { cell.fn++; cell.misses.push(`${it.id} ${it.text}`) }
      else cell.tn++
    }
  }
  return cells
}

const ratio = (n: number, d: number) => (d === 0 ? '—' : `${(n / d).toFixed(3)} (${n}/${d})`)

function table(title: string, cells: Record<Category, Cell>): string {
  const rows = CATEGORIES.map(c => {
    const x = cells[c]
    return `| ${CATEGORY_NAME[c]} | ${x.tp + x.fn} | ${ratio(x.tp, x.tp + x.fn)} | ${ratio(x.tp, x.tp + x.fp)} | ${x.fn} | ${x.fp} |`
  })
  const lists = CATEGORIES.flatMap(c => {
    const x = cells[c]
    if (!x.misses.length && !x.falseAlarms.length) return []
    return [`#### ${CATEGORY_NAME[c]}`, ...x.misses.map(m => `- 미탐: ${m}`), ...x.falseAlarms.map(f => `- 오탐: ${f}`), '']
  })
  return [`### ${title}`, '', '| 범주 | 정답 양성 수 | 재현율 | 정밀도 | 미탐 | 오탐 |', '|---|---|---|---|---|---|', ...rows, '', ...lists].join('\n')
}

export function loadExamples(dataDir: string, split: string): Example[] {
  const dir = join(dataDir, split)
  let files: string[] = []
  try { files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort() } catch { return [] }
  return files.flatMap(f => readFileSync(join(dir, f), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Example))
}

function main(argv: string[]) {
  const arg = (k: string, d: string) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
  const split = arg('--split', 'eval')
  const labelsFrom = arg('--labels', 'final')
  const dataDir = resolve(arg('--data', resolve(import.meta.dirname, '../data')))
  const out = argv.includes('--out') ? arg('--out', '') : ''
  if (labelsFrom !== 'final' && labelsFrom !== 'author') throw new Error('--labels 는 final 또는 author')

  const all = loadExamples(dataDir, split)
  const used = labelsFrom === 'final'
    ? all.filter(e => e.status === 'accepted' && e.final).map(e => ({ id: e.id, text: e.target.text, labels: e.final! }))
    : all.map(e => ({ id: e.id, text: e.target.text, labels: e.labelsByAuthor }))
  const isBaseline = split === 'eval' && labelsFrom === 'final'
  const head = [
    `# 규칙 기준선 — ${isBaseline ? '평가 자료' : '⚠️ 도구 점검용(기준선 아님)'}`,
    '',
    `- 자료: \`${split}\` · 라벨: ${labelsFrom === 'final' ? '검수 합의(final)' : '작성자 라벨(검수 전)'} · 사용 ${used.length}개 / 전체 ${all.length}개`,
    '- 규칙: `packages/core/src/safety.ts` `assessUtterance`(대상 턴 전사 하나). 중계는 연결 단위 누적 창(최근 4,000자)으로 검사하므로 여러 턴에 걸친 어구는 여기서 안 잡힐 수 있다.',
    '- 규칙은 상황 하나만 돌려준다(위기 > 휴식 요청 > 급성 고통 > 거부). 위기와 함께 나온 휴식 요청·거부는 휴식·거부로 집계되지 않는다(행동은 어차피 즉시 종료).',
    '- 정답 두 기준: **표면**(언급되면 양성) · **대응 대상**(표면 ∧ 본인·현재·직접). D1 때문에 규칙 적중은 늘 그대로 집행된다 — 대응 대상 기준의 오탐은 이번 범위(규칙 완화 금지) 밖이며 기록만 한다.',
    '- 작성된 예시다. 실제 어르신 음성·전사 오류 분포와 다를 수 있다. 현장 정확도로 표현하지 않는다.',
    '',
  ]
  if (!isBaseline) head.splice(2, 0, '> ⚠️ 이 결과는 평가 자료·검수 합의 라벨이 아니다. 수치를 기준선·성능으로 인용하지 않는다.', '')
  const report = [...head, table('표면 기준', measure(used, goldSurface)), '', table('대응 대상 기준(본인·현재·직접)', measure(used, goldActionable))].join('\n')
  if (out) writeFileSync(out, report + '\n', 'utf8')
  else process.stdout.write(report + '\n')
}

// Windows 경로(C:\…)에서도 맞게 URL 로 바꿔 비교한다.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2))

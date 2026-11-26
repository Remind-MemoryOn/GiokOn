// Python(학습) ↔ Node(추론) 일치 검사. 모델 폴더는 저장소 밖이라 CTX_CLS_MODEL_DIR 이 있을 때만 돈다.
// 준비: ml/context-safety/train/export_onnx.py → dump_parity_fixture.py (같은 --run 폴더)
// 실행(Windows cmd · 저장소 루트): set CTX_CLS_MODEL_DIR=<run>\onnx && pnpm --filter @giokon/context-classifier test
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ContextClassifier } from './classifier.ts'
import { encodePair, parseVocab } from './tokenizer.ts'
import { contextText } from './classifier.ts'
import { ClassifierWorker } from './worker.ts'

const DIR = process.env.CTX_CLS_MODEL_DIR
type Row = { id: string; context: { speaker: 'ai' | 'elder'; text: string }[]; text: string; input_ids: number[]; token_type_ids: number[]; probs: Record<string, Record<string, number>> }

describe.skipIf(!DIR)('Python 과 같은 토큰·점수', () => {
  const rows = DIR ? (JSON.parse(readFileSync(join(DIR, 'parity_fixture.json'), 'utf8')) as Row[]) : []
  const heads = DIR ? JSON.parse(readFileSync(join(DIR, 'heads.json'), 'utf8')) : null
  const vocab = DIR ? parseVocab(readFileSync(join(DIR, 'vocab.txt'), 'utf8')) : null
  let model: ContextClassifier | null = null
  afterAll(async () => { await model?.close() })

  it('토큰 id 가 모든 검증 문장에서 같다', () => {
    const bad = rows.filter(r => {
      const e = encodePair(contextText(r.context), r.text, vocab!, heads.max_len)
      return e.inputIds.join() !== r.input_ids.join() || e.tokenTypeIds.join() !== r.token_type_ids.join()
    })
    expect(bad.map(r => `${r.id} ${r.text}`)).toEqual([])
    expect(rows.length).toBeGreaterThan(1000)
  })

  it('fp32 점수가 PyTorch 와 1e-4 안에서 같다', async () => {
    model = await ContextClassifier.load({ modelDir: DIR!, modelVersion: 'parity' })
    let worst = 0
    for (const r of rows) {
      const got = await model.classify({ sessionId: 's', turnId: r.id, inputRevision: 0, context: r.context, text: r.text })
      for (const [axis, labels] of Object.entries(r.probs)) {
        for (const [l, p] of Object.entries(labels)) worst = Math.max(worst, Math.abs((got as unknown as Record<string, Record<string, number>>)[axis][l] - p))
      }
    }
    expect(worst).toBeLessThan(1e-4)
  }, 120_000)
})

describe.skipIf(!DIR)('워커 스레드', () => {
  const execArgv = ['--import', 'tsx']
  it('결과를 내고, 세션·턴·개정·모델 버전을 그대로 싣는다', async () => {
    const w = new ClassifierWorker({ modelDir: DIR!, modelVersion: 'v-test', timeoutMs: 30_000, execArgv })
    await w.warmup()
    const o = await w.classify({ sessionId: 's1', turnId: 't9', inputRevision: 3, context: [{ speaker: 'ai', text: '요즘 어떠세요?' }], text: '그냥 다 그만 살고 싶어' })
    await w.close()
    expect(o.ok).toBe(true)
    if (o.ok) {
      expect(o.result).toMatchObject({ sessionId: 's1', turnId: 't9', inputRevision: 3, modelVersion: 'v-test' })
      expect(o.result.content.crisis_appeal).toBeGreaterThan(0.5)
    }
  }, 60_000)

  it('시간 초과는 timeout, 빈 턴은 input_invalid, 잘못된 모델 폴더는 error — 통과로 바꾸지 않는다', async () => {
    const slow = new ClassifierWorker({ modelDir: DIR!, modelVersion: 'v', timeoutMs: 1, execArgv })
    expect(await slow.classify({ sessionId: 's', turnId: 't', inputRevision: 0, context: [], text: '안녕' })).toEqual({ ok: false, reason: 'timeout' })
    expect(await slow.classify({ sessionId: 's', turnId: 't', inputRevision: 0, context: [], text: '  ' })).toEqual({ ok: false, reason: 'input_invalid' })
    await slow.close()
    const broken = new ClassifierWorker({ modelDir: join(DIR!, '없는-폴더'), modelVersion: 'v', timeoutMs: 30_000, execArgv })
    await expect(broken.warmup()).rejects.toThrow()
    expect(await broken.classify({ sessionId: 's', turnId: 't', inputRevision: 0, context: [], text: '안녕' })).toEqual({ ok: false, reason: 'error' })
    await broken.close()
  }, 60_000)

  it('SHA-256 이 다르면 불러오지 않는다', async () => {
    const w = new ClassifierWorker({ modelDir: DIR!, modelVersion: 'v', timeoutMs: 30_000, execArgv, expectedSha256: '0'.repeat(64) })
    await expect(w.warmup()).rejects.toThrow(/SHA-256/)
    await w.close()
  }, 60_000)
})

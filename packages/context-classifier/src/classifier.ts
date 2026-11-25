// 전사 문맥 분류기 추론(ONNX Runtime · CPU) — CTX-CLS-S5.
// 이 파일은 같은 스레드에서 돈다. 중계에서는 worker.ts 로 별도 스레드에 띄워 쓴다(음성 처리 이벤트 루프를 막지 않게).
//
// 모델 폴더(R6 사용자 확정 2026-11-25: 중계 Docker 이미지에 포함 · 형식 fp32 · 런타임 자동 내려받기 없음):
//   model.fp32.onnx(또는 modelFile) · heads.json(출력 축·온도·max_len) · vocab.txt
// 입력 = 직전 문맥(화자 표시, ' / ' 로 잇기) [SEP] 어르신 대상 턴 — 학습(train.py context_text)과 같은 형식(R4).
// 점수 = 로짓 / 축별 온도 → 다중 축은 시그모이드, 한 값 축은 소프트맥스(학습의 보정과 같다).

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CONTEXT_CONTENT_LABELS, CONTEXT_CRISIS_LABELS, CONTEXT_INTENTS, CONTEXT_INTERPRETABILITY, CONTEXT_MODES,
  CONTEXT_SUBJECTS, CONTEXT_TENSES, type ContextClassification,
} from '@giokon/core'
import { encodePair, parseVocab, type Vocab } from './tokenizer.ts'

export type Speaker = 'ai' | 'elder'
export interface ClassifierInput {
  sessionId: string
  turnId: string
  inputRevision: number
  /** 직전 문맥(오래된 것 → 최근 순). R4: 직전 AI 질문 + 어르신 최근 1턴. */
  context: { speaker: Speaker; text: string }[]
  /** 이번 어르신 턴(확정 전사). */
  text: string
}

export interface LoadOptions {
  modelDir: string
  /** 결과에 실어 보낼 모델 버전. 정책(ContextSafetyPolicy.modelVersion)과 같아야 결합 정책이 결과를 받는다. */
  modelVersion: string
  /** 기본 model.fp32.onnx. */
  modelFile?: string
  /** 주면 모델 파일 SHA-256 을 확인하고, 다르면 불러오지 않는다. */
  expectedSha256?: string
  /** ONNX Runtime 스레드 수(기본 1 — 중계 인스턴스 1 vCPU 가정). */
  threads?: number
}

/** 학습 결과와 같은 축 순서·라벨 — core 의 라벨 목록과 다르면 불러오지 않는다. */
const EXPECTED_HEADS: Record<string, readonly string[]> = {
  content: CONTEXT_CONTENT_LABELS, crisisCategory: CONTEXT_CRISIS_LABELS, subject: CONTEXT_SUBJECTS, tense: CONTEXT_TENSES,
  mode: CONTEXT_MODES, intent: CONTEXT_INTENTS, interpretability: CONTEXT_INTERPRETABILITY,
}
const MULTI = new Set(['content', 'crisisCategory'])
const SPEAKER: Record<Speaker, string> = { ai: 'AI', elder: '어르신' }

interface HeadsJson { heads: Record<string, string[]>; temperatures: Record<string, number>; max_len: number }

export function contextText(turns: ClassifierInput['context']): string {
  return turns.map(t => `${SPEAKER[t.speaker]}: ${t.text}`).join(' / ') || '(문맥 없음)'
}

export function calibrate(logits: Float32Array | number[], temperature: number, multi: boolean): number[] {
  const z = Array.from(logits, v => v / temperature)
  if (multi) return z.map(v => 1 / (1 + Math.exp(-v)))
  const m = Math.max(...z)
  const e = z.map(v => Math.exp(v - m))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map(v => v / sum)
}

export function validateHeads(h: HeadsJson): void {
  const names = Object.keys(h.heads)
  if (names.join() !== Object.keys(EXPECTED_HEADS).join()) throw new Error(`heads.json 축 순서가 다르다: ${names.join()}`)
  for (const [axis, labels] of Object.entries(EXPECTED_HEADS)) {
    if (h.heads[axis].join() !== labels.join()) throw new Error(`heads.json ${axis} 라벨이 core 와 다르다`)
    const t = h.temperatures[axis]
    if (!(typeof t === 'number' && t > 0 && Number.isFinite(t))) throw new Error(`heads.json ${axis} 온도가 비정상`)
  }
  if (!(Number.isInteger(h.max_len) && h.max_len > 3)) throw new Error('heads.json max_len 이 비정상')
}

type Ort = typeof import('onnxruntime-node')

export class ContextClassifier {
  private constructor(
    private readonly ort: Ort,
    private readonly session: import('onnxruntime-node').InferenceSession,
    private readonly vocab: Vocab,
    private readonly heads: HeadsJson,
    readonly modelVersion: string,
  ) {}

  static async load(o: LoadOptions): Promise<ContextClassifier> {
    const ort = await import('onnxruntime-node')
    const heads = JSON.parse(await readFile(join(o.modelDir, 'heads.json'), 'utf8')) as HeadsJson
    validateHeads(heads)
    const vocab = parseVocab(await readFile(join(o.modelDir, 'vocab.txt'), 'utf8'))
    const bytes = await readFile(join(o.modelDir, o.modelFile ?? 'model.fp32.onnx'))
    if (o.expectedSha256) {
      const got = createHash('sha256').update(bytes).digest('hex')
      if (got !== o.expectedSha256.toLowerCase()) throw new Error(`모델 파일 SHA-256 불일치: ${got}`)
    }
    const threads = o.threads ?? 1
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['cpu'], intraOpNumThreads: threads, interOpNumThreads: 1, graphOptimizationLevel: 'all',
    })
    return new ContextClassifier(ort, session, vocab, heads, o.modelVersion)
  }

  /** 한 턴 분류. 입력 불량이면 던진다(호출 쪽이 input_invalid 로 바꾼다). */
  async classify(input: ClassifierInput): Promise<ContextClassification> {
    if (typeof input.text !== 'string' || input.text.trim() === '') throw new InputInvalidError('대상 턴이 비었다')
    const t0 = performance.now()
    const enc = encodePair(contextText(input.context), input.text, this.vocab, this.heads.max_len)
    const n = enc.inputIds.length
    const tensor = (v: number[]) => new this.ort.Tensor('int64', BigInt64Array.from(v, BigInt), [1, n])
    const out = await this.session.run({
      input_ids: tensor(enc.inputIds), attention_mask: tensor(enc.attentionMask), token_type_ids: tensor(enc.tokenTypeIds),
    })
    const scores: Record<string, Record<string, number>> = {}
    for (const [axis, labels] of Object.entries(this.heads.heads)) {
      const logits = out[axis]?.data as Float32Array | undefined
      if (!logits || logits.length !== labels.length) throw new Error(`출력 ${axis} 길이가 다르다`)
      const p = calibrate(logits, this.heads.temperatures[axis], MULTI.has(axis))
      scores[axis] = Object.fromEntries(labels.map((l, i) => [l, p[i]]))
    }
    return {
      modelVersion: this.modelVersion, sessionId: input.sessionId, turnId: input.turnId, inputRevision: input.inputRevision,
      ...(scores as Pick<ContextClassification, 'content' | 'crisisCategory' | 'subject' | 'tense' | 'mode' | 'intent' | 'interpretability'>),
      latencyMs: performance.now() - t0,
    }
  }

  async close(): Promise<void> {
    await this.session.release()
  }
}

export class InputInvalidError extends Error {}

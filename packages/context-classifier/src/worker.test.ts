import { describe, expect, it } from 'vitest'
import { CLASSIFIER_TIMEOUT_MS, ClassifierWorker } from './worker.ts'

describe('워커 설정(모델 없이)', () => {
  it('시간 초과 기본값 = 200ms(R5 사용자 확정 2026-11-25), 비정상 값은 거절', () => {
    expect(CLASSIFIER_TIMEOUT_MS).toBe(200)
    expect(() => new ClassifierWorker({ modelDir: '.', modelVersion: 'v' })).not.toThrow()
    expect(() => new ClassifierWorker({ modelDir: '.', modelVersion: 'v', timeoutMs: 0 })).toThrow()
  })
  it('빈 턴은 스레드를 띄우지 않고 input_invalid, 닫힌 뒤에는 error', async () => {
    const w = new ClassifierWorker({ modelDir: '.', modelVersion: 'v' })
    expect(await w.classify({ sessionId: 's', turnId: 't', inputRevision: 0, context: [], text: ' ' })).toEqual({ ok: false, reason: 'input_invalid' })
    await w.close()
    expect(await w.classify({ sessionId: 's', turnId: 't', inputRevision: 0, context: [], text: '안녕' })).toEqual({ ok: false, reason: 'error' })
  })
})

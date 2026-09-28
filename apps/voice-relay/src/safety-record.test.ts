import { describe, expect, it, vi } from 'vitest'
import { recordWithRetry, storeSafetyEvent, type SafetyEventRow, type SafetyEventTable } from './safety-record'

const ROW: SafetyEventRow = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', profile_id: 'p', session_id: 's', user_id: 'u',
  level: 'crisis', categories: ['self_harm'], matched_terms: ['죽고싶'], excerpt: '요즘은 그냥 죽고 싶어요', caregiver_alert: '안내',
}

function table(insertError: { code?: string } | null, fillError: { code?: string } | null = null) {
  return {
    insert: vi.fn(async () => ({ error: insertError })),
    fillEmptyEvidence: vi.fn(async () => ({ error: fillError })),
  } satisfies SafetyEventTable
}

describe('storeSafetyEvent', () => {
  it('inserts the row under the relay-made id', async () => {
    const t = table(null)
    await storeSafetyEvent(t, ROW)
    expect(t.insert).toHaveBeenCalledExactlyOnceWith(ROW)
    expect(t.fillEmptyEvidence).not.toHaveBeenCalled()
  })

  it('treats a duplicate id as "already there" and only fills empty evidence (lost response or app fallback first)', async () => {
    const t = table({ code: '23505' })
    await storeSafetyEvent(t, ROW)
    expect(t.fillEmptyEvidence).toHaveBeenCalledExactlyOnceWith(ROW.id, ROW.excerpt, ROW.matched_terms)
  })

  it('fails without leaking raw speech on any other insert error or a failed fill', async () => {
    await expect(storeSafetyEvent(table({ code: '42501' }), ROW)).rejects.toThrow('SAFETY_RECORD_FAILED')
    await expect(storeSafetyEvent(table({ code: '23505' }, { code: '42501' }), ROW)).rejects.toThrow('SAFETY_EVIDENCE_FILL_FAILED')
    await storeSafetyEvent(table({}), ROW).catch((e: Error) => expect(e.message).not.toContain('죽고'))
  })
})

describe('recordWithRetry', () => {
  it('stops at the first success', async () => {
    const record = vi.fn(async () => {})
    await expect(recordWithRetry(record, { attempts: 5, baseDelayMs: 1 })).resolves.toBe(true)
    expect(record).toHaveBeenCalledOnce()
  })

  it('retries with doubling delays up to the limit and reports failure without throwing', async () => {
    vi.useFakeTimers()
    try {
      const record = vi.fn(async (): Promise<void> => { throw new Error('down') })
      const done = recordWithRetry(record, { attempts: 4, baseDelayMs: 100 })
      await vi.advanceTimersByTimeAsync(0); expect(record).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(99); expect(record).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1); expect(record).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(200); expect(record).toHaveBeenCalledTimes(3)
      await vi.advanceTimersByTimeAsync(400); expect(record).toHaveBeenCalledTimes(4)
      await expect(done).resolves.toBe(false)
    } finally { vi.useRealTimers() }
  })
})

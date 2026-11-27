import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_DELETION_TITLE, AI_REPORT_TITLE_PREFIX } from '@giokon/core'
import { reportAiResponse, requestAccountDeletion } from './supportRequests'

// supabase-js 체인을 흉내 낸다 — 마지막 abortSignal() 이 결과를 돌려준다.
const calls = vi.hoisted(() => ({ select: [] as unknown[], insert: [] as unknown[], filters: [] as unknown[] }))
const results = vi.hoisted(() => ({ select: { data: [] as unknown, error: null as unknown }, insert: { data: null as unknown, error: null as unknown } }))

vi.mock('./client', () => ({
  getGiokonClient: () => ({
    from: (table: string) => {
      expect(table).toBe('inquiries')
      const chain: Record<string, unknown> = {}
      let mode: 'select' | 'insert' = 'select'
      chain.select = (cols: string) => { calls.select.push(cols); return chain }
      chain.insert = (row: unknown) => { mode = 'insert'; calls.insert.push(row); return chain }
      chain.eq = (col: string, val: unknown) => { calls.filters.push([col, val]); return chain }
      chain.order = () => chain
      chain.limit = () => chain
      chain.single = () => chain
      chain.abortSignal = () => chain
      chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(results[mode]).then(ok, bad)
      return chain
    },
  }),
}))

afterEach(() => {
  calls.select.length = 0; calls.insert.length = 0; calls.filters.length = 0
  results.select = { data: [], error: null }
  results.insert = { data: null, error: null }
})

const INPUT = { email: 'a@example.com', role: '요양보호사', orgName: null, source: 'app' as const }

describe('계정 삭제 요청', () => {
  it('대기 중인 요청이 없으면 본인 명의 비공개 문의로 접수한다', async () => {
    results.insert = { data: { id: 'q1', created_at: '2026-11-27T00:00:00Z' }, error: null }
    const r = await requestAccountDeletion('u1', INPUT)
    expect(r).toEqual({ status: 'created', inquiryId: 'q1', requestedAt: '2026-11-27T00:00:00Z' })
    expect(calls.insert[0]).toMatchObject({ author_id: 'u1', title: ACCOUNT_DELETION_TITLE, visibility: 'private' })
    // 중복 확인은 본인·같은 제목·처리 대기만 본다.
    expect(calls.filters).toEqual([['author_id', 'u1'], ['title', ACCOUNT_DELETION_TITLE], ['status', 'waiting']])
  })
  it('이미 대기 중이면 새로 만들지 않는다', async () => {
    results.select = { data: [{ id: 'q0', created_at: '2026-11-20T00:00:00Z' }], error: null }
    const r = await requestAccountDeletion('u1', INPUT)
    expect(r).toEqual({ status: 'existing', inquiryId: 'q0', requestedAt: '2026-11-20T00:00:00Z' })
    expect(calls.insert).toHaveLength(0)
  })
  it('서버 오류 원문을 숨긴다', async () => {
    results.insert = { data: null, error: { message: 'new row violates row-level security policy' } }
    await expect(requestAccountDeletion('u1', INPUT)).rejects.toThrow('삭제 요청을 보내지 못했어요.')
    results.select = { data: null, error: { message: 'permission denied' } }
    await expect(requestAccountDeletion('u1', INPUT)).rejects.toThrow('접수 상태를 확인하지 못했어요.')
  })
})

describe('AI 응답 신고', () => {
  it('본인 명의 비공개 문의로 넣는다', async () => {
    results.insert = { data: { id: 'q2' }, error: null }
    await expect(reportAiResponse('u1', { reason: 'harmful', aiText: '나쁜 말', sessionId: 's1', source: 'app' })).resolves.toEqual({ inquiryId: 'q2' })
    const row = calls.insert[0] as { author_id: string; title: string; visibility: string; content: string }
    expect(row.author_id).toBe('u1')
    expect(row.visibility).toBe('private')
    expect(row.title.startsWith(AI_REPORT_TITLE_PREFIX)).toBe(true)
    expect(row.content).toContain('나쁜 말')
  })
  it('실패하면 한국어 안내만 보인다', async () => {
    results.insert = { data: null, error: { message: 'violates check constraint' } }
    await expect(reportAiResponse('u1', { reason: 'other', aiText: '가', sessionId: null, source: 'app' })).rejects.toThrow('신고를 보내지 못했어요.')
  })
})

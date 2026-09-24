import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { useGiokonRealtime } from './realtime'

const runtime = vi.hoisted(() => ({
  listeners: new Map<string, (payload: Record<string, unknown>) => void>(),
  cleanup: undefined as undefined | (() => void),
  status: undefined as undefined | ((value: string) => void),
  qc: undefined as unknown,
  remove: vi.fn(),
}))

vi.mock('react', () => ({
  useState: () => [false, vi.fn()],
  useEffect: (effect: () => (() => void) | undefined) => { runtime.cleanup = effect() },
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQueryClient: () => runtime.qc,
}))
vi.mock('../client', () => ({
  getGiokonClient: () => ({
    channel: () => {
      const channel = {
        on: (_type: string, filter: { table: string }, callback: (p: Record<string, unknown>) => void) => {
          runtime.listeners.set(filter.table, callback)
          return channel
        },
        subscribe: (callback: (status: string) => void) => { runtime.status = callback },
      }
      return channel
    },
    removeChannel: runtime.remove,
  }),
}))

describe('Realtime → 실제 Query 캐시 무효화', () => {
  let qc: QueryClient
  beforeEach(() => {
    runtime.listeners.clear()
    runtime.remove.mockClear()
    qc = new QueryClient()
    runtime.qc = qc
  })

  it.each([
    ['consents', ['consents', 'elder-a']],
    ['program_journals', ['program_journals', 'org']],
    ['elder_codes', ['elder_codes', 'elder-a']],
    ['inquiries', ['inquiries', 'detail', 'inquiry-a']],
    ['profile_caregivers', ['profiles']],
    ['profile_guardians', ['guardian_shares', 'mine']],
  ])('%s 변경을 구독하고 영향받는 캐시를 stale로 만든다', (table, key) => {
    qc.setQueryData(key, { before: true })
    useGiokonRealtime()
    const listener = runtime.listeners.get(table as string)
    expect(listener).toBeDefined()
    listener!({ eventType: 'UPDATE', new: { id: 'row-a', profile_id: 'elder-a' }, old: {} })
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('DELETE의 빈 new 대신 old를 전달하고 PK만 있어도 동의 캐시를 무효화한다', () => {
    qc.setQueryData(['consents', 'elder-a'], [])
    qc.setQueryData(['consents', 'mine'], [])
    const onEvent = vi.fn()
    useGiokonRealtime({ onEvent })
    runtime.listeners.get('consents')!({ eventType: 'DELETE', new: {}, old: { id: 'consent-a' } })
    expect(onEvent).toHaveBeenCalledWith({ table: 'consents', eventType: 'DELETE', row: { id: 'consent-a' } })
    expect(qc.getQueryState(['consents', 'elder-a'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['consents', 'mine'])?.isInvalidated).toBe(true)
  })

  it('연결 복구 때 누락된 변경을 재조회하고 언마운트 때 채널을 제거한다', () => {
    qc.setQueryData(['profiles'], [])
    useGiokonRealtime()
    runtime.status!('SUBSCRIBED')
    expect(qc.getQueryState(['profiles'])?.isInvalidated).toBe(true)
    runtime.cleanup!()
    expect(runtime.remove).toHaveBeenCalledTimes(1)
  })

  it('미인증 상태에서는 구독하지 않는다', () => {
    useGiokonRealtime({ enabled: false })
    expect(runtime.listeners.size).toBe(0)
  })

  it.each([
    ['consents', ['consents', 'elder-a']],
    ['profile_caregivers', ['profiles']],
  ])('%s 이벤트가 열린 화면의 데이터를 실제로 재조회한다', async (table, queryKey) => {
    let serverValue = 'before'
    const observer = new QueryObserver(qc, {
      queryKey,
      queryFn: async () => serverValue,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await vi.waitFor(() => expect(qc.getQueryData(queryKey)).toBe('before'))
      useGiokonRealtime()
      serverValue = 'after'
      runtime.listeners.get(table as string)!({ eventType: 'UPDATE', new: { id: 'row-a' }, old: {} })
      await vi.waitFor(() => expect(qc.getQueryData(queryKey)).toBe('after'))
    } finally {
      unsubscribe()
      qc.clear()
    }
  })
})

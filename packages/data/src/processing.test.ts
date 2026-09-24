import { afterEach, describe, expect, it, vi } from 'vitest'
import { canProcessProfile, canProcessSession, getSessionControl } from './processing'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ getGiokonClient: () => ({ rpc }) }))
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('server processing permission', () => {
  it.each([
    [canProcessProfile, 'can_process_profile', 'p_profile_id'],
    [canProcessSession, 'can_process_session', 'p_session_id'],
  ] as const)('uses the scoped server predicate %s', async (check, name, arg) => {
    const abortSignal = vi.fn(async (signal: AbortSignal) => ({ data: !signal.aborted, error: null }))
    rpc.mockReturnValue({ abortSignal })
    expect(await check('synthetic-id')).toBe(true)
    expect(rpc).toHaveBeenCalledWith(name, { [arg]: 'synthetic-id' })
    expect(abortSignal.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal)
  })
  it.each([false, null, undefined, 'true'])('does not infer permission from %s', async data => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data, error: null }) })
    expect(await canProcessSession('synthetic-id')).toBe(false)
  })
  it('does not expose server error details or treat an error as permission', async () => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data: true, error: { message: 'server details' } }) })
    await expect(canProcessSession('synthetic-id')).rejects.toThrow('대화를 계속할 수 있는지 확인하지 못했어요.')
  })
  it('aborts a pending permission request after five seconds', async () => {
    vi.useFakeTimers()
    rpc.mockReturnValue({ abortSignal: (signal: AbortSignal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'aborted' } }))
    }) })
    const result = expect(canProcessSession('synthetic-id')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(5000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('remote session control state', () => {
  const tick = (data: unknown, error: unknown = null) => rpc.mockReturnValue({ abortSignal: async () => ({ data, error }) })
  it('reads the same server tick the relay uses', async () => {
    tick({ allowed: true, paused: false, end_requested: false })
    expect(await getSessionControl('synthetic-id')).toBe('running')
    expect(rpc).toHaveBeenCalledWith('session_tick', { p_session_id: 'synthetic-id' })
  })
  it.each([
    [{ allowed: true, paused: true, end_requested: false }, 'paused'],
    [{ allowed: true, paused: true, end_requested: true }, 'ended'],
    [{ allowed: true, paused: false, end_requested: true }, 'ended'],
    [{ allowed: false }, 'denied'],
    [{ allowed: 'true', paused: false }, 'denied'],
  ] as const)('maps %o to %s', async (data, expected) => {
    tick(data)
    expect(await getSessionControl('synthetic-id')).toBe(expected)
  })
  it.each([[null, null], ['yes', null], [{ allowed: true }, { message: 'server details' }]])('does not guess a state from %o', async (data, error) => {
    tick(data, error)
    await expect(getSessionControl('synthetic-id')).rejects.toThrow('대화 진행 상태를 확인하지 못했어요.')
  })
})

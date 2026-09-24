import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerPushToken, revokePushToken } from './pushTokens'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ getGiokonClient: () => ({ rpc }) }))
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('push token RPCs (pilot D7)', () => {
  it('registers through the definer RPC, never a direct table write', async () => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: null }) })
    await registerPushToken('ExponentPushToken[synthetic]', 'android')
    expect(rpc).toHaveBeenCalledWith('register_push_token', { p_token: 'ExponentPushToken[synthetic]', p_platform: 'android' })
  })
  it('revokes through the owner-scoped RPC', async () => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: null }) })
    await revokePushToken('ExponentPushToken[synthetic]')
    expect(rpc).toHaveBeenCalledWith('revoke_push_token', { p_token: 'ExponentPushToken[synthetic]' })
  })
  it.each([
    [() => registerPushToken('ExponentPushToken[synthetic]', 'ios'), '알림 등록을 완료하지 못했어요.'],
    [() => revokePushToken('ExponentPushToken[synthetic]'), '알림 해제를 완료하지 못했어요.'],
  ])('hides server error details', async (call, message) => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: { message: 'PUSH_TOKEN_ROLE server details' } }) })
    await expect(call()).rejects.toThrow(message)
  })
  it('aborts after five seconds', async () => {
    vi.useFakeTimers()
    rpc.mockReturnValue({ abortSignal: (signal: AbortSignal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'aborted' } }))
    }) })
    const result = expect(revokePushToken('ExponentPushToken[synthetic]')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(5000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})

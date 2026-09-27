import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  ANDROID_CHANNEL, buildMessages, CLAIM_LIMIT, createDispatchHandler, dispatch, EXPO_BATCH, SAFETY_PUSH, sendToExpo,
  WorkerAuthError, type ClaimedPush, type DispatchDeps, type ExpoMessage, type ExpoTicket,
} from '../../../supabase/functions/push-dispatch/dispatcher'

const push = (id: string, tokens: string[]): ClaimedPush => ({ notification_id: id, user_id: `u-${id}`, tokens })
const ok = (n: number): ExpoTicket[] => Array.from({ length: n }, (_, i) => ({ status: 'ok', id: `t${i}` }))

function deps(over: Partial<DispatchDeps> = {}) {
  const d = {
    claim: vi.fn(async () => [push('n1', ['ExponentPushToken[a]', 'ExponentPushToken[b]'])]),
    send: vi.fn(async (m: ExpoMessage[]) => ok(m.length)),
    revoke: vi.fn(async () => {}),
    ...over,
  }
  return d as typeof d & DispatchDeps
}
const post = (secret?: string) => new Request('https://synthetic.invalid', { method: 'POST', headers: secret ? { 'x-worker-secret': secret } : {}, body: '{}' })

describe('push-dispatch — 메시지', () => {
  it('sends a fixed lock-screen text with only the notification id (no elder name, speech or crisis type)', () => {
    const messages = buildMessages([push('n1', ['ExponentPushToken[a]'])])
    expect(messages).toEqual([{
      to: 'ExponentPushToken[a]', title: SAFETY_PUSH.title, body: SAFETY_PUSH.body,
      sound: 'default', priority: 'high', channelId: ANDROID_CHANNEL,
      data: { type: 'safety', notificationId: 'n1' },
    }])
    const text = JSON.stringify(messages)
    expect(text).not.toMatch(/죽|자살|학대|119|109|1577|어르신 [가-힣]{2,3}님/)
    expect(Object.keys(messages[0].data)).toEqual(['type', 'notificationId'])
  })

  it('fans out one message per active token and skips recipients without tokens', () => {
    const messages = buildMessages([push('n1', ['ExponentPushToken[a]', 'ExponentPushToken[b]']), push('n2', [])])
    expect(messages.map(m => m.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]'])
  })
})

describe('push-dispatch — 발송', () => {
  it('batches by 100 and counts results per message', async () => {
    const tokens = Array.from({ length: EXPO_BATCH + 5 }, (_, i) => `ExponentPushToken[${i}]`)
    const d = deps()
    const result = await dispatch([push('n1', tokens)], 's', d)
    expect(d.send).toHaveBeenCalledTimes(2)
    expect(vi.mocked(d.send).mock.calls[0][0]).toHaveLength(EXPO_BATCH)
    expect(vi.mocked(d.send).mock.calls[1][0]).toHaveLength(5)
    expect(result).toEqual({ messages: EXPO_BATCH + 5, sent: EXPO_BATCH + 5, failed: 0, revoked: 0 })
  })

  it('revokes only tokens Expo reports as DeviceNotRegistered', async () => {
    const d = deps({ send: vi.fn(async () => [
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } },
    ] as ExpoTicket[]) })
    const result = await dispatch([push('n1', ['ExponentPushToken[a]', 'ExponentPushToken[b]'])], 's', d)
    expect(d.revoke).toHaveBeenCalledExactlyOnceWith('s', ['ExponentPushToken[a]'])
    expect(result).toEqual({ messages: 2, sent: 0, failed: 2, revoked: 1 })
  })

  it('a failed batch does not stop the next one and never throws', async () => {
    const tokens = Array.from({ length: EXPO_BATCH + 1 }, (_, i) => `ExponentPushToken[${i}]`)
    let call = 0
    const d = deps({ send: vi.fn(async (m: ExpoMessage[]) => { if (call++ === 0) throw new Error('network'); return ok(m.length) }),
      revoke: vi.fn(async () => { throw new Error('db') }) })
    await expect(dispatch([push('n1', tokens)], 's', d)).resolves.toEqual({ messages: EXPO_BATCH + 1, sent: 1, failed: EXPO_BATCH, revoked: 0 })
  })

  it('sendToExpo posts JSON to the Expo API, adds the access token only when set, and rejects malformed replies', async () => {
    const messages = buildMessages([push('n1', ['ExponentPushToken[a]'])])
    const fetcher = vi.fn(async () => Response.json({ data: ok(1) }))
    await expect(sendToExpo(messages, fetcher as unknown as typeof fetch)).resolves.toEqual(ok(1))
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    expect(JSON.parse(init.body as string)).toEqual(messages)
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    await sendToExpo(messages, fetcher as unknown as typeof fetch, 'expo-token')
    expect(((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer expo-token')
    await expect(sendToExpo(messages, vi.fn(async () => Response.json({ data: [] })) as unknown as typeof fetch)).rejects.toThrow('EXPO_PUSH_RESPONSE')
    await expect(sendToExpo(messages, vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch)).rejects.toThrow('EXPO_PUSH_FAILED')
  })
})

describe('push-dispatch — HTTP', () => {
  it('rejects a missing or wrong worker secret without claiming anything', async () => {
    const d = deps()
    expect((await createDispatchHandler(d)(post())).status).toBe(401)
    expect(d.claim).not.toHaveBeenCalled()
    const wrong = deps({ claim: vi.fn(async () => { throw new WorkerAuthError() }) })
    expect((await createDispatchHandler(wrong)(post('bad'))).status).toBe(401)
    expect(wrong.send).not.toHaveBeenCalled()
    expect((await createDispatchHandler(deps({ claim: vi.fn(async () => { throw new Error('x') }) }))(post('s'))).status).toBe(503)
  })

  it('answers 202 after claiming and keeps sending in the background', async () => {
    let background: Promise<unknown> | undefined
    const d = deps({ waitUntil: p => { background = p } })
    const res = await createDispatchHandler(d)(post('s'))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ claimed: 1 })
    expect(d.claim).toHaveBeenCalledExactlyOnceWith('s', CLAIM_LIMIT)
    await background
    expect(d.send).toHaveBeenCalledOnce()
  })
})

describe('push-dispatch deployed entrypoint', () => {
  function load(rpcError: { message: string } | null = null, expoToken = '') {
    let captured!: DispatchDeps
    const rpc = vi.fn(async () => ({ data: [push('n1', ['ExponentPushToken[a]'])], error: rpcError }))
    const createClient = vi.fn((..._args: unknown[]) => ({ rpc }))
    const sendToExpoMock = vi.fn(async (m: ExpoMessage[], _fetcher?: unknown, _token?: string) => ok(m.length))
    const source = readFileSync(new URL('../../../supabase/functions/push-dispatch/index.ts', import.meta.url), 'utf8')
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports: {}, fetch: vi.fn(), AbortSignal, globalThis: {},
      Deno: { serve: vi.fn(), env: { get: (name: string) => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service', EXPO_ACCESS_TOKEN: expoToken })[name] } },
      require: (name: string) => name.includes('supabase-js') ? { createClient }
        : { WorkerAuthError, sendToExpo: sendToExpoMock, createDispatchHandler: (d: DispatchDeps) => { captured = d; return () => {} } },
    })
    return { deps: captured, rpc, createClient, sendToExpoMock }
  }

  it('uses the service role key, passes the secret to the DB, and maps a secret rejection', async () => {
    const { deps: d, rpc, createClient } = load()
    expect(createClient.mock.calls[0][1]).toBe('service')
    await d.claim('s', 50)
    expect(rpc).toHaveBeenCalledWith('claim_push_notifications', { p_secret: 's', p_limit: 50 })
    await d.revoke('s', ['ExponentPushToken[a]'])
    expect(rpc).toHaveBeenCalledWith('revoke_dead_push_tokens', { p_secret: 's', p_tokens: ['ExponentPushToken[a]'] })
    await expect(load({ message: 'WORKER_UNAUTHORIZED' }).deps.claim('bad', 50)).rejects.toBeInstanceOf(WorkerAuthError)
  })

  it('passes the optional Expo access token only when configured', async () => {
    const without = load(null, '')
    await without.deps.send([])
    expect(without.sendToExpoMock.mock.calls[0][2]).toBeUndefined()
    const withToken = load(null, 'expo-secret')
    await withToken.deps.send([])
    expect(withToken.sendToExpoMock.mock.calls[0][2]).toBe('expo-secret')
  })
})

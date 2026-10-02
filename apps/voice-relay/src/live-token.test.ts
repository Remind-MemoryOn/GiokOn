import { describe, expect, it, vi } from 'vitest'
import { RELAY_SECRET_HEADER, requestLiveToken } from './live-token'

const request = {
  supabaseUrl: 'https://synthetic.supabase.co', publishableKey: 'synthetic-publishable',
  relaySecret: 'synthetic-relay-secret-0123456789abcdef', accessToken: 'synthetic.jwt', sessionId: '11111111-2222-4333-8444-555555555555',
}

describe('requestLiveToken (T23.5)', () => {
  it('sends the relay credential together with the staff JWT and only session_id in the body', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ token: 'auth_tokens/t', model: 'gemini-3.8-live' }), { status: 200 }))
    await expect(requestLiveToken(fetcher, request)).resolves.toEqual({ token: 'auth_tokens/t', model: 'gemini-3.8-live' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://synthetic.supabase.co/functions/v1/live-token')
    const headers = init.headers as Record<string, string>
    expect(headers[RELAY_SECRET_HEADER]).toBe(request.relaySecret)
    expect(headers.Authorization).toBe('Bearer synthetic.jwt')
    expect(JSON.parse(String(init.body))).toEqual({ session_id: request.sessionId })
  })

  it('fails without exposing the secret when live-token refuses or answers malformed', async () => {
    for (const response of [new Response('{}', { status: 403 }), new Response(JSON.stringify({ token: 1 }), { status: 200 })]) {
      const error = await requestLiveToken(vi.fn(async () => response), request).catch((e: Error) => e)
      expect(error).toBeInstanceOf(Error)
      expect(String(error)).not.toContain(request.relaySecret)
    }
  })
})

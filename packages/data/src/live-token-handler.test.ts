import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_TOKENS_URL, createLiveTokenHandler, MIN_RELAY_SECRET_LENGTH, RELAY_SECRET_HEADER, secretMatches, type LiveTokenDeps,
} from '../../../supabase/functions/live-token/handler'

const SECRET = 'synthetic-relay-secret-0123456789abcdef'
const SESSION = '11111111-2222-4333-8444-555555555555'
const JWT = 'Bearer synthetic.jwt.token'

function deps(over: Partial<LiveTokenDeps> = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'auth_tokens/synthetic' }), { status: 200 }))
  const d = {
    apiKey: 'synthetic-gemini-key',
    relaySecret: SECRET,
    model: 'gemini-3.8-live',
    verifyUser: vi.fn(async () => true),
    reserve: vi.fn(async () => ({ data: true as unknown, error: null })),
    fetch: fetchMock as unknown as typeof fetch,
    now: () => Date.UTC(2026, 9, 2),
    ...over,
  }
  return Object.assign(d as typeof d & LiveTokenDeps, { fetchMock })
}
function post(headers: Record<string, string>, body: unknown = { session_id: SESSION }) {
  return new Request('https://synthetic.invalid/functions/v1/live-token', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
}
const relayHeaders = (secret = SECRET) => ({ Authorization: JWT, [RELAY_SECRET_HEADER]: secret })

describe('live-token — 중계 전용 발급(T23.5)', () => {
  it('rejects a staff JWT without the relay credential with 403, before checking the user or consuming quota', async () => {
    const d = deps()
    const res = await createLiveTokenHandler(d)(post({ Authorization: JWT }))
    expect(res.status).toBe(403)
    expect(await res.json()).not.toHaveProperty('token')
    expect(d.verifyUser).not.toHaveBeenCalled()
    expect(d.reserve).not.toHaveBeenCalled()
    expect(d.fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a wrong relay credential (including a prefix of the real one) with 403', async () => {
    for (const wrong of ['x'.repeat(SECRET.length), SECRET.slice(0, -1), `${SECRET}x`, '']) {
      const d = deps()
      const res = await createLiveTokenHandler(d)(post(relayHeaders(wrong)))
      expect(res.status).toBe(403)
      expect(d.reserve).not.toHaveBeenCalled()
      expect(d.fetchMock).not.toHaveBeenCalled()
    }
  })

  it('issues a token on the relay path (relay credential + staff JWT)', async () => {
    const d = deps()
    const res = await createLiveTokenHandler(d)(post(relayHeaders()))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ token: 'auth_tokens/synthetic', model: 'gemini-3.8-live' })
    expect(d.verifyUser).toHaveBeenCalledWith(JWT)
    expect(d.reserve).toHaveBeenCalledWith(JWT, SESSION)
    const [url, init] = d.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(AUTH_TOKENS_URL)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('synthetic-gemini-key')
    const sent = JSON.parse(String(init.body))
    expect(sent.uses).toBe(1)
    // REST 필드명(bidiGenerateContentSetup). SDK 이름(liveConnectConstraints)은 Google 이 400 으로 거절한다.
    expect(sent.liveConnectConstraints).toBeUndefined()
    expect(sent.bidiGenerateContentSetup).toEqual({ model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'] }, sessionResumption: {} })
    // 잠금은 이 필드들만 — 빠지면 '전부 잠금'이 되어 중계의 systemInstruction·전사 설정이 무시될 수 있다.
    expect(sent.fieldMask).toBe('model,generationConfig.responseModalities,sessionResumption')
  })

  it('still requires the staff JWT on the relay path (credential is added to, not instead of, the user check)', async () => {
    const noAuth = deps()
    expect((await createLiveTokenHandler(noAuth)(post({ [RELAY_SECRET_HEADER]: SECRET }))).status).toBe(401)
    const badUser = deps({ verifyUser: vi.fn(async () => false) })
    expect((await createLiveTokenHandler(badUser)(post(relayHeaders()))).status).toBe(401)
    expect(noAuth.reserve).not.toHaveBeenCalled()
    expect(badUser.reserve).not.toHaveBeenCalled()
  })

  it('fails closed when the relay secret is not configured or too short — even a matching header gets no token', async () => {
    for (const relaySecret of ['', 'short', 'x'.repeat(MIN_RELAY_SECRET_LENGTH - 1)]) {
      const d = deps({ relaySecret })
      const res = await createLiveTokenHandler(d)(post(relayHeaders(relaySecret)))
      expect(res.status).toBe(500)
      expect(d.verifyUser).not.toHaveBeenCalled()
      expect(d.fetchMock).not.toHaveBeenCalled()
    }
  })

  it('keeps the DB gate mapping on the relay path (403 consent/role · 429 limit · 503 unknown)', async () => {
    const cases: [{ code?: string; message?: string }, number][] = [
      [{ code: '42501', message: 'denied' }, 403],
      [{ code: 'P0001', message: 'LIVE_TOKEN_LIMIT' }, 429],
      [{ code: 'XX000', message: 'boom' }, 503],
    ]
    for (const [error, status] of cases) {
      const d = deps({ reserve: vi.fn(async () => ({ data: null, error })) })
      expect((await createLiveTokenHandler(d)(post(relayHeaders()))).status).toBe(status)
      expect(d.fetchMock).not.toHaveBeenCalled()
    }
  })

  it('keeps input validation: only session_id, a UUID', async () => {
    const d = deps()
    const handler = createLiveTokenHandler(d)
    expect((await handler(post(relayHeaders(), { session_id: SESSION, user_id: 'x' }))).status).toBe(400)
    expect((await handler(post(relayHeaders(), { session_id: 'not-a-uuid' }))).status).toBe(400)
    expect(d.reserve).not.toHaveBeenCalled()
  })
})

describe('secretMatches', () => {
  it('matches only the identical value', async () => {
    expect(await secretMatches(SECRET, SECRET)).toBe(true)
    expect(await secretMatches(SECRET.toUpperCase(), SECRET)).toBe(false)
    expect(await secretMatches('', SECRET)).toBe(false)
  })
})

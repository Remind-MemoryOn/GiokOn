import { readFileSync } from 'node:fs'
import { webcrypto, createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const base = 'https://synthetic.invalid/functions/v1/naver-auth'
const verifier = 'v'.repeat(64)
const challenge = createHash('sha256').update(verifier).digest('base64url')

function edge() {
  let now = Date.now()
  let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
  const rows = new Map<string, { challenge: string; code: string; state: string; consumed: boolean; expires: number }>()
  const rpc = vi.fn(async (name: string, args: Record<string, string>): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (name === 'store_naver_mobile_handoff') {
      if (rows.has(args.p_id)) return { data: false, error: null }
      rows.set(args.p_id, { challenge: args.p_challenge, code: args.p_code, state: args.p_state,
        consumed: false, expires: Date.parse(args.p_expires_at) })
      return { data: true, error: null }
    }
    const row = rows.get(args.p_id)
    if (!row || row.consumed || row.challenge !== args.p_challenge || row.expires <= now) return { data: null, error: null }
    row.consumed = true
    return { data: { code: row.code, state: row.state }, error: null }
  })
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/oauth2.0/token')) return Response.json({ access_token: 'synthetic-naver' })
    if (url.includes('/nid/me')) return Response.json({ response: { id: 'synthetic', email: 'synthetic@example.invalid' } })
    if (url.includes('/auth/v1/verify')) return new Response(null, { status: 302, headers: {
      location: 'https://synthetic.invalid/#access_token=synthetic-access&refresh_token=synthetic-refresh',
    } })
    throw new Error('Unexpected synthetic request')
  })
  const source = readFileSync(new URL('../../../supabase/functions/naver-auth/index.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, Request, Response, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
    btoa, atob, crypto: webcrypto, Date: class extends Date { static now() { return now } }, fetch: fetchMock,
    Deno: { env: { get: (key: string) => ({ NAVER_CLIENT_ID: 'synthetic-id', NAVER_CLIENT_SECRET: 'synthetic-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', SUPABASE_URL: 'https://synthetic.invalid', SITE_URL: 'https://web.invalid' })[key] } },
    require: (id: string) => id.includes('@supabase/supabase-js') ? { createClient: () => ({ rpc, auth: { admin: {
      createUser: async () => ({ error: null }),
      generateLink: async () => ({ data: { properties: { hashed_token: 'synthetic-hash' } }, error: null }),
    } } }) } : { serve: (fn: typeof handler) => { handler = fn } },
  })
  const invoke = (req: Request) => handler(req)
  const authorize = async (mobile = true) => {
    const url = new URL(base + '/authorize')
    url.search = new URLSearchParams(mobile ? { mode: 'mobile', redirect_to: 'giokon://auth/callback', challenge, app_state: challenge }
      : { redirect_to: 'https://web.invalid/auth/callback' }).toString()
    const response = await invoke(new Request(url))
    const state = new URL(response.headers.get('Location')!).searchParams.get('state')!
    const cookie = response.headers.get('Set-Cookie')!.split(';')[0]
    return { state, cookie, response }
  }
  const callback = (state: string, cookie: string) => invoke(new Request(base + '/callback?' +
    new URLSearchParams({ state, code: 'synthetic-code' }), { headers: { Cookie: cookie } }))
  const redeem = (id: string, proof = verifier) => invoke(new Request(base, { method: 'POST',
    body: JSON.stringify({ transaction_id: id, code_verifier: proof }) }))
  return { invoke, authorize, callback, redeem, fetchMock, rpc, advance: () => { now += 600001 } }
}

describe('Naver mobile server handoff', () => {
  it('게이트웨이 내부 URL 대신 공개 HTTPS 콜백을 사용한다', async () => {
    const api = edge()
    const internal = new URL('http://internal.invalid/naver-auth/authorize')
    internal.search = new URLSearchParams({ mode: 'mobile', redirect_to: 'giokon://auth/callback', challenge, app_state: challenge }).toString()
    const result = await api.invoke(new Request(internal))
    expect(new URL(result.headers.get('Location')!).searchParams.get('redirect_uri')).toBe(base + '/callback')
  })
  it('HTTPS 콜백은 인가 코드를 보관하고 딥링크에 일회성 ID만 전달한다', async () => {
    const api = edge()
    const { state, cookie } = await api.authorize()
    const response = await api.callback(state, cookie)
    expect(response.status).toBe(302)
    const back = response.headers.get('Location')!
    expect(back).not.toContain('synthetic-code')
    expect(back).not.toContain('access_token')
    expect(api.fetchMock).not.toHaveBeenCalled()
    const params = new URLSearchParams(new URL(back).hash.slice(1))
    expect(params.get('state')).toBe(challenge)
    const id = params.get('transaction_id')!
    expect((await api.redeem(id, 'x'.repeat(64))).status).toBe(400)
    expect(api.fetchMock).not.toHaveBeenCalled()
    const result = await api.redeem(id)
    expect(result.status).toBe(200)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(await result.json()).toMatchObject({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' })
    const tokenCall = api.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URLSearchParams(tokenCall[1].body as string).get('state')).toBe(state)
    expect((await api.redeem(id)).status).toBe(400)
    expect(api.fetchMock).toHaveBeenCalledTimes(3)
    expect((await api.callback(state, cookie)).headers.get('Location')).toContain('naver_error')
  })

  it('다른 브라우저의 쿠키나 만료된 서명으로는 handoff를 만들지 않는다', async () => {
    const api = edge()
    const { state, cookie } = await api.authorize()
    expect((await api.callback(state, 'giokon_naver_nonce=wrong')).headers.get('Location')).toContain('naver_error')
    api.advance()
    expect((await api.callback(state, cookie)).status).toBe(400)
    expect(api.rpc).not.toHaveBeenCalled()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('이미 생성된 handoff도 만료 후에는 교환하지 않는다', async () => {
    const api = edge()
    const { state, cookie } = await api.authorize()
    const response = await api.callback(state, cookie)
    const id = new URLSearchParams(new URL(response.headers.get('Location')!).hash.slice(1)).get('transaction_id')!
    api.advance()
    expect((await api.redeem(id)).status).toBe(400)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it.each(['broken', 'body.!', 'a.b.c'])('변조된 state %s를 거부한다', async (state) => {
    const api = edge()
    expect((await api.callback(state, '')).status).toBe(400)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('구형 code/state 직접 POST 경로를 닫는다', async () => {
    const api = edge()
    const response = await api.invoke(new Request(base, { method: 'POST', body: JSON.stringify({ code: 'stolen', state: 'untrusted' }) }))
    expect(response.status).toBe(400)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('서명된 state의 payload만 바꾸면 거부한다', async () => {
    const api = edge()
    const { state, cookie } = await api.authorize()
    const [payload, signature] = state.split('.')
    const changed = JSON.parse(Buffer.from(payload, 'base64url').toString())
    changed.challenge = 'x'.repeat(43)
    const tampered = Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + signature
    expect((await api.callback(tampered, cookie)).status).toBe(400)
    expect(api.rpc).not.toHaveBeenCalled()
  })

  it('handoff 저장소 오류와 큰 본문에서 공급자를 호출하지 않는다', async () => {
    const api = edge()
    api.rpc.mockResolvedValueOnce({ data: null, error: { message: 'synthetic DB failure' } })
    expect((await api.redeem('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).status).toBe(503)
    expect((await api.invoke(new Request(base, { method: 'POST', body: ' '.repeat(1025) }))).status).toBe(413)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('웹의 서명/쿠키 검증과 토큰 프래그먼트 반환을 유지한다', async () => {
    const api = edge()
    const { state, cookie } = await api.authorize(false)
    const response = await api.callback(state, cookie)
    expect(response.headers.get('Location')).toContain('https://web.invalid/auth/callback#access_token=')
    expect(api.rpc).not.toHaveBeenCalled()
  })
})

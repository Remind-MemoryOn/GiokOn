import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as liveTokenHandler from '../../../supabase/functions/live-token/handler'

// Edge 함수 소스를 그대로 실행하되 Deno.env/Auth/fetch는 합성 값으로 격리한다.
// 환경 파일이나 실제 공급자 키를 읽지 않는다. 발급 로직(handler.ts)은 실제 모듈을 그대로 연결한다.
const RELAY_SECRET = 'synthetic-relay-secret-0123456789abcdef'
function edge() {
  let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
  const fetchMock = vi.fn(async () => Response.json({ name: 'auth_tokens/synthetic' }))
  const getUser = vi.fn(async () => ({ data: { user: { id: 'synthetic-user' } }, error: null }))
  const rpc = vi.fn(async () => ({ data: true as boolean | null, error: null as { code: string; message: string } | null }))
  const source = readFileSync(new URL('../../../supabase/functions/live-token/index.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, Request, Response, Date, TextDecoder,
    console: { error: vi.fn() }, fetch: fetchMock,
    Deno: { env: { get: (name: string) => ({
      GEMINI_API_KEY: 'synthetic-key', GEMINI_LIVE_MODEL: 'synthetic-model',
      SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon', VOICE_RELAY_SECRET: RELAY_SECRET,
    })[name] } },
    require: (id: string) => id.includes('@supabase/supabase-js')
      ? { createClient: () => ({ auth: { getUser }, rpc }) }
      : id === './handler.ts' ? liveTokenHandler
      : { serve: (fn: typeof handler) => { handler = fn } },
  })
  return { invoke: (req: Request) => handler(req), fetchMock, getUser, rpc }
}

const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const request = (body = JSON.stringify({ session_id: sessionId }), relaySecret: string | null = RELAY_SECRET) => new Request('https://synthetic.invalid/live-token', {
  method: 'POST', headers: { Authorization: 'Bearer synthetic-jwt', ...(relaySecret === null ? {} : { 'x-relay-secret': relaySecret }) }, body,
})

describe('Live 단기 토큰 REST 계약', () => {
  it('v1beta에 모델/오디오 제약을 전송하고 no-store 응답을 반환한다', async () => {
    const api = edge()
    const result = await api.invoke(request())
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ token: 'auth_tokens/synthetic', model: 'synthetic-model' })
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(api.rpc).toHaveBeenCalledWith('reserve_live_token', { p_session_id: sessionId })
    const call = api.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens')
    expect(JSON.parse(call[1].body as string)).toMatchObject({
      uses: 1, liveConnectConstraints: { model: 'models/synthetic-model', config: {
        sessionResumption: {}, responseModalities: ['AUDIO'],
      } },
    })
  })

  it('인증 헤더가 없으면 공급자에 요청하지 않는다', async () => {
    const api = edge()
    expect((await api.invoke(new Request('https://synthetic.invalid', { method: 'POST', headers: { 'x-relay-secret': RELAY_SECRET } }))).status).toBe(401)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  // T23.5 — 배포되는 진입점 그대로: 직원 JWT 만으로는 403, 사용자 확인·한도 계량·공급자 호출 모두 없음.
  it.each([null, '', 'wrong-relay-secret-0123456789abcdef0123'])('중계 자격 %s 로는 발급하지 않는다(403)', async (relaySecret) => {
    const api = edge()
    const result = await api.invoke(request(undefined, relaySecret))
    expect(result.status).toBe(403)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(api.getUser).not.toHaveBeenCalled()
    expect(api.rpc).not.toHaveBeenCalled()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('토큰 응답에 name이 없으면 성공으로 처리하지 않는다', async () => {
    const api = edge()
    api.fetchMock.mockResolvedValueOnce(Response.json({}))
    const result = await api.invoke(request())
    expect(result.status).toBe(502)
  })

  it.each(['{}', 'null', '[]', 'invalid', JSON.stringify({ session_id: 'bad' }),
    JSON.stringify({ session_id: sessionId, user_id: 'spoof' })])('잘못된 입력 %s는 발급하지 않는다', async (body) => {
    const api = edge()
    expect((await api.invoke(request(body))).status).toBe(400)
    expect(api.rpc).not.toHaveBeenCalled()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('큰 본문을 제한한다', async () => {
    const api = edge()
    expect((await api.invoke(request(' '.repeat(1025)))).status).toBe(413)
    expect(api.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['42501', 'LIVE_TOKEN_FORBIDDEN', 403],
    ['42501', 'LIVE_TOKEN_CONSENT_REQUIRED', 403],
    ['P0001', 'LIVE_TOKEN_LIMIT', 429],
    ['42883', 'missing RPC', 503],
  ])('DB 차단 %s %s에서 공급자를 호출하지 않는다', async (code, message, status) => {
    const api = edge()
    api.rpc.mockResolvedValueOnce({ data: null, error: { code: code as string, message: message as string } })
    const result = await api.invoke(request())
    expect(result.status).toBe(status)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('DB 승인 결과가 불명확하면 실패로 닫는다', async () => {
    const api = edge()
    api.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await api.invoke(request())).status).toBe(503)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
})

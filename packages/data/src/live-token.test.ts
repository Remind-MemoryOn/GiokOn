import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Edge 함수 소스를 그대로 실행하되 Deno.env/Auth/fetch는 합성 값으로 격리한다.
// 환경 파일이나 실제 공급자 키를 읽지 않는다.
function edge() {
  let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
  const fetchMock = vi.fn(async () => Response.json({ name: 'auth_tokens/synthetic' }))
  const getUser = vi.fn(async () => ({ data: { user: { id: 'synthetic-user' } }, error: null }))
  const source = readFileSync(new URL('../../../supabase/functions/live-token/index.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, Request, Response, Date,
    console: { error: vi.fn() }, fetch: fetchMock,
    Deno: { env: { get: (name: string) => ({
      GEMINI_API_KEY: 'synthetic-key', GEMINI_LIVE_MODEL: 'synthetic-model',
      SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon',
    })[name] } },
    require: (id: string) => id.includes('@supabase/supabase-js')
      ? { createClient: () => ({ auth: { getUser } }) }
      : { serve: (fn: typeof handler) => { handler = fn } },
  })
  return { invoke: (req: Request) => handler(req), fetchMock, getUser }
}

describe('Live 단기 토큰 REST 계약', () => {
  it('v1beta에 모델/오디오 제약을 전송하고 no-store 응답을 반환한다', async () => {
    const api = edge()
    const result = await api.invoke(new Request('https://synthetic.invalid/live-token', {
      method: 'POST', headers: { Authorization: 'Bearer synthetic-jwt' },
    }))
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ token: 'auth_tokens/synthetic', model: 'synthetic-model' })
    expect(result.headers.get('Cache-Control')).toBe('no-store')
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
    expect((await api.invoke(new Request('https://synthetic.invalid', { method: 'POST' }))).status).toBe(401)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('토큰 응답에 name이 없으면 성공으로 처리하지 않는다', async () => {
    const api = edge()
    api.fetchMock.mockResolvedValueOnce(Response.json({}))
    const result = await api.invoke(new Request('https://synthetic.invalid', {
      method: 'POST', headers: { Authorization: 'Bearer synthetic-jwt' },
    }))
    expect(result.status).toBe(502)
  })
})

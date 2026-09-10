import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

function edge() {
  let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
  const fetchMock = vi.fn(async () => Response.json({ text: 'synthetic transcript' }))
  const getUser = vi.fn(async (): Promise<{ data: { user: { id: string } | null }; error: unknown }> => ({ data: { user: { id: 'synthetic-user' } }, error: null }))
  const permission = vi.fn(async (): Promise<{ data: boolean | null; error: unknown }> => ({ data: true, error: null }))
  const rpc = vi.fn(() => ({ abortSignal: permission }))
  const createClient = vi.fn(() => ({ auth: { getUser }, rpc }))
  const source = readFileSync(new URL('../../../supabase/functions/stt-transcribe/index.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, Request, Response, File, AbortSignal, fetch: fetchMock,
    Deno: { env: { get: (name: string) => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon',
      NCP_CLOVA_CLIENT_ID: 'synthetic-id', NCP_CLOVA_CLIENT_SECRET: 'synthetic-secret' })[name] } },
    require: (id: string) => id.includes('@supabase/supabase-js') ? { createClient } : { serve: (fn: typeof handler) => { handler = fn } },
  })
  return { invoke: (req: Request) => handler(req), fetchMock, getUser, permission, rpc, createClient }
}

const profileId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
function request(headers: Record<string, string> = { Authorization: 'Bearer synthetic-jwt', 'x-profile-id': profileId }) {
  const form = new FormData()
  form.append('audio', new File(['synthetic audio'], 'synthetic.wav', { type: 'audio/wav' }))
  return new Request('https://synthetic.invalid/stt-transcribe', { method: 'POST', headers, body: form })
}

describe('STT target consent boundary', () => {
  it('forwards only after scoped checks and rechecks before returning a transcript', async () => {
    const api = edge()
    const result = await api.invoke(request())
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ text: 'synthetic transcript' })
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(api.rpc).toHaveBeenCalledTimes(3)
    expect(api.rpc).toHaveBeenCalledWith('can_process_profile', { p_profile_id: profileId })
    expect(api.createClient.mock.calls[0]).toEqual(['https://synthetic.invalid', 'synthetic-anon', {
      global: { headers: { Authorization: 'Bearer synthetic-jwt' } }, auth: { persistSession: false, autoRefreshToken: false },
    }])
    expect(api.fetchMock).toHaveBeenCalledOnce()
  })
  it.each<Record<string, string>>([{}, { 'x-profile-id': profileId }])('rejects missing login before reading audio', async headers => {
    const api = edge()
    const req = request(headers)
    expect((await api.invoke(req)).status).toBe(401)
    expect(req.bodyUsed).toBe(false)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
  it('rejects invalid JWT even when the platform gateway accepted the request', async () => {
    const api = edge()
    api.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    expect((await api.invoke(request())).status).toBe(401)
    expect(api.permission).not.toHaveBeenCalled()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
  it.each(['', 'invalid'])('requires a valid target: %s', async target => {
    const api = edge()
    expect((await api.invoke(request({ Authorization: 'Bearer synthetic-jwt', 'x-profile-id': target }))).status).toBe(400)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    [{ data: false, error: null }, 403],
    [{ data: null, error: null }, 403],
    [{ data: true, error: { message: 'internal' } }, 503],
  ] as const)('does not read or forward audio when DB permission is %s', async (permission, status) => {
    const api = edge()
    api.permission.mockResolvedValue(permission)
    const req = request()
    expect((await api.invoke(req)).status).toBe(status)
    expect(req.bodyUsed).toBe(false)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
  it('does not forward an upload whose consent was withdrawn while parsing', async () => {
    const api = edge()
    api.permission.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValue({ data: false, error: null })
    expect((await api.invoke(request())).status).toBe(403)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
  it('discards a late transcript after withdrawal', async () => {
    const api = edge()
    api.permission.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValue({ data: false, error: null })
    const response = await api.invoke(request())
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('synthetic transcript')
  })
  it('fails closed when the permission request times out', async () => {
    const api = edge()
    api.permission.mockRejectedValue(new Error('timeout'))
    expect((await api.invoke(request())).status).toBe(503)
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
  it('does not expose provider error bodies', async () => {
    const api = edge()
    api.fetchMock.mockResolvedValue(new Response('private provider detail', { status: 500 }))
    const response = await api.invoke(request())
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('private provider detail')
  })
})

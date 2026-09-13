import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

function engineApi(relayUrl?: string) {
  const fetchMock = vi.fn(async () => Response.json({ token: 'synthetic-token', model: 'synthetic-model' }))
  const connect = vi.fn(async () => {})
  const close = vi.fn()
  const stopPlayback = vi.fn(async () => {})
  const canProcess = vi.fn(async () => true)
  const send = vi.fn(async () => ({ text: 'synthetic', audioChunksB64: [] }))
  let tick: () => Promise<unknown> | void = () => {};
  const clearInterval = vi.fn()
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console: { info: vi.fn(), warn: vi.fn() }, fetch: fetchMock,
    setInterval: vi.fn((callback: () => void) => { tick = callback; return 1 }), clearInterval,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic', EXPO_PUBLIC_VOICE_RELAY_URL: relayUrl } },
    require: (name: string) => {
      if (name === '@giokon/core') return { buildSystemPrompt: () => 'synthetic prompt' }
      if (name === '@giokon/data') return { getSession: async () => ({ access_token: 'synthetic-jwt' }), canProcessSession: canProcess }
      if (name === './client') return { GeminiLiveClient: class { isConnected = true; connect = connect; close = close; sendUserTurn = send } }
      if (name === './mic') return { micStreamingSupported: () => true }
      if (name === './player') return { stopPlayback }
      throw new Error(name)
    },
  })
  return { exports, fetchMock, connect, close, stopPlayback, canProcess, send, tick: () => tick(), clearInterval }
}

describe('Live engine token session binding', () => {
  it('relay mode does not issue a Gemini token from the app', async () => {
    const api = engineApi('wss://voice.example.test/voice')
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'session')
    expect(engine).not.toBeNull()
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(api.connect).toHaveBeenCalledWith('', 'synthetic prompt')
  })
  it('rechecks permission before sending the system prompt after token issuance', async () => {
    const api = engineApi()
    api.canProcess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'session')).toBeNull()
    expect(api.fetchMock).toHaveBeenCalledOnce()
    expect(api.connect).not.toHaveBeenCalled()
  })
  it.each([false, new Error('offline')])('periodically stops an idle connection when verification fails: %s', async result => {
    const api = engineApi()
    const denied = vi.fn()
    await api.exports.acquireLiveEngine('key', {}, [], undefined, { onProcessingDenied: denied }, 'session')
    if (result instanceof Error) api.canProcess.mockRejectedValue(result)
    else api.canProcess.mockResolvedValue(result)
    api.tick()
    await vi.waitFor(() => expect(denied).toHaveBeenCalledOnce())
    expect(api.close).toHaveBeenCalledOnce()
    expect(api.clearInterval).toHaveBeenCalledOnce()
  })
  it('refuses token issuance and connection without current server permission', async () => {
    const api = engineApi()
    api.canProcess.mockResolvedValue(false)
    const denied = vi.fn()
    expect(await api.exports.acquireLiveEngine('key', {}, [], undefined, { onProcessingDenied: denied }, 'session')).toBeNull()
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(api.connect).not.toHaveBeenCalled()
    expect(denied).toHaveBeenCalledOnce()
  })
  it.each(['requestOpener', 'submitUserTurn', 'startListening', 'playTurn'])('stops %s when consent is revoked mid-session', async method => {
    const api = engineApi()
    const denied = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onProcessingDenied: denied }, 'session') as Record<string, (...args: unknown[]) => Promise<unknown>>
    api.canProcess.mockResolvedValue(false)
    await engine[method](method === 'playTurn' ? ['synthetic'] : 'synthetic')
    expect(api.send).not.toHaveBeenCalled()
    expect(api.close).toHaveBeenCalledOnce()
    expect(denied).toHaveBeenCalledOnce()
  })
  it('revocation while a token is pending prevents a later connection', async () => {
    const api = engineApi()
    let resolve!: (response: Response) => void
    api.fetchMock.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'session')
    await vi.waitFor(() => expect(api.fetchMock).toHaveBeenCalled())
    await api.exports.closeLiveEngine()
    resolve(Response.json({ token: 'synthetic' }))
    expect(await pending).toBeNull()
    expect(api.connect).not.toHaveBeenCalled()
  })

  it('revocation closes a connecting socket before audio cleanup completes', async () => {
    const api = engineApi()
    let connectDone!: () => void
    api.connect.mockImplementationOnce(() => new Promise(done => { connectDone = done }))
    const pending = api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'session')
    await vi.waitFor(() => expect(api.connect).toHaveBeenCalled())
    let playbackDone!: () => void
    api.stopPlayback.mockImplementationOnce(() => new Promise(done => { playbackDone = done }))
    const closing = api.exports.closeLiveEngine()
    expect(api.close).toHaveBeenCalledOnce()
    connectDone()
    expect(await pending).toBeNull()
    playbackDone()
    await closing
  })
  it('서버 세션이 없으면 토큰이나 WebSocket을 요청하지 않는다', async () => {
    const api = engineApi()
    expect(await api.exports.acquireLiveEngine('key', {}, [], undefined, {}, null)).toBeNull()
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(api.connect).not.toHaveBeenCalled()
  })

  it('서버 세션 ID로 토큰을 요청한 뒤 연결한다', async () => {
    const api = engineApi()
    await api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    const call = api.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(call[1].body as string)).toEqual({ session_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
    expect(api.connect).toHaveBeenCalledWith('synthetic-token', 'synthetic prompt')
  })

  it('토큰 서버가 거부하면 Live 연결을 시작하지 않는다', async () => {
    const api = engineApi()
    api.fetchMock.mockResolvedValueOnce(Response.json({ error: 'denied' }, { status: 403 }))
    expect(await api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBeNull()
    expect(api.connect).not.toHaveBeenCalled()
  })
})

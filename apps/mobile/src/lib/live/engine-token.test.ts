import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

function engineApi() {
  const fetchMock = vi.fn(async () => Response.json({ token: 'synthetic-token', model: 'synthetic-model' }))
  const connect = vi.fn(async () => {})
  const close = vi.fn()
  const stopPlayback = vi.fn(async () => {})
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console: { info: vi.fn(), warn: vi.fn() }, fetch: fetchMock,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic' } },
    require: (name: string) => {
      if (name === '@giokon/core') return { buildSystemPrompt: () => 'synthetic prompt' }
      if (name === '@giokon/data') return { getSession: async () => ({ access_token: 'synthetic-jwt' }) }
      if (name === './client') return { GeminiLiveClient: class { isConnected = true; connect = connect; close = close } }
      if (name === './mic') return { micStreamingSupported: () => true }
      if (name === './player') return { stopPlayback }
      throw new Error(name)
    },
  })
  return { exports, fetchMock, connect, close, stopPlayback }
}

describe('Live engine token session binding', () => {
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

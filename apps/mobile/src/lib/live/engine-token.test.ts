import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputEndpoint, pcmLevel } from './endpoint'

function engineApi(relayUrl?: string) {
  const fetchMock = vi.fn(async () => Response.json({ token: 'synthetic-token', model: 'synthetic-model' }))
  const connect = vi.fn(async () => {})
  const close = vi.fn()
  const stopPlayback = vi.fn(async () => {})
  const playPcmTurn = vi.fn(async (): Promise<string> => 'completed')
  const reportPlayback = vi.fn()
  const canProcess = vi.fn(async () => true)
  const send = vi.fn(async () => ({ text: 'synthetic', audioChunksB64: [] }))
  const streamAudio = vi.fn()
  let draft: (text: string) => void = () => {}
  const micStop = vi.fn()
  const startMic = vi.fn((_options: { onData: (chunk: string) => void }) => ({ stop: micStop }))
  let tick: () => Promise<unknown> | void = () => {};
  const clearInterval = vi.fn()
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console: { info: vi.fn(), warn: vi.fn() }, fetch: fetchMock, setTimeout, clearTimeout, performance: { now: () => Date.now() },
    setInterval: vi.fn((callback: () => void) => { tick = callback; return 1 }), clearInterval,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic', EXPO_PUBLIC_VOICE_RELAY_URL: relayUrl } },
    require: (name: string) => {
      if (name === '@giokon/core') return { buildSystemPrompt: () => 'synthetic prompt' }
      if (name === '@giokon/data') return { getSession: async () => ({ access_token: 'synthetic-jwt' }), canProcessSession: canProcess }
      if (name === './client') return { GeminiLiveClient: class { constructor(_model: string, callbacks: {onDraft: (text: string) => void}) { draft = callbacks.onDraft }; isConnected = true; playbackTurnId = relayUrl ? 1 : null; reportPlayback = reportPlayback; connect = connect; close = close; sendUserTurn = send; streamAudioChunk = streamAudio } }
      if (name === './endpoint') return { InputEndpoint, pcmLevel }
      if (name === './mic') return { micStreamingSupported: () => true, startMicStream: startMic }
      if (name === './player') return { stopPlayback, playPcmTurn }
      throw new Error(name)
    },
  })
  return { exports, fetchMock, connect, close, stopPlayback, playPcmTurn, reportPlayback, canProcess, send, startMic, micStop, streamAudio, draft: (text: string) => draft(text), tick: () => tick(), clearInterval }
}

afterEach(() => vi.useRealTimers())

describe('automatic input endpoint integration', () => {
  async function listening() {
    vi.useFakeTimers()
    const api = engineApi('wss://voice.example.test/voice')
    const final = vi.fn(), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: final, onError: error }, 'session') as ListeningEngine & {client: {playbackTurnId: number | null}}
    engine.client.playbackTurnId = null
    await engine.startListening()
    return {api, engine, final, error}
  }
  it('accepts a one-syllable reply once after the extra pause', async () => {
    const f = await listening()
    f.api.draft('네')
    await vi.advanceTimersByTimeAsync(5999)
    expect(f.final).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(251)
    expect(f.final).toHaveBeenCalledExactlyOnceWith('네')
    await f.api.exports.closeLiveEngine()
  })
  it('ends no-input capture without manufacturing an utterance', async () => {
    const f = await listening()
    await vi.advanceTimersByTimeAsync(20000)
    expect(f.final).toHaveBeenCalledExactlyOnceWith('')
    expect(f.api.micStop).toHaveBeenCalledOnce()
    await f.api.exports.closeLiveEngine()
  })
  it('keeps listening while PCM continues after the last transcript', async () => {
    const f = await listening()
    f.api.draft('고향 이야기')
    await vi.advanceTimersByTimeAsync(3000)
    f.api.startMic.mock.calls[0][0].onData('AAD/fwCA')
    await vi.advanceTimersByTimeAsync(3000)
    expect(f.final).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.final).toHaveBeenCalledExactlyOnceWith('고향 이야기')
    await f.api.exports.closeLiveEngine()
  })
  it('closes at the cap without submitting a forced partial utterance', async () => {
    const f = await listening()
    for (let i = 0; i < 60; i++) {
      f.api.draft('아직 말하는 중')
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(f.error).toHaveBeenCalledOnce()
    expect(f.final).not.toHaveBeenCalled()
    expect(f.api.close).toHaveBeenCalledOnce()
    expect(f.api.micStop).toHaveBeenCalledOnce()
  })
  it('cancels the input deadline on retrieval and ignores subsequent drafts', async () => {
    const f = await listening()
    await f.api.exports.closeLiveEngine()
    f.api.draft('늦은 입력')
    await vi.advanceTimersByTimeAsync(60000)
    expect(f.final).not.toHaveBeenCalled()
  })
})

interface ListeningEngine { startListening(): Promise<void>; stopListening(): string }

describe('listening cancellation generations', () => {
  it('shares cleanup between callers and survives recovery and playback errors', async () => {
    const api = engineApi()
    const partial = vi.fn(() => { throw new Error('consumer failed') }), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: vi.fn(), onDraftInterrupted: partial, onError: error }, 'session') as ListeningEngine & {close(): Promise<void>}
    await engine.startListening(); api.draft('부분 입력')
    api.stopPlayback.mockRejectedValueOnce(new Error('native unload failed'))
    await Promise.all([engine.close(), engine.close()])
    expect(api.close).toHaveBeenCalledOnce()
    expect(api.micStop).toHaveBeenCalledOnce()
    expect(api.stopPlayback).toHaveBeenCalledOnce()
    expect(partial).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
    await api.exports.closeLiveEngine()
  })
  it('closes the socket and recovers input even when native microphone cleanup throws', async () => {
    const api = engineApi()
    const partial = vi.fn(), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: vi.fn(), onDraftInterrupted: partial, onError: error }, 'session') as ListeningEngine
    await engine.startListening(); api.draft('받은 말씀')
    api.micStop.mockImplementationOnce(() => { throw new Error('native stop failed') })
    await api.exports.closeLiveEngine()
    expect(api.close).toHaveBeenCalledOnce()
    expect(api.stopPlayback).toHaveBeenCalledOnce()
    expect(partial).toHaveBeenCalledExactlyOnceWith('받은 말씀')
    expect(error).toHaveBeenCalledOnce()
  })
  it('returns an interrupted draft once as partial, never as a completed input', async () => {
    const api = engineApi()
    const final = vi.fn(), partial = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: final, onDraftInterrupted: partial }, 'session') as ListeningEngine
    await engine.startListening(); api.draft('아직 '); api.draft('말씀 중')
    await api.exports.closeLiveEngine(); await api.exports.closeLiveEngine()
    expect(partial).toHaveBeenCalledExactlyOnceWith('아직 말씀 중')
    expect(final).not.toHaveBeenCalled()
  })
  it('retains every transcription segment, whitespace and intentional repetition', async () => {
    const api = engineApi()
    const final = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: final }, 'session') as ListeningEngine
    await engine.startListening()
    api.draft('고향은 '); api.draft('전주'); api.draft('예요. '); api.draft('네. '); api.draft('네. ')
    expect(engine.stopListening()).toBe('고향은 전주예요. 네. 네.')
    expect(final).toHaveBeenCalledExactlyOnceWith('고향은 전주예요. 네. 네.')
    api.draft('청취 밖 입력')
    await engine.startListening()
    api.draft('새 발화')
    expect(engine.stopListening()).toBe('새 발화')
    await api.exports.closeLiveEngine()
  })
  it('rejects oversized transcripts instead of silently truncating or submitting them', async () => {
    const api = engineApi()
    const final = vi.fn(), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: final, onError: error }, 'session') as ListeningEngine
    await engine.startListening()
    api.draft('가'.repeat(3999)); api.draft('나다')
    expect(error).toHaveBeenCalledOnce()
    expect(api.close).toHaveBeenCalledOnce()
    expect(final).not.toHaveBeenCalled()
    await api.exports.closeLiveEngine()
  })
  it('does not open the microphone after stop during the permission check', async () => {
    const api = engineApi()
    const final = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: final }, 'session') as ListeningEngine
    let resolve!: (allowed: boolean) => void
    api.canProcess.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const starting = engine.startListening()
    engine.stopListening()
    resolve(true); await starting
    expect(api.startMic).not.toHaveBeenCalled()
    expect(final).not.toHaveBeenCalled()
  })
  it('drops audio from an earlier listening generation after restart', async () => {
    const api = engineApi()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: vi.fn() }, 'session') as ListeningEngine
    await engine.startListening()
    const stale = api.startMic.mock.calls[0][0]
    engine.stopListening(); await engine.startListening()
    stale.onData('old-audio')
    api.startMic.mock.calls[1][0].onData('new-audio')
    expect(api.streamAudio.mock.calls).toEqual([['new-audio']])
    await api.exports.closeLiveEngine()
  })
  it('emits the final transcript at most once for one capture', async () => {
    const api = engineApi(); const final = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, { onDraftFinal: final }, 'session') as ListeningEngine
    await engine.startListening()
    engine.stopListening(); engine.stopListening()
    expect(final).toHaveBeenCalledOnce()
    await api.exports.closeLiveEngine()
  })
})

describe('Live engine token session binding', () => {
  it.each(['completed', 'interrupted', 'empty'])('reports only completed Clova playback and closes on %s', async outcome => {
    const api = engineApi('wss://voice.example.test/voice')
    api.playPcmTurn.mockResolvedValue(outcome)
    const engine = await api.exports.acquireLiveEngine('key', {}, [], undefined, {}, 'session') as { playTurn: (chunks: string[]) => Promise<string> }
    expect(await engine.playTurn(['synthetic'])).toBe(outcome)
    if (outcome === 'completed') expect(api.reportPlayback).toHaveBeenCalledWith(1, 'completed')
    else { expect(api.reportPlayback).not.toHaveBeenCalled(); expect(api.close).toHaveBeenCalled() }
  })
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

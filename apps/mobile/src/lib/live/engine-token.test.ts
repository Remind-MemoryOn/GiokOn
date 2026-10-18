import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseVoiceResumeContext } from '@giokon/core'
import { InputEndpoint, pcmLevel } from './endpoint'
import { BargeInBuffer } from './barge-in'
import { parseVoiceRelayUrl, VOICE_RELAY_MISSING_MESSAGE } from './relay-config'

const RELAY = 'wss://voice.example.test/voice'

function engineApi(configured: string | undefined = RELAY, unset = false) {
  const relayUrl = unset ? undefined : configured
  const fetchMock = vi.fn(async () => Response.json({ token: 'synthetic-token', model: 'synthetic-model' }))
  const connections = vi.fn()
  const connect = vi.fn(async () => {})
  const close = vi.fn()
  const stopPlayback = vi.fn(async () => {})
  const playPcmTurn = vi.fn(async (): Promise<string> => 'completed')
  const reportPlayback = vi.fn()
  let playbackId: number | null = null
  const canProcess = vi.fn(async () => true)
  const micPermission = vi.fn(async () => true)
  const send = vi.fn(async (): Promise<{ text: string; audioChunksB64: string[] }> => ({ text: 'synthetic', audioChunksB64: [] }))
  const streamAudio = vi.fn()
  let draft: (text: string) => void = () => {}
  let clientCallbacks: Record<string, (...args: unknown[]) => void> = {}
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
      if (name === '@giokon/core') return { parseVoiceResumeContext }
      if (name === '@giokon/data') return { getSession: async () => ({ access_token: 'synthetic-jwt' }), canProcessSession: canProcess }
      if (name === './client') return { GeminiLiveClient: class { constructor(callbacks: {onDraft: (text: string) => void}, relay: unknown) { connections(relay); draft = callbacks.onDraft; clientCallbacks = callbacks as never }; isConnected = true; get playbackTurnId() { return playbackId }; reportPlayback = (id: number, result: string) => {reportPlayback(id,result); playbackId=null;}; connect = connect; close = close; sendUserTurn = send; streamAudioChunk = streamAudio } }
      if (name === './relay-config') return { voiceRelayUrl: () => parseVoiceRelayUrl(relayUrl), VOICE_RELAY_MISSING_MESSAGE }
      if (name === './endpoint') return { InputEndpoint, pcmLevel }
      if (name === './barge-in') return { BargeInBuffer }
      if (name === './mic') return { micStreamingSupported: () => true, startMicStream: startMic, hasMicPermission: micPermission, closeMicAudio: vi.fn(async () => {}) }
      if (name === './player') return { stopPlayback, playPcmTurn }
      throw new Error(name)
    },
  })
  return { exports, connections, fetchMock, connect, close, stopPlayback, playPcmTurn, reportPlayback, canProcess, micPermission, send, startMic, micStop, streamAudio, draft: (text: string) => draft(text), tick: () => tick(), clearInterval, client: () => clientCallbacks, setPlaybackId: (id: number) => {playbackId=id;} }
}

afterEach(() => vi.useRealTimers())

describe('post-AEC capture during TTS', () => {
  const pcm = Buffer.alloc(640, 16).toString('base64');
  const quiet = Buffer.alloc(640).toString('base64');
  type Engine = ListeningEngine & {playTurn(chunks: string[]): Promise<string>; readonly isListening: boolean};
  it('stops TTS once, reports interruption, and forwards the buffered beginning only after the receipt', async () => {
    const api=engineApi(); const error=vi.fn();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:vi.fn(),onError:error},'session') as Engine;
    api.setPlaybackId(1);
    let finish!: (value:string) => void;
    api.playPcmTurn.mockImplementation(() => new Promise(resolve=>{finish=resolve;}));
    api.stopPlayback.mockImplementation(async () => {finish('interrupted');});
    const playing=engine.playTurn(['pcm']);
    await vi.waitFor(()=>expect(api.playPcmTurn).toHaveBeenCalled());
    const audio=api.startMic.mock.calls[0][0].onData;
    for(let i=0;i<20;i++) audio(quiet);
    expect(api.stopPlayback).not.toHaveBeenCalled();
    for(let i=0;i<11;i++) audio(pcm);
    expect(api.streamAudio).not.toHaveBeenCalled();
    expect(await playing).toBe('barge_in');
    expect(api.reportPlayback).toHaveBeenCalledExactlyOnceWith(1,'interrupted');
    expect(api.stopPlayback).toHaveBeenCalledOnce();
    await engine.startListening();
    expect(api.startMic).toHaveBeenCalledOnce();
    expect(api.streamAudio.mock.calls.filter(([chunk])=>chunk===pcm)).toHaveLength(11);
    expect(api.reportPlayback.mock.invocationCallOrder[0]).toBeLessThan(api.streamAudio.mock.invocationCallOrder[0]);
    expect(error).not.toHaveBeenCalled(); await api.exports.closeLiveEngine();
  });
  it('keeps capture across a naturally completed playback and ignores late PCM after retrieval', async () => {
    const api=engineApi();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:vi.fn()},'session') as Engine;
    api.setPlaybackId(1); expect(await engine.playTurn(['pcm'])).toBe('completed');
    const audio=api.startMic.mock.calls[0][0].onData;
    audio(pcm); await engine.startListening();
    expect(api.startMic).toHaveBeenCalledOnce();
    expect(api.streamAudio).toHaveBeenCalledWith(pcm);
    await api.exports.closeLiveEngine(); const count=api.streamAudio.mock.calls.length;
    audio(pcm); expect(api.streamAudio).toHaveBeenCalledTimes(count);
  });
  it('never sends a receipt when native playback stop fails', async () => {
    const api=engineApi(), error=vi.fn();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:vi.fn(),onError:error},'session') as Engine;
    api.setPlaybackId(1); let finish!: (value:string) => void;
    api.playPcmTurn.mockImplementation(() => new Promise(resolve=>{finish=resolve;}));
    api.stopPlayback.mockImplementation(async () => {finish('interrupted'); throw new Error('native stop');});
    const playing=engine.playTurn(['pcm']); await vi.waitFor(()=>expect(api.playPcmTurn).toHaveBeenCalled());
    for(let i=0;i<10;i++) api.startMic.mock.calls[0][0].onData(pcm);
    expect(await playing).toBe('interrupted'); expect(api.reportPlayback).not.toHaveBeenCalled();
    expect(api.streamAudio).not.toHaveBeenCalled(); expect(api.close).toHaveBeenCalled();
    await api.exports.closeLiveEngine();
  });
  it('streams during a slow observation save, but queues the completed input until its controller is ready', async () => {
    vi.useFakeTimers(); const api=engineApi(), final=vi.fn(), error=vi.fn();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:final,onError:error},'session') as Engine;
    api.setPlaybackId(1);
    let finish!: (value:string)=>void;
    api.playPcmTurn.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    api.stopPlayback.mockImplementation(async()=>{finish('interrupted');});
    const playing=engine.playTurn(['pcm']);
    await vi.advanceTimersByTimeAsync(0);
    const audio=api.startMic.mock.calls[0][0].onData;
    for(let i=0;i<10;i++) audio(pcm);
    await playing;
    // Controller deliberately has not called startListening yet (its save is still pending).
    for(let i=0;i<150;i++) {audio(pcm); await vi.advanceTimersByTimeAsync(20);}
    expect(api.streamAudio).toHaveBeenCalledTimes(160);
    api.draft('합성 시험 답변');
    await vi.advanceTimersByTimeAsync(2000);
    expect(final).not.toHaveBeenCalled();
    await api.tick(); // Simulate the still-successful periodic permission lease refresh.
    await engine.startListening();
    expect(final).toHaveBeenCalledExactlyOnceWith('합성 시험 답변');
    expect(error).not.toHaveBeenCalled(); await api.exports.closeLiveEngine();
  });
  it('keeps the input cycle alive if saving finishes while the relay response is still pending', async () => {
    vi.useFakeTimers(); const api=engineApi(), final=vi.fn();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:final},'session') as Engine;
    api.setPlaybackId(1); await engine.playTurn(['pcm']);
    let respond!: (value:{text:string;audioChunksB64:string[]})=>void;
    api.send.mockImplementationOnce(()=>new Promise(resolve=>{respond=resolve;}));
    api.startMic.mock.calls[0][0].onData(pcm);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.micStop).toHaveBeenCalledOnce();
    await engine.startListening();
    expect(engine.isListening).toBe(true);
    expect(final).not.toHaveBeenCalled();
    api.draft('합성 답변'); respond({text:'검증된 응답',audioChunksB64:['AQACAA==']});
    await vi.advanceTimersByTimeAsync(0);
    expect(final).toHaveBeenCalledExactlyOnceWith('합성 답변');
    await api.exports.closeLiveEngine();
  });
});

describe('automatic input endpoint integration', () => {
  async function listening() {
    vi.useFakeTimers()
    const api = engineApi()
    const final = vi.fn(), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final, onError: error }, 'session') as ListeningEngine
    await engine.startListening()
    return {api, engine, final, error}
  }
  it('ends PCM before awaiting its delayed transcript and reuses the checked response after input adoption', async () => {
    const f = await listening()
    let reply!: (value: {text:string;audioChunksB64:string[]}) => void
    f.api.send.mockImplementationOnce(() => new Promise(resolve => { reply = resolve }))
    f.api.startMic.mock.calls[0][0].onData('AAD/fwCA')
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.api.micStop).toHaveBeenCalledOnce()
    expect(f.api.send).toHaveBeenCalledExactlyOnceWith('', 60000)
    expect(f.final).not.toHaveBeenCalled()
    f.api.draft('고향은 '); f.api.draft('전주예요.')
    reply({text:'응답',audioChunksB64:['AQACAA==']})
    await vi.advanceTimersByTimeAsync(0)
    expect(f.final).toHaveBeenCalledExactlyOnceWith('고향은 전주예요.')
    const result = await (f.engine as ListeningEngine & {submitUserTurn(text:string):Promise<unknown>}).submitUserTurn('고향은 전주예요.')
    expect(result).toEqual({status:'ok',text:'응답',chunksB64:['AQACAA==']})
    expect(f.api.send).toHaveBeenCalledOnce()
    await f.api.exports.closeLiveEngine()
  })
  it('does not adopt delayed transcription or a completed response after retrieval', async () => {
    const f = await listening()
    let reply!: (value: {text:string;audioChunksB64:string[]}) => void
    f.api.send.mockImplementationOnce(() => new Promise(resolve => { reply = resolve }))
    f.api.startMic.mock.calls[0][0].onData('AAD/fwCA')
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.api.send).toHaveBeenCalledOnce()
    await f.api.exports.closeLiveEngine()
    f.api.draft('늦은 전사'); reply({text:'늦은 응답',audioChunksB64:['AQACAA==']})
    await vi.advanceTimersByTimeAsync(0)
    expect(f.final).not.toHaveBeenCalled()
  })
  it('closes without adopting an input when the finished audio has no transcript', async () => {
    const f = await listening()
    f.api.startMic.mock.calls[0][0].onData('AAD/fwCA')
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.error).toHaveBeenCalledWith('말씀을 확인하지 못했어요. 담당자가 확인해 주세요.')
    expect(f.final).not.toHaveBeenCalled()
    expect(f.api.close).toHaveBeenCalledOnce()
    await f.api.exports.closeLiveEngine()
  })
  it('does not reuse a prepared response for different adopted input', async () => {
    const f = await listening()
    f.api.draft('고향은 전주예요.')
    f.api.startMic.mock.calls[0][0].onData('AAD/fwCA')
    await vi.advanceTimersByTimeAsync(3500)
    expect(f.final).toHaveBeenCalledExactlyOnceWith('고향은 전주예요.')
    const result = await (f.engine as ListeningEngine & {submitUserTurn(text:string):Promise<unknown>}).submitUserTurn('바뀐 입력')
    expect(result).toBeNull()
    expect(f.api.send).toHaveBeenCalledOnce()
    expect(f.api.close).toHaveBeenCalledOnce()
    await f.api.exports.closeLiveEngine()
  })
  it('accepts a one-syllable reply once after the extra pause', async () => {
    const f = await listening()
    f.api.draft('네')
    await vi.advanceTimersByTimeAsync(999)
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
    await vi.advanceTimersByTimeAsync(750)
    f.api.startMic.mock.calls[0][0].onData('AAD/fwCA')
    await vi.advanceTimersByTimeAsync(750)
    expect(f.final).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(f.final).toHaveBeenCalledExactlyOnceWith('고향 이야기')
    await f.api.exports.closeLiveEngine()
  })
  it('closes at the cap without submitting a forced partial utterance', async () => {
    const f = await listening()
    for (let i = 0; i < 120; i++) {
      f.api.draft('아직 말하는 중')
      await vi.advanceTimersByTimeAsync(500)
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

describe('microphone permission at each capture', () => {
  it.each(['denied','failed'])('closes without a new capture when permission is %s', async reason => {
    const api=engineApi(), error=vi.fn();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:vi.fn(),onError:error},'session') as ListeningEngine;
    await engine.startListening(); engine.stopListening();
    if(reason==='denied') api.micPermission.mockResolvedValueOnce(false);
    else api.micPermission.mockRejectedValueOnce(new Error('native permission failure'));
    await engine.startListening();
    expect(api.startMic).toHaveBeenCalledTimes(1);
    expect(api.close).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    await api.exports.closeLiveEngine();
  });
  it('ignores permission granted after retrieval', async () => {
    const api=engineApi();
    const engine=await api.exports.acquireLiveEngine('key',{onDraftFinal:vi.fn()},'session') as ListeningEngine;
    let resolve!:(allowed:boolean)=>void;
    api.micPermission.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
    const pending=engine.startListening();
    await vi.waitFor(()=>expect(api.micPermission).toHaveBeenCalled());
    await api.exports.closeLiveEngine(); resolve(true); await pending;
    expect(api.startMic).not.toHaveBeenCalled();
  });
});

describe('listening cancellation generations', () => {
  it('recovers a partial and closes instead of finalizing when normal microphone stop fails', async () => {
    const api = engineApi()
    const partial = vi.fn(), final = vi.fn(), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final, onDraftInterrupted: partial, onError: error }, 'session') as ListeningEngine
    await engine.startListening(); api.draft('입력 중')
    api.micStop.mockImplementationOnce(() => { throw new Error('native stop failed') })
    expect(engine.stopListening()).toBe('')
    await api.exports.closeLiveEngine()
    expect(final).not.toHaveBeenCalled()
    expect(partial).toHaveBeenCalledExactlyOnceWith('입력 중')
    expect(api.close).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
  })
  it('shares cleanup between callers and survives recovery and playback errors', async () => {
    const api = engineApi()
    const partial = vi.fn(() => { throw new Error('consumer failed') }), error = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: vi.fn(), onDraftInterrupted: partial, onError: error }, 'session') as ListeningEngine & {close(): Promise<void>}
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
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: vi.fn(), onDraftInterrupted: partial, onError: error }, 'session') as ListeningEngine
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
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final, onDraftInterrupted: partial }, 'session') as ListeningEngine
    await engine.startListening(); api.draft('아직 '); api.draft('말씀 중')
    await api.exports.closeLiveEngine(); await api.exports.closeLiveEngine()
    expect(partial).toHaveBeenCalledExactlyOnceWith('아직 말씀 중')
    expect(final).not.toHaveBeenCalled()
  })
  it('retains every transcription segment, whitespace and intentional repetition', async () => {
    const api = engineApi()
    const final = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final }, 'session') as ListeningEngine
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
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final, onError: error }, 'session') as ListeningEngine
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
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final }, 'session') as ListeningEngine
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
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: vi.fn() }, 'session') as ListeningEngine
    await engine.startListening()
    const stale = api.startMic.mock.calls[0][0]
    engine.stopListening(); await engine.startListening()
    stale.onData('AAAAAA==')
    api.startMic.mock.calls[1][0].onData('AAD/fwCA')
    expect(api.streamAudio.mock.calls).toEqual([['AAD/fwCA']])
    await api.exports.closeLiveEngine()
  })
  it('emits the final transcript at most once for one capture', async () => {
    const api = engineApi(); const final = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: final }, 'session') as ListeningEngine
    await engine.startListening()
    engine.stopListening(); engine.stopListening()
    expect(final).toHaveBeenCalledOnce()
    await api.exports.closeLiveEngine()
  })
})

describe('relay engine session binding', () => {
  it.each(['completed', 'interrupted', 'empty'])('reports only completed Gemini TTS playback and closes on %s', async outcome => {
    const api = engineApi()
    api.playPcmTurn.mockResolvedValue(outcome)
    const engine = await api.exports.acquireLiveEngine('key', {}, 'session') as { playTurn: (chunks: string[]) => Promise<string>; client: { playbackTurnId: number | null } }
    api.setPlaybackId(1)
    expect(await engine.playTurn(['synthetic'])).toBe(outcome)
    if (outcome === 'completed') expect(api.reportPlayback).toHaveBeenCalledWith(1, 'completed')
    else { expect(api.reportPlayback).not.toHaveBeenCalled(); expect(api.close).toHaveBeenCalled() }
  })
  it('never requests a Gemini token or builds a local prompt — the relay owns both', async () => {
    const api = engineApi()
    const engine = await api.exports.acquireLiveEngine('key', {}, 'session')
    expect(engine).not.toBeNull()
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(api.connect).toHaveBeenCalledExactlyOnceWith()
  })
  it.each([null, '', 'ws://voice.example.test/voice', 'wss://voice.example.test/other', 'wss://voice.example.test/voice?token=x'])(
    'refuses to connect without a valid relay URL (%s) and reports why instead of falling back', async relayUrl => {
      const api = engineApi(relayUrl ?? undefined, relayUrl === null)
      const error = vi.fn()
      expect(await api.exports.acquireLiveEngine('key', { onError: error }, 'session')).toBeNull()
      expect(api.fetchMock).not.toHaveBeenCalled()
      expect(api.connect).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledExactlyOnceWith(VOICE_RELAY_MISSING_MESSAGE)
    })
  it('rechecks permission before opening the relay connection', async () => {
    const api = engineApi()
    api.canProcess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await api.exports.acquireLiveEngine('key', {}, 'session')).toBeNull()
    expect(api.connect).not.toHaveBeenCalled()
  })
  it.each([false, new Error('offline')])('periodically stops an idle connection when verification fails: %s', async result => {
    const api = engineApi()
    const denied = vi.fn()
    await api.exports.acquireLiveEngine('key', { onProcessingDenied: denied }, 'session')
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
    expect(await api.exports.acquireLiveEngine('key', { onProcessingDenied: denied }, 'session')).toBeNull()
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(api.connect).not.toHaveBeenCalled()
    expect(denied).toHaveBeenCalledOnce()
  })
  it.each(['requestOpener', 'submitUserTurn', 'startListening', 'playTurn'])('stops %s when consent is revoked mid-session', async method => {
    const api = engineApi()
    const denied = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onProcessingDenied: denied }, 'session') as Record<string, (...args: unknown[]) => Promise<unknown>>
    api.canProcess.mockResolvedValue(false)
    await engine[method](method === 'playTurn' ? ['synthetic'] : 'synthetic')
    expect(api.send).not.toHaveBeenCalled()
    expect(api.close).toHaveBeenCalledOnce()
    expect(denied).toHaveBeenCalledOnce()
  })
  it('revocation closes a connecting socket before audio cleanup completes', async () => {
    const api = engineApi()
    let connectDone!: () => void
    api.connect.mockImplementationOnce(() => new Promise(done => { connectDone = done }))
    const pending = api.exports.acquireLiveEngine('key', {}, 'session')
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
    expect(await api.exports.acquireLiveEngine('key', {}, null)).toBeNull()
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(api.connect).not.toHaveBeenCalled()
  })

  it('서버 세션 ID와 사용자 JWT 로 중계에 연결한다(토큰은 URL 이 아니라 첫 프레임)', async () => {
    const api = engineApi()
    await api.exports.acquireLiveEngine('key', {}, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(api.connections).toHaveBeenCalledExactlyOnceWith({ url: RELAY, sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      accessToken: 'synthetic-jwt', playbackReceipts: true, bargeIn: true, streamingAudio: true })
    expect(api.connect).toHaveBeenCalledOnce()
  })
})


describe('restored engine acquisition', () => {
  it('opens a fresh relay with a snapshot even for the same session key', async () => {
    const api = engineApi()
    const args = ['key', {onDraftFinal: vi.fn()}, 'session']
    const first = await api.exports.acquireLiveEngine(...args)
    const context = {version: 1, turns: [{role: 'user', text: '전주에서 살았어요.'}]}
    const pending = api.exports.acquireLiveEngine(...args, context)
    context.turns[0].text = '수정된 외부 값'
    const restored = await pending
    expect(restored).not.toBe(first)
    expect(api.close).toHaveBeenCalledOnce()
    expect(api.connections.mock.calls.at(-1)?.[0].resumeContext.turns[0].text).toBe('전주에서 살았어요.')
    await api.exports.closeLiveEngine()
  })
  it('rejects invalid context before closing an existing connection', async () => {
    const api = engineApi()
    const args = ['key', {onDraftFinal: vi.fn()}, 'session']
    await api.exports.acquireLiveEngine(...args)
    expect(await api.exports.acquireLiveEngine(...args, {version:9,turns:[]})).toBeNull()
    expect(api.close).not.toHaveBeenCalled()
    await api.exports.closeLiveEngine()
  })
})

it('requests a continuation only on a restored relay and rechecks current processing permission',async()=>{
  const api=engineApi();
  const args=['key',{onDraftFinal:vi.fn()},'session'];
  const first=await api.exports.acquireLiveEngine(...args) as {requestContinuation():Promise<unknown>};
  expect(await first.requestContinuation()).toBeNull();
  const restored=await api.exports.acquireLiveEngine(...args,{version:1,turns:[]}) as {requestContinuation():Promise<unknown>};
  expect(await restored.requestContinuation()).toMatchObject({text:'synthetic'});
  expect(api.send).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('잠시 멈췄던'),60000);
  api.canProcess.mockResolvedValue(false);
  expect(await restored.requestContinuation()).toBeNull();
  expect(api.send).toHaveBeenCalledTimes(1);
  await api.exports.closeLiveEngine();
});

describe('감독 화면 원격 제어 수신(파일럿 M5)', () => {
  it.each(['paused', 'ended'] as const)('%s 를 오류가 아닌 원격 제어로 넘기고, 뒤따르는 끊김을 오류로 알리지 않는다', async state => {
    const api = engineApi()
    const onError = vi.fn(), onRemoteControl = vi.fn()
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: vi.fn(), onError, onRemoteControl }, 'session') as ListeningEngine
    expect(engine).toBeTruthy()
    api.client().onRemoteControl(state)
    api.client().onRemoteControl(state)
    expect(onRemoteControl).toHaveBeenCalledTimes(1)
    expect(onRemoteControl).toHaveBeenCalledWith(state)
    api.client().onClose()
    await Promise.resolve()
    expect(onError).not.toHaveBeenCalled()
    expect(api.stopPlayback).toHaveBeenCalled() // 엔진 정리(마이크·재생)는 한다
  })
  it('처리기가 없으면 조용히 멈추지 않고 오류로 알린 뒤 닫는다', async () => {
    const api = engineApi()
    const onError = vi.fn()
    await api.exports.acquireLiveEngine('key', { onDraftFinal: vi.fn(), onError }, 'session')
    api.client().onRemoteControl('paused')
    expect(onError).toHaveBeenCalledWith('감독 화면에서 대화를 잠시 멈췄어요.')
    expect(api.close).toHaveBeenCalled()
  })
  it('접속 시점에 이미 정지된 세션은 연결 오류 안내 없이 원격 제어만 알린다', async () => {
    const api = engineApi()
    const onError = vi.fn(), onRemoteControl = vi.fn()
    api.connect.mockImplementation(async () => { api.client().onRemoteControl('paused'); throw new Error('remote') })
    const engine = await api.exports.acquireLiveEngine('key', { onDraftFinal: vi.fn(), onError, onRemoteControl }, 'session')
    expect(engine).toBeNull()
    expect(onRemoteControl).toHaveBeenCalledWith('paused')
    expect(onError).not.toHaveBeenCalled()
  })
})

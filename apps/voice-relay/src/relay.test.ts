import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { ELDER_CLOSING_FAREWELL } from '@giokon/core'
import { createRelayServer } from './server'
import { CONTROL_CLOSE_GRACE_MS, ELDER_CLOSING_GRACE_MS, SAFETY_RECORD_TIMEOUT_MS, SESSION_LIMIT_SECONDS, type RelayDependencies, type RelaySession, type SessionTick } from './relay'

const EVENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const cleanup: (() => void)[] = []
afterEach(() => { vi.useRealTimers(); for (const close of cleanup.splice(0)) close() })

async function fixture(respond = true, extra: Partial<RelaySession> = {}, depsExtra: Partial<RelayDependencies> = {}) {
  const provider = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(provider, 'listening')
  cleanup.push(() => { for (const s of provider.clients) s.terminate(); provider.close() })
  const inputs: Record<string, any>[] = []
  let peer: WebSocket | undefined
  provider.on('connection', ws => {
    peer = ws
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString()); inputs.push(msg)
      if (msg.setup) ws.send(JSON.stringify({ setupComplete: {} }))
      if (respond && msg.realtimeInput?.activityEnd) ws.send(JSON.stringify({ serverContent: {
        outputTranscription: { text: '오늘 어떤 이야기를 나눌까요?' },
        modelTurn: { parts: [{ inlineData: { data: 'GEMINI_RAW_AUDIO' } }] }, turnComplete: true,
      } }))
    })
  })
  const allowed = vi.fn(async () => true), release = vi.fn()
  // 서버(session_tick) 상태 — 기본은 단계 정보 없음(기존 시나리오는 단계·제어와 무관하게 돈다).
  const server: Omit<SessionTick, 'allowed'> = {}
  const tick = vi.fn(async (): Promise<SessionTick> => ({ ...server, allowed: await allowed() }))
  const advancePhase = vi.fn(async (phase: NonNullable<SessionTick['phase']>) => { server.phase = phase; server.phaseElapsedSeconds = 0; return true })
  const synthesize = vi.fn(async (text: string) => ({ text, pcm: Buffer.from([1, 0, 2, 0]) }))
  const authorize = vi.fn(async () => ({ token: 'synthetic', model: 'test', systemInstruction: 'server context', tick, advancePhase, release, ...extra }))
  const connectProvider = vi.fn(() => new WebSocket(`ws://127.0.0.1:${(provider.address() as AddressInfo).port}`))
  const relay = createRelayServer({ authorize, connectProvider, synthesize, geminiTts: { apiKey: 'synthetic' },
    newSafetyEventId: () => EVENT_ID, safetyRetry: { attempts: 3, baseDelayMs: 20 }, log: vi.fn(), ...depsExtra })
  relay.server.listen(0, '127.0.0.1'); await once(relay.server, 'listening')
  cleanup.push(relay.close)
  const app = new WebSocket(`ws://127.0.0.1:${(relay.server.address() as AddressInfo).port}/voice`)
  await once(app, 'open'); cleanup.push(() => app.terminate())
  const frames: any[] = []; app.on('message', raw => frames.push(JSON.parse(raw.toString())))
  const send = (x: unknown) => app.send(JSON.stringify(x))
  async function start(protocolVersion?: number, resumeContext?: unknown) {
    send({ relayAuth: { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accessToken: 'synthetic-jwt', protocolVersion, resumeContext } })
    send({ setup: { systemInstruction: { parts: [{ text: 'untrusted override' }] } } })
    await vi.waitFor(() => expect(frames.some(f => f.setupComplete)).toBe(true))
  }
  function turn() {
    send({ realtimeInput: { activityStart: {} } })
    send({ realtimeInput: { audio: { data: 'AQACAA==', mimeType: 'audio/pcm;rate=16000' } } })
    send({ realtimeInput: { text: '확인한 합성 테스트 발화' } })
    send({ realtimeInput: { activityEnd: {} } })
  }
  const directives = () => inputs.filter(x => x.clientContent?.turns?.[0]?.parts?.[0]?.text?.startsWith('(내부 지시)')).map(x => x.clientContent.turns[0].parts[0].text as string)
  return { relay, app, send, start, turn, frames, inputs, authorize, connectProvider, synthesize, allowed, release, peer: () => peer, server, tick, advancePhase, directives }
}

describe('real local WebSocket relay', () => {
  it('does not stop ordinary reminiscence just because input arrives during output work',async()=>{
    const f=await fixture();await f.start(2);
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'고향의 골목이 그리워요.'}}}));
    await vi.waitFor(()=>expect(f.frames.some(x=>x.serverContent?.inputTranscription)).toBe(true));
    f.turn();await vi.waitFor(()=>expect(f.frames.some(x=>x.serverContent?.turnComplete)).toBe(true));
    expect(f.frames.some(x=>x.relayError)).toBe(false);
  })
  it('cancels synthesis immediately for a late crisis split across transcription frames',async()=>{
    const f=await fixture();await f.start(2);
    let finish!:(value:{text:string;pcm:Buffer})=>void;
    f.synthesize.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
    f.turn();await vi.waitFor(()=>expect(f.synthesize).toHaveBeenCalledOnce());
    const closed=once(f.app,'close');
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'죽고 '}}}));
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'싶어요'}}}));
    await closed;
    const signal=(f.synthesize.mock.calls[0] as unknown as [string,unknown,AbortSignal])[2];
    expect(signal.aborted).toBe(true);
    expect(f.frames.some(x=>x.relayError?.code==='INPUT_REVIEW_REQUIRED')).toBe(true);
    finish({text:'늦은 출력',pcm:Buffer.from([1,0])});
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(f.frames.some(x=>x.serverContent?.turnComplete)).toBe(false);
  })
  it.each([['죽고 싶어요',{ level: 'crisis', categories: ['self_harm'], alert: 'self_harm' }]] as const)('ends even an idle playback wait when late input requires intervention: %s',async (text,safety)=>{
    const f=await fixture();await f.start(2);f.turn();
    await vi.waitFor(()=>expect(f.frames.some(x=>x.serverContent?.turnComplete)).toBe(true));
    const closed=once(f.app,'close');
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text}}}));await closed;
    expect(f.frames.at(-1)).toEqual({relayError:{code:'INPUT_REVIEW_REQUIRED',...(safety ? {safety} : {})}});
    expect(f.release).toHaveBeenCalledOnce();
  })
  // T21.11(2026-10-04): 휴식 요청은 즉시 정지가 아니라 마무리 — 이미 들려준 답이 마지막이 되고, 재생 확인 뒤 종료한다.
  it('a late rest request during the playback wait ends after the playback receipt, not as a stop for review',async()=>{
    const f=await fixture();await f.start(2);f.turn();
    await vi.waitFor(()=>expect(f.frames.some(x=>x.serverContent?.turnComplete)).toBe(true));
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'그만할래요'}}}));
    await new Promise(r=>setTimeout(r,100));
    expect(f.frames.some(x=>x.relayControl)).toBe(false);
    const closed=once(f.app,'close');
    f.send({relayPlayback:{turnId:1,result:'completed'}});await closed;
    expect(f.frames.some(x=>x.relayError)).toBe(false);
    expect(f.frames.filter(x=>x.relayControl)).toEqual([{relayControl:{state:'ended',reason:'elder_closing'}}]);
    expect(f.release).toHaveBeenCalledOnce();
  }, CONTROL_CLOSE_GRACE_MS + 5000)
  it('clears the response deadline once the completed turn enters playback',async()=>{
    const f=await fixture(); await f.start(2); vi.useFakeTimers(); f.turn();
    await vi.waitFor(()=>expect(f.frames.some(x=>x.serverContent?.turnComplete)).toBe(true));
    await vi.advanceTimersByTimeAsync(45001);
    expect(f.app.readyState).toBe(WebSocket.OPEN);
    expect(f.frames.some(x=>x.relayError)).toBe(false);
  })
  it('closes a stalled model turn on a fixed deadline even if partial text arrives',async()=>{
    const f=await fixture(false); await f.start(2); vi.useFakeTimers();
    const closed=once(f.app,'close'); f.turn();
    await vi.waitFor(()=>expect(f.inputs.some(x=>x.realtimeInput?.activityEnd)).toBe(true));
    await vi.advanceTimersByTimeAsync(30000);
    f.peer()!.send(JSON.stringify({serverContent:{outputTranscription:{text:'아직 생성 중'}}}));
    await vi.advanceTimersByTimeAsync(15000);
    await closed;
    expect(f.frames.filter(x=>x.relayError)).toEqual([{relayError:{code:'RESPONSE_TIMEOUT'}}]);
    expect(f.synthesize).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledOnce();
  })
  it.each([
    [new Error('GEMINI_TTS_RATE_LIMIT'),'SYNTHESIS_LIMIT'],
    [new Error('GEMINI_TTS_UNAVAILABLE'),'SYNTHESIS_UNAVAILABLE'],
    [new DOMException('private timeout detail','TimeoutError'),'SYNTHESIS_TIMEOUT'],
    [new Error('OUTPUT_REJECTED'),'OUTPUT_REJECTED'],
    [new Error('private response body and token'),'SYNTHESIS_FAILED'],
  ])('sends only a bounded synthesis failure code before closing: %s',async(error,code)=>{
    const f=await fixture(); await f.start(2);
    f.synthesize.mockRejectedValueOnce(error);
    const closed=once(f.app,'close'); f.turn(); await closed;
    expect(f.frames.filter(x=>x.relayError)).toEqual([{relayError:{code}}]);
    expect(f.frames.some(x=>x.serverContent?.turnComplete)).toBe(false);
    expect(f.synthesize).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  })
  it('v3 restores validated context once without starting generation before the next input', async () => {
    const f = await fixture()
    await f.start(3,{version:1,turns:[{role:'model',text:'들은 질문'},{role:'user',text:'채택한 답변'}]})
    await vi.waitFor(()=>expect(f.inputs.some(x=>x.clientContent)).toBe(true))
    expect(f.inputs.find(x=>x.clientContent)).toEqual({clientContent:{turns:[
      {role:'model',parts:[{text:'들은 질문'}]},{role:'user',parts:[{text:'채택한 답변'}]},
    ],turnComplete:false}})
    expect(f.synthesize).not.toHaveBeenCalled()
    f.turn(); await vi.waitFor(()=>expect(f.frames.some(x=>x.relayOutput?.turnId===1)).toBe(true))
    const closed=once(f.app,'close'); f.turn(); await closed
    expect(f.synthesize).toHaveBeenCalledOnce() // v3 retains the playback receipt gate.
  })
  it.each([2,3])('rejects invalid restoration before authorization in v%s',async version=>{
    const f=await fixture();const closed=once(f.app,'close')
    f.send({relayAuth:{sessionId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',accessToken:'synthetic',protocolVersion:version,
      resumeContext:{version:1,turns:[{role:'system',text:'untrusted'}]}}})
    await closed;expect(f.authorize).not.toHaveBeenCalled()
  })
  it('shutdown cancels synthesis and releases the session without forwarding late audio', async () => {
    const f = await fixture(); await f.start(2)
    let finish!: (result: {text:string;pcm:Buffer}) => void
    f.synthesize.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
    f.turn(); await vi.waitFor(() => expect(f.synthesize).toHaveBeenCalledOnce())
    const closed = once(f.app,'close')
    await f.relay.shutdown(); await closed
    expect(f.release).toHaveBeenCalledOnce()
    finish({text:'늦은 음성',pcm:Buffer.from([1,0])})
    await new Promise(resolve => setTimeout(resolve,10))
    expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(false)
  })
  it('forwards input segments intact and rejects oversize segments without truncation', async () => {
    const f = await fixture(); await f.start(2)
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'고향은 '}}}))
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'전주예요.'}}}))
    await vi.waitFor(() => expect(f.frames.filter(x => x.serverContent?.inputTranscription)).toHaveLength(2))
    expect(f.frames.filter(x => x.serverContent?.inputTranscription).map(x => x.serverContent.inputTranscription.text)).toEqual(['고향은 ', '전주예요.'])
    f.peer()!.send(JSON.stringify({serverContent:{inputTranscription:{text:'가'.repeat(4001)}}}))
    await vi.waitFor(() => expect(f.app.readyState).toBe(WebSocket.CLOSED))
    expect(f.frames.filter(x => x.serverContent?.inputTranscription)).toHaveLength(2)
  })
  it('v2 holds the next input until the exact output is reported completed', async () => {
    const f = await fixture(); await f.start(2); f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    const turnId = f.frames.at(-1).relayOutput?.turnId
    expect(turnId).toBe(1)
    f.send({ relayPlayback: { turnId, result: 'completed' } })
    f.turn()
    await vi.waitFor(() => expect(f.synthesize).toHaveBeenCalledTimes(2))
  })
  it('v2 rejects input before playback acknowledgement', async () => {
    const f = await fixture(); await f.start(2); f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    const closed = once(f.app, 'close'); f.turn(); await closed
    expect(f.synthesize).toHaveBeenCalledOnce()
  })
  it.each(['interrupted', 'empty', 'wrong-turn'])('v2 closes instead of continuing after %s delivery', async result => {
    const f = await fixture(); await f.start(2); f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    const closed = once(f.app, 'close')
    f.send({ relayPlayback: { turnId: result === 'wrong-turn' ? 99 : 1, result: result === 'wrong-turn' ? 'completed' : result } })
    await closed
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('authenticates, relays microphone PCM and returns only validated Gemini TTS PCM', async () => {
    const f = await fixture(); await f.start(); f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    expect(f.inputs[0].setup.systemInstruction.parts[0].text).toContain('server context')
    expect(f.inputs[0].setup.systemInstruction.parts[0].text).not.toContain('untrusted override')
    expect(f.inputs.some(x => x.realtimeInput?.audio?.data === 'AQACAA==')).toBe(true)
    expect(JSON.stringify(f.frames)).not.toContain('GEMINI_RAW_AUDIO')
    expect(f.frames.at(-1).serverContent.modelTurn.parts[0].inlineData.data).toBe('AQACAA==')
    expect(f.synthesize).toHaveBeenCalledOnce()
  })
  it('rejects an unauthenticated setup without connecting to Google', async () => {
    const f = await fixture(); const closed = once(f.app, 'close')
    f.send({ setup: {} }); await closed
    expect(f.connectProvider).not.toHaveBeenCalled()
  })
  it('rejects denied authorization without connecting to Google', async () => {
    const f = await fixture(); f.authorize.mockRejectedValueOnce(new Error('denied'))
    const closed = once(f.app, 'close')
    f.send({ relayAuth: { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accessToken: 'synthetic' } })
    await closed; expect(f.connectProvider).not.toHaveBeenCalled()
  })
  it('does not return Gemini TTS results after permission withdrawal', async () => {
    const f = await fixture(); await f.start()
    f.synthesize.mockImplementationOnce(async text => { f.allowed.mockResolvedValue(false); return { text, pcm: Buffer.from([1, 0]) } })
    const closed = once(f.app, 'close'); f.turn(); await closed
    expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(false)
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('closes the provider immediately when the app disconnects during synthesis', async () => {
    const f = await fixture(); await f.start()
    let resolve!: (r: { text: string; pcm: Buffer }) => void
    f.synthesize.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    f.turn(); await vi.waitFor(() => expect(f.synthesize).toHaveBeenCalled())
    const providerClosed = once(f.peer()!, 'close'); f.app.close(); await providerClosed
    resolve({ text: 'late', pcm: Buffer.from([1, 0]) })
    expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(false)
  })
})

describe('pilot C3 — server phases and remote control', () => {
  it('starts the intro phase on the server clock and injects its directive only between turns', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: null, elapsedSeconds: 0, targetMinutes: 10 })
    await f.start(2)
    await vi.waitFor(() => expect(f.advancePhase).toHaveBeenCalledWith('intro'))
    await vi.waitFor(() => expect(f.directives()).toEqual([expect.stringContaining('도입 단계')]))
    // 지시는 model 턴을 시작하지 않는다(turnComplete=false) — 어르신께 들리지 않는다.
    expect(f.inputs.find(x => x.clientContent)?.clientContent.turnComplete).toBe(false)
  })
  it('counts only spoken elder turns and moves to reminiscence, never during a pending response', async () => {
    const f = await fixture(false)
    Object.assign(f.server, { phase: 'intro', phaseElapsedSeconds: 5, elapsedSeconds: 5, targetMinutes: 10 })
    await f.start(2)
    await vi.waitFor(() => expect(f.directives()).toHaveLength(1))
    // 텍스트만 있는 첫 인사 요청은 어르신 대답이 아니다
    f.send({ realtimeInput: { activityStart: {} } }); f.send({ realtimeInput: { text: '(내부 지시) 첫 말씀' } }); f.send({ realtimeInput: { activityEnd: {} } })
    await vi.waitFor(() => expect(f.inputs.some(x => x.realtimeInput?.activityEnd)).toBe(true))
    await f.tick(); await new Promise(r => setTimeout(r, 2100))
    expect(f.advancePhase).not.toHaveBeenCalledWith('reminiscence')
  })
  it('advances to reminiscence after a spoken answer and injects the directive before the next activity', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: 'intro', phaseElapsedSeconds: 5, elapsedSeconds: 5, targetMinutes: 10 })
    await f.start(2); f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    await vi.waitFor(() => expect(f.advancePhase).toHaveBeenCalledWith('reminiscence'), { timeout: 5000 })
    // 재생 확인 전에는 지시를 넣지 않는다
    expect(f.directives().some(t => t.includes('회상 단계'))).toBe(false)
    f.send({ relayPlayback: { turnId: 1, result: 'completed' } })
    await vi.waitFor(() => expect(f.directives().some(t => t.includes('회상 단계'))).toBe(true))
  })
  it('moves to closing near the target time', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: 'reminiscence', phaseElapsedSeconds: 400, elapsedSeconds: 510, targetMinutes: 10 })
    await f.start(2)
    await vi.waitFor(() => expect(f.advancePhase).toHaveBeenCalledWith('closing'))
    await vi.waitFor(() => expect(f.directives().some(t => t.includes('마무리 단계'))).toBe(true))
  })
  it.each([['paused', { paused: true }], ['ended', { endRequested: true }]] as const)(
    'remote %s: tells the app, stops forwarding input and output, then closes after a grace period', async (state, flags) => {
      const f = await fixture()
      await f.start(2)
      Object.assign(f.server, flags)
      await f.tick()
      await vi.waitFor(() => expect(f.frames.some(x => x.relayControl?.state === state)).toBe(true), { timeout: 3000 })
      const forwarded = f.inputs.length
      f.turn()
      await new Promise(r => setTimeout(r, 200))
      expect(f.inputs.length).toBe(forwarded)  // 입력이 모델로 가지 않는다
      expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(false)  // 새 AI 음성이 오지 않는다
      const closed = once(f.app, 'close')
      await closed
    }, CONTROL_CLOSE_GRACE_MS + 5000)
  it('does not open the model connection when the session is already paused at connect', async () => {
    const f = await fixture()
    Object.assign(f.server, { paused: true })
    f.send({ relayAuth: { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accessToken: 'synthetic-jwt', protocolVersion: 2 } })
    await vi.waitFor(() => expect(f.frames.some(x => x.relayControl?.state === 'paused')).toBe(true))
    expect(f.connectProvider).not.toHaveBeenCalled()
    await once(f.app, 'close')
  }, CONTROL_CLOSE_GRACE_MS + 5000)
})

describe('T21.12 — 세션 10분 상한(서버 경과 시간)', () => {
  const ended = (f: { frames: any[] }) => f.frames.filter(x => x.relayControl?.state === 'ended')
  it('is 10 minutes', () => { expect(SESSION_LIMIT_SECONDS).toBe(600) })

  it('ends at once without opening the model when the session is already past 10 minutes at (re)connect', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: 'closing', elapsedSeconds: SESSION_LIMIT_SECONDS + 120, targetMinutes: 10 })
    f.send({ relayAuth: { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accessToken: 'synthetic-jwt', protocolVersion: 2 } })
    await vi.waitFor(() => expect(ended(f)).toEqual([{ relayControl: { state: 'ended', reason: 'time_limit' } }]))
    expect(f.connectProvider).not.toHaveBeenCalled()
    await once(f.app, 'close')
  }, CONTROL_CLOSE_GRACE_MS + 5000)

  it('when idle at the limit: tells the app it ended, forwards no new elder speech, injects no directive, then closes', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: 'closing', phaseElapsedSeconds: 60, elapsedSeconds: SESSION_LIMIT_SECONDS - 5, targetMinutes: 10 })
    await f.start(2)
    const directivesBefore = f.directives().length
    f.server.elapsedSeconds = SESSION_LIMIT_SECONDS
    await vi.waitFor(() => expect(ended(f)).toHaveLength(1), { timeout: 3000 })
    const forwarded = f.inputs.length
    f.turn()
    await new Promise(r => setTimeout(r, 200))
    expect(f.inputs.length).toBe(forwarded)
    expect(f.directives().length).toBe(directivesBefore)
    expect(f.advancePhase).not.toHaveBeenCalled()
    await once(f.app, 'close')
  }, CONTROL_CLOSE_GRACE_MS + 6000)

  it('lets an AI reply already in progress finish and play, refusing new elder speech meanwhile, then ends after the playback receipt', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: 'closing', phaseElapsedSeconds: 60, elapsedSeconds: SESSION_LIMIT_SECONDS - 5, targetMinutes: 10 })
    await f.start(2)
    let finish!: (value: { text: string; pcm: Buffer }) => void
    f.synthesize.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    f.turn()
    await vi.waitFor(() => expect(f.synthesize).toHaveBeenCalledOnce())
    f.server.elapsedSeconds = SESSION_LIMIT_SECONDS + 1
    await new Promise(r => setTimeout(r, 2300))           // 상한을 넘긴 폴이 지나갔다
    expect(ended(f)).toHaveLength(0)                       // 생성 중인 답은 끊지 않는다
    const forwarded = f.inputs.length
    f.send({ realtimeInput: { activityStart: {} } })
    await new Promise(r => setTimeout(r, 100))
    expect(f.inputs.length).toBe(forwarded)                // 새 발화는 모델로 가지 않는다
    finish({ text: '오늘 이야기 고마웠어요.', pcm: Buffer.from([1, 0, 2, 0]) })
    await vi.waitFor(() => expect(f.frames.some(x => x.relayOutput?.turnId === 1)).toBe(true))
    await new Promise(r => setTimeout(r, 100))
    expect(ended(f)).toHaveLength(0)                       // 재생 확인 전에는 끝내지 않는다
    f.send({ relayPlayback: { turnId: 1, result: 'completed' } })
    await vi.waitFor(() => expect(ended(f)).toHaveLength(1))
    await once(f.app, 'close')
  }, CONTROL_CLOSE_GRACE_MS + 8000)

  it('does not wait past the grace period when playback is never confirmed', async () => {
    const f = await fixture(true, {}, { timeLimitGraceMs: 300 })
    Object.assign(f.server, { phase: 'closing', phaseElapsedSeconds: 60, elapsedSeconds: SESSION_LIMIT_SECONDS - 5, targetMinutes: 10 })
    await f.start(2)
    f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.relayOutput?.turnId === 1)).toBe(true))
    f.server.elapsedSeconds = SESSION_LIMIT_SECONDS
    await vi.waitFor(() => expect(ended(f)).toHaveLength(1), { timeout: 3500 })
    await once(f.app, 'close')
  }, CONTROL_CLOSE_GRACE_MS + 6000)

  it('keeps the normal flow before the limit (no end signal at 9:59)', async () => {
    const f = await fixture()
    Object.assign(f.server, { phase: 'closing', phaseElapsedSeconds: 60, elapsedSeconds: SESSION_LIMIT_SECONDS - 1, targetMinutes: 10 })
    await f.start(2); f.turn()
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    await new Promise(r => setTimeout(r, 2200))
    expect(ended(f)).toHaveLength(0)
  }, 8000)
})

describe('T21.11 — 휴식 요청·거부는 인사 한 문장 뒤 종료(위기·급성 고통은 즉시 정지 유지)', () => {
  const ended = (f: { frames: any[] }) => f.frames.filter(x => x.relayControl?.state === 'ended')
  const outputs = (f: { frames: any[] }) => f.frames.filter(x => x.serverContent?.turnComplete).map(x => x.serverContent.outputTranscription.text)
  /** 어르신이 말씀하는 중에 휴식 요청 전사가 오고, 그 뒤 말씀이 끝난다. */
  async function sayDuringTurn(f: Awaited<ReturnType<typeof fixture>>, transcript: string) {
    f.send({ realtimeInput: { activityStart: {} } })
    f.send({ realtimeInput: { audio: { data: 'AQACAA==', mimeType: 'audio/pcm;rate=16000' } } })
    await vi.waitFor(() => expect(f.inputs.some(x => x.realtimeInput?.audio)).toBe(true))
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: transcript } } }))
    await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.inputTranscription?.text === transcript)).toBe(true))
    f.send({ realtimeInput: { activityEnd: {} } })
  }

  it.each([['rest_request', '이제 그만할래요'], ['refusal', '듣기 싫어요']] as const)(
    '%s: answers with the fixed farewell instead of the model reply, logs the closing for supervisors, then ends after playback', async (situation, said) => {
      const recordElderClosing = vi.fn(async () => {}), recordSafety = vi.fn(async () => {})
      const f = await fixture(true, { recordElderClosing, recordSafety })
      Object.assign(f.server, { phase: 'reminiscence', phaseElapsedSeconds: 30, elapsedSeconds: 120, targetMinutes: 10 })
      await f.start(2)
      await sayDuringTurn(f, said)
      await vi.waitFor(() => expect(outputs(f)).toEqual([ELDER_CLOSING_FAREWELL]))
      expect(f.synthesize).toHaveBeenCalledWith(ELDER_CLOSING_FAREWELL, expect.anything(), expect.anything())  // 출력 검열·TTS 는 그대로
      expect(recordElderClosing).toHaveBeenCalledWith(situation)
      expect(f.advancePhase).toHaveBeenCalledWith('closing')
      expect(recordSafety).not.toHaveBeenCalled()
      expect(f.frames.some(x => x.relayError)).toBe(false)
      expect(f.directives().some(t => t.includes('마무리'))).toBe(false)  // 모델에 마무리 지시를 넣지 않는다 — 고정 인사로 끝낸다
      expect(ended(f)).toHaveLength(0)                                    // 재생 확인 전에는 끝내지 않는다
      f.send({ relayPlayback: { turnId: 1, result: 'completed' } })
      await vi.waitFor(() => expect(ended(f)).toEqual([{ relayControl: { state: 'ended', reason: 'elder_closing' } }]))
      await once(f.app, 'close')
    }, CONTROL_CLOSE_GRACE_MS + 6000)

  it('ends at once if the elder refuses again after the farewell was sent (no playback wait)', async () => {
    const f = await fixture()
    await f.start(2)
    await sayDuringTurn(f, '그만할래요')
    await vi.waitFor(() => expect(outputs(f)).toEqual([ELDER_CLOSING_FAREWELL]))
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '듣기 싫어요' } } }))
    await vi.waitFor(() => expect(ended(f)).toHaveLength(1))
    await once(f.app, 'close')
  }, CONTROL_CLOSE_GRACE_MS + 6000)

  it('a crisis during the farewell still takes the immediate stop-and-record path', async () => {
    const recordSafety = vi.fn(async () => {})
    const f = await fixture(true, { recordSafety })
    await f.start(2)
    await sayDuringTurn(f, '그만할래요')
    await vi.waitFor(() => expect(outputs(f)).toEqual([ELDER_CLOSING_FAREWELL]))
    const closed = once(f.app, 'close')
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '죽고 싶어요' } } }))
    await closed
    expect(recordSafety).toHaveBeenCalledOnce()
    expect(f.frames.some(x => x.relayError?.code === 'INPUT_REVIEW_REQUIRED')).toBe(true)
  })

  it('a rest request mixed with acute distress keeps the immediate stop (not a gentle closing)', async () => {
    const recordElderClosing = vi.fn(async () => {})
    const f = await fixture(true, { recordElderClosing })
    await f.start(2)
    const closed = once(f.app, 'close')
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '너무 힘들어서 못 견디겠어 그만할래' } } }))
    await closed
    expect(f.frames.some(x => x.relayError?.code === 'INPUT_REVIEW_REQUIRED')).toBe(true)
    expect(recordElderClosing).not.toHaveBeenCalled()
    expect(outputs(f)).toEqual([])
  })

  it('a late request with no turn to answer ends without a farewell', async () => {
    const f = await fixture()
    await f.start(2)
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '그만할래요' } } }))
    await vi.waitFor(() => expect(ended(f)).toHaveLength(1))
    expect(outputs(f)).toEqual([])
  })

  it('does not wait past the grace period if the elder keeps talking', async () => {
    const f = await fixture(true, {}, { elderClosingGraceMs: 300 })
    await f.start(2)
    f.send({ realtimeInput: { activityStart: {} } })
    await vi.waitFor(() => expect(f.inputs.some(x => x.realtimeInput?.activityStart)).toBe(true))
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '그만할래요' } } }))
    await vi.waitFor(() => expect(ended(f)).toHaveLength(1), { timeout: 2000 })
    expect(ELDER_CLOSING_GRACE_MS).toBe(45_000)
  })
})

describe('T21.4 · T25.17 — 위험 발화 즉시 기록 · 사건 id · 재시도', () => {
  it('records the safety event under the relay-made event id before stopping and hands the id to the app', async () => {
    const recordSafety = vi.fn(async () => {})
    const f = await fixture(true, { recordSafety }); await f.start(2)
    const closed = once(f.app, 'close')
    // 조각으로 나뉘어 와도 감지 창(연결 단위)으로 잡는다 — "죽고 " + "싶어요"
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '요즘은 그냥 죽고 ' } } }))
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '싶어요' } } }))
    await closed
    expect(recordSafety).toHaveBeenCalledOnce()
    const [draft, eventId] = recordSafety.mock.calls[0] as unknown as [{ level: string; categories: string[]; excerpt: string; caregiverAlert: string }, string]
    expect(eventId).toBe(EVENT_ID)
    expect(draft.level).toBe('crisis')
    expect(draft.categories).toContain('self_harm')
    expect(draft.excerpt).toContain('죽고 싶어요')
    expect(draft.caregiverAlert).toContain('109')
    expect(f.frames.at(-1)).toEqual({ relayError: { code: 'INPUT_REVIEW_REQUIRED', safetyEventId: EVENT_ID, safety: { level: 'crisis', categories: ['self_harm'], alert: 'self_harm' } } })
    // 원문·발췌·매칭 단어는 앱으로 가지 않는다(기록에만 남는다).
    expect(JSON.stringify(f.frames.at(-1))).not.toContain('죽고')
  })

  it('retries with the same event id and reports it recorded when a later attempt succeeds in time', async () => {
    let calls = 0
    const recordSafety = vi.fn(async () => { if (calls++ === 0) throw new Error('network') })
    const f = await fixture(true, { recordSafety }); await f.start(2)
    const closed = once(f.app, 'close')
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '죽고 싶어요' } } }))
    await closed
    expect(recordSafety).toHaveBeenCalledTimes(2)
    expect(recordSafety.mock.calls.map(c => (c as unknown[])[1])).toEqual([EVENT_ID, EVENT_ID])
    expect(f.frames.at(-1)).toEqual({ relayError: { code: 'INPUT_REVIEW_REQUIRED', safetyEventId: EVENT_ID, safety: { level: 'crisis', categories: ['self_harm'], alert: 'self_harm' } } })
  })

  it('gives up after the retry limit, hands over a pending id and logs no raw speech', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const recordSafety = vi.fn(async (): Promise<void> => { throw new Error('rls') })
    const f = await fixture(true, { recordSafety }); await f.start(2)
    const closed = once(f.app, 'close')
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '숨이 안 쉬어져요' } } }))
    await closed
    expect(recordSafety).toHaveBeenCalledTimes(3)
    // 기록이 안 됐으니 app 은 같은 id 로 대체 기록을 넣는다(판정 요약은 그대로 간다).
    expect(f.frames.at(-1)).toEqual({ relayError: { code: 'INPUT_REVIEW_REQUIRED', pendingSafetyEventId: EVENT_ID, safety: { level: 'crisis', categories: ['medical_emergency'], alert: 'medical_emergency' } } })
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(JSON.stringify(warn.mock.calls)).toContain(EVENT_ID)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('숨이')
    warn.mockRestore()
  })

  it('does not wait longer than the recording timeout to stop and keeps retrying after closing', async () => {
    let calls = 0
    const recordSafety = vi.fn(() => calls++ === 0
      ? new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), SAFETY_RECORD_TIMEOUT_MS + 200))
      : Promise.resolve())
    const f = await fixture(true, { recordSafety }); await f.start(2)
    const started = Date.now()
    const closed = once(f.app, 'close')
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '죽고 싶어요' } } }))
    await closed
    expect(Date.now() - started).toBeGreaterThanOrEqual(SAFETY_RECORD_TIMEOUT_MS - 100)
    expect(Date.now() - started).toBeLessThan(SAFETY_RECORD_TIMEOUT_MS + 2000)
    expect(f.frames.at(-1)).toEqual({ relayError: { code: 'INPUT_REVIEW_REQUIRED', pendingSafetyEventId: EVENT_ID, safety: { level: 'crisis', categories: ['self_harm'], alert: 'self_harm' } } })
    // 앱 연결을 닫은 뒤에도 같은 id 로 다시 시도해 근거를 남긴다.
    await vi.waitFor(() => expect(recordSafety).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect((recordSafety.mock.calls[1] as unknown[])[1]).toBe(EVENT_ID)
  }, SAFETY_RECORD_TIMEOUT_MS + 6000)

  it('forwards nothing more to the model or the elder while recording', async () => {
    let finish!: () => void
    const recordSafety = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const f = await fixture(true, { recordSafety }); await f.start(2)
    const before = f.inputs.length
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '죽고 싶어요' } } }))
    await vi.waitFor(() => expect(recordSafety).toHaveBeenCalledOnce())
    f.turn()
    f.peer()!.send(JSON.stringify({ serverContent: { outputTranscription: { text: '늦은 응답' }, turnComplete: true } }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(f.inputs.length).toBe(before)
    expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(false)
    const closed = once(f.app, 'close')
    finish(); await closed
    expect(f.frames.at(-1)).toEqual({ relayError: { code: 'INPUT_REVIEW_REQUIRED', safetyEventId: EVENT_ID, safety: { level: 'crisis', categories: ['self_harm'], alert: 'self_harm' } } })
  })

  it('records only once even when the risky phrase keeps arriving', async () => {
    let finish!: () => void
    const recordSafety = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const f = await fixture(true, { recordSafety }); await f.start(2)
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '죽고 싶어요' } } }))
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: ' 정말 죽고 싶어요' } } }))
    await vi.waitFor(() => expect(recordSafety).toHaveBeenCalledOnce())
    const closed = once(f.app, 'close')
    finish(); await closed
    expect(recordSafety).toHaveBeenCalledOnce()
    expect(f.frames.filter(x => x.relayError)).toHaveLength(1)
  })

  it('sends a watch-level summary for a distress signal', async () => {
    const recordSafety = vi.fn(async () => {})
    const f = await fixture(true, { recordSafety }); await f.start(2)
    const closed = once(f.app, 'close')
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '자식들한테 짐만 되는 것 같아' } } }))
    await closed
    expect(f.frames.at(-1)).toEqual({ relayError: { code: 'INPUT_REVIEW_REQUIRED', safetyEventId: EVENT_ID, safety: { level: 'watch', categories: [], alert: 'distress' } } })
  })

  it('does not record a plain rest request as a safety event (no risk) — it is a closing, not a stop for review (T21.11)', async () => {
    const recordSafety = vi.fn(async () => {})
    const f = await fixture(true, { recordSafety }); await f.start(2)
    f.peer()!.send(JSON.stringify({ serverContent: { inputTranscription: { text: '그만할래요' } } }))
    await vi.waitFor(() => expect(f.frames.some(x => x.relayControl?.state === 'ended')).toBe(true))
    expect(recordSafety).not.toHaveBeenCalled()
    expect(f.frames.some(x => x.relayError)).toBe(false)
  })
})

describe('진단 로그 — 어느 단계에서 왜 끝났는지(내용 없음)', () => {
  it('인증 단계 실패는 단계와 코드만 남긴다', async () => {
    const log = vi.fn()
    const f = await fixture(true, {}, { log, authorize: vi.fn(async () => { throw new Error('TOKEN_FAILED_403') }) })
    const closed = once(f.app, 'close')
    f.send({ relayAuth: { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accessToken: 'synthetic-jwt', protocolVersion: 2 } })
    await closed
    expect(log).toHaveBeenCalledWith('closed', { stage: 'auth', reason: 'TOKEN_FAILED_403', turns: 0 })
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-jwt')
  })
  it('Gemini 가 연결을 닫으면 종료 코드·이유를 남기고 대화 내용은 남기지 않는다', async () => {
    const log = vi.fn()
    const f = await fixture(true, {}, { log })
    await f.start(2)
    expect(log).toHaveBeenCalledWith('authorized', { protocolVersion: 2 })
    expect(log).toHaveBeenCalledWith('provider_open')
    expect(log).toHaveBeenCalledWith('ready')
    f.turn(); await vi.waitFor(() => expect(f.frames.some(x => x.serverContent?.turnComplete)).toBe(true))
    const closed = once(f.app, 'close')
    f.peer()!.close(1008, 'API key not valid')
    await closed
    expect(log).toHaveBeenCalledWith('provider_closed', { code: 1008, reason: 'API key not valid' })
    expect(log).toHaveBeenCalledWith('closed', expect.objectContaining({ stage: 'conversation', reason: 'PROVIDER_CLOSED' }))
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).not.toContain('오늘 어떤 이야기')
    expect(logged).not.toContain('확인한 합성 테스트 발화')
    expect(logged).not.toContain('synthetic-jwt')
  })
  it('합성 실패는 앱에 알리는 코드와 원인 코드를 남긴다', async () => {
    const log = vi.fn()
    const f = await fixture(true, {}, { log, synthesize: vi.fn(async () => { throw new Error('GEMINI_TTS_FAILED_400') }) })
    await f.start(2)
    const closed = once(f.app, 'close')
    f.turn(); await closed
    expect(log).toHaveBeenCalledWith('synthesis_failed', { code: 'SYNTHESIS_FAILED', cause: 'GEMINI_TTS_FAILED_400' })
  })
})

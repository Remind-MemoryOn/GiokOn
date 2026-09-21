import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { createRelayServer } from './server'

const cleanup: (() => void)[] = []
afterEach(() => { vi.useRealTimers(); for (const close of cleanup.splice(0)) close() })

async function fixture(respond = true) {
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
  const synthesize = vi.fn(async (text: string) => ({ text, pcm: Buffer.from([1, 0, 2, 0]) }))
  const authorize = vi.fn(async () => ({ token: 'synthetic', model: 'test', systemInstruction: 'server context', allowed, release }))
  const connectProvider = vi.fn(() => new WebSocket(`ws://127.0.0.1:${(provider.address() as AddressInfo).port}`))
  const relay = createRelayServer({ authorize, connectProvider, synthesize, clova: { clientId: 'synthetic', clientSecret: 'synthetic' } })
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
  return { relay, app, send, start, turn, frames, inputs, authorize, connectProvider, synthesize, allowed, release, peer: () => peer }
}

describe('real local WebSocket relay', () => {
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
    [new Error('CLOVA_RATE_LIMIT'),'SYNTHESIS_LIMIT'],
    [new Error('CLOVA_UNAVAILABLE'),'SYNTHESIS_UNAVAILABLE'],
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
  it('authenticates, relays microphone PCM and returns only synthesized Clova PCM', async () => {
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
  it('does not return Clova results after permission withdrawal', async () => {
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

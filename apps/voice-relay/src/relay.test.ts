import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { createRelayServer } from './server'

const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })

async function fixture() {
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
      if (msg.realtimeInput?.activityEnd) ws.send(JSON.stringify({ serverContent: {
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
  async function start() {
    send({ relayAuth: { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accessToken: 'synthetic-jwt' } })
    send({ setup: { systemInstruction: { parts: [{ text: 'untrusted override' }] } } })
    await vi.waitFor(() => expect(frames.some(f => f.setupComplete)).toBe(true))
  }
  function turn() {
    send({ realtimeInput: { activityStart: {} } })
    send({ realtimeInput: { audio: { data: 'AQACAA==', mimeType: 'audio/pcm;rate=16000' } } })
    send({ realtimeInput: { text: '확인한 합성 테스트 발화' } })
    send({ realtimeInput: { activityEnd: {} } })
  }
  return { app, send, start, turn, frames, inputs, authorize, connectProvider, synthesize, allowed, release, peer: () => peer }
}

describe('real local WebSocket relay', () => {
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

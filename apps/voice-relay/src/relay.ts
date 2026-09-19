import { WebSocket, type RawData } from 'ws'
import type { ClovaCredentials } from './output'
import { synthesizeValidated } from './output'

export interface RelaySession {
  token: string
  model: string
  systemInstruction: string
  allowed(): Promise<boolean>
  release(): void
}
export interface RelayDependencies {
  authorize(sessionId: string, accessToken: string): Promise<RelaySession>
  connectProvider(url: string): WebSocket
  synthesize?: typeof synthesizeValidated
  clova: ClovaCredentials
}

function buffer(raw: RawData): Buffer {
  return Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
}

/** Bounded, single-connection integration transport; no audio or transcript logs. */
export function attachRelay(app: WebSocket, deps: RelayDependencies): void {
  const abort = new AbortController()
  let session: RelaySession | undefined, upstream: WebSocket | undefined
  let authenticated = false, setupSeen = false, ready = false, activity = false, pending = false
  let output = '', turns = 0, queuedBytes = 0, receivedBytes = 0
  let outputQueued = 0
  let protocolVersion = 1, awaitingPlayback: number | null = null
  let playbackTimer: ReturnType<typeof setTimeout> | undefined
  let inputChain = Promise.resolve(), outputChain = Promise.resolve()
  let checking: Promise<boolean> | undefined
  let lastAllowed = 0
  const openedAt = Date.now()
  const setupTimer = setTimeout(() => close(), 30000)
  const lifetime = setTimeout(() => close(), 25 * 60 * 1000)
  const poll = setInterval(() => { if (session) void allowed().then(ok => { if (!ok) close() }) }, 2000)

  function close() {
    if (abort.signal.aborted) return
    abort.abort()
    clearTimeout(setupTimer); clearTimeout(lifetime); clearInterval(poll)
    clearTimeout(playbackTimer)
    session?.release()
    upstream?.terminate()
    app.close(1000, 'VOICE_SESSION_ENDED')
    const terminate = setTimeout(() => { if (app.readyState !== WebSocket.CLOSED) app.terminate() }, 1000)
    terminate.unref()
  }
  async function allowed() {
    if (!session || abort.signal.aborted) return false
    checking ??= session.allowed().catch(() => false)
    const ok = await checking
    checking = undefined
    if (ok && !abort.signal.aborted) lastAllowed = Date.now()
    return ok && !abort.signal.aborted
  }
  function send(value: unknown) {
    if (abort.signal.aborted || app.readyState !== WebSocket.OPEN) return
    if (app.bufferedAmount > 3 * 1024 * 1024) return close()
    app.send(JSON.stringify(value))
  }
  function forward(value: unknown) {
    if (abort.signal.aborted || !upstream || upstream.readyState !== WebSocket.OPEN || Date.now() - lastAllowed > 5000) return close()
    if (upstream.bufferedAmount > 128 * 1024) return close()
    upstream.send(JSON.stringify(value))
  }

  app.on('close', close); app.on('error', close)
  app.on('message', (data, binary) => {
    const raw = buffer(data)
    queuedBytes += raw.length
    receivedBytes += raw.length
    // Admission and total-rate ceilings include frames queued during authentication.
    if (binary || raw.length > 65536 || queuedBytes > 128 * 1024 || receivedBytes > 256 * 1024 + (Date.now() - openedAt) * 64) return close()
    inputChain = inputChain.then(async () => {
      queuedBytes -= raw.length
      if (abort.signal.aborted) return
      const msg = JSON.parse(raw.toString())
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || Object.keys(msg).length !== 1) throw new Error('INVALID_FRAME')
      if (!authenticated) {
        const a = msg.relayAuth
        if (!a || typeof a.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(a.sessionId) || typeof a.accessToken !== 'string' || a.accessToken.length > 8192) throw new Error('AUTH_REQUIRED')
        if (a.protocolVersion !== undefined && a.protocolVersion !== 2) throw new Error('UNSUPPORTED_PROTOCOL')
        protocolVersion = a.protocolVersion ?? 1
        const acquired = await deps.authorize(a.sessionId, a.accessToken)
        if (abort.signal.aborted) { acquired.release(); return }
        session = acquired
        if (!await allowed()) throw new Error('DENIED')
        authenticated = true
        upstream = deps.connectProvider(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(session.token)}`)
        upstream.on('error', close); upstream.on('close', close)
        upstream.on('open', () => forward({ setup: {
          model: session!.model.startsWith('models/') ? session!.model : `models/${session!.model}`,
          systemInstruction: { parts: [{ text: session!.systemInstruction + '\n각 응답은 180자 이내의 짧은 질문 하나로 말합니다.' }] },
          generationConfig: { responseModalities: ['AUDIO'] }, inputAudioTranscription: {}, outputAudioTranscription: {},
          realtimeInputConfig: { automaticActivityDetection: { disabled: true }, activityHandling: 'NO_INTERRUPTION' }, sessionResumption: {},
        } }))
        upstream.on('message', dataProvider => {
          const rawProvider = buffer(dataProvider)
          outputQueued += rawProvider.length
          if (rawProvider.length > 1024 * 1024 || outputQueued > 2 * 1024 * 1024) return close()
          outputChain = outputChain.then(async () => {
            outputQueued -= rawProvider.length
            if (abort.signal.aborted) return
            const p = JSON.parse(rawProvider.toString())
            if (p.error || p.goAway) return close()
            if (p.setupComplete) { ready = true; clearTimeout(setupTimer); send({ setupComplete: { relayProtocolVersion: protocolVersion } }); return }
            const content = p.serverContent
            if (!content) return
            if (content.interrupted) return close()
            // Never forward Gemini inlineData or its original audio.
            if (typeof content.inputTranscription?.text === 'string') send({ serverContent: { inputTranscription: { text: content.inputTranscription.text.slice(0, 4000) } } })
            if (!pending) return
            if (typeof content.outputTranscription?.text === 'string') output += content.outputTranscription.text
            if (output.length > 200) return close()
            if (!content.turnComplete) return
            if (!await allowed()) return close()
            const result = await (deps.synthesize ?? synthesizeValidated)(output.trim(), deps.clova, abort.signal)
            if (!await allowed()) return close()
            if (protocolVersion === 2) {
              awaitingPlayback = turns
              playbackTimer = setTimeout(close, 95000)
            }
            send({ ...(protocolVersion === 2 ? { relayOutput: { turnId: turns } } : {}), serverContent: { outputTranscription: { text: result.text }, modelTurn: { parts: [{ inlineData: { data: result.pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] }, turnComplete: true } })
            output = ''; pending = false
          }).catch(close)
        })
        return
      }
      // The app's setup is acknowledged structurally but its prompt/model is ignored.
      if (msg.setup && !setupSeen) { setupSeen = true; return }
      if (msg.relayPlayback) {
        const receipt = msg.relayPlayback
        if (protocolVersion !== 2 || !ready || pending || awaitingPlayback === null ||
            Object.keys(receipt).length !== 2 || receipt.turnId !== awaitingPlayback || receipt.result !== 'completed') return close()
        if (!await allowed()) return close()
        clearTimeout(playbackTimer); awaitingPlayback = null
        return
      }
      if (awaitingPlayback !== null) throw new Error('PLAYBACK_NOT_CONFIRMED')
      if (!ready || !setupSeen || !msg.realtimeInput || pending) throw new Error('INVALID_PHASE')
      const r = msg.realtimeInput
      if (Object.keys(r).length !== 1) throw new Error('INVALID_INPUT')
      if (r.activityStart && !activity) { activity = true; forward({ realtimeInput: { activityStart: {} } }); return }
      if (!activity) throw new Error('NO_ACTIVITY')
      if (r.audio) {
        if (r.audio.mimeType !== 'audio/pcm;rate=16000' || typeof r.audio.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.audio.data) || Buffer.from(r.audio.data, 'base64').length % 2) throw new Error('INVALID_AUDIO')
        forward({ realtimeInput: { audio: { data: r.audio.data, mimeType: 'audio/pcm;rate=16000' } } }); return
      }
      if (typeof r.text === 'string' && r.text.trim() && r.text.length <= 4000) {
        if (!await allowed()) return close()
        forward({ realtimeInput: { text: r.text } }); return
      }
      if (r.activityEnd) {
        if (++turns > 60 || !await allowed()) return close()
        pending = true; activity = false; output = ''
        forward({ realtimeInput: { activityEnd: {} } }); return
      }
      throw new Error('INVALID_INPUT')
    }).catch(close)
  })
}

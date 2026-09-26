import { WebSocket, type RawData } from 'ws'
import type { GeminiTtsConfig } from './output'
import { synthesizeValidated } from './output'
import { assessUtterance, buildPhaseDirective, parseVoiceResumeContext, shouldAdvancePhase, type SessionPhase, type VoiceFailureCode } from '@giokon/core'

/**
 * 서버(session_tick RPC) 한 번의 판정 — 파일럿 D6·C3. 2초 폴이 이 값 하나로 허용 여부·단계·원격 제어를 함께 받는다.
 * allowed=false 면 나머지 값은 믿지 않는다.
 */
export interface SessionTick {
  allowed: boolean
  phase?: SessionPhase | null
  /** 세션 시작부터 경과(초) — 서버 시계. */
  elapsedSeconds?: number
  phaseElapsedSeconds?: number | null
  /** 목표 시간(분) — 서버가 10분 상한을 건 값. */
  targetMinutes?: number
  /** 감독 화면의 원격 일시정지. */
  paused?: boolean
  /** 감독 화면의 원격 종료 요청. */
  endRequested?: boolean
}

export interface RelaySession {
  token: string
  model: string
  systemInstruction: string
  tick(): Promise<SessionTick>
  /** 세션 시작자 권한으로 단계를 기록한다(advance_session_phase). 실패하면 false — 단계 지시를 넣지 않는다. */
  advancePhase?(phase: SessionPhase): Promise<boolean>
  release(): void
}

/** 원격 일시정지·종료를 앱에 알린 뒤 연결을 닫기까지의 유예(ms) — 제어 메시지가 닫힘보다 먼저 닿게. */
export const CONTROL_CLOSE_GRACE_MS = 2000
export interface RelayDependencies {
  authorize(sessionId: string, accessToken: string): Promise<RelaySession>
  connectProvider(url: string): WebSocket
  synthesize?: typeof synthesizeValidated
  geminiTts: GeminiTtsConfig
}

function buffer(raw: RawData): Buffer {
  return Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
}

/** Bounded, single-connection integration transport; no audio or transcript logs. */
export function attachRelay(app: WebSocket, deps: RelayDependencies): () => void {
  const abort = new AbortController()
  let session: RelaySession | undefined, upstream: WebSocket | undefined
  let authenticated = false, setupSeen = false, ready = false, activity = false, pending = false
  let safetyInput = ''
  let output = '', turns = 0, queuedBytes = 0, receivedBytes = 0
  let outputQueued = 0
  let protocolVersion = 1, awaitingPlayback: number | null = null
  let responseTimer: ReturnType<typeof setTimeout> | undefined
  let playbackTimer: ReturnType<typeof setTimeout> | undefined
  let inputChain = Promise.resolve(), outputChain = Promise.resolve()
  let checking: Promise<SessionTick> | undefined
  let lastAllowed = 0
  // 파일럿 C3 — 단계 지시와 원격 제어
  let controlled = false                  // 원격 일시정지·종료를 알렸다: 입력·출력 전달 중단, 곧 닫는다
  let directive: string | null = null     // 턴 사이에 넣을 단계 지시(모델 생성 중에는 넣지 않는다)
  let directedPhase: SessionPhase | null = null
  let advancing = false
  let phaseTurns = 0                      // 현재 단계에서 어르신이 **말한**(음성이 전달된) 턴 수
  let activityAudio = false
  const openedAt = Date.now()
  const setupTimer = setTimeout(() => close(), 30000)
  const lifetime = setTimeout(() => close(), 25 * 60 * 1000)
  const poll = setInterval(() => { if (session) void allowed().then(ok => { if (!ok) close() }) }, 2000)

  function close() {
    if (abort.signal.aborted) return
    abort.abort()
    clearTimeout(setupTimer); clearTimeout(lifetime); clearInterval(poll)
    clearTimeout(playbackTimer); clearTimeout(responseTimer)
    session?.release()
    upstream?.terminate()
    app.close(1000, 'VOICE_SESSION_ENDED')
    const terminate = setTimeout(() => { if (app.readyState !== WebSocket.CLOSED) app.terminate() }, 1000)
    terminate.unref()
  }
  async function allowed() {
    if (!session || abort.signal.aborted) return false
    checking ??= session.tick().catch((): SessionTick => ({ allowed: false }))
    const tick = await checking
    checking = undefined
    const ok = tick.allowed === true
    if (ok && !abort.signal.aborted) {
      lastAllowed = Date.now()
      react(tick)
    }
    return ok && !abort.signal.aborted
  }
  /** 서버 판정에 반응한다: 원격 종료·일시정지 → 알리고 유예 뒤 닫기, 단계 → 기록하고 지시를 대기열에. */
  function react(tick: SessionTick) {
    if (abort.signal.aborted || controlled) return
    if (tick.endRequested || tick.paused) {
      controlled = true
      directive = null
      clearTimeout(responseTimer); clearTimeout(playbackTimer)
      send({ relayControl: { state: tick.endRequested ? 'ended' : 'paused' } })
      setTimeout(close, CONTROL_CLOSE_GRACE_MS).unref()
      return
    }
    const phase = tick.phase ?? null
    // 재접속(복구) 등으로 이 연결이 아직 현재 단계 지시를 모델에 넣지 않았다면 한 번 넣는다.
    if (phase && directedPhase !== phase && !advancing) {
      directedPhase = phase
      directive = buildPhaseDirective(phase)
    }
    const next = typeof tick.elapsedSeconds === 'number' && typeof tick.targetMinutes === 'number'
      ? shouldAdvancePhase({ phase, elapsedSeconds: tick.elapsedSeconds, targetMinutes: tick.targetMinutes,
          elderTurnsInPhase: phaseTurns, phaseElapsedSeconds: tick.phaseElapsedSeconds ?? 0 })
      : null
    if (next && !advancing && session?.advancePhase) {
      advancing = true
      void session.advancePhase(next).then(ok => {
        advancing = false
        if (!ok || abort.signal.aborted || controlled) return
        phaseTurns = 0
        directedPhase = next
        directive = buildPhaseDirective(next)
        flushDirective()
      }, () => { advancing = false })
    }
    flushDirective()
  }
  /** 단계 지시는 **턴 사이**에만 넣는다 — 모델 생성·재생 대기·어르신 발화 중이면 다음 기회로 미룬다. */
  function flushDirective() {
    if (!directive || controlled || !ready || pending || activity || awaitingPlayback !== null) return
    const text = directive
    directive = null
    forward({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false } })
  }
  function send(value: unknown) {
    if (abort.signal.aborted || app.readyState !== WebSocket.OPEN) return
    if (app.bufferedAmount > 3 * 1024 * 1024) return close()
    app.send(JSON.stringify(value))
  }
  function forward(value: unknown) {
    if (controlled) return  // 원격 일시정지·종료 알림 뒤에는 모델에 아무것도 보내지 않는다(곧 닫힌다).
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
        if (a.protocolVersion !== undefined && a.protocolVersion !== 2 && a.protocolVersion !== 3) throw new Error('UNSUPPORTED_PROTOCOL')
        protocolVersion = a.protocolVersion ?? 1
        if (a.resumeContext !== undefined && protocolVersion !== 3) throw new Error('UNSUPPORTED_RESTORATION')
        const resumeContext = a.resumeContext === undefined ? undefined : parseVoiceResumeContext(a.resumeContext)
        const acquired = await deps.authorize(a.sessionId, a.accessToken)
        if (abort.signal.aborted) { acquired.release(); return }
        session = acquired
        if (!await allowed()) throw new Error('DENIED')
        authenticated = true
        // 연결 시점에 이미 일시정지·종료 상태면 모델 연결을 열지 않는다(알림은 react 가 보냈고 곧 닫힌다).
        if (controlled) return
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
          if (abort.signal.aborted) return
          let p: Record<string, any>
          try {
            p = JSON.parse(rawProvider.toString())
            if (!p || typeof p !== 'object' || Array.isArray(p)) return close()
            const input = p.serverContent?.inputTranscription?.text
            if (typeof input === 'string') {
              if (input.length > 4000) return close()
              // Transcription ordering is independent of output. Inspect immediately,
              // before the synthesis promise can hold up the normal output queue.
              // A bounded connection window also catches phrases split across frames.
              const combinedInput = safetyInput + input
              const assessment = assessUtterance(combinedInput)
              safetyInput = combinedInput.slice(-4000)
              if (assessment.escalate || assessment.hasDistressSignal ||
                  assessment.situation === 'rest_request' || assessment.situation === 'refusal') {
                send({relayError:{code:'INPUT_REVIEW_REQUIRED'}})
                return close()
              }
            }
          } catch { return close() }
          outputChain = outputChain.then(async () => {
            outputQueued -= rawProvider.length
            if (abort.signal.aborted) return
            if (p.error || p.goAway) return close()
            if (p.setupComplete) {
              if (ready) return close()
              if (resumeContext) {
                if (!await allowed()) return close()
                forward({clientContent:{turns:resumeContext.turns.map(turn=>({role:turn.role,parts:[{text:turn.text}]})),turnComplete:false}})
                if (abort.signal.aborted) return
              }
              ready = true; clearTimeout(setupTimer); send({ setupComplete: { relayProtocolVersion: protocolVersion } })
              flushDirective(); return
            }
            const content = p.serverContent
            if (!content) return
            if (content.interrupted) return close()
            // Never forward Gemini inlineData or its original audio.
            if (typeof content.inputTranscription?.text === 'string') {
              const text = content.inputTranscription.text
              if (text.length > 4000) return close()
              send({ serverContent: { inputTranscription: { text } } })
            }
            if (!pending) return
            if (typeof content.outputTranscription?.text === 'string') output += content.outputTranscription.text
            if (output.length > 200) return close()
            if (!content.turnComplete) return
            clearTimeout(responseTimer); responseTimer = undefined
            if (!await allowed()) return close()
            let result: Awaited<ReturnType<typeof synthesizeValidated>>
            try { result = await (deps.synthesize ?? synthesizeValidated)(output.trim(), deps.geminiTts, abort.signal) }
            catch (error) {
              if (!abort.signal.aborted) {
                const code: VoiceFailureCode = error instanceof Error && error.message === 'OUTPUT_REJECTED' ? 'OUTPUT_REJECTED'
                  : error instanceof Error && error.message === 'GEMINI_TTS_RATE_LIMIT' ? 'SYNTHESIS_LIMIT'
                  : error instanceof Error && error.message === 'GEMINI_TTS_UNAVAILABLE' ? 'SYNTHESIS_UNAVAILABLE'
                  : error instanceof Error && error.name === 'TimeoutError' ? 'SYNTHESIS_TIMEOUT' : 'SYNTHESIS_FAILED'
                send({relayError:{code}})
              }
              return close()
            }
            if (!await allowed()) return close()
            // 원격 일시정지·종료를 알린 뒤에는 새 AI 음성을 어르신께 보내지 않는다.
            if (controlled) return
            if (protocolVersion >= 2) {
              awaitingPlayback = turns
              playbackTimer = setTimeout(close, 95000)
            }
            send({ ...(protocolVersion >= 2 ? { relayOutput: { turnId: turns } } : {}), serverContent: { outputTranscription: { text: result.text }, modelTurn: { parts: [{ inlineData: { data: result.pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] }, turnComplete: true } })
            output = ''; pending = false
          }).catch(close)
        })
        return
      }
      // The app's setup is acknowledged structurally but its prompt/model is ignored.
      if (msg.setup && !setupSeen) { setupSeen = true; return }
      if (msg.relayPlayback) {
        const receipt = msg.relayPlayback
        if (protocolVersion < 2 || !ready || pending || awaitingPlayback === null ||
            Object.keys(receipt).length !== 2 || receipt.turnId !== awaitingPlayback || receipt.result !== 'completed') return close()
        if (!await allowed()) return close()
        clearTimeout(playbackTimer); awaitingPlayback = null
        flushDirective()
        return
      }
      // 원격 일시정지·종료 알림 뒤의 입력은 조용히 버린다(앱이 스스로 연결을 닫는 중이다).
      if (controlled) return
      if (awaitingPlayback !== null) throw new Error('PLAYBACK_NOT_CONFIRMED')
      if (!ready || !setupSeen || !msg.realtimeInput || pending) throw new Error('INVALID_PHASE')
      const r = msg.realtimeInput
      if (Object.keys(r).length !== 1) throw new Error('INVALID_INPUT')
      if (r.activityStart && !activity) {
        flushDirective()
        activity = true; activityAudio = false; forward({ realtimeInput: { activityStart: {} } }); return
      }
      if (!activity) throw new Error('NO_ACTIVITY')
      if (r.audio) {
        if (r.audio.mimeType !== 'audio/pcm;rate=16000' || typeof r.audio.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.audio.data) || Buffer.from(r.audio.data, 'base64').length % 2) throw new Error('INVALID_AUDIO')
        activityAudio = true
        forward({ realtimeInput: { audio: { data: r.audio.data, mimeType: 'audio/pcm;rate=16000' } } }); return
      }
      if (typeof r.text === 'string' && r.text.trim() && r.text.length <= 4000) {
        if (!await allowed()) return close()
        forward({ realtimeInput: { text: r.text } }); return
      }
      if (r.activityEnd) {
        if (++turns > 60 || !await allowed()) return close()
        // 어르신 대답만 센다 — 첫 인사·이어가기 요청(텍스트만)은 단계 전환 근거가 아니다.
        if (activityAudio) phaseTurns++
        pending = true; activity = false; output = ''
        // Leave the remaining 15 seconds of the app's 60-second wait for synthesis.
        // Partial output never extends this deadline.
        responseTimer = setTimeout(() => {
          send({relayError:{code:'RESPONSE_TIMEOUT'}})
          close()
        }, 45000)
        forward({ realtimeInput: { activityEnd: {} } }); return
      }
      throw new Error('INVALID_INPUT')
    }).catch(close)
  })
  return close
}

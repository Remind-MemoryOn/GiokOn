import { randomUUID } from 'node:crypto'
import { WebSocket, type RawData } from 'ws'
import type { GeminiTtsConfig } from './output'
import { synthesizeValidated } from './output'
import { recordWithRetry, SAFETY_RETRY, type SafetyRetryPolicy } from './safety-record'
import { assessUtterance, buildPhaseDirective, ELDER_CLOSING_FAREWELL, parseVoiceResumeContext, relaySafetySummary, safetyEventDraftFor, SESSION_MAX_MINUTES, shouldAdvancePhase, type ElderClosingSituation, type RelaySafetySummary, type SafetyEventDraft, type SessionPhase, type VoiceFailureCode } from '@giokon/core'

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
  /**
   * 위험 발화를 **감지 즉시** safety_events 에 기록한다(파일럿 T21.4 — 감독 화면·푸시 알림의 선결).
   * 세션 시작자 권한(요양보호사 JWT)으로 쓴다 — 앱과 같은 RLS 경로. `eventId` 는 중계가 감지 때 만든 사건 id 다(T25.17):
   * 같은 id 로 다시 불려도 사건이 늘지 않고, 이미 있는 행이면 비어 있는 근거만 채운다(`safety-record.ts`).
   */
  recordSafety?(draft: SafetyEventDraft, eventId: string): Promise<void>
  /**
   * 어르신의 휴식 요청·거부로 마무리한다는 사실을 감독 화면에 남긴다(T21.11 — `record_elder_closing`, 세션당 한 번).
   * 원문은 보내지 않는다. 실패해도 마무리·종료는 그대로 진행한다.
   */
  recordElderClosing?(situation: ElderClosingSituation): Promise<void>
  release(): void
}

/** 원격 일시정지·종료를 앱에 알린 뒤 연결을 닫기까지의 유예(ms) — 제어 메시지가 닫힘보다 먼저 닿게. */
export const CONTROL_CLOSE_GRACE_MS = 2000
/**
 * 위험 발화 즉시 기록을 기다리는 상한(ms). 넘기면 확정을 기다리지 않고 멈춘다 — 사건 id(`pendingSafetyEventId`)만 앱에 주고
 * 기록 재시도는 연결을 닫은 뒤에도 뒤에서 계속한다(T25.17). 앱은 같은 id 로 대체 기록을 넣는다(없을 때만).
 */
export const SAFETY_RECORD_TIMEOUT_MS = 3000
/**
 * 세션 1회 상한(초) — 서버 경과 시간(`session_tick.elapsed_seconds`, DB `started_at` 기준 · 일시정지 포함)으로 판정한다(T21.12).
 * 연결 시각이 아니라 세션 시각이라 재연결·앱 재시작으로 초기화되지 않는다. 기관 설정으로 늘릴 수 없다(core 고정값).
 */
export const SESSION_LIMIT_SECONDS = SESSION_MAX_MINUTES * 60
/**
 * 상한에 닿았을 때 이미 시작된 AI 발화(생성·합성·재생)를 마저 들려주는 최대 시간(ms) — 말 중간에 끊지 않게(2026-10-03 사용자 확정).
 * 그동안 어르신의 새 발화는 받지 않는다. 지나면 재생 중이어도 종료를 알리고 닫는다.
 */
export const TIME_LIMIT_GRACE_MS = 30_000
/**
 * 휴식 요청·거부(T21.11) 뒤 마무리 인사 한 문장을 들려주고 재생 확인까지 기다리는 최대 시간(ms).
 * 어르신 말씀이 끝나고(activityEnd) 인사가 합성·재생되기까지의 여유 — 지나면 인사 없이도 종료를 알린다.
 */
export const ELDER_CLOSING_GRACE_MS = 45_000
/** 중계가 스스로 대화를 끝낼 때 앱에 함께 보내는 이유(`relayControl.reason` — 구버전 앱은 무시한다). */
export type RelayEndReason = 'time_limit' | 'elder_closing'
/** 안전 이벤트 발췌 길이 — 감지 창(여러 조각)의 끝부분을 남긴다(core 초안 규칙과 같은 120자). */
const SAFETY_EXCERPT_WINDOW = 120
export interface RelayDependencies {
  authorize(sessionId: string, accessToken: string): Promise<RelaySession>
  connectProvider(url: string): WebSocket
  synthesize?: typeof synthesizeValidated
  geminiTts: GeminiTtsConfig
  /** 위험 발화 기록 재시도 정책(테스트용 주입 — 기본 5회 · 2·4·8·16초). */
  safetyRetry?: SafetyRetryPolicy
  /** 사건 id 생성(테스트용 주입). */
  newSafetyEventId?: () => string
  /** 10분 상한 뒤 진행 중 AI 발화를 기다리는 최대 시간(테스트용 주입 — 기본 TIME_LIMIT_GRACE_MS). */
  timeLimitGraceMs?: number
  /** 휴식 요청·거부 뒤 마무리 인사를 기다리는 최대 시간(테스트용 주입 — 기본 ELDER_CLOSING_GRACE_MS). */
  elderClosingGraceMs?: number
  /** 원인 확인 로그(테스트용 주입 — 기본 `logRelayEvent`). */
  log?: RelayLog
}

/**
 * 원인 확인 로그 — 연결이 **어느 단계에서 왜** 끝났는지만 남긴다(Cloud Run 로그). 대화 내용·전사·음성·토큰·JWT 는 넣지 않는다.
 * 그전에는 실패가 전부 조용한 종료라 실기기에서 대화가 시작되지 않을 때 원인을 알 수 없었다(2026-10-15).
 */
export type RelayLog = (event: string, detail?: Record<string, string | number | undefined>) => void
export const logRelayEvent: RelayLog = (event, detail) => {
  console.warn(JSON.stringify({ voiceRelay: event, ...detail }))
}
/** 오류 → 로그용 코드. 코드 형태(`AUTH_FAILED`·`TOKEN_FAILED_403` 등)만 그대로 쓰고 나머지 문장은 버린다. */
export function relayErrorCode(error: unknown): string {
  if (error instanceof Error) {
    if (/^[A-Z][A-Z0-9_]{2,40}$/.test(error.message)) return error.message
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return error.name
    if (error instanceof SyntaxError) return 'INVALID_JSON'
  }
  return 'UNEXPECTED'
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
  let inputEndedAt = 0
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
  let activityText = ''
  let audioChunks = 0, audioBytes = 0, signalChunks = 0, inputTranscriptions = 0
  let zeroChunks = 0, maxRms = 0
  let reviewing = false                   // 위험 발화로 멈추는 중(기록 → 알림 → 닫기)
  // T21.12 — 세션 10분 상한: 새 발화는 받지 않고, 진행 중 AI 발화만 유예 안에서 마친 뒤 종료를 알린다.
  let timeUp = false
  let timeUpTimer: ReturnType<typeof setTimeout> | undefined
  // T21.11 — 어르신 요청 마무리: 다음 AI 응답 대신 고정 인사 한 문장 → 재생 확인 뒤 종료.
  let closingBy: ElderClosingSituation | null = null
  let farewellSent = false
  let closingTimer: ReturnType<typeof setTimeout> | undefined
  const openedAt = Date.now()
  const log = deps.log ?? logRelayEvent
  const setupTimer = setTimeout(() => close('SETUP_TIMEOUT'), 30000)
  // 안전 장치 — 판정은 서버 경과 시간(위)이 하고, 이 연결 수명은 그보다 길게만 둔다(서버 시각을 못 받는 경우 대비).
  const lifetime = setTimeout(() => close(), SESSION_LIMIT_SECONDS * 1000 + (deps.timeLimitGraceMs ?? TIME_LIMIT_GRACE_MS) + CONTROL_CLOSE_GRACE_MS)
  const poll = setInterval(() => { if (session) void allowed().then(ok => { if (!ok) close() }) }, 2000)

  function close(reason?: unknown) {
    if (abort.signal.aborted) return
    abort.abort()
    // 단계: 인증 전 → 모델 준비 전 → 대화 중. 이유가 없는 종료는 정상 종료·검사 실패(로그 없음 경로)다.
    log('closed', {
      stage: !authenticated ? 'auth' : !ready ? 'setup' : 'conversation',
      reason: reason === undefined ? 'unspecified' : typeof reason === 'string' ? reason : relayErrorCode(reason),
      turns,
      ...(ready ? { audioChunks, audioBytes, signalChunks, inputTranscriptions, zeroChunks, maxRms: Number(maxRms.toFixed(6)) } : {}),
    })
    clearTimeout(setupTimer); clearTimeout(lifetime); clearInterval(poll)
    clearTimeout(playbackTimer); clearTimeout(responseTimer); clearTimeout(timeUpTimer); clearTimeout(closingTimer)
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
    // T21.12 — 세션 경과(서버 시각)가 상한에 닿았다: 단계 진행·지시를 멈추고 마무리로 간다.
    if (timeUp) return
    if (typeof tick.elapsedSeconds === 'number' && tick.elapsedSeconds >= SESSION_LIMIT_SECONDS) {
      startTimeUp()
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
  /**
   * 위험 발화 → 멈춘다. 먼저 모델·앱으로의 전달을 끊고(controlled), 안전 이벤트를 즉시 기록한 뒤
   * 기록 id 를 오류 알림에 실어 보내고 닫는다. 앱은 그 id 로 같은 사건을 다시 기록하지 않는다
   * (id 를 모르는 구버전 앱은 알 수 없는 칸을 무시한다). 기록이 실패·지연돼도 멈춤은 늦추지 않는다(상한 3초).
   * 판정 요약(`safety` — 수준·분류·알림 종류, 원문 없음)도 함께 보내 현장 요양보호사 화면이 위기 종류별 안내를 띄운다(T25.14).
   */
  async function stopForReview(draft: SafetyEventDraft | null, summary: RelaySafetySummary | null) {
    if (reviewing || abort.signal.aborted) return
    reviewing = true
    controlled = true
    directive = null
    clearTimeout(responseTimer); clearTimeout(playbackTimer)
    // 사건 id 는 감지 때 만든다. 3초 안에 기록이 확정되면 safetyEventId(앱은 다시 기록하지 않는다),
    // 아니면 pendingSafetyEventId(앱은 같은 id 로 '없을 때만' 대체 기록 — 발췌 없음). 어느 쪽이든 사건은 1건이다.
    let safetyEventId: string | undefined, pendingSafetyEventId: string | undefined
    if (draft && session?.recordSafety) {
      const eventId = (deps.newSafetyEventId ?? randomUUID)()
      const record = session.recordSafety.bind(session)
      // 연결을 닫아도 재시도는 계속된다(원문은 이 클로저 메모리에만 — 로그에 남기지 않는다).
      const recording = recordWithRetry(() => record(draft, eventId), deps.safetyRetry ?? SAFETY_RETRY).then(ok => {
        if (!ok) console.warn('[voice-relay] safety evidence not stored after retries', { eventId, level: draft.level })
        return ok
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      const recorded = await Promise.race([
        recording,
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), SAFETY_RECORD_TIMEOUT_MS) }),
      ]).finally(() => clearTimeout(timer))
      if (recorded) safetyEventId = eventId
      else pendingSafetyEventId = eventId
    }
    send({ relayError: { code: 'INPUT_REVIEW_REQUIRED', ...(safetyEventId ? { safetyEventId } : {}),
      ...(pendingSafetyEventId ? { pendingSafetyEventId } : {}), ...(summary ? { safety: summary } : {}) } })
    close()
  }
  /**
   * 10분 상한(T21.12) — 이 순간부터 어르신의 새 발화는 모델로 보내지 않는다. 이미 시작된 AI 발화(생성·합성·재생 확인 대기)가
   * 있으면 유예(최대 30초) 안에서 마치기를 기다리고, 없거나 유예가 지나면 종료를 알린 뒤 닫는다.
   * 연결 시점에 이미 상한을 넘었으면(재연결·일시정지 중 경과) 모델 연결을 열지 않고 바로 끝낸다.
   */
  function startTimeUp() {
    if (timeUp || controlled || abort.signal.aborted) return
    timeUp = true
    directive = null
    timeUpTimer = setTimeout(() => finishWith('time_limit'), deps.timeLimitGraceMs ?? TIME_LIMIT_GRACE_MS)
    maybeFinish()
  }
  /**
   * 어르신의 휴식 요청·거부(T21.11 · 계획 §9-5) — 위기·급성 고통이 아니면 즉시 끊지 않는다. 지금 말씀에 대한 AI 응답을
   * 모델 생성문 대신 고정 인사 한 문장(core `ELDER_CLOSING_FAREWELL`)으로 들려주고, 재생 확인 뒤 종료를 알린다.
   * 감독 화면에는 원문 없이 마무리 이유만 남긴다. 응답할 차례가 없으면(이미 답을 보낸 뒤 늦게 온 전사) 인사 없이 마친다.
   */
  function startElderClosing(situation: ElderClosingSituation) {
    if (closingBy || controlled || abort.signal.aborted) return
    closingBy = situation
    directive = null
    void session?.recordElderClosing?.(situation).catch(() => {})
    void session?.advancePhase?.('closing').catch(() => false)  // 단계 기록만(지시는 넣지 않는다 — 고정 인사로 끝낸다)
    closingTimer = setTimeout(() => finishWith('elder_closing'), deps.elderClosingGraceMs ?? ELDER_CLOSING_GRACE_MS)
    if (!pending && !activity) farewellSent = true  // 답할 차례가 없다 — 지금 재생 중인 답(있으면)이 마지막이다
    maybeFinish()
  }
  /** 마칠 조건(10분 상한, 또는 마무리 인사를 보냄)이 섰고 진행 중인 AI 발화가 없으면 종료를 알린다. */
  function maybeFinish() {
    if (pending || awaitingPlayback !== null) return
    if (timeUp) finishWith('time_limit')
    else if (closingBy && farewellSent) finishWith('elder_closing')
  }
  function finishWith(reason: RelayEndReason) {
    if (controlled || abort.signal.aborted) return
    controlled = true
    clearTimeout(timeUpTimer); clearTimeout(closingTimer); clearTimeout(responseTimer); clearTimeout(playbackTimer)
    // 앱은 원격 종료와 같은 경로(멈추고 요양보호사가 저장)로 처리한다. reason 은 구버전 앱이 무시하는 추가 칸이다.
    send({ relayControl: { state: 'ended', reason } })
    setTimeout(close, CONTROL_CLOSE_GRACE_MS).unref()
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

  app.on('close', () => close('APP_CLOSED')); app.on('error', () => close('APP_ERROR'))
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
        if (a.protocolVersion !== undefined && ![2, 3, 4].includes(a.protocolVersion)) throw new Error('UNSUPPORTED_PROTOCOL')
        protocolVersion = a.protocolVersion ?? 1
        if (a.resumeContext !== undefined && protocolVersion < 3) throw new Error('UNSUPPORTED_RESTORATION')
        const resumeContext = a.resumeContext === undefined ? undefined : parseVoiceResumeContext(a.resumeContext)
        const acquired = await deps.authorize(a.sessionId, a.accessToken)
        if (abort.signal.aborted) { acquired.release(); return }
        session = acquired
        if (!await allowed()) throw new Error('DENIED')
        authenticated = true
        log('authorized', { protocolVersion })
        // 연결 시점에 이미 일시정지·종료 상태면 모델 연결을 열지 않는다(알림은 react 가 보냈고 곧 닫힌다).
        if (controlled) return
        upstream = deps.connectProvider(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(session.token)}`)
        // Gemini 가 연결을 거절·종료하면 이유를 남긴다(예: 키·모델·토큰 문제 — 내용 없는 상태 문구뿐).
        upstream.on('error', error => { log('provider_error', { message: (error instanceof Error ? error.message : String(error)).slice(0, 200) }); close('PROVIDER_ERROR') })
        upstream.on('close', (code: number, why: Buffer) => { log('provider_closed', { code, reason: why.toString().slice(0, 200) }); close('PROVIDER_CLOSED') })
        upstream.on('open', () => log('provider_open'))
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
              if (input) {
                if (++inputTranscriptions === 1) log('first_input_transcription')
              }
              // Transcription ordering is independent of output. Inspect immediately,
              // before the synthesis promise can hold up the normal output queue.
              // A bounded connection window also catches phrases split across frames.
              const combinedInput = safetyInput + input
              const assessment = assessUtterance(combinedInput)
              safetyInput = combinedInput.slice(-4000)
              // 위기·급성 고통(휴식 요청에 섞인 고통 신호 포함)은 지금처럼 즉시 멈춘다 — 약화하지 않는다.
              if (assessment.escalate || assessment.hasDistressSignal) {
                void stopForReview(safetyEventDraftFor(assessment, combinedInput.slice(-SAFETY_EXCERPT_WINDOW)), relaySafetySummary(assessment))
                return
              }
              // 휴식 요청·거부(T21.11) → 인사 한 문장 뒤 종료. 감지 창을 비워 같은 말씀이 다시 걸리지 않게 하고,
              // 인사를 보낸 뒤에 또 거부하시면 기다리지 않고 바로 마친다.
              if (assessment.situation === 'rest_request' || assessment.situation === 'refusal') {
                safetyInput = ''
                if (!closingBy) startElderClosing(assessment.situation)
                else if (farewellSent) finishWith('elder_closing')
              }
            }
          } catch { return close() }
          outputChain = outputChain.then(async () => {
            outputQueued -= rawProvider.length
            if (abort.signal.aborted) return
            if (p.error || p.goAway) {
              log('provider_message', { kind: p.error ? 'error' : 'goAway', status: typeof p.error?.status === 'string' ? p.error.status : undefined, message: typeof p.error?.message === 'string' ? p.error.message.slice(0, 200) : undefined })
              return close(p.error ? 'PROVIDER_ERROR_MESSAGE' : 'PROVIDER_GO_AWAY')
            }
            if (p.setupComplete) {
              if (ready) return close()
              if (resumeContext) {
                if (!await allowed()) return close()
                forward({clientContent:{turns:resumeContext.turns.map(turn=>({role:turn.role,parts:[{text:turn.text}]})),turnComplete:false}})
                if (abort.signal.aborted) return
              }
              ready = true; clearTimeout(setupTimer); send({ setupComplete: { relayProtocolVersion: protocolVersion } })
              log('ready')
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
            // 마무리 인사로 바꿀 응답은 모델 문장을 쓰지 않으므로 길이를 보지 않는다.
            if (output.length > 200 && !(closingBy && !farewellSent)) return close()
            if (!content.turnComplete) return
            const modelCompletedAt = Date.now()
            clearTimeout(responseTimer); responseTimer = undefined
            if (!await allowed()) return close()
            let result: Awaited<ReturnType<typeof synthesizeValidated>>
            // T21.11 — 마무리 중이면 모델 응답 대신 고정 인사 한 문장(출력 검열·TTS 는 똑같이 거친다).
            const farewell = closingBy !== null && !farewellSent
            const synthesisStartedAt = Date.now()
            try { result = await (deps.synthesize ?? synthesizeValidated)(farewell ? ELDER_CLOSING_FAREWELL : output.trim(), deps.geminiTts, abort.signal) }
            catch (error) {
              if (!abort.signal.aborted) {
                const code: VoiceFailureCode = error instanceof Error && error.message === 'OUTPUT_REJECTED' ? 'OUTPUT_REJECTED'
                  : error instanceof Error && error.message === 'GEMINI_TTS_RATE_LIMIT' ? 'SYNTHESIS_LIMIT'
                  : error instanceof Error && error.message === 'GEMINI_TTS_UNAVAILABLE' ? 'SYNTHESIS_UNAVAILABLE'
                  : error instanceof Error && error.name === 'TimeoutError' ? 'SYNTHESIS_TIMEOUT' : 'SYNTHESIS_FAILED'
                send({relayError:{code}})
                log('synthesis_failed', { code, cause: relayErrorCode(error) })
              }
              return close('SYNTHESIS_FAILED')
            }
            const synthesisEndedAt = Date.now()
            if (!await allowed()) return close()
            // 원격 일시정지·종료를 알린 뒤에는 새 AI 음성을 어르신께 보내지 않는다.
            if (controlled) return
            if (protocolVersion >= 2) {
              awaitingPlayback = turns
              playbackTimer = setTimeout(close, 95000)
            }
            send({ ...(protocolVersion >= 2 ? { relayOutput: { turnId: turns } } : {}), serverContent: { outputTranscription: { text: result.text }, modelTurn: { parts: [{ inlineData: { data: result.pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] }, turnComplete: true } })
            log('turn_latency', {turnId: turns, modelMs: modelCompletedAt - inputEndedAt,
              synthesisMs: synthesisEndedAt - synthesisStartedAt, totalMs: Date.now() - inputEndedAt})
            output = ''; pending = false
            if (farewell) farewellSent = true
            maybeFinish()  // v1 은 재생 확인이 없다 — 보낸 뒤 바로(v2+ 는 awaitingPlayback 이 남아 재생 확인을 기다린다)
          }).catch(close)
        })
        return
      }
      // The app's setup is acknowledged structurally but its prompt/model is ignored.
      if (msg.setup && !setupSeen) { setupSeen = true; return }
      if (msg.relayPlayback) {
        const receipt = msg.relayPlayback
        const interrupted = protocolVersion >= 4 && receipt.result === 'interrupted'
        if (protocolVersion < 2 || !ready || pending || awaitingPlayback === null ||
            Object.keys(receipt).length !== 2 || receipt.turnId !== awaitingPlayback || (receipt.result !== 'completed' && !interrupted)) return close()
        if (!await allowed()) return close()
        clearTimeout(playbackTimer); awaitingPlayback = null
        log('playback_receipt', {turnId: receipt.turnId, result: receipt.result})
        maybeFinish()
        if (interrupted && !controlled && !timeUp && !closingBy) {
          forward({clientContent:{turns:[{role:'user',parts:[{text:'(내부 지시) 직전 AI 음성의 재생이 중단되었습니다. 어르신이 끝까지 들었다고 가정하지 마세요. 이어지는 어르신 말씀부터 듣고 답하세요.'}]}],turnComplete:false}})
        }
        flushDirective()
        return
      }
      // 원격 일시정지·종료 알림 뒤의 입력은 조용히 버린다(앱이 스스로 연결을 닫는 중이다).
      // 10분 상한 뒤의 어르신 발화도 모델로 보내지 않는다(T21.12 — 진행 중 AI 발화만 마친다).
      if (controlled || timeUp) return
      if (awaitingPlayback !== null) throw new Error('PLAYBACK_NOT_CONFIRMED')
      if (!ready || !setupSeen || !msg.realtimeInput || pending) throw new Error('INVALID_PHASE')
      const r = msg.realtimeInput
      if (Object.keys(r).length !== 1) throw new Error('INVALID_INPUT')
      if (r.activityStart && !activity) {
        flushDirective()
        // 텍스트만 있는 첫 인사·이어가기에는 Gemini의 오디오 activity를 열지 않는다.
        // 음성 없는 activityEnd는 실제 Live API에서 1007로 종료된다.
        activity = true; activityAudio = false; activityText = ''; return
      }
      if (!activity) throw new Error('NO_ACTIVITY')
      if (r.audio) {
        if (r.audio.mimeType !== 'audio/pcm;rate=16000' || typeof r.audio.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.audio.data) || Buffer.from(r.audio.data, 'base64').length % 2) throw new Error('INVALID_AUDIO')
        if (!r.audio.data) throw new Error('INVALID_AUDIO')
        // 전달 여부와 무음 여부만 집계한다. PCM·발화·개별 음량은 로그에 남기지 않는다.
        const pcm = Buffer.from(r.audio.data, 'base64')
        if (++audioChunks === 1) log('first_audio', { bytes: pcm.length })
        audioBytes += pcm.length
        let energy = 0
        for (let offset = 0; offset < pcm.length; offset += 2) energy += (pcm.readInt16LE(offset) / 32768) ** 2
        const rms = Math.sqrt(energy / (pcm.length / 2))
        if (rms >= 0.015) signalChunks++
        if (energy === 0) zeroChunks++
        maxRms = Math.max(maxRms, rms)
        if (!activityAudio) {
          forward({ realtimeInput: { activityStart: {} } })
          if (activityText) forward({ realtimeInput: { text: activityText } })
          activityText = ''
        }
        activityAudio = true
        forward({ realtimeInput: { audio: { data: r.audio.data, mimeType: 'audio/pcm;rate=16000' } } }); return
      }
      if (typeof r.text === 'string' && r.text.trim() && r.text.length <= 4000) {
        if (!await allowed()) return close()
        if (activityAudio) forward({ realtimeInput: { text: r.text } })
        else {
          if (activityText.length + r.text.length > 4000) throw new Error('INVALID_INPUT')
          activityText += r.text
        }
        return
      }
      if (r.activityEnd) {
        if (!activityAudio && !activityText) throw new Error('EMPTY_ACTIVITY')
        if (++turns > 60 || !await allowed()) return close()
        // 어르신 대답만 센다 — 첫 인사·이어가기 요청(텍스트만)은 단계 전환 근거가 아니다.
        if (activityAudio) phaseTurns++
        pending = true; activity = false; output = ''
        inputEndedAt = Date.now()
        // Leave the remaining 15 seconds of the app's 60-second wait for synthesis.
        // Partial output never extends this deadline.
        responseTimer = setTimeout(() => {
          send({relayError:{code:'RESPONSE_TIMEOUT'}})
          close()
        }, 45000)
        if (activityAudio) forward({ realtimeInput: { activityEnd: {} } })
        else forward({ clientContent: { turns: [{ role: 'user', parts: [{ text: activityText }] }], turnComplete: true } })
        activityText = ''
        return
      }
      throw new Error('INVALID_INPUT')
    }).catch(close)
  })
  return close
}

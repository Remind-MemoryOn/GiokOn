// 음성 대화 엔진 — 중계 접속 → (전사 기반) 청취 → 확정 텍스트 턴 → 검증된 음성 재생.
//
// 경로는 **중계 단일**이다(계획 M1): 앱 ─▶ voice-relay ─▶ Gemini Live ─▶ 서버 검증 ─▶ Gemini TTS ─▶ 앱.
// 앱은 Gemini 토큰을 받지 않고 모델·시스템 지시도 정하지 않는다 — 중계가 서버에서 만든다.
// 직접 Gemini Live 경로·기기 TTS 폴백은 삭제했다(검열되지 않은 원본 오디오 경로).
//
// 앱의 세션 상태 머신과의 계약:
//   - listening 중 마이크 오디오가 중계로 전달되고, 전사가 발화 경계(InputEndpoint)에서
//     onDraftFinal 로 확정된다. 중단된 청취의 부분 전사는 onDraftInterrupted 로만 간다.
//   - 확정 텍스트를 submitUserTurn 으로 보내고 activityEnd 로 응답 생성을 요청한다.
//   - 어떤 단계든 실패하면 onError 로 알리고 연결을 닫는다. 조용한 폴백은 없다.

import { parseVoiceResumeContext, type VoiceResumeContext } from '@giokon/core';
import { getSession, canProcessSession } from '@giokon/data';
import { GeminiLiveClient, type LiveTurnResult, type RelayControlState, type RelayEndReason, type RelayReviewDetail, type VoiceRelayConnection } from './client';
import { hasMicPermission, micStreamingSupported, startMicStream } from './mic';
import { playPcmTurn, stopPlayback, type PlaybackResult } from './player';
import { InputEndpoint, pcmLevel } from './endpoint';
import { VOICE_RELAY_MISSING_MESSAGE, voiceRelayUrl } from './relay-config';

/** 중계 응답 대기 한도(오프너·턴·이어가기 공통). */
const RELAY_TURN_TIMEOUT_MS = 60000;

export interface LiveEngineCallbacks {
  /**
   * 청취가 끝났을 때의 전사 확정문 — 확인·수정 패널(pendingStt)로 넘어간다.
   * 스트리밍 중 중간 결과는 화면에 흘리지 않는다(반쪽 문장이 저장처럼 보이는 것 방지).
   */
  onDraftFinal: (text: string) => void;
  /** Interrupted capture, not a completed or automatically adopted utterance. */
  onDraftInterrupted?: (text: string) => void;
  onError?: (message: string) => void;
  onProcessingDenied?: () => void;
  /**
   * 감독 화면의 원격 일시정지·종료(파일럿 M5). 오류가 아니다 — 이 알림 뒤의 연결 실패·끊김은
   * onError 로 다시 알리지 않는다. 핸들러가 없으면 오류로 알리고 닫는다(조용히 멈추지 않게).
   */
  onRemoteControl?: (state: RelayControlState, reason?: RelayEndReason) => void;
  /** 중계가 위험 발화로 멈춘 사건의 기록 id(T21.4)·판정 요약(T25.14) — 같은 사건을 다시 기록하지 않고, 위기 종류별 안내를 띄우게. */
  onRelayReview?: (detail: RelayReviewDetail) => void;
}

export class LiveConversationEngine {
  private client: GeminiLiveClient | null = null;
  private micStop: { stop: () => void } | null = null;
  private listeningGeneration = 0;
  private draft = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private endpoint: InputEndpoint | null = null;
  private closing = false;
  private closeWork: Promise<void> | null = null;
  private failedStopDraft: string | null = null;
  private accessTimer: ReturnType<typeof setInterval> | null = null;
  private lastAccessCheck = 0;
  private remoteControl: RelayControlState | null = null;

  private denyProcessing(): void {
    if (this.closing) return;
    void this.close().catch(() => {});
    this.callbacks.onProcessingDenied?.();
  }

  private async verifyProcessing(): Promise<boolean> {
    if (this.closing) return false;
    const checkedAt = Date.now();
    try {
      if (await canProcessSession(this.sessionId) && Date.now() - checkedAt < 5000) {
        if (this.closing) return false;
        this.lastAccessCheck = checkedAt;
        return true;
      }
    } catch { /* An unverifiable permission is not permission to keep streaming. */ }
    this.denyProcessing();
    return false;
  }

  constructor(
    private callbacks: LiveEngineCallbacks,
    private readonly sessionId: string,
    private readonly resumeContext?: VoiceResumeContext,
  ) {}

  /** 화면 재마운트(로딩 인터스티셜 왕복)에 대비해 콜백을 갈아끼운다. */
  setCallbacks(callbacks: LiveEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 중계 접속. 실패(중계 주소 미설정·네트워크·네이티브 모듈 부재·권한 상실)하면
   * onError 로 알리고 false — 호출부는 세션을 멈춘다(폴백 경로 없음).
   */
  async start(): Promise<boolean> {
    if (!micStreamingSupported()) {
      this.callbacks.onError?.('마이크 네이티브 모듈이 필요해요. 개발 빌드에서 실행해 주세요.');
      return false;
    }
    const relayUrl = voiceRelayUrl();
    if (!relayUrl) {
      this.callbacks.onError?.(VOICE_RELAY_MISSING_MESSAGE);
      return false;
    }
    try {
      if (!await this.verifyProcessing()) return false;
      const session = await getSession();
      if (!session?.access_token) throw new Error('AUTH_REQUIRED');
      const relay: VoiceRelayConnection = { url: relayUrl, sessionId: this.sessionId, accessToken: session.access_token,
        playbackReceipts: true, ...(this.resumeContext ? {resumeContext:this.resumeContext} : {}) };
      if (!await this.verifyProcessing()) return false;
      this.client = this.makeClient(relay);
      await this.client.connect();
      if (!this.closing) this.accessTimer = setInterval(() => { void this.verifyProcessing(); }, 2000);
      return !this.closing;
    } catch (e) {
      this.client?.close();
      this.client = null;
      if (this.remoteControl) return false; // 원격 제어로 거부된 연결 — 이미 onRemoteControl 로 알렸다.
      this.callbacks.onError?.('음성 중계 연결을 확인해 주세요.');
      console.info('[giokon] 음성 중계 연결 실패', e);
      return false;
    }
  }

  private makeClient(relay: VoiceRelayConnection): GeminiLiveClient {
    return new GeminiLiveClient({
      onDraft: (text) => {
        if (this.closing || !this.micStop) return;
        // Live serverContent is incremental. Preserve segment spacing and repetition.
        // Do not turn a size limit into an apparently complete, truncated record.
        if (this.draft.length + text.length > 4000) {
          this.callbacks.onError?.('인식된 말씀의 길이가 한도를 넘었어요. 담당자가 확인해 주세요.');
          void this.close();
          return;
        }
        this.draft += text;
        this.endpoint?.transcript(performance.now());
      },
      onError: (e) => this.callbacks.onError?.(e instanceof Error ? e.message : String(e)),
      onRelayReview: (detail) => this.callbacks.onRelayReview?.(detail),
      onRemoteControl: (state, reason) => {
        if (this.closing || this.remoteControl) return;
        this.remoteControl = state;
        const handler = this.callbacks.onRemoteControl;
        if (handler) { if (reason) handler(state, reason); else handler(state); return; }
        // 핸들러 없는 호출부의 대체 안내 — 이유별 문구는 자동 대화(automatic.ts)가 맡는다. 중계가 끝낸 것을 감독 화면 탓으로 돌리지 않는다.
        this.callbacks.onError?.(state === 'paused' ? '감독 화면에서 대화를 잠시 멈췄어요.' : reason ? '음성 중계가 대화를 마쳤어요.' : '감독 화면에서 대화를 끝냈어요.');
        void this.close();
      },
      onClose: () => {
        this.client = null;
        if (this.closing) return;
        if (this.remoteControl) { void this.close(); return; }
        // 의도하지 않은 끊김 — 중계 연결은 재사용하지 않는다(서버가 턴·재생 상태를 소유).
        this.callbacks.onError?.('음성 중계가 종료됐어요. 기록을 저장한 뒤 다시 시작해 주세요.');
        void this.close();
      },
    }, relay);
  }

  get available(): boolean {
    return this.client !== null && this.client.isConnected;
  }

  /**
   * 모델에게 오프너를 요청한다. 내부 지시문은 대화 기록에 남지 않는다(우리가 로그하지 않음).
   * 실패 시 null — 호출부가 세션을 멈춘다.
   */
  async requestOpener(): Promise<LiveTurnResult | null> {
    if (!await this.verifyProcessing() || !this.available) return null;
    try {
      const r = await this.client!.sendUserTurn(
        '(내부 지시) 대화를 시작합니다. 지금 단계의 지시에 맞춰 첫 말씀을 건네주세요.',
        RELAY_TURN_TIMEOUT_MS,
      );
      if (!r || r === 'timeout') return null;
      return r;
    } catch (e) {
      console.warn('[giokon] live 오프너 실패', e);
      return null;
    }
  }

  /** Fresh connection already received only the selected restored history. */
  async requestContinuation(): Promise<LiveTurnResult | null> {
    if (!this.resumeContext || !await this.verifyProcessing() || !this.available) return null;
    try {
      const result = await this.client!.sendUserTurn(
        '(내부 지시) 잠시 멈췄던 회상 대화를 이어갑니다. 제공된 대화 이력만 참고하여 마지막 말씀에 이어 짧게 응답하고 질문 하나를 건네주세요. 이력이 없으면 첫 질문을 건네주세요. 중단 중의 말씀이나 개인 사실을 추측하지 마세요.', RELAY_TURN_TIMEOUT_MS);
      return result && result !== 'timeout' ? result : null;
    } catch { return null; }
  }

  /** 청취 시작 — 마이크 스트리밍 + 실시간 전사(onDraft). */
  async startListening(): Promise<void> {
    if (this.micStop) return;
    const generation = ++this.listeningGeneration;
    if (!await this.verifyProcessing() || generation !== this.listeningGeneration || !this.available || this.micStop || this.client?.playbackTurnId != null) return;
    let permitted = false;
    try { permitted = await hasMicPermission(); } catch { /* Native permission failures deny capture. */ }
    if (generation !== this.listeningGeneration || !this.available || this.micStop) return;
    if (!permitted) {
      void this.close();
      this.callbacks.onError?.('마이크 권한을 확인하지 못했어요. 기록을 저장하고 권한 설정을 확인해 주세요.');
      return;
    }
    if (Date.now() - this.lastAccessCheck >= 5000) { this.denyProcessing(); return; }
    if (this.client?.playbackTurnId != null) return;
    this.draft = '';
    this.endpoint = new InputEndpoint(performance.now());
    this.micStop = startMicStream({
      onData: (chunkB64) => {
        if (this.closing || generation !== this.listeningGeneration) return;
        if (Date.now() - this.lastAccessCheck >= 5000) { this.denyProcessing(); return; }
        try { this.endpoint?.audio(performance.now(), pcmLevel(chunkB64)); }
        catch {
          this.callbacks.onError?.('마이크 입력을 확인하지 못했어요. 대화를 회수해 주세요.');
          void this.close();
          return;
        }
        this.client?.streamAudioChunk(chunkB64);
      },
      onError: (e) => {
        if (this.closing || generation !== this.listeningGeneration) return;
        this.callbacks.onError?.(e instanceof Error ? e.message : String(e));
      },
    });
    this.pollEndpoint(generation);
  }

  /** 청취 종료 — 확정 전사를 콜백으로 넘기고 반환한다(빈 문자열 = 미인식). */
  stopListening(): string {
    this.listeningGeneration++;
    this.clearSilenceTimer();
    const microphone = this.micStop;
    this.micStop = null;
    const text = this.draft.trim();
    try { microphone?.stop(); }
    catch {
      this.failedStopDraft = text;
      void this.close();
      return ''; // Native failure is not a completed utterance.
    }
    if (microphone && !this.closing) this.callbacks.onDraftFinal(text);
    return text;
  }

  get isListening(): boolean {
    return this.micStop !== null;
  }

  /**
   * 확정 텍스트로 모델 턴을 진행한다. **재생은 하지 않고** 응답(텍스트+오디오 청크)을
   * 돌려준다 — 호출부(자동 대화 컨트롤러)가 speaking 상태와 재생을 조율한다.
   * 응답 지연은 `{ status: 'timeout' }` 으로 구분한다.
   */
  async submitUserTurn(
    finalText: string,
  ): Promise<{ status: 'ok'; text: string; chunksB64: string[] } | { status: 'timeout' } | null> {
    if (!await this.verifyProcessing() || !this.available) return null;
    const turn = await this.client!.sendUserTurn(finalText, RELAY_TURN_TIMEOUT_MS);
    if (turn === 'timeout') return { status: 'timeout' };
    return { status: 'ok', text: turn.text, chunksB64: turn.audioChunksB64 };
  }

  /** 턴 음성(base64 PCM 청크)을 재생하고 완료를 기다린다. */
  async playTurn(chunksB64: string[]): Promise<PlaybackResult> {
    if (!await this.verifyProcessing()) return 'interrupted';
    const client = this.client;
    const receipt = client?.playbackTurnId;
    try {
      const result = await playPcmTurn(chunksB64);
      if (this.closing || this.client !== client) return 'interrupted';
      if (result !== 'completed') {
        this.callbacks.onError?.('음성 재생이 중단됐어요. 담당자가 대화를 회수해 주세요.');
        await this.close();
      } else if (receipt != null) {
        client?.reportPlayback(receipt, result);
        if (!client?.isConnected) return 'interrupted';
      }
      return result;
    } catch (e) {
      console.warn('[giokon] 음성 재생 실패', e);
      this.callbacks.onError?.('AI 음성을 재생하지 못했어요.');
      await this.close();
      return 'interrupted';
    }
  }

  close(): Promise<void> {
    if (this.closeWork) return this.closeWork;
    let finish!: () => void;
    this.closeWork = new Promise(resolve => { finish = resolve; });
    this.closing = true; // 의도 종료 — onClose 에서 재접속 시도하지 않는다
    this.listeningGeneration++;
    if (this.accessTimer) clearInterval(this.accessTimer);
    this.accessTimer = null;
    this.clearSilenceTimer();
    const microphone = this.micStop;
    this.micStop = null;
    const client = this.client;
    this.client = null;
    let failed = this.failedStopDraft !== null;
    const interruptedDraft = this.failedStopDraft ?? (microphone ? this.draft.trim() : '');
    this.failedStopDraft = null;
    // Isolate cleanup failures so a native exception cannot retain a provider connection.
    try { client?.close(); } catch { failed = true; }
    try { microphone?.stop(); } catch { failed = true; }
    try {
      if (interruptedDraft) this.callbacks.onDraftInterrupted?.(interruptedDraft);
    } catch { failed = true; }
    void (async () => {
      try { await stopPlayback(); } catch { failed = true; }
      if (failed) {
        try { this.callbacks.onError?.('오디오 정리를 완료하지 못했어요. 앱의 마이크와 재생 상태를 확인해 주세요.'); }
        catch { /* Consumer errors must not strand cleanup callers. */ }
      }
      finish();
    })();
    return this.closeWork;
  }

  private clearSilenceTimer(): void {
    this.endpoint = null;
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private pollEndpoint(generation: number): void {
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.closing || generation !== this.listeningGeneration || !this.micStop || !this.endpoint) return;
      const result = this.endpoint.check(performance.now(), this.draft);
      if (result === 'limit') {
        // A forced cutoff is not a completed utterance; do not request an answer.
        this.callbacks.onError?.('한 번의 청취 시간이 길어져 대화를 멈췄어요. 담당자가 확인해 주세요.');
        void this.close();
      } else if (result) this.stopListening();
      else this.pollEndpoint(generation);
    }, 250);
  }
}

// ── 세션 스코프 싱글턴 ─────────────────────────────────────────────────────────
// 화면 재마운트 사이에도 WebSocket 연결·마이크 상태를 유지해야 한다.
// 세션 키(elderId+시작 시각)가 바뀌면 기존 연결을 닫고 새로 만든다.

let activeEngine: { key: string; engine: LiveConversationEngine } | null = null;
const connectingEngines = new Set<LiveConversationEngine>();
let engineGeneration = 0;

/** 음성 엔진을 확보한다(재사용 or 신규 접속). 미가용이면 null — 호출부가 세션을 멈춘다. */
export async function acquireLiveEngine(
  key: string,
  callbacks: LiveEngineCallbacks,
  sessionId: string | null,
  resumeContext?: VoiceResumeContext,
): Promise<LiveConversationEngine | null> {
  // DB 저장에 실패한 로컬 세션에는 유료 AI 토큰을 발급하지 않는다.
  if (!sessionId) return null;
  let context: VoiceResumeContext | undefined;
  if (resumeContext !== undefined) {
    try { context = parseVoiceResumeContext(resumeContext); } catch { return null; }
  }
  // Restored history belongs to a fresh provider connection, even for the same key.
  if (context || (activeEngine && activeEngine.key !== key)) {
    const closingGeneration = engineGeneration + 1;
    await closeLiveEngine();
    if (engineGeneration !== closingGeneration) return null;
  }
  if (activeEngine) {
    activeEngine.engine.setCallbacks(callbacks);
    return activeEngine.engine.available ? activeEngine.engine : null;
  }
  const engine = new LiveConversationEngine(callbacks, sessionId, context);
  const generation = engineGeneration;
  connectingEngines.add(engine);
  let ok: boolean;
  try { ok = await engine.start(); } finally { connectingEngines.delete(engine); }
  if (generation !== engineGeneration) {
    // Cancellation already owns cleanup. Acquisition must not wait on native teardown.
    void engine.close();
    return null;
  }
  if (!ok) {
    // 다음 세션 때 다시 시도할 수 있게 흔적을 남기지 않는다.
    await engine.close();
    return null;
  }
  activeEngine = { key, engine };
  return engine;
}

/** 대화 종료·이탈 시 연결을 닫는다(호출 안 해도 GC 전 close 콜백이 정리한다). */
export async function closeLiveEngine(): Promise<void> {
  engineGeneration++;
  const e = activeEngine?.engine;
  activeEngine = null;
  const pending = [...connectingEngines];
  connectingEngines.clear();
  await Promise.all([e?.close(), ...pending.map(engine => engine.close())]);
}

/** 현재 살아 있는 엔진(없으면 null). 화면 마운트 시 재부착 판단에 쓴다. */
export function peekLiveEngine(): LiveConversationEngine | null {
  return activeEngine?.engine ?? null;
}

// Live 대화 엔진 — 토큰 발급 → 접속 → (전사 기반) 청취 → 확정 텍스트 턴.
//
// 앱의 세션 상태 머신과의 계약:
//   - listening 중 마이크 오디오가 Live로 전달되고, 실시간 전사가 onDraft 로
//     흘러 요양보호사 확인·수정 패널(pendingStt)을 채운다.
//   - 확인 텍스트를 submitUserTurn으로 추가하고 activityEnd로 응답 생성을 요청한다.
//     같은 세션의 모델이 원래 오디오도 처리한다는 점을 전제로 한다.
//   - 어떤 단계든 실패하면 start() 가 false 를 반환해 호출부가 기존 파이프라인
//     (expo-speech TTS + 타자/모의 입력)으로 조용히 폴백한다.

import { parseVoiceResumeContext, type VoiceResumeContext, buildSystemPrompt, type ChronicleEntry, type ElderProfile, type SessionDesign } from '@giokon/core';
import { getSession, canProcessSession } from '@giokon/data';
import { GeminiLiveClient, type LiveTurnResult, type VoiceRelayConnection } from './client';
import { hasMicPermission, micStreamingSupported, startMicStream } from './mic';
import { playPcmTurn, stopPlayback, type PlaybackResult } from './player';
import { InputEndpoint, pcmLevel } from './endpoint';

const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';

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
}

/** ephemeral token 을 Edge Function(live-token)에서 받는다. */
async function fetchLiveToken(sessionId: string): Promise<{ token: string; model: string }> {
  const url = process.env.EXPO_PUBLIC_LIVE_TOKEN_URL?.trim() ||
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/live-token`;
  const session = await getSession();
  if (!session?.access_token) throw new Error('로그인 세션이 없어요.');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`live-token ${res.status}`);
  const json = (await res.json()) as { token?: string; model?: string };
  if (!json.token) throw new Error('live-token 응답에 token 이 없어요.');
  return { token: json.token, model: json.model ?? DEFAULT_MODEL };
}

export class LiveConversationEngine {
  private client: GeminiLiveClient | null = null;
  private micStop: { stop: () => void } | null = null;
  private listeningGeneration = 0;
  private draft = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private endpoint: InputEndpoint | null = null;
  // 재접속(resumption)용 캐시 — start() 때 채워진다.
  private lastToken = '';
  private model = '';
  private systemInstruction = '';
  private resumeHandle = '';
  private resumedOnce = false;
  private closing = false;
  private closeWork: Promise<void> | null = null;
  private failedStopDraft: string | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private accessTimer: ReturnType<typeof setInterval> | null = null;
  private lastAccessCheck = 0;
  private relay: VoiceRelayConnection | undefined;

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
    private readonly elder: ElderProfile,
    private readonly chronicles: ChronicleEntry[],
    private readonly design: SessionDesign | undefined,
    private callbacks: LiveEngineCallbacks,
    private readonly sessionId: string,
    private readonly resumeContext?: VoiceResumeContext,
  ) {}

  /** 화면 재마운트(로딩 인터스티셜 왕복)에 대비해 콜백을 갈아끼운다. */
  setCallbacks(callbacks: LiveEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 접속 + 시스템 지시 주입. 실패(키 미설정·네트워크·네이티브 모듈 부재)하면
   * false — 호출부는 기존 파이프라인으로 폴백한다.
   */
  async start(): Promise<boolean> {
    if (!micStreamingSupported()) {
      if (process.env.EXPO_PUBLIC_VOICE_RELAY_URL) this.callbacks.onError?.('마이크 네이티브 모듈이 필요해요. 개발 빌드에서 실행해 주세요.');
      return false;
    }
    try {
      if (!await this.verifyProcessing()) return false;
      const relayUrl = process.env.EXPO_PUBLIC_VOICE_RELAY_URL?.trim();
      let token = '', model = DEFAULT_MODEL;
      if (relayUrl) {
        const session = await getSession();
        if (!session?.access_token) throw new Error('AUTH_REQUIRED');
        this.relay = { url: relayUrl, sessionId: this.sessionId, accessToken: session.access_token, playbackReceipts: true, ...(this.resumeContext ? {resumeContext:this.resumeContext} : {}) };
      } else {
        ({ token, model } = await fetchLiveToken(this.sessionId));
      }
      if (!await this.verifyProcessing()) return false;
      this.lastToken = token;
      this.model = model;
      this.systemInstruction = buildSystemPrompt(this.elder, this.chronicles, this.design, 'speech');
      this.client = this.makeClient();
      await this.client.connect(token, this.systemInstruction);
      if (!this.closing) this.accessTimer = setInterval(() => { void this.verifyProcessing(); }, 2000);
      return !this.closing;
    } catch (e) {
      if (process.env.EXPO_PUBLIC_VOICE_RELAY_URL) this.callbacks.onError?.('음성 중계 연결을 확인해 주세요.');
      console.info('[giokon] live 미가용 — 기존 파이프라인으로 진행', e);
      this.client?.close();
      this.client = null;
      return false;
    }
  }

  /** 클라이언트 팩토리 — 최초 접속과 재접속(resume)이 같은 핸들러를 쓰도록 뽑아둔다. */
  private makeClient(): GeminiLiveClient {
    return new GeminiLiveClient(this.model, {
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
        if (this.endpoint) this.endpoint.transcript(performance.now());
        else this.armSilenceTimer();
      },
      onError: (e) => this.callbacks.onError?.(e instanceof Error ? e.message : String(e)),
      onResumption: (handle) => {
        // 세션 재개 핸들 보관 — 네트워크 끊김 시 같은 맥락으로 재접속한다.
        this.resumeHandle = handle;
      },
      onClose: () => {
        if (this.closing) {
          this.client = null;
          return;
        }
        // 의도하지 않은 끊김 → **1회 한정** 같은 대화로 재접속을 시도한다.
        this.client = null;
        if (this.relay) {
          this.callbacks.onError?.('음성 중계가 종료됐어요. 기록을 저장한 뒤 다시 시작해 주세요.');
          void this.close();
          return;
        }
        if (this.resumeHandle && !this.resumedOnce && this.lastToken) {
          this.resumedOnce = true;
          this.resumeTimer = setTimeout(() => void this.tryResume(), 1200);
        }
      },
    }, this.relay);
  }

  /** 재개 핸들로 재접속. 실패하면 폴백 파이프라인으로 자연 강하한다. */
  private async tryResume(): Promise<void> {
    this.resumeTimer = null;
    if (!await this.verifyProcessing()) return;
    try {
      const client = this.makeClient();
      await client.connect(this.lastToken, this.systemInstruction, this.resumeHandle);
      if (this.closing) { client.close(); return; }
      this.client = client;
      console.info('[giokon] live 세션 재개 성공');
    } catch (e) {
      console.warn('[giokon] live 재접속 실패 — 폴백으로 진행', e);
      this.client = null;
    }
  }

  get available(): boolean {
    return this.client !== null && this.client.isConnected;
  }

  /**
   * 모델에게 오프너를 요청한다. 내부 지시문은 대화 기록에 남지 않는다(우리가 로그하지 않음).
   * 실패 시 null — 호출부가 로컬 생성 오프너를 유지한다.
   */
  async requestOpener(): Promise<LiveTurnResult | null> {
    if (!await this.verifyProcessing() || !this.available) return null;
    try {
      const r = await this.client!.sendUserTurn(
        '(내부 지시) 오늘의 첫 인사와 함께 회상 대화의 첫 질문을 건네주세요.',
        this.relay ? 60000 : 20000,
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
    if (!this.resumeContext || !this.relay || !await this.verifyProcessing() || !this.available) return null;
    try {
      const result = await this.client!.sendUserTurn(
        '(내부 지시) 잠시 멈췄던 회상 대화를 이어갑니다. 제공된 대화 이력만 참고하여 마지막 말씀에 이어 짧게 응답하고 질문 하나를 건네주세요. 이력이 없으면 첫 질문을 건네주세요. 중단 중의 말씀이나 개인 사실을 추측하지 마세요.', 60000);
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
    this.micStop = startMicStream({
      onData: (chunkB64) => {
        if (this.closing || generation !== this.listeningGeneration) return;
        if (Date.now() - this.lastAccessCheck >= 5000) { this.denyProcessing(); return; }
        if (this.endpoint) {
          try { this.endpoint.audio(performance.now(), pcmLevel(chunkB64)); }
          catch {
            this.callbacks.onError?.('마이크 입력을 확인하지 못했어요. 대화를 회수해 주세요.');
            void this.close();
            return;
          }
        }
        this.client?.streamAudioChunk(chunkB64);
      },
      onError: (e) => {
        if (this.closing || generation !== this.listeningGeneration) return;
        this.callbacks.onError?.(e instanceof Error ? e.message : String(e));
      },
    });
    if (this.relay) {
      this.endpoint = new InputEndpoint(performance.now());
      this.pollEndpoint(generation);
    }
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
   * 돌려준다 — 호출부(talk 화면)가 네비게이션·speaking 상태와 재생을 조율한다.
   * 응답 지연은 `{ status: 'timeout' }` 으로 구분한다(조용한 폴백 방지 — talk 에서 안내).
   */
  async submitUserTurn(
    finalText: string,
  ): Promise<{ status: 'ok'; text: string; chunksB64: string[] } | { status: 'timeout' } | null> {
    if (!await this.verifyProcessing() || !this.available) return null;
    const turn = await this.client!.sendUserTurn(finalText, this.relay ? 60000 : 20000);
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
      if (this.relay) {
        if (result !== 'completed') {
          this.callbacks.onError?.('음성 재생이 중단됐어요. 담당자가 대화를 회수해 주세요.');
          await this.close();
        } else if (receipt != null) {
          client?.reportPlayback(receipt, result);
          if (!client?.isConnected) return 'interrupted';
        }
      }
      return result;
    } catch (e) {
      console.warn('[giokon] live 오디오 재생 실패 — 텍스트만 표시', e);
      if (this.relay) {
        this.callbacks.onError?.('CLOVA 음성을 재생하지 못했어요.');
        await this.close();
      }
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
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
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

  /** 발화 끝 감지 — 전사가 잠깐 멈추면 청취를 자동으로 마친다(어르신 호흡 길이 배려). */
  private armSilenceTimer(): void {
    this.clearSilenceTimer();
    if (!this.micStop) return;
    this.silenceTimer = setTimeout(() => {
      // 최소한의 말이 잡혔을 때만 자동 종료 — 무음 상태에서는 수동(두 번 누름) 대기.
      if (this.draft.trim().length >= 2) this.stopListening();
    }, 1600);
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
// talk ↔ loading 화면 왕복(컴포넌트 재마운트) 사이에도 WebSocket 연결·마이크 상태를
// 유지해야 한다. 세션 키(elderId+시작 시각)가 바뀌면 기존 연결을 닫고 새로 만든다.

let activeEngine: { key: string; engine: LiveConversationEngine } | null = null;
const connectingEngines = new Set<LiveConversationEngine>();
let engineGeneration = 0;

/** 라이브 엔진을 확보한다(재사용 or 신규 접속). 미가용이면 null — 폴백 경로로 간다. */
export async function acquireLiveEngine(
  key: string,
  elder: ElderProfile,
  chronicles: ChronicleEntry[],
  design: SessionDesign | undefined,
  callbacks: LiveEngineCallbacks,
  sessionId: string | null,
  resumeContext?: VoiceResumeContext,
): Promise<LiveConversationEngine | null> {
  // DB 저장에 실패한 로컬 세션에는 유료 AI 토큰을 발급하지 않는다.
  if (!sessionId) return null;
  let context: VoiceResumeContext | undefined;
  if (resumeContext !== undefined) {
    if (!process.env.EXPO_PUBLIC_VOICE_RELAY_URL?.trim()) return null;
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
  const engine = new LiveConversationEngine(elder, chronicles, design, callbacks, sessionId, context);
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
    // 폴백 모드에서도 다음 세션 때 다시 시도할 수 있게 흔적을 남기지 않는다.
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

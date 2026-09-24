// 음성 중계(voice-relay) WebSocket 클라이언트 — Gemini Live 프로토콜 모양을 중계 경유로 쓴다.
//
// 앱은 **중계에만** 접속한다(계획 M1 — 직접 Gemini Live 경로 삭제). 그래서:
//   - 모델·시스템 지시·생성 설정은 중계가 서버에서 정한다(`voice-relay/src/relay.ts`).
//     앱의 setup 프레임은 구조 확인용으로만 받고 내용은 무시되므로 **빈 setup** 을 보낸다 —
//     어르신 연대기로 만든 지시문을 앱이 네트워크로 보낼 이유가 없다.
//   - 인증은 첫 프레임(relayAuth)의 Supabase JWT 다. URL 에 토큰을 싣지 않는다.
//   - 턴 경계는 앱이 소유한다(activityStart/End). 서버는 오디오도 처리하므로
//     '확인 텍스트만 모델이 본다'고 가정하면 안 된다.
//   - 출력은 중계가 검증·Clova 합성한 것만 온다. v2 는 재생 영수증, v3 는 복구 맥락.

import { voiceFailureMessage, parseVoiceResumeContext, type VoiceResumeContext } from '@giokon/core';
import { parseVoiceRelayUrl } from './relay-config';

export type LiveTurnResult = {
  /** 모델 응답 전문(output transcription). */
  text: string;
  /** 응답 오디오 청크(base64 PCM 24k mono L16) — 순서대로 재생해야 한다. */
  audioChunksB64: string[];
};

export interface VoiceRelayConnection {
  url: string;
  sessionId: string;
  accessToken: string;
  playbackReceipts?: boolean;
  resumeContext?: VoiceResumeContext;
}

type Handlers = {
  onOpen?: () => void;
  /** Incremental input segment; the engine accumulates within one capture. */
  onDraft?: (text: string) => void;
  onError?: (e: unknown) => void;
  onClose?: () => void;
};

interface WsLike {
  send(data: string): void;
  close(): void;
}

/** 중계 준비(setupComplete) 대기 한도. */
const SETUP_TIMEOUT_MS = 30000;

async function frameText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    // RN Blob에는 text()가 없는 런타임도 있어 FileReader로 읽는다.
    if (typeof data.text === 'function') return data.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result) : reject(new Error('Live 응답을 읽을 수 없어요.'));
      reader.onerror = () => reject(new Error('Live 응답을 읽을 수 없어요.'));
      reader.readAsText(data);
    });
  }
  throw new Error('지원하지 않는 Live 응답 형식이에요.');
}

export class GeminiLiveClient {
  private ws: WsLike | null = null;
  private outputText = '';
  private audioChunks: string[] = [];
  private pendingTurn:
    | ((r: LiveTurnResult | 'timeout') => void)
    | null = null;
  private opened = false;
  private inputActivity = false;
  private cancelConnect: (() => void) | null = null;
  private awaitingPlayback: number | null = null;
  private lastOutputTurn = 0;

  constructor(
    private readonly handlers: Handlers,
    private readonly relay: VoiceRelayConnection,
  ) {}

  /** 중계에 접속해 인증·setup 을 보낸다. setupComplete 수신 시 resolve. */
  connect(): Promise<void> {
    if (this.ws) return Promise.reject(new Error('음성 연결이 이미 진행 중이에요.'));
    if (!parseVoiceRelayUrl(this.relay.url)) return Promise.reject(new Error('음성 중계의 올바른 WSS 주소가 필요해요.'));
    let resumeContext: VoiceResumeContext | undefined;
    try { if (this.relay.resumeContext) resumeContext = parseVoiceResumeContext(this.relay.resumeContext); }
    catch { return Promise.reject(new Error('대화 복구 이력을 확인하지 못했어요.')); }
    const protocolVersion = resumeContext ? 3 : this.relay.playbackReceipts ? 2 : 1;
    const ws = new WebSocket(this.relay.url);
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let incoming = Promise.resolve();
      const setupTimer = setTimeout(() => fail(new Error('음성 중계 연결 준비 시간이 초과됐어요.')), SETUP_TIMEOUT_MS);
      const fail = (e: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(setupTimer);
          this.cancelConnect = null;
          reject(e instanceof Error ? e : new Error(String(e)));
        }
        this.close();
      };
      this.cancelConnect = () => fail(new Error('Live 연결 준비가 취소됐어요.'));

      ws.onopen = () => {
        if (this.ws !== ws) return;
        try {
          ws.send(JSON.stringify({ relayAuth: { sessionId: this.relay.sessionId, accessToken: this.relay.accessToken,
            ...(protocolVersion >= 2 ? { protocolVersion } : {}), ...(resumeContext ? {resumeContext} : {}) } }));
          // 중계는 setup 의 존재만 확인하고 내용(모델·지시문)은 서버 값으로 대체한다.
          ws.send(JSON.stringify({ setup: {} }));
        } catch (e) { fail(e); }
      };
      ws.onmessage = (ev: WebSocketMessageEvent) => {
        if (this.ws !== ws) return;
        // Blob 디코딩이 늦어져도 전사/오디오/turnComplete의 도착 순서를 보존한다.
        incoming = incoming.then(async () => {
          const text = await frameText(ev.data);
          if (this.ws !== ws) return;
          const msg = JSON.parse(text) as Record<string, never>;
          if ('setupComplete' in msg && !settled) {
            if (protocolVersion >= 2 && (msg.setupComplete as { relayProtocolVersion?: number })?.relayProtocolVersion !== protocolVersion) throw new Error('음성 중계 서버 업데이트가 필요해요.');
            settled = true;
            clearTimeout(setupTimer);
            this.cancelConnect = null;
            this.opened = true;
            resolve();
            this.handlers.onOpen?.();
            return;
          }
          if ('serverContent' in msg) {
            if (protocolVersion >= 2 && (msg.serverContent as { turnComplete?: boolean })?.turnComplete) {
              const id = (msg as { relayOutput?: { turnId?: number } }).relayOutput?.turnId;
              if (!Number.isSafeInteger(id) || id! <= this.lastOutputTurn || !this.pendingTurn || this.awaitingPlayback !== null) throw new Error('음성 재생 순서를 확인하지 못했어요.');
              this.awaitingPlayback = id!;
              this.lastOutputTurn = id!;
            }
            this.handleServerContent(msg['serverContent'] as never);
          }
          if ('relayError' in msg) throw new Error(voiceFailureMessage((msg.relayError as {code?:unknown} | null)?.code));
          if ('error' in msg) throw new Error('음성 중계가 요청을 거부했어요.');
        }).catch((e: unknown) => {
          if (this.ws !== ws) return;
          this.handlers.onError?.(e);
          fail(e);
        });
        return incoming;
      };
      ws.onerror = () => {
        if (this.ws !== ws) return;
        const error = new Error('음성 중계 연결에 실패했어요.');
        this.handlers.onError?.(error);
        fail(error);
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        if (!settled) fail(new Error('음성 중계 연결이 일찍 닫혔어요.'));
        else {
          this.close();
          this.handlers.onClose?.();
        }
      };
    });
  }

  private handleServerContent(content: {
    interrupted?: boolean;
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
  }): void {
    if (content.interrupted) {
      // barge-in 없음(NO_INTERRUPTION)이지만 서버가 알려주면 조용히 무시한다.
      return;
    }
    const draft = content.inputTranscription?.text;
    if (draft) this.handlers.onDraft?.(draft);

    // 전사 중/취소된 턴에서 오는 임의 출력은 다음 요청 버퍼에 넣지 않는다.
    if (!this.pendingTurn) return;

    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) this.audioChunks.push(data);
    }
    const out = content.outputTranscription?.text;
    if (out) this.outputText += out;

    if (content.turnComplete) {
      const result: LiveTurnResult =
        this.audioChunks.length > 0 || this.outputText.length > 0
          ? { text: this.outputText.trim(), audioChunksB64: this.audioChunks }
          : { text: '', audioChunksB64: [] };
      this.outputText = '';
      this.audioChunks = [];
      const resolver = this.pendingTurn;
      this.pendingTurn = null;
      resolver?.(result);
    }
  }

  get isConnected(): boolean {
    return this.opened;
  }

  get playbackTurnId(): number | null { return this.awaitingPlayback; }

  /** App playback observation, not proof a person heard the output. */
  reportPlayback(turnId: number, result: 'completed' | 'interrupted' | 'empty'): void {
    if (!this.ws || !this.opened || this.awaitingPlayback !== turnId) return;
    if (result !== 'completed') { this.close(); return; }
    try {
      this.ws.send(JSON.stringify({ relayPlayback: { turnId, result } }));
      this.awaitingPlayback = null;
    } catch (error) { this.close(); this.handlers.onError?.(error); }
  }

  /** 어르신 발화 확정 텍스트를 모델에 넘기고 이번 턴 응답을 기다린다.
   *  응답 지연(타임아웃)은 예외가 아니라 **'timeout'** 으로 구분해 돌려준다. */
  async sendUserTurn(
    text: string,
    timeoutMs = 20000,
  ): Promise<LiveTurnResult | 'timeout'> {
    if (!this.ws || !this.opened) throw new Error('Live 세션이 연결돼 있지 않아요.');
    if (this.pendingTurn) throw new Error('이전 Live 응답을 기다리고 있어요.');
    if (this.awaitingPlayback !== null) throw new Error('이전 음성 재생 완료를 기다리고 있어요.');
    const result = await new Promise<LiveTurnResult | 'timeout'>((resolve) => {
      const finish = (value: LiveTurnResult | 'timeout') => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        if (this.pendingTurn === finish) {
          // 이전 응답이 다음 요청에 섞이지 않도록 시간초과 연결을 폐기한다.
          this.close();
          this.handlers.onError?.(new Error('Live 응답 시간이 초과됐어요.'));
        }
      }, timeoutMs);
      this.pendingTurn = finish;
      try {
        this.beginAudioInput();
        this.ws!.send(JSON.stringify({ realtimeInput: { text } }));
        this.ws!.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
        this.inputActivity = false;
      } catch (e) {
        this.close();
        this.handlers.onError?.(e);
      }
    });
    return result;
  }

  /**
   * 마이크 PCM 청크를 스트리밍한다. activityEnd는 확인된 텍스트와 함께 보낸다.
   */
  streamAudioChunk(base64Pcm16k: string): void {
    if (!this.ws || !this.opened || this.pendingTurn || this.awaitingPlayback !== null) return;
    try {
      this.beginAudioInput();
      this.ws.send(
        JSON.stringify({
          realtimeInput: { audio: { data: base64Pcm16k, mimeType: 'audio/pcm;rate=16000' } },
        }),
      );
    } catch (e) {
      this.handlers.onError?.(e);
    }
  }

  private beginAudioInput(): void {
    if (this.inputActivity) return;
    this.ws!.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
    this.inputActivity = true;
  }

  close(): void {
    const cancel = this.cancelConnect;
    this.cancelConnect = null;
    cancel?.();
    if (this.pendingTurn) {
      this.pendingTurn('timeout');
      this.pendingTurn = null;
    }
    const socket = this.ws;
    this.ws = null;
    try {
      socket?.close();
    } catch {
      /* 이미 닫힘 무시 */
    }
    this.opened = false;
    this.awaitingPlayback = null;
    this.lastOutputTurn = 0;
    this.inputActivity = false;
    this.outputText = '';
    this.audioChunks = [];
  }
}

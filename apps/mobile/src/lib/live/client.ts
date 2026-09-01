// Gemini Live API WebSocket 클라이언트(생 프로토콜).
//
// 설계 근거(gemini-3.1-flash-live-preview 제약 반영):
//   - proactive audio/affective dialog 필드는 **아예 보내면 안 된다**(연결 오류).
//   - 자동 VAD 를 끄고(activityHandling NO_INTERRUPTION), 턴 경계는 앱이 소유한다 —
//     요양보호사 확인·교정 흐름과 정합(모델이 먼저 끼어들지 않는다).
//   - 사용자 턴은 **확정·교정된 텍스트**만 realtime_input.text 로 넘긴다. 마이크 오디오는
//     실시간 전사(inputTranscription)를 얻는 용도로만 스트리밍하고 커밋하지 않는다
//     → DB 에 남은 텍스트와 모델이 본 텍스트가 항상 같다(감사 정합).
//   - 초기 맥락(persona+설계)은 system_instruction 로 주입한다(3.1 에서 항상 유지되는
//     경로 — 캐싱 미지원 대비).

export type LiveTurnResult = {
  /** 모델 응답 전문(output transcription). */
  text: string;
  /** 응답 오디오 청크(base64 PCM 24k mono L16) — 순서대로 재생해야 한다. */
  audioChunksB64: string[];
};

type Handlers = {
  onOpen?: () => void;
  onDraft?: (text: string) => void;
  onError?: (e: unknown) => void;
  onClose?: () => void;
  /** 세션 재개 핸들 수신 — 엔진이 보관해 끊김 시 재접속에 쓴다. */
  onResumption?: (handle: string) => void;
};

interface WsLike {
  send(data: string): void;
  close(): void;
}

const LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/v1beta/models';

export class GeminiLiveClient {
  private ws: WsLike | null = null;
  private outputText = '';
  private audioChunks: string[] = [];
  private pendingTurn:
    | ((r: LiveTurnResult | 'timeout') => void)
    | null = null;
  private opened = false;
  /** 서버가 내려준 세션 재개 핸들(재연결 시 setup 에 되돌려 준다). */
  private lastHandle = '';

  constructor(
    private readonly model: string,
    private readonly handlers: Handlers,
  ) {}

  /** ephemeral token 으로 접속해 setup 을 보낸다. setupComplete 수신 시 resolve.
   *  resumeHandle 을 주면 **같은 대화 맥락으로 재접속**한다(세션 재개). */
  connect(token: string, systemInstruction: string, resumeHandle?: string): Promise<void> {
    const url = `${LIVE_WS_BASE}/${this.model}:bidiGenerateContent?access_token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (e: unknown) => {
        if (!settled) {
          settled = true;
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };

      ws.onopen = () => {
        this.opened = true;
        this.handlers.onOpen?.();
        // ⚠️ 3.1 미지원 필드(proactivity 등)는 절대 포함하지 않는다.
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${this.model}`,
              system_instruction: { parts: [{ text: systemInstruction }] },
              response_modalities: ['AUDIO'],
              input_audio_transcription: {},
              output_audio_transcription: {},
              realtime_input_config: {
                automatic_activity_detection: { disabled: true },
                activity_handling: 'NO_INTERRUPTION',
              },
              session_resumption: resumeHandle ? { handle: resumeHandle } : {},
            },
          }),
        );
      };
      ws.onmessage = (ev: WebSocketMessageEvent) => {
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, never>;
          if ('setupComplete' in msg && !settled) {
            settled = true;
            resolve();
            return;
          }
          if ('serverContent' in msg) {
            this.handleServerContent(msg['serverContent'] as never);
          }
          if ('sessionResumptionUpdate' in msg) {
            const update = msg['sessionResumptionUpdate'] as { newHandle?: string; resumable?: boolean };
            if (update?.newHandle && update.resumable !== false) {
              this.lastHandle = update.newHandle;
              this.handlers.onResumption?.(update.newHandle);
            }
          }
          if ('goAway' in msg) {
            // 서버가 곧 연결을 닫는다 — 재개 핸들은 이미 보관 중이므로 에러 아님.
            console.info('[giokon] live: goAway 수신');
          }
        } catch (e) {
          this.handlers.onError?.(e);
        }
      };
      ws.onerror = () => fail(new Error('Live API 연결에 실패했어요.'));
      ws.onclose = () => {
        this.opened = false;
        if (!settled) fail(new Error('Live API 연결이 일찍 닫혔어요.'));
        else this.handlers.onClose?.();
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

  get resumptionHandle(): string {
    return this.lastHandle;
  }

  get isConnected(): boolean {
    return this.opened;
  }

  /** 어르신 발화 확정 텍스트를 모델에 넘기고 이번 턴 응답을 기다린다.
   *  응답 지연(타임아웃)은 예외가 아니라 **'timeout'** 으로 구분해 돌려준다. */
  async sendUserTurn(
    text: string,
    timeoutMs = 20000,
  ): Promise<LiveTurnResult | 'timeout'> {
    if (!this.ws || !this.opened) throw new Error('Live 세션이 연결돼 있지 않아요.');
    const result = await new Promise<LiveTurnResult | 'timeout'>((resolve) => {
      this.pendingTurn = resolve;
      try {
        this.ws!.send(JSON.stringify({ realtime_input: { text } }));
      } catch (e) {
        this.pendingTurn = null;
        resolve('timeout');
        this.handlers.onError?.(e);
        return;
      }
      setTimeout(() => {
        if (this.pendingTurn === resolve) {
          this.pendingTurn = null;
          resolve('timeout');
        }
      }, timeoutMs);
    });
    return result;
  }

  /**
   * 마이크 PCM 청크를 스트리밍한다 — **전사 목적 전용**(커밋하지 않는다).
   * automaticActivityDetection 이 꺼져 있어 이 오디오만으로는 모델이 반응하지 않는다.
   */
  streamAudioChunk(base64Pcm16k: string): void {
    if (!this.ws || !this.opened) return;
    try {
      this.ws.send(
        JSON.stringify({
          realtime_input: { audio: { data: base64Pcm16k, mime_type: 'audio/pcm;rate=16000' } },
        }),
      );
    } catch (e) {
      this.handlers.onError?.(e);
    }
  }

  close(): void {
    if (this.pendingTurn) {
      this.pendingTurn('timeout');
      this.pendingTurn = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* 이미 닫힘 무시 */
    }
    this.ws = null;
    this.opened = false;
  }
}

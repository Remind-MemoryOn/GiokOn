// Live 대화 엔진 — 토큰 발급 → 접속 → (전사 기반) 청취 → 확정 텍스트 턴.
//
// 앱의 세션 상태 머신과의 계약:
//   - listening 중 마이크 오디오는 전사용으로만 스트리밍되고, 실시간 전사가 onDraft 로
//     흘러 요양보호사 확인·수정 패널(pendingStt)을 채운다.
//   - 확정 텍스트만 submitUserTurn 으로 모델에 넘긴다 → 응답(텍스트+음성)을 돌려준다.
//   - 어떤 단계든 실패하면 start() 가 false 를 반환해 호출부가 기존 파이프라인
//     (expo-speech TTS + 타자/모의 입력)으로 조용히 폴백한다.

import { buildSystemPrompt, type ChronicleEntry, type ElderProfile, type SessionDesign } from '@giokon/core';
import { getSession } from '@giokon/data';
import { GeminiLiveClient, type LiveTurnResult } from './client';
import { micStreamingSupported, startMicStream } from './mic';
import { playPcmTurn, stopPlayback } from './player';
import { isSupabaseConfigured } from '../supabase';

const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';

export interface LiveEngineCallbacks {
  /**
   * 청취가 끝났을 때의 전사 확정문 — 확인·수정 패널(pendingStt)로 넘어간다.
   * 스트리밍 중 중간 결과는 화면에 흘리지 않는다(반쪽 문장이 저장처럼 보이는 것 방지).
   */
  onDraftFinal: (text: string) => void;
  onError?: (message: string) => void;
}

/** ephemeral token 을 Edge Function(live-token)에서 받는다. */
async function fetchLiveToken(): Promise<{ token: string; model: string }> {
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
    body: '{}',
  });
  if (!res.ok) throw new Error(`live-token ${res.status}`);
  const json = (await res.json()) as { token?: string; model?: string };
  if (!json.token) throw new Error('live-token 응답에 token 이 없어요.');
  return { token: json.token, model: json.model ?? DEFAULT_MODEL };
}

export class LiveConversationEngine {
  private client: GeminiLiveClient | null = null;
  private micStop: { stop: () => void } | null = null;
  private draft = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly elder: ElderProfile,
    private readonly chronicles: ChronicleEntry[],
    private readonly design: SessionDesign | undefined,
    private callbacks: LiveEngineCallbacks,
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
    if (!isSupabaseConfigured || !micStreamingSupported()) return false;
    try {
      const { token, model } = await fetchLiveToken();
      this.client = new GeminiLiveClient(model, {
        onDraft: (text) => {
          // 서버 전사 스냅샷을 누적만 한다 — 확정은 stopListening 시점에 한 번.
          this.draft = text;
          this.armSilenceTimer();
        },
        onError: (e) => this.callbacks.onError?.(e instanceof Error ? e.message : String(e)),
        onClose: () => {
          this.client = null;
        },
      });
      await this.client.connect(
        token,
        buildSystemPrompt(this.elder, this.chronicles, this.design),
      );
      return true;
    } catch (e) {
      console.info('[giokon] live 미가용 — 기존 파이프라인으로 진행', e);
      this.client = null;
      return false;
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
    if (!this.available) return null;
    try {
      return await this.client!.sendUserTurn('(내부 지시) 오늘의 첫 인사와 함께 회상 대화의 첫 질문을 건네주세요.', 20000);
    } catch (e) {
      console.warn('[giokon] live 오프너 실패', e);
      return null;
    }
  }

  /** 청취 시작 — 마이크 스트리밍 + 실시간 전사(onDraft). */
  startListening(): void {
    if (!this.available || this.micStop) return;
    this.draft = '';
    this.micStop = startMicStream({
      onData: (chunkB64) => this.client?.streamAudioChunk(chunkB64),
      onError: (e) => this.callbacks.onError?.(e instanceof Error ? e.message : String(e)),
    });
  }

  /** 청취 종료 — 확정 전사를 콜백으로 넘기고 반환한다(빈 문자열 = 미인식). */
  stopListening(): string {
    this.clearSilenceTimer();
    this.micStop?.stop();
    this.micStop = null;
    const text = this.draft.trim();
    this.callbacks.onDraftFinal(text);
    return text;
  }

  get isListening(): boolean {
    return this.micStop !== null;
  }

  /**
   * 확정 텍스트로 모델 턴을 진행한다. **재생은 하지 않고** 응답(텍스트+오디오 청크)을
   * 돌려준다 — 호출부(talk 화면)가 네비게이션·speaking 상태와 재생을 조율한다.
   */
  async submitUserTurn(
    finalText: string,
  ): Promise<{ text: string; chunksB64: string[] } | null> {
    if (!this.available) return null;
    const turn = await this.client!.sendUserTurn(finalText);
    if (!turn) return null;
    return { text: turn.text, chunksB64: turn.audioChunksB64 };
  }

  /** 턴 음성(base64 PCM 청크)을 재생하고 완료를 기다린다. */
  async playTurn(chunksB64: string[]): Promise<void> {
    if (chunksB64.length === 0) return;
    try {
      await playPcmTurn(chunksB64);
    } catch (e) {
      console.warn('[giokon] live 오디오 재생 실패 — 텍스트만 표시', e);
    }
  }

  async close(): Promise<void> {
    this.clearSilenceTimer();
    this.micStop?.stop();
    this.micStop = null;
    await stopPlayback();
    this.client?.close();
    this.client = null;
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
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}

// ── 세션 스코프 싱글턴 ─────────────────────────────────────────────────────────
// talk ↔ loading 화면 왕복(컴포넌트 재마운트) 사이에도 WebSocket 연결·마이크 상태를
// 유지해야 한다. 세션 키(elderId+시작 시각)가 바뀌면 기존 연결을 닫고 새로 만든다.

let activeEngine: { key: string; engine: LiveConversationEngine } | null = null;

/** 라이브 엔진을 확보한다(재사용 or 신규 접속). 미가용이면 null — 폴백 경로로 간다. */
export async function acquireLiveEngine(
  key: string,
  elder: ElderProfile,
  chronicles: ChronicleEntry[],
  design: SessionDesign | undefined,
  callbacks: LiveEngineCallbacks,
): Promise<LiveConversationEngine | null> {
  if (activeEngine && activeEngine.key !== key) {
    await closeLiveEngine();
  }
  if (activeEngine) {
    activeEngine.engine.setCallbacks(callbacks);
    return activeEngine.engine.available ? activeEngine.engine : null;
  }
  const engine = new LiveConversationEngine(elder, chronicles, design, callbacks);
  const ok = await engine.start();
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
  const e = activeEngine?.engine;
  activeEngine = null;
  await e?.close();
}

/** 현재 살아 있는 엔진(없으면 null). 화면 마운트 시 재부착 판단에 쓴다. */
export function peekLiveEngine(): LiveConversationEngine | null {
  return activeEngine?.engine ?? null;
}

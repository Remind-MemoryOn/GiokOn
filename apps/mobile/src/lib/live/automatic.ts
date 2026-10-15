import { ELDER_CLOSING_FAREWELL, SESSION_MAX_MINUTES, safeVoiceFailureMessage } from '@giokon/core';
import type { RelayEndReason } from './client';
/** 감독 화면의 원격 제어(파일럿 M5) — 중계 알림(`relayControl`)과 서버 판정(`session_tick`) 공통 값. */
export type RemoteControlState = 'running' | 'paused' | 'ended' | 'denied';
/** 원격 일시정지 중 서버 상태를 다시 보는 간격 — 요구사항 "원격 재개가 2초 안에 반영". */
export const REMOTE_CONTROL_POLL_MS = 2000;
export const REMOTE_PAUSE_REASON = '감독 화면에서 대화를 잠시 멈췄어요. 감독 화면에서 재개하면 자동으로 이어져요.';
export const REMOTE_END_REASON = '감독 화면에서 대화를 끝냈어요. 기록을 저장해 주세요.';
export const REMOTE_DENIED_REASON = '대화를 이어갈 수 없는 상태예요. 기록을 저장해 주세요.';
/** 중계가 스스로 끝낸 대화의 안내(T21.11·T21.12) — 감독 화면이 끝낸 것처럼 보이지 않게 이유별로 알린다. */
export const RELAY_END_REASONS: Record<RelayEndReason, string> = {
  time_limit: `대화 시간 ${SESSION_MAX_MINUTES}분이 다 되어 마쳤어요. 기록을 저장해 주세요.`,
  elder_closing: '어르신이 쉬고 싶어 하셔서 인사를 드리고 마쳤어요. 기록을 저장해 주세요.',
  other: '음성 중계가 대화를 마쳤어요. 기록을 저장해 주세요.',
};
/** 중계의 종료 알림 문구 — 이유가 없으면 감독 화면의 원격 종료다. */
export function relayEndMessage(reason?: RelayEndReason): string {
  return reason ? RELAY_END_REASONS[reason] : REMOTE_END_REASON;
}
export type AutomaticPhase = 'idle' | 'starting' | 'processing' | 'speaking' | 'listening' | 'pausing' | 'paused' | 'stopped';
export interface AutomaticEngine {
  requestContinuation?(): Promise<{ text: string; audioChunksB64: string[] } | null>;
  requestOpener(): Promise<{ text: string; audioChunksB64: string[] } | null>;
  submitUserTurn(text: string): Promise<{ status: 'ok'; text: string; chunksB64: string[] } | { status: 'timeout' } | null>;
  playTurn(chunks: string[]): Promise<'completed' | 'interrupted' | 'empty'>;
  startListening(): Promise<void>;
  readonly isListening: boolean;
  close(): Promise<void>;
}
export interface AutomaticPorts {
  current(): boolean;
  ready(resuming: boolean): Promise<boolean>;
  resume?(engine: AutomaticEngine): Promise<'listen' | {text: string; audioChunksB64: string[]} | null>;
  connect(onInput: (text: string) => void, onFailure: (message?: string) => void, resuming: boolean,
    onRemote?: (state: 'paused' | 'ended', reason?: RelayEndReason) => void): Promise<AutomaticEngine | null>;
  /** 멈춘 동안 서버의 원격 제어 상태를 읽는다(`session_tick`). 없으면 원격 재개·종료를 감지하지 않는다. */
  control?(): Promise<RemoteControlState>;
  cancelPending(): Promise<void>;
  input(text: string): 'continue' | 'closing' | 'help';
  output(text: string, opener: boolean): boolean;
  playback(result: 'completed' | 'interrupted' | 'empty'): void;
  save(): Promise<boolean>;
  /** remote = 감독 화면의 원격 일시정지로 멈춰 있다(현장 재개 불가 — 사용자 확정 2026-09-24). */
  status(phase: AutomaticPhase, reason?: string, remote?: boolean): void;
}
export class AutomaticConversation {
  private generation = 0;
  private phase: AutomaticPhase = 'idle';
  private engine: AutomaticEngine | null = null;
  private closing: Promise<void> | null = null;
  /** 원격 일시정지로 멈춤 — 서버가 재개를 알릴 때까지 현장 재개를 막는다. */
  private remoteHeld = false;
  /** A plain rest/refusal allows only the relay farewell, with no next capture or resumption. */
  private closingForElder = false;
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private ports: AutomaticPorts) {}
  private alive(generation: number): boolean { return generation === this.generation && !['stopped','pausing','paused'].includes(this.phase) && this.ports.current(); }
  private status(phase: AutomaticPhase, reason?: string): void {
    this.phase = phase;
    if (this.ports.current()) {
      if (this.remoteHeld) this.ports.status(phase, reason, true);
      else this.ports.status(phase, reason);
    }
    if (phase === 'paused') this.watch();
  }
  get remotePaused(): boolean { return this.remoteHeld; }
  /** 멈춘 동안 서버의 원격 제어 상태를 2초마다 본다 — 원격 재개면 이어가고, 원격 종료면 멈춘다. */
  private watch(): void {
    if (!this.ports.control || this.watchTimer) return;
    const generation = this.generation;
    const tick = async (): Promise<void> => {
      this.watchTimer = null;
      if (generation !== this.generation || this.phase !== 'paused' || !this.ports.current()) return;
      let state: RemoteControlState | null = null;
      try { state = await this.ports.control!(); } catch { /* 확인 실패는 상태를 바꾸지 않는다 — 다음 폴에 다시 본다. */ }
      if (generation !== this.generation || this.phase !== 'paused' || !this.ports.current()) return;
      if (state === 'ended') return void this.stop(REMOTE_END_REASON);
      if (state === 'denied') return void this.stop(REMOTE_DENIED_REASON);
      if (state === 'running' && this.remoteHeld) {
        this.remoteHeld = false;
        return void this.resume();
      }
      if (state === 'paused' && !this.remoteHeld) {
        // 현장에서 멈춘 사이 감독 화면도 멈췄다 — 현장 재개를 막고 안내를 바꾼다.
        this.remoteHeld = true;
        this.ports.status('paused', REMOTE_PAUSE_REASON, true);
      }
      this.watchTimer = setTimeout(() => void tick(), REMOTE_CONTROL_POLL_MS);
    };
    this.watchTimer = setTimeout(() => void tick(), REMOTE_CONTROL_POLL_MS);
  }
  private unwatch(): void {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = null;
  }
  /** 중계의 원격 제어 알림 — 해당 연결 세대에서만 받는다. */
  private remote(state: 'paused' | 'ended', generation: number, reason?: RelayEndReason): void {
    if (generation !== this.generation || this.phase === 'stopped') return;
    if (state === 'ended') { void this.stop(relayEndMessage(reason)); return; }
    this.remoteHeld = true;
    void this.pause();
  }
  async start(): Promise<void> {
    if (this.phase !== 'idle') return;
    await this.begin(false);
  }
  async resume(): Promise<void> {
    if (this.phase !== 'paused' || !this.ports.resume || this.remoteHeld || this.closingForElder) return;
    this.unwatch();
    this.closing = null;
    await this.begin(true);
  }
  private async begin(resuming: boolean): Promise<void> {
    const generation = ++this.generation;
    this.status('starting');
    try {
      const ready = await this.ports.ready(resuming);
      if (!this.alive(generation)) return;
      if (!ready) {
        if (resuming) { this.status('paused', '입력 확인과 저장 상태를 확인한 뒤 다시 재개해 주세요.'); return; }
        return await this.stop('마이크 권한과 자동 대화 저장 준비를 확인해 주세요.');
      }
      if (!this.alive(generation)) return;
      const engine = await this.ports.connect(text => { void this.receive(text, generation); }, message => { if (this.alive(generation)) void this.stop(safeVoiceFailureMessage(message)); }, resuming,
        (state, reason) => this.remote(state, generation, reason));
      if (!this.alive(generation)) { await engine?.close(); return; }
      this.engine = engine;
      if (!engine) throw new Error('connection');
      if (resuming) {
        const restored = await this.ports.resume!(engine);
        if (!this.alive(generation)) return;
        if (!restored) throw new Error('restoration');
        if (restored === 'listen') await this.listen(generation);
        else await this.deliver(restored.text, restored.audioChunksB64, false, generation);
        return;
      }
      const opener = await engine.requestOpener();
      if (!this.alive(generation)) return;
      if (!opener) throw new Error('opener');
      await this.deliver(opener.text, opener.audioChunksB64, true, generation);
    } catch { if (this.alive(generation)) await this.stop('대화를 시작하지 못했어요. 연결을 확인하고 기록을 저장해 주세요.'); }
  }
  private async receive(text: string, generation: number): Promise<void> {
    if (!this.alive(generation) || this.phase !== 'listening') return;
    this.status('processing'); // Synchronous fence against duplicate input callbacks.
    try {
      if (!text.trim()) return await this.stop('말씀을 확인하지 못했어요. 담당자가 확인해 주세요.');
      const action = this.ports.input(text);
      if (action === 'closing') this.closingForElder = true;
      if (!await this.ports.save()) throw new Error('save');
      if (!this.alive(generation)) return;
      if (action === 'help') return await this.stop('담당자의 확인이 필요해요. 대화를 회수해 주세요.');
      const response = await this.engine!.submitUserTurn(text);
      if (!this.alive(generation)) return;
      if (!response || response.status !== 'ok') throw new Error('response');
      if (this.closingForElder && response.text !== ELDER_CLOSING_FAREWELL) throw new Error('closing response');
      await this.deliver(response.text, response.chunksB64, false, generation);
    } catch { if (this.alive(generation)) await this.stop('응답이나 기록 저장을 완료하지 못했어요. 기록을 확인하고 저장해 주세요.'); }
  }
  private async deliver(text: string, chunks: string[], opener: boolean, generation: number): Promise<void> {
    if (!this.alive(generation)) return;
    if (!text.trim() || !chunks.length || !this.ports.output(text, opener)) throw new Error('output');
    if (!await this.ports.save()) throw new Error('save');
    if (!this.alive(generation)) return;
    this.status('speaking');
    const result = await this.engine!.playTurn(chunks);
    if (generation === this.generation && this.ports.current()) this.ports.playback(result);
    if (!this.alive(generation)) return;
    if (result !== 'completed') throw new Error('playback');
    // The engine has sent the playback receipt. Wait for relayControl ended;
    // reopening the microphone would violate the elder's request to finish.
    if (this.closingForElder) return;
    await this.listen(generation);
  }
  private async listen(generation: number): Promise<void> {
    if (!this.alive(generation)) return;
    this.status('listening');
    await this.engine!.startListening();
    if (this.alive(generation) && !this.engine!.isListening) throw new Error('microphone');
  }
  async pause(): Promise<void> {
    if (this.closingForElder) return this.stop();
    if (['idle','pausing','paused','stopped'].includes(this.phase)) return;
    ++this.generation;
    this.status('pausing');
    try {
      await this.cleanup();
      if (this.phase === 'pausing') this.status('paused', this.remoteHeld ? REMOTE_PAUSE_REASON : undefined);
    } catch { await this.stop('음성 중지를 확인하지 못했어요. 기록을 저장해 주세요.'); }
  }
  private cleanup(): Promise<void> {
    if (!this.closing) this.closing = Promise.all([this.engine?.close(), this.ports.cancelPending()]).then(() => {});
    return this.closing;
  }
  async stop(reason?: string): Promise<void> {
    this.unwatch();
    this.remoteHeld = false;
    // 시작 전(idle)에는 멈출 대화가 없다 — 'stopped' 로 바꾸면 이후 start() 가 영영 무시된다.
    // (2026-10-15 실기기: 마이크 권한 창·화면 꺼짐으로 앱이 잠깐 백그라운드가 되며 시작 전에 멈춰, 대화가 시작되지 않았다.)
    if (this.phase === 'idle') return;
    if (this.phase === 'stopped') { await this.cleanup().catch(() => {}); return; }
    this.status('stopped', reason);
    // Cancel a connecting singleton too; never wait for provider work to finish.
    await this.cleanup().catch(() => {});
  }
}

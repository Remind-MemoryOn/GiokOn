export type AutomaticPhase = 'idle' | 'starting' | 'processing' | 'speaking' | 'listening' | 'pausing' | 'paused' | 'stopped';
export interface AutomaticEngine {
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
  connect(onInput: (text: string) => void, onFailure: () => void, resuming: boolean): Promise<AutomaticEngine | null>;
  cancelPending(): Promise<void>;
  input(text: string): 'continue' | 'help';
  output(text: string, opener: boolean): boolean;
  playback(result: 'completed' | 'interrupted' | 'empty'): void;
  save(): Promise<boolean>;
  status(phase: AutomaticPhase, reason?: string): void;
}
export class AutomaticConversation {
  private generation = 0;
  private phase: AutomaticPhase = 'idle';
  private engine: AutomaticEngine | null = null;
  private closing: Promise<void> | null = null;
  constructor(private ports: AutomaticPorts) {}
  private alive(generation: number): boolean { return generation === this.generation && !['stopped','pausing','paused'].includes(this.phase) && this.ports.current(); }
  private status(phase: AutomaticPhase, reason?: string): void {
    this.phase = phase;
    if (this.ports.current()) this.ports.status(phase, reason);
  }
  async start(): Promise<void> {
    if (this.phase !== 'idle') return;
    await this.begin(false);
  }
  async resume(): Promise<void> {
    if (this.phase !== 'paused' || !this.ports.resume) return;
    this.closing = null;
    await this.begin(true);
  }
  private async begin(resuming: boolean): Promise<void> {
    const generation = ++this.generation;
    this.status('starting');
    try {
      const ready = await this.ports.ready(resuming);
      if (!this.alive(generation)) return;
      if (!ready) return await this.stop('마이크 권한과 자동 대화 저장 준비를 확인해 주세요.');
      if (!this.alive(generation)) return;
      const engine = await this.ports.connect(text => { void this.receive(text, generation); }, () => { if (this.alive(generation)) void this.stop('음성 연결이 중단됐어요. 기록을 저장해 주세요.'); }, resuming);
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
      if (!await this.ports.save()) throw new Error('save');
      if (!this.alive(generation)) return;
      if (action === 'help') return await this.stop('담당자의 확인이 필요해요. 대화를 회수해 주세요.');
      const response = await this.engine!.submitUserTurn(text);
      if (!this.alive(generation)) return;
      if (!response || response.status !== 'ok') throw new Error('response');
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
    await this.listen(generation);
  }
  private async listen(generation: number): Promise<void> {
    if (!this.alive(generation)) return;
    this.status('listening');
    await this.engine!.startListening();
    if (this.alive(generation) && !this.engine!.isListening) throw new Error('microphone');
  }
  async pause(): Promise<void> {
    if (['idle','pausing','paused','stopped'].includes(this.phase)) return;
    ++this.generation;
    this.status('pausing');
    try {
      await this.cleanup();
      if (this.phase === 'pausing') this.status('paused');
    } catch { await this.stop('음성 중지를 확인하지 못했어요. 기록을 저장해 주세요.'); }
  }
  private cleanup(): Promise<void> {
    if (!this.closing) this.closing = Promise.all([this.engine?.close(), this.ports.cancelPending()]).then(() => {});
    return this.closing;
  }
  async stop(reason?: string): Promise<void> {
    if (this.phase === 'stopped') { await this.cleanup().catch(() => {}); return; }
    this.status('stopped', reason);
    // Cancel a connecting singleton too; never wait for provider work to finish.
    await this.cleanup().catch(() => {});
  }
}

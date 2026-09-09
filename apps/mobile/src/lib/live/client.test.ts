import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiLiveClient } from './client';

class Socket {
  static all: Socket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void | Promise<void>;
  onerror?: () => void;
  onclose?: () => void;
  sent: unknown[] = [];
  send = vi.fn((data: string) => { this.sent.push(JSON.parse(data)); });
  close = vi.fn(() => this.onclose?.());
  constructor(readonly url: string) { Socket.all.push(this); }
  receive(data: unknown) { return this.onmessage?.({ data: JSON.stringify(data) }); }
}

describe('Live WebSocket 프로토콜 및 턴 격리', () => {
  beforeEach(() => { Socket.all = []; vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function connected() {
    const onError = vi.fn();
    const client = new GeminiLiveClient('test-model', { onError });
    const connecting = client.connect('auth_tokens/synthetic', '합성 시스템 지시');
    const socket = Socket.all[0];
    socket.onopen!(); socket.receive({ setupComplete: {} });
    await connecting;
    return { client, socket, onError };
  }

  it('단기 토큰 endpoint·setup 구조가 맞고 setupComplete 전에는 입력하지 않는다', async () => {
    const client = new GeminiLiveClient('models/test-model', {});
    const connecting = client.connect('auth_tokens/synthetic', 'system', 'resume-handle');
    const socket = Socket.all[0];
    expect(socket.url).toBe('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Fsynthetic');
    socket.onopen!();
    expect(client.isConnected).toBe(false);
    await expect(client.sendUserTurn('early')).rejects.toThrow('연결돼');
    expect(socket.sent).toEqual([{ setup: {
      model: 'models/test-model', systemInstruction: { parts: [{ text: 'system' }] },
      generationConfig: { responseModalities: ['AUDIO'] }, inputAudioTranscription: {}, outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { disabled: true }, activityHandling: 'NO_INTERRUPTION' },
      sessionResumption: { handle: 'resume-handle' },
    } }]);
    socket.receive({ setupComplete: {} }); await connecting;
    expect(client.isConnected).toBe(true);
    await socket.receive({ sessionResumptionUpdate: { newHandle: 'next-handle', resumable: true } });
    expect(client.resumptionHandle).toBe('next-handle');
    client.close();
  });

  it('오디오→확인 텍스트→activityEnd 순서 후 응답을 조립한다', async () => {
    const { client, socket } = await connected();
    client.streamAudioChunk('PCM');
    const pending = client.sendUserTurn('확인한 문장');
    expect(socket.sent.slice(1)).toEqual([
      { realtimeInput: { activityStart: {} } },
      { realtimeInput: { audio: { data: 'PCM', mimeType: 'audio/pcm;rate=16000' } } },
      { realtimeInput: { text: '확인한 문장' } },
      { realtimeInput: { activityEnd: {} } },
    ]);
    socket.receive({ serverContent: { outputTranscription: { text: '첫 ' }, modelTurn: { parts: [{ inlineData: { data: 'A' } }] } } });
    socket.receive({ serverContent: { outputTranscription: { text: '질문' }, turnComplete: true } });
    await expect(pending).resolves.toEqual({ text: '첫 질문', audioChunksB64: ['A'] });
    expect(vi.getTimerCount()).toBe(0);
    client.close();
  });

  it('동시 요청을 거부하고 타임아웃된 소켓의 늦은 응답을 새 턴에 넣지 않는다', async () => {
    const { client, socket } = await connected();
    const first = client.sendUserTurn('A', 20);
    await expect(client.sendUserTurn('B')).rejects.toThrow('기다리고');
    await vi.advanceTimersByTimeAsync(20);
    await expect(first).resolves.toBe('timeout');
    expect(socket.close).toHaveBeenCalled();
    expect(client.isConnected).toBe(false);
    const reconnecting = client.connect('auth_tokens/new', 'system');
    const nextSocket = Socket.all[1];
    nextSocket.onopen!(); nextSocket.receive({ setupComplete: {} }); await reconnecting;
    const second = client.sendUserTurn('B');
    socket.receive({ serverContent: { outputTranscription: { text: 'late A' }, turnComplete: true } });
    nextSocket.receive({ serverContent: { outputTranscription: { text: 'B result' }, turnComplete: true } });
    await expect(second).resolves.toEqual({ text: 'B result', audioChunksB64: [] });
    client.close();
  });

  it('setup 무응답은 연결 timeout으로 종료한다', async () => {
    const client = new GeminiLiveClient('model', {});
    const pending = client.connect('auth_tokens/test', 'system');
    const rejection = expect(pending).rejects.toThrow('초과');
    Socket.all[0].onopen!();
    await vi.advanceTimersByTimeAsync(10000);
    await rejection;
    expect(Socket.all[0].close).toHaveBeenCalled();
    expect(client.isConnected).toBe(false);
  });

  it('Blob/ArrayBuffer 응답도 순서를 지켜 처리한다', async () => {
    const { client, socket } = await connected();
    const pending = client.sendUserTurn('합성 입력');
    void socket.onmessage!({ data: new Blob([JSON.stringify({ serverContent: { outputTranscription: { text: '음성 결과' } } })]) });
    void socket.onmessage!({ data: new TextEncoder().encode(JSON.stringify({ serverContent: { turnComplete: true } })).buffer });
    await expect(pending).resolves.toEqual({ text: '음성 결과', audioChunksB64: [] });
    client.close();
  });

  it.each(['close', 'error', 'invalid'] as const)('%s 실패가 대기 중인 턴을 끝낸다', async (kind) => {
    const { client, socket } = await connected();
    const pending = client.sendUserTurn('A');
    if (kind === 'close') socket.onclose!();
    if (kind === 'error') socket.onerror!();
    if (kind === 'invalid') socket.onmessage!({ data: 'not-json' });
    await expect(pending).resolves.toBe('timeout');
    expect(client.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

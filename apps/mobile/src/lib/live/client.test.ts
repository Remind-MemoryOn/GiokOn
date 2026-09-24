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

const RELAY = { url: 'wss://voice.example.test/voice', sessionId: 'session', accessToken: 'synthetic' };

describe('중계 WebSocket 프로토콜 및 턴 격리', () => {
  beforeEach(() => { Socket.all = []; vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function connected() {
    const onError = vi.fn();
    const client = new GeminiLiveClient({ onError }, RELAY);
    const connecting = client.connect();
    const socket = Socket.all[0];
    socket.onopen!(); socket.receive({ setupComplete: {} });
    await connecting;
    return { client, socket, onError };
  }

  it.each([['SYNTHESIS_LIMIT','요청이 많아'],['unexpected private detail','음성 연결이 중단']])('maps relay failure %s to local copy and settles the pending turn',async(code,message)=>{
    const onError=vi.fn();
    const client=new GeminiLiveClient({onError},{url:'wss://voice.example.test/voice',sessionId:'session',accessToken:'synthetic'});
    const connected=client.connect(); const socket=Socket.all[0];socket.onopen!();
    await socket.receive({setupComplete:{}});await connected;
    const reply=client.sendUserTurn('테스트');
    await socket.receive({relayError:{code,message:'untrusted server text'}});
    expect(onError.mock.calls[0]?.[0].message).toContain(message);
    expect(onError.mock.calls[0]?.[0].message).not.toContain('untrusted');
    expect(client.isConnected).toBe(false);expect(await reply).toBe('timeout');
  });
  it('relay mode sends Supabase auth in the first frame, never the URL or a Gemini token', async () => {
    const client = new GeminiLiveClient({}, { url: 'wss://voice.example.test/voice', sessionId: 'session', accessToken: 'synthetic-jwt' });
    const pending = client.connect();
    const socket = Socket.all[0];
    expect(socket.url).toBe('wss://voice.example.test/voice');
    socket.onopen!();
    expect(socket.sent[0]).toEqual({ relayAuth: { sessionId: 'session', accessToken: 'synthetic-jwt' } });
    // 중계가 모델·지시문을 서버 값으로 정한다 — 앱은 어르신 정보가 담긴 지시문을 보내지 않는다.
    expect(socket.sent[1]).toEqual({ setup: {} });
    socket.receive({ setupComplete: {} }); await pending;
    client.close();
  });

  it('refuses insecure relay URLs', async () => {
    const client = new GeminiLiveClient({}, { url: 'ws://remote.example.test/voice', sessionId: 'session', accessToken: 'synthetic' });
    await expect(client.connect()).rejects.toThrow();
    expect(Socket.all).toHaveLength(0);
  });

  it('requires v3 when sending a restoration context and refuses a v2 acknowledgement',async()=>{
    const resumeContext={version:1 as const,turns:[{role:'user' as const,text:'채택한 입력'}]};
    const client=new GeminiLiveClient({}, {url:'wss://voice.example.test/voice',sessionId:'session',accessToken:'synthetic',resumeContext});
    const connecting=client.connect();const failed=expect(connecting).rejects.toThrow();
    const socket=Socket.all[0];socket.onopen!();
    expect(socket.sent[0]).toEqual({relayAuth:{sessionId:'session',accessToken:'synthetic',protocolVersion:3,resumeContext}});
    await socket.receive({setupComplete:{relayProtocolVersion:2}});await failed;
    expect(client.isConnected).toBe(false);
  });
  it('v3 keeps the playback gate after successful restoration negotiation',async()=>{
    const client=new GeminiLiveClient({}, {url:'wss://voice.example.test/voice',sessionId:'session',accessToken:'synthetic',
      resumeContext:{version:1,turns:[{role:'user',text:'이전 답변'}]}});
    const connecting=client.connect(); const socket=Socket.all[0];socket.onopen!();
    await socket.receive({setupComplete:{relayProtocolVersion:3}});await connecting;
    const reply=client.sendUserTurn('이어서 질문해 주세요.');
    await socket.receive({relayOutput:{turnId:1},serverContent:{outputTranscription:{text:'다음 질문'},turnComplete:true}});await reply;
    await expect(client.sendUserTurn('아직 재생 전')).rejects.toThrow();
    client.reportPlayback(1,'completed');expect(client.playbackTurnId).toBeNull();client.close();
  });

  it('negotiates playback receipts and blocks a new turn until completion', async () => {
    const client = new GeminiLiveClient({}, { url: 'wss://voice.example.test/voice', sessionId: 'session', accessToken: 'synthetic', playbackReceipts: true });
    const connecting = client.connect(); const socket = Socket.all[0]; socket.onopen!();
    expect(socket.sent[0]).toEqual({ relayAuth: { sessionId: 'session', accessToken: 'synthetic', protocolVersion: 2 } });
    await socket.receive({ setupComplete: { relayProtocolVersion: 2 } }); await connecting;
    const turn = client.sendUserTurn('test');
    await socket.receive({ relayOutput: { turnId: 1 }, serverContent: { outputTranscription: { text: '질문' }, modelTurn: { parts: [{ inlineData: { data: 'PCM' } }] }, turnComplete: true } });
    await turn;
    expect(client.playbackTurnId).toBe(1);
    await expect(client.sendUserTurn('too early')).rejects.toThrow();
    client.reportPlayback(1, 'completed');
    expect(socket.sent.at(-1)).toEqual({ relayPlayback: { turnId: 1, result: 'completed' } });
    const next = client.sendUserTurn('next'); client.close(); await next;
  });

  it('refuses an old relay when playback receipts were requested', async () => {
    const client = new GeminiLiveClient({}, { url: 'wss://voice.example.test/voice', sessionId: 'session', accessToken: 'synthetic', playbackReceipts: true });
    const connecting = client.connect(); const rejected = expect(connecting).rejects.toThrow();
    Socket.all[0].onopen!(); await Socket.all[0].receive({ setupComplete: {} }); await rejected;
    expect(client.isConnected).toBe(false);
  });

  it('closes interrupted playback without sending a completion receipt or more input', async () => {
    const client = new GeminiLiveClient({}, { url: 'wss://voice.example.test/voice', sessionId: 'session', accessToken: 'synthetic', playbackReceipts: true });
    const connecting = client.connect(); const socket = Socket.all[0]; socket.onopen!();
    await socket.receive({ setupComplete: { relayProtocolVersion: 2 } }); await connecting;
    const turn = client.sendUserTurn('test');
    await socket.receive({ relayOutput: { turnId: 1 }, serverContent: { outputTranscription: { text: '질문' }, turnComplete: true } }); await turn;
    client.reportPlayback(1, 'interrupted');
    expect(client.isConnected).toBe(false);
    expect(socket.sent.some(frame => 'relayPlayback' in (frame as object))).toBe(false);
    await expect(client.sendUserTurn('next')).rejects.toThrow();
  });

  it('setupComplete 전에는 입력하지 않는다', async () => {
    const client = new GeminiLiveClient({}, RELAY);
    const connecting = client.connect();
    const socket = Socket.all[0];
    socket.onopen!();
    expect(client.isConnected).toBe(false);
    await expect(client.sendUserTurn('early')).rejects.toThrow('연결돼');
    expect(socket.sent).toEqual([{ relayAuth: { sessionId: 'session', accessToken: 'synthetic' } }, { setup: {} }]);
    socket.receive({ setupComplete: {} }); await connecting;
    expect(client.isConnected).toBe(true);
    client.close();
  });

  it('오디오→확인 텍스트→activityEnd 순서 후 응답을 조립한다', async () => {
    const { client, socket } = await connected();
    client.streamAudioChunk('PCM');
    const pending = client.sendUserTurn('확인한 문장');
    expect(socket.sent.slice(2)).toEqual([
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
    const reconnecting = client.connect();
    const nextSocket = Socket.all[1];
    nextSocket.onopen!(); nextSocket.receive({ setupComplete: {} }); await reconnecting;
    const second = client.sendUserTurn('B');
    socket.receive({ serverContent: { outputTranscription: { text: 'late A' }, turnComplete: true } });
    nextSocket.receive({ serverContent: { outputTranscription: { text: 'B result' }, turnComplete: true } });
    await expect(second).resolves.toEqual({ text: 'B result', audioChunksB64: [] });
    client.close();
  });

  it('setup 무응답은 연결 timeout으로 종료한다', async () => {
    const client = new GeminiLiveClient({}, RELAY);
    const pending = client.connect();
    const rejection = expect(pending).rejects.toThrow('초과');
    Socket.all[0].onopen!();
    await vi.advanceTimersByTimeAsync(29999);
    expect(client.isConnected).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
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

  describe('감독 화면 원격 제어(파일럿 M5)', () => {
    it.each(['paused', 'ended'] as const)('%s 알림을 원격 제어로 넘기고 대기 중인 턴을 끝낸 뒤 입력을 막는다', async state => {
      const onRemoteControl = vi.fn(), onError = vi.fn(), onClose = vi.fn();
      const client = new GeminiLiveClient({ onRemoteControl, onError, onClose }, RELAY);
      const connecting = client.connect(); const socket = Socket.all[0];
      socket.onopen!(); await socket.receive({ setupComplete: {} }); await connecting;
      const reply = client.sendUserTurn('말씀');
      await socket.receive({ relayControl: { state } });
      expect(onRemoteControl).toHaveBeenCalledWith(state);
      expect(await reply).toBe('timeout');
      expect(client.isConnected).toBe(false);
      // 원격 제어는 오류·예상 밖 끊김이 아니다 — 엔진이 "중계가 종료됐어요"를 띄우지 않게.
      expect(onError).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
      const sent = socket.sent.length;
      client.streamAudioChunk('AAAA');
      expect(socket.sent).toHaveLength(sent);
    });
    it('준비 전(인증 시점에 이미 정지)에 온 알림도 원격 제어로 알리고 연결을 거부한다', async () => {
      const onRemoteControl = vi.fn(), onError = vi.fn();
      const client = new GeminiLiveClient({ onRemoteControl, onError }, RELAY);
      const connecting = client.connect(); const failed = expect(connecting).rejects.toThrow();
      const socket = Socket.all[0]; socket.onopen!();
      await socket.receive({ relayControl: { state: 'paused' } });
      await failed;
      expect(onRemoteControl).toHaveBeenCalledWith('paused');
      expect(onError).not.toHaveBeenCalled();
    });
    it.each([{ state: 'resume' }, {}, null])('모르는 제어 신호 %o 는 오류로 닫는다', async control => {
      const { client, socket, onError } = await connected();
      await socket.receive({ relayControl: control });
      expect(onError).toHaveBeenCalled(); expect(client.isConnected).toBe(false);
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomaticConversation, RELAY_END_REASONS, REMOTE_CONTROL_POLL_MS, REMOTE_END_REASON, REMOTE_PAUSE_REASON, type AutomaticPorts, type RemoteControlState } from './automatic';
import type { RelayEndReason } from './client';

function fixture() {
  let onInput!: (text: string) => void;
  let onRemote: ((state: 'paused' | 'ended', reason?: RelayEndReason) => void) | undefined;
  const events: string[] = [];
  const engine = { requestOpener: vi.fn(async () => ({text:'질문',audioChunksB64:['pcm']})),
    submitUserTurn: vi.fn(async () => ({status:'ok' as const,text:'다음 질문',chunksB64:['pcm']})),
    playTurn: vi.fn(async () => {events.push('play'); return 'completed' as 'completed'|'interrupted'|'empty';}),
    startListening: vi.fn(async () => {events.push('listen');}), isListening: true, close: vi.fn(async()=>{}) };
  const ports: AutomaticPorts = { current:()=>true, ready:vi.fn(async()=>true),
    connect:vi.fn(async (cb,_failure,_resuming,remote)=>{onInput=cb; onRemote=remote; return engine;}), cancelPending:vi.fn(async()=>{}),
    input:vi.fn(()=>{events.push('input'); return 'continue' as const;}),
    output:vi.fn(()=>{events.push('output'); return true;}),
    playback:vi.fn(), save:vi.fn(async()=>{events.push('save'); return true;}), status:vi.fn() };
  const controller=new AutomaticConversation(ports);
  return {controller,ports,engine,events,input:(text:string)=>onInput(text),remote:(state:'paused'|'ended',reason?:RelayEndReason)=>onRemote?.(state,reason)};
}
it('automatically saves, plays and listens across two utterances without confirmation', async()=>{
  const f=fixture(); await f.controller.start();
  expect(f.events).toEqual(['output','save','play','listen']);
  f.input('고향 이야기');
  await vi.waitFor(()=>expect(f.engine.startListening).toHaveBeenCalledTimes(2));
  expect(f.events.slice(4)).toEqual(['input','save','output','save','play','listen']);
  f.input('가족 이야기');
  await vi.waitFor(()=>expect(f.engine.startListening).toHaveBeenCalledTimes(3));
  expect(f.engine.submitUserTurn.mock.calls).toEqual([['고향 이야기'],['가족 이야기']]);
});
it('stop before start is a no-op so a later start still runs',async()=>{
  const f=fixture(); await f.controller.stop('앱이 백그라운드로 전환되어 대화를 멈췄어요.');
  expect(f.ports.status).not.toHaveBeenCalled();
  await f.controller.start();
  expect(f.ports.connect).toHaveBeenCalled();
  expect(f.events).toEqual(['output','save','play','listen']);
});
it('does not connect without permission and the storage contract',async()=>{
  const f=fixture(); vi.mocked(f.ports.ready).mockResolvedValue(false);
  await f.controller.start(); expect(f.ports.connect).not.toHaveBeenCalled();
  expect(f.ports.status).toHaveBeenLastCalledWith('stopped',expect.any(String));
});
it('saves a help-requesting input but never requests the next model response',async()=>{
  const f=fixture(); await f.controller.start();
  vi.mocked(f.ports.input).mockReturnValue('help'); f.input('도움 필요');
  await vi.waitFor(()=>expect(f.engine.close).toHaveBeenCalled());
  expect(f.engine.submitUserTurn).not.toHaveBeenCalled();
  expect(f.ports.save).toHaveBeenCalledTimes(2);
});
it('stops after saving fails and retains the already adopted input',async()=>{
  const f=fixture(); await f.controller.start();
  vi.mocked(f.ports.save).mockResolvedValue(false); f.input('저장 실패');
  await vi.waitFor(()=>expect(f.engine.close).toHaveBeenCalled());
  expect(f.ports.input).toHaveBeenCalledWith('저장 실패');
  expect(f.engine.submitUserTurn).not.toHaveBeenCalled();
});
it.each(['interrupted','empty'] as const)('does not open the microphone after %s playback',async result=>{
  const f=fixture(); f.engine.playTurn.mockResolvedValue(result);
  await f.controller.start(); expect(f.engine.startListening).not.toHaveBeenCalled();
  expect(f.ports.playback).toHaveBeenCalledWith(result);
});
it('records completed playback before opening the next input',async()=>{
  const f=fixture();
  f.engine.startListening.mockImplementation(async()=>{
    expect(f.ports.playback).toHaveBeenCalledWith('completed');
  });
  await f.controller.start();
  expect(f.ports.playback).toHaveBeenCalledExactlyOnceWith('completed');
});
it('discards a late response after retrieval and ignores duplicate input callbacks',async()=>{
  const f=fixture(); await f.controller.start();
  let done!: (value:{status:'ok';text:string;chunksB64:string[]})=>void;
  f.engine.submitUserTurn.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
  f.input('첫 입력'); f.input('중복 입력');
  await vi.waitFor(()=>expect(f.engine.submitUserTurn).toHaveBeenCalledOnce());
  await f.controller.stop(); done({status:'ok',text:'늦은 응답',chunksB64:['pcm']});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(f.ports.output).toHaveBeenCalledTimes(1);
  expect(f.engine.playTurn).toHaveBeenCalledTimes(1);
  expect(f.ports.input).toHaveBeenCalledTimes(1);
});
it('does not start after retrieval during preflight',async()=>{
  const f=fixture(); let done!: (ready:boolean)=>void;
  vi.mocked(f.ports.ready).mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
  const starting=f.controller.start(); await f.controller.stop(); done(true); await starting;
  expect(f.ports.connect).not.toHaveBeenCalled();
});

it('waits for pause cleanup then reconnects without a new opener',async()=>{
  const f=fixture(); f.ports.resume=vi.fn(async()=> 'listen' as const);
  await f.controller.start();
  let clean!:()=>void;
  f.engine.close.mockImplementationOnce(()=>new Promise<void>(resolve=>{clean=resolve;}));
  const paused=f.controller.pause();
  await f.controller.resume();
  expect(f.ports.connect).toHaveBeenCalledTimes(1);
  clean(); await paused; await f.controller.resume();
  expect(f.ports.ready).toHaveBeenLastCalledWith(true);
  expect(f.ports.connect).toHaveBeenCalledTimes(2);
  expect(f.engine.requestOpener).toHaveBeenCalledTimes(1);
  expect(f.engine.startListening).toHaveBeenCalledTimes(2);
});
it('ignores previous connection input, failure and late output after resume',async()=>{
  const f=fixture(); f.ports.resume=vi.fn(async()=> 'listen' as const);
  await f.controller.start();
  const [oldInput, oldFailure]=vi.mocked(f.ports.connect).mock.calls[0];
  let resolve!: (value:{status:'ok';text:string;chunksB64:string[]})=>void;
  f.engine.submitUserTurn.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  oldInput('이전 말씀');
  await vi.waitFor(()=>expect(f.engine.submitUserTurn).toHaveBeenCalledOnce());
  await f.controller.pause(); await f.controller.resume();
  oldInput('늦은 입력'); oldFailure();
  resolve({status:'ok',text:'늦은 질문',chunksB64:['pcm']});
  await new Promise(done=>setTimeout(done,0));
  expect(f.ports.input).toHaveBeenCalledTimes(1);
  expect(f.ports.output).toHaveBeenCalledTimes(1);
  expect(f.ports.status).toHaveBeenLastCalledWith('listening',undefined);
});
it('cannot resume after terminal retrieval or unsupported restoration',async()=>{
  const f=fixture(); await f.controller.start(); await f.controller.pause();
  await f.controller.resume(); expect(f.ports.connect).toHaveBeenCalledTimes(1);
  f.ports.resume=vi.fn(async()=> 'listen' as const);
  await f.controller.stop(); await f.controller.resume();
  expect(f.ports.connect).toHaveBeenCalledTimes(1);
});

it('a failed old preflight cannot stop a resumed connection',async()=>{
  const f=fixture(); f.ports.resume=vi.fn(async()=> 'listen' as const);
  let reject!: (error:Error)=>void;
  vi.mocked(f.ports.ready).mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  const starting=f.controller.start();
  await f.controller.pause(); await f.controller.resume();
  reject(new Error('old request')); await starting;
  expect(f.ports.status).toHaveBeenLastCalledWith('listening',undefined);
  expect(f.ports.connect).toHaveBeenCalledTimes(1);
});
it('saves and finishes restored output playback before listening',async()=>{
  const f=fixture(); await f.controller.start(); await f.controller.pause();
  f.ports.resume=vi.fn(async()=>({text:'재개 질문',audioChunksB64:['pcm']}));
  f.events.length=0; await f.controller.resume();
  expect(f.ports.output).toHaveBeenLastCalledWith('재개 질문',false);
  expect(f.events).toEqual(['output','save','play','listen']);
});

it.each(['음성 합성 요청이 많아 대화를 멈췄어요. 기록을 저장하고 잠시 후 다시 시작해 주세요.','private provider detail'])('keeps only approved failure copy: %s',async message=>{
  const f=fixture(); await f.controller.start();
  vi.mocked(f.ports.connect).mock.calls[0][1](message);
  await vi.waitFor(()=>expect(f.engine.close).toHaveBeenCalled());
  expect(f.ports.status).toHaveBeenLastCalledWith('stopped',message.startsWith('음성 합성')?message:'음성 연결이 중단됐어요. 기록을 저장해 주세요.');
});

describe('감독 화면 원격 제어(파일럿 M5)', () => {
  afterEach(() => { vi.useRealTimers(); });
  function remoteFixture(states: RemoteControlState[]) {
    vi.useFakeTimers();
    const f = fixture();
    const control = vi.fn(async (): Promise<RemoteControlState> => states.length > 1 ? states.shift()! : states[0]);
    f.ports.control = control;
    f.ports.resume = vi.fn(async () => 'listen' as const);
    return { ...f, control };
  }
  it('원격 일시정지는 마이크·연결을 즉시 닫고 "잠시 쉬어요" 상태로 멈추며 현장 재개를 막는다', async () => {
    const f = remoteFixture(['paused']);
    await f.controller.start();
    f.remote('paused');
    expect(f.engine.close).toHaveBeenCalled(); // 동기 — 다음 오디오 청크 전에 마이크가 닫힌다
    await vi.waitFor(() => expect(f.ports.status).toHaveBeenLastCalledWith('paused', REMOTE_PAUSE_REASON, true));
    expect(f.controller.remotePaused).toBe(true);
    await f.controller.resume();
    expect(f.ports.connect).toHaveBeenCalledTimes(1); // 현장 재개 불가(사용자 확정)
  });
  it('서버가 재개를 알리면 2초 폴 안에 저장된 흐름으로 이어간다', async () => {
    const f = remoteFixture(['paused', 'running']);
    await f.controller.start();
    f.remote('paused');
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.connect).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.ports.connect).mock.calls[1]?.[2]).toBe(true); // 재개 경로(새 오프너 아님)
    expect(f.engine.requestOpener).toHaveBeenCalledTimes(1);
    expect(f.controller.remotePaused).toBe(false);
  });
  it('원격 종료는 이유와 함께 멈추고 폴을 멈춘다', async () => {
    const f = remoteFixture(['running']);
    await f.controller.start();
    f.remote('ended');
    await vi.waitFor(() => expect(f.ports.status).toHaveBeenLastCalledWith('stopped', REMOTE_END_REASON));
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS * 3);
    expect(f.control).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['time_limit', 'elder_closing', 'other'] as const)('중계가 스스로 끝내면(%s) 감독 화면 종료가 아니라 그 이유로 멈춘다', async reason => {
    const f = remoteFixture(['running']);
    await f.controller.start();
    f.remote('ended', reason);
    await vi.waitFor(() => expect(f.ports.status).toHaveBeenLastCalledWith('stopped', RELAY_END_REASONS[reason]));
    expect(f.ports.status).not.toHaveBeenCalledWith('stopped', REMOTE_END_REASON);
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS * 3);
    expect(f.control).not.toHaveBeenCalled();
  });
  it('종료 이유 문구는 서로 다르고 10분 상한을 숫자로 알린다', () => {
    const texts = Object.values(RELAY_END_REASONS);
    expect(new Set([...texts, REMOTE_END_REASON]).size).toBe(texts.length + 1);
    expect(RELAY_END_REASONS.time_limit).toContain('10분');
    for (const t of texts) expect(t).toContain('기록을 저장해 주세요');
  });
  it('원격 정지 중 서버가 종료를 알리면 멈춘다', async () => {
    const f = remoteFixture(['ended']);
    await f.controller.start();
    f.remote('paused');
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.status).toHaveBeenLastCalledWith('stopped', REMOTE_END_REASON);
  });
  it('현장에서 멈춘 사이 감독 화면도 멈추면 현장 재개를 막고, 서버 재개 뒤에 이어간다', async () => {
    const f = remoteFixture(['paused', 'running']);
    await f.controller.start();
    await f.controller.pause();
    expect(f.controller.remotePaused).toBe(false);
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.status).toHaveBeenLastCalledWith('paused', REMOTE_PAUSE_REASON, true);
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.connect).toHaveBeenCalledTimes(2);
  });
  it('현장 일시정지는 서버가 계속 진행 중이어도 저절로 재개하지 않는다', async () => {
    const f = remoteFixture(['running']);
    await f.controller.start();
    await f.controller.pause();
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS * 3);
    expect(f.ports.connect).toHaveBeenCalledTimes(1);
    expect(f.control).toHaveBeenCalledTimes(3);
  });
  it('상태 확인 실패는 추측하지 않고 다음 폴에 다시 본다', async () => {
    const f = remoteFixture(['paused']);
    await f.controller.start();
    f.remote('paused');
    await vi.waitFor(() => expect(f.controller.remotePaused).toBe(true));
    f.control.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.controller.remotePaused).toBe(true);
    f.control.mockResolvedValue('running');
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.connect).toHaveBeenCalledTimes(2);
  });
  it('이전 연결의 원격 알림은 무시한다', async () => {
    const f = remoteFixture(['running']);
    await f.controller.start();
    f.remote('paused');
    await vi.waitFor(() => expect(f.controller.remotePaused).toBe(true));
    await vi.advanceTimersByTimeAsync(REMOTE_CONTROL_POLL_MS);
    expect(f.ports.connect).toHaveBeenCalledTimes(2);
    const stale = vi.mocked(f.ports.connect).mock.calls[0]![3]!;
    stale('ended');
    expect(f.ports.status).not.toHaveBeenCalledWith('stopped', REMOTE_END_REASON);
  });
  it('회수(stop) 뒤에는 폴 타이머가 남지 않는다', async () => {
    const f = remoteFixture(['paused']);
    await f.controller.start();
    f.remote('paused');
    await vi.waitFor(() => expect(f.controller.remotePaused).toBe(true));
    await f.controller.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.controller.remotePaused).toBe(false);
  });
});

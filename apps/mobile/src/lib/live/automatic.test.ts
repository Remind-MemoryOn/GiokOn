import { expect, it, vi } from 'vitest';
import { AutomaticConversation, type AutomaticPorts } from './automatic';

function fixture() {
  let onInput!: (text: string) => void;
  const events: string[] = [];
  const engine = { requestOpener: vi.fn(async () => ({text:'질문',audioChunksB64:['pcm']})),
    submitUserTurn: vi.fn(async () => ({status:'ok' as const,text:'다음 질문',chunksB64:['pcm']})),
    playTurn: vi.fn(async () => {events.push('play'); return 'completed' as 'completed'|'interrupted'|'empty';}),
    startListening: vi.fn(async () => {events.push('listen');}), isListening: true, close: vi.fn(async()=>{}) };
  const ports: AutomaticPorts = { current:()=>true, ready:vi.fn(async()=>true),
    connect:vi.fn(async cb=>{onInput=cb; return engine;}), cancelPending:vi.fn(async()=>{}),
    input:vi.fn(()=>{events.push('input'); return 'continue' as const;}),
    output:vi.fn(()=>{events.push('output'); return true;}),
    playback:vi.fn(), save:vi.fn(async()=>{events.push('save'); return true;}), status:vi.fn() };
  const controller=new AutomaticConversation(ports);
  return {controller,ports,engine,events,input:(text:string)=>onInput(text)};
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

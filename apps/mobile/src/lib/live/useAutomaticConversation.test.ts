import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[],
  failure: null as null | ((message:string)=>void),
  contexts: [] as unknown[], continuation: vi.fn(async()=>({text:'이어서 고향 이야기를 들려주시겠어요?',audioChunksB64:['pcm']})),
  status: [] as unknown[], change: null as null | ((state:string)=>void),
  input: null as null | ((text:string)=>void), partial: null as null | ((text:string)=>void), version: vi.fn(async()=>1), cancel:vi.fn(async()=>{}),
  play:vi.fn(async()=> 'completed'), listen:vi.fn(async()=>{}), close:vi.fn(async()=>{}) }));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useEffect:(effect:()=>void|(()=>void))=>{native.effects.push(effect);},
  useRef:<T,>(value:T)=>({current:value}),
  useState:<T,>(value:T)=>[value,(next:T)=>{native.status.push(next);}],
}));
vi.mock('react-native',()=>({AppState:{currentState:'active',addEventListener:(_event:string,cb:(state:string)=>void)=>{
  native.change=cb; return {remove:()=>{native.change=null;}};
}}}));
vi.mock('@giokon/data',()=>({getTranscriptStorageVersion:native.version}));
vi.mock('../supabase',()=>({queryScope:{capture:()=>({current:()=>true})}}));
vi.mock('./mic',()=>({ensureMicPermission:async()=>true}));
vi.mock('./engine',()=>({closeLiveEngine:native.cancel,
  acquireLiveEngine:async(_key:unknown,_elder:unknown,_chronicles:unknown,_design:unknown,callbacks:{onError:(message:string)=>void;onDraftFinal:(text:string)=>void;onDraftInterrupted:(text:string)=>void},_session:unknown,context:unknown)=>{
    native.contexts.push(context);
    native.input=callbacks.onDraftFinal; native.failure=callbacks.onError;
    native.partial=callbacks.onDraftInterrupted;
    return {requestContinuation:native.continuation,requestOpener:async()=>({text:'고향은 어디세요?',audioChunksB64:['pcm']}),
      submitUserTurn:async()=>({status:'ok',text:'고향에서 무엇을 하셨어요?',chunksB64:['pcm']}),
      playTurn:native.play,startListening:native.listen,isListening:true,close:native.close};
  }}));
import { DEFAULT_APPEARANCE } from '@giokon/core';
import { useApp } from '../../store/appStore';
import { useAutomaticConversation } from './useAutomaticConversation';
beforeEach(()=>{
  vi.clearAllMocks(); native.contexts=[]; native.effects=[];native.status=[];native.input=null;native.change=null;native.version.mockResolvedValue(1);
  useApp.getState().beginSession({id:'e',name:'테스트',birthYear:1940,avatarColor:'#fff',appearance:DEFAULT_APPEARANCE,createdAt:'',updatedAt:''},[],{title:'테스트',therapyType:'reminiscence'});
  useApp.getState().attachRemoteSession('remote');
});
it('binds the screen hook to automatic source adoption and the next microphone cycle',async()=>{
  const save=vi.fn(async()=>true);
  const view=useAutomaticConversation(true,useApp.getState().active,save);
  const cleanup=native.effects[0]();
  expect(native.input).toBeNull(); // Explicit start, never mount-triggered recording.
  await view.start(); native.input!('고향은 전주예요');
  await vi.waitFor(()=>expect(native.listen).toHaveBeenCalledTimes(2));
  expect(useApp.getState().active!.turns[1].provenance?.kind).toBe('automatic');
  expect(useApp.getState().active!.pendingStt).toBeNull();
  const active = useApp.getState().active!;
  for (const turn of active.turns.filter(t => t.speaker === 'AI')) {
    expect(active.playbackByTurnId?.[turn.id]).toMatchObject({text:turn.text,result:'completed'});
  }
  expect(save).toHaveBeenCalledTimes(3);
  if (cleanup) cleanup();
});

it('records interrupted playback even when retrieval precedes the native result',async()=>{
  let finished!: (value:string)=>void;
  native.play.mockImplementationOnce(()=>new Promise(resolve=>{finished=resolve;}));
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0]();
  const starting=view.start();
  await vi.waitFor(()=>expect(native.play).toHaveBeenCalled());
  await view.stop(); finished('interrupted'); await starting;
  const active=useApp.getState().active!, turn=active.turns[0];
  expect(active.playbackByTurnId?.[turn.id]).toMatchObject({result:'interrupted'});
  expect(native.listen).not.toHaveBeenCalled();
  if(cleanup) cleanup();
});
it('stops the running loop on background transition',async()=>{
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  native.change!('background'); native.input!('늦은 전사');
  expect(useApp.getState().active!.turns).toHaveLength(1);
  expect(native.status.at(-1)).toMatchObject({phase:'stopped'});
  if(cleanup) cleanup();
});
it('does not install automatic controls for the direct manual path',async()=>{
  const view=useAutomaticConversation(false,useApp.getState().active,async()=>true);
  native.effects[0](); await view.start();
  expect(native.version).not.toHaveBeenCalled(); expect(native.input).toBeNull();
});

it('preserves an interrupted input for review without adopting or saving it',async()=>{
  const save=vi.fn(async()=>true);
  const view=useAutomaticConversation(true,useApp.getState().active,save);
  const cleanup=native.effects[0](); await view.start();
  native.close.mockImplementationOnce(async()=>{native.partial!('말씀 도중');});
  await view.stop();
  expect(useApp.getState().active!.pendingStt).toBe('말씀 도중');
  expect(useApp.getState().active!.turns).toHaveLength(1);
  expect(save).toHaveBeenCalledTimes(1);
  if(cleanup) cleanup();
  native.partial!('화면 이탈 뒤 입력');
  expect(useApp.getState().active!.pendingStt).toBe('말씀 도중');
});

it('pauses and restores the completed question without repeating it',async()=>{
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  const original=useApp.getState().active!.turns.slice();
  await view.pause(); await view.resume();
  expect(native.contexts[1]).toEqual({version:1,turns:[{role:'model',text:'고향은 어디세요?'}]});
  expect(native.continuation).not.toHaveBeenCalled();
  expect(native.listen).toHaveBeenCalledTimes(2);
  expect(useApp.getState().active!.turns).toEqual(original);
  if(cleanup) cleanup();
});
it('requires partial input review, then resumes from the confirmed final text',async()=>{
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  native.close.mockImplementationOnce(async()=>{native.partial!('고향은 전');});
  await view.pause(); await view.resume();
  expect(native.contexts).toHaveLength(1);
  expect(useApp.getState().confirmRecoveredInput('고향은 전주예요')).toBe(true);
  await view.resume();
  expect(native.contexts[1]).toMatchObject({turns:[{role:'model'},{role:'user',text:'고향은 전주예요'}]});
  expect(native.continuation).toHaveBeenCalledOnce();
  expect(useApp.getState().active!.turns.at(-1)?.speaker).toBe('AI');
  expect(native.listen).toHaveBeenCalledTimes(2);
  if(cleanup) cleanup();
});
it('preserves the interrupted AI record and excludes it from restored model history',async()=>{
  let finish!:(value:string)=>void;
  native.play.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); const starting=view.start();
  await vi.waitFor(()=>expect(native.play).toHaveBeenCalledOnce());
  await view.pause(); finish('interrupted'); await starting;
  const old=useApp.getState().active!.turns[0];
  await view.resume();
  expect(native.contexts[1]).toEqual({version:1,turns:[]});
  expect(useApp.getState().active!.turns[0]).toEqual(old);
  expect(useApp.getState().active!.turns).toHaveLength(2);
  expect(native.listen).toHaveBeenCalledOnce();
  if(cleanup) cleanup();
});
it('refuses resumption of a confirmed help request',async()=>{
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start(); await view.pause();
  useApp.getState().setPendingStt('죽고 싶어요','gemini_live');
  useApp.getState().confirmRecoveredInput('죽고 싶어요');
  await view.resume(); expect(native.contexts).toHaveLength(1);
  if(cleanup) cleanup();
});

it('retains the approved synthesis failure through the screen controller',async()=>{
  const view=useAutomaticConversation(true,useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  const reason='음성 합성 요청이 많아 대화를 멈췄어요. 기록을 저장하고 잠시 후 다시 시작해 주세요.';
  native.failure!(reason);
  await vi.waitFor(()=>expect(native.status.at(-1)).toEqual({phase:'stopped',reason}));
  expect(useApp.getState().active!.turns).toHaveLength(1);
  if(cleanup) cleanup();
});

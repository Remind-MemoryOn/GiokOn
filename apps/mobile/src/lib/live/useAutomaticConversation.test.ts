import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[],
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
  acquireLiveEngine:async(_key:unknown,_elder:unknown,_chronicles:unknown,_design:unknown,callbacks:{onDraftFinal:(text:string)=>void;onDraftInterrupted:(text:string)=>void})=>{
    native.input=callbacks.onDraftFinal;
    native.partial=callbacks.onDraftInterrupted;
    return {requestOpener:async()=>({text:'고향은 어디세요?',audioChunksB64:['pcm']}),
      submitUserTurn:async()=>({status:'ok',text:'고향에서 무엇을 하셨어요?',chunksB64:['pcm']}),
      playTurn:native.play,startListening:native.listen,isListening:true,close:native.close};
  }}));
import { DEFAULT_APPEARANCE } from '@giokon/core';
import { useApp } from '../../store/appStore';
import { useAutomaticConversation } from './useAutomaticConversation';
beforeEach(()=>{
  vi.clearAllMocks(); native.effects=[];native.status=[];native.input=null;native.change=null;native.version.mockResolvedValue(1);
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

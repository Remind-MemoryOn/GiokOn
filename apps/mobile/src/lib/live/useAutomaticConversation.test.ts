import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[],
  failure: null as null | ((message:string)=>void),
  contexts: [] as unknown[], continuation: vi.fn(async()=>({text:'이어서 고향 이야기를 들려주시겠어요?',audioChunksB64:['pcm']})),
  status: [] as unknown[], change: null as null | ((state:string)=>void),
  appState: 'active', listeners: new Set<(state:string)=>void>(),
  input: null as null | ((text:string)=>void), partial: null as null | ((text:string)=>void), version: vi.fn(async()=>1), cancel:vi.fn(async()=>{}),
  opener:vi.fn(async():Promise<unknown>=>({text:'고향은 어디세요?',audioChunksB64:['pcm']})),
  control:vi.fn(async()=> 'running'), remote:null as null | ((state:'paused'|'ended',reason?:'elder_closing')=>void),
  submit:vi.fn(async()=>({status:'ok' as const,text:'고향에서 무엇을 하셨어요?',chunksB64:['pcm']})),
  play:vi.fn(async()=> 'completed'), listen:vi.fn(async()=>{}), close:vi.fn(async()=>{}) }));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useEffect:(effect:()=>void|(()=>void))=>{native.effects.push(effect);},
  useRef:<T,>(value:T)=>({current:value}),
  useState:<T,>(value:T)=>[value,(next:T)=>{native.status.push(next);}],
}));
// AppState 감시는 여러 개일 수 있다(대화 흐름의 백그라운드 감시 + 시작 전 활성 대기). change 는 모두에게 알린다.
vi.mock('react-native',()=>({AppState:{get currentState(){return native.appState;},addEventListener:(_event:string,cb:(state:string)=>void)=>{
  native.listeners.add(cb);
  native.change=(state:string)=>{native.appState=state; for (const listener of [...native.listeners]) listener(state);};
  return {remove:()=>{native.listeners.delete(cb); if (!native.listeners.size) native.change=null;}};
}}}));
vi.mock('@giokon/data',()=>({getTranscriptStorageVersion:native.version,getSessionControl:native.control}));
vi.mock('../supabase',()=>({queryScope:{capture:()=>({current:()=>true})}}));
vi.mock('./mic',()=>({ensureMicPermission:async()=>true}));
vi.mock('./engine',()=>({closeLiveEngine:native.cancel,
  acquireLiveEngine:async(_key:unknown,callbacks:{onError:(message:string)=>void;onDraftFinal:(text:string)=>void;onDraftInterrupted:(text:string)=>void;onRemoteControl:(state:'paused'|'ended',reason?:'elder_closing')=>void},_session:unknown,context:unknown)=>{
    native.contexts.push(context);
    native.input=callbacks.onDraftFinal; native.failure=callbacks.onError;
    native.partial=callbacks.onDraftInterrupted; native.remote=callbacks.onRemoteControl;
    return {requestContinuation:native.continuation,requestOpener:native.opener,
      submitUserTurn:native.submit,
      playTurn:native.play,startListening:native.listen,isListening:true,close:native.close};
  }}));
import { DEFAULT_APPEARANCE, ELDER_CLOSING_FAREWELL, VOICE_FAILURE_MESSAGES } from '@giokon/core';
import { useApp } from '../../store/appStore';
import { useAutomaticConversation } from './useAutomaticConversation';
beforeEach(()=>{
  vi.clearAllMocks(); native.contexts=[]; native.effects=[];native.status=[];native.input=null;native.change=null;native.version.mockResolvedValue(1);
  native.appState='active'; native.listeners.clear();
  native.submit.mockReset().mockResolvedValue({status:'ok',text:'고향에서 무엇을 하셨어요?',chunksB64:['pcm']});
  native.play.mockReset().mockResolvedValue('completed');
  useApp.getState().beginSession({id:'e',name:'테스트',birthYear:1940,avatarColor:'#fff',appearance:DEFAULT_APPEARANCE,createdAt:'',updatedAt:''},[],{title:'테스트',therapyType:'reminiscence'});
  useApp.getState().attachRemoteSession('remote');
});
it('binds the screen hook to automatic source adoption and the next microphone cycle',async()=>{
  const save=vi.fn(async()=>true);
  const view=useAutomaticConversation(useApp.getState().active,save);
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
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
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
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  native.change!('background'); native.input!('늦은 전사');
  expect(useApp.getState().active!.turns).toHaveLength(1);
  expect(native.status.at(-1)).toMatchObject({phase:'stopped'});
  if(cleanup) cleanup();
});
it('a background transition before start (permission dialog, screen off) does not block the later start',async()=>{
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0]();
  native.change!('background'); native.change!('active');
  expect(native.status.some(s=>(s as {phase:string}).phase==='stopped')).toBe(false);
  await view.start();
  expect(native.listen).toHaveBeenCalled();
  expect(native.status.at(-1)).toMatchObject({phase:'listening'});
  if(cleanup) cleanup();
});
it('waits for the app to return to active right after the permission dialog instead of stopping',async()=>{
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0]();
  native.appState='background';
  const starting=view.start();
  await Promise.resolve();
  expect(native.version).not.toHaveBeenCalled();
  native.change!('active');
  await starting;
  expect(native.version).toHaveBeenCalled();
  expect(native.listen).toHaveBeenCalled();
  if(cleanup) cleanup();
});
it('does not install automatic controls before the server session exists',async()=>{
  const active=useApp.getState().active!;
  const view=useAutomaticConversation({...active,remoteId:null},async()=>true);
  native.effects[0](); await view.start();
  expect(native.version).not.toHaveBeenCalled(); expect(native.input).toBeNull();
});

it('preserves an interrupted input for review without adopting or saving it',async()=>{
  const save=vi.fn(async()=>true);
  const view=useAutomaticConversation(useApp.getState().active,save);
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

it('starts from an empty record and adopts the relay greeting as the first AI turn',async()=>{
  expect(useApp.getState().active!.turns).toEqual([]);
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  expect(useApp.getState().active!.turns.map(t=>[t.speaker,t.text])).toEqual([['AI','고향은 어디세요?']]);
  if(cleanup) cleanup();
});
it('resumes a pause taken before the greeting by requesting the opener again, discarding the late one',async()=>{
  let greet!: (value:unknown)=>void;
  native.opener.mockImplementationOnce(()=>new Promise(resolve=>{greet=resolve;}));
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0]();
  const starting=view.start();
  await vi.waitFor(()=>expect(native.opener).toHaveBeenCalledOnce());
  await view.pause(); greet({text:'늦게 온 인사',audioChunksB64:['pcm']}); await starting;
  expect(useApp.getState().active!.turns).toEqual([]);
  await view.resume();
  expect(native.opener).toHaveBeenCalledTimes(2);
  expect(native.contexts[1]).toBeUndefined();
  expect(useApp.getState().active!.turns.map(t=>t.text)).toEqual(['고향은 어디세요?']);
  expect(native.listen).toHaveBeenCalledOnce();
  if(cleanup) cleanup();
});
it('pauses and restores the completed question without repeating it',async()=>{
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
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
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
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
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
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
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start(); await view.pause();
  useApp.getState().setPendingStt('죽고 싶어요','gemini_live');
  useApp.getState().confirmRecoveredInput('죽고 싶어요');
  await view.resume(); expect(native.contexts).toHaveLength(1);
  if(cleanup) cleanup();
});

it('retains the approved synthesis failure through the screen controller',async()=>{
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0](); await view.start();
  const reason='음성 합성 요청이 많아 대화를 멈췄어요. 기록을 저장하고 잠시 후 다시 시작해 주세요.';
  native.failure!(reason);
  await vi.waitFor(()=>expect(native.status.at(-1)).toEqual({phase:'stopped',reason}));
  expect(useApp.getState().active!.turns).toHaveLength(1);
  if(cleanup) cleanup();
});

it('records relay review only for the current connection and keeps it for final save',async()=>{
  const view=useAutomaticConversation(useApp.getState().active,async()=>true);
  const cleanup=native.effects[0]();await view.start();
  const oldFailure=native.failure!;
  await view.pause();await view.resume();
  oldFailure(VOICE_FAILURE_MESSAGES.INPUT_REVIEW_REQUIRED);
  expect(useApp.getState().active!.events).toHaveLength(0);
  native.failure!(VOICE_FAILURE_MESSAGES.INPUT_REVIEW_REQUIRED);
  expect(native.status.at(-1)).toMatchObject({phase:'stopped'});
  expect(useApp.getState().active!.events).toHaveLength(1);
  useApp.getState().finishSession();
  expect(useApp.getState().lastFinished!.events[0].excerpt).toBe('');
  if(cleanup) cleanup();
});

it('감독 화면 원격 일시정지를 받아 멈추고, 서버(session_tick) 재개 뒤 같은 세션으로 이어간다(파일럿 M5)',async()=>{
  vi.useFakeTimers();
  try {
    native.control.mockResolvedValueOnce('paused').mockResolvedValue('running');
    const view=useAutomaticConversation(useApp.getState().active,async()=>true);
    const cleanup=native.effects[0]();
    await view.start();
    native.remote!('paused');
    expect(native.close).toHaveBeenCalled();
    await vi.waitFor(()=>expect(native.status.at(-1)).toMatchObject({phase:'paused',remote:true}));
    await vi.advanceTimersByTimeAsync(2000);
    expect(native.control).toHaveBeenCalledWith('remote'); // 세션의 서버 id 로만 묻는다
    expect(native.contexts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(()=>expect(native.contexts).toHaveLength(2)); // 재개 = 새 중계 연결
    expect(native.status.at(-1)).not.toMatchObject({remote:true});
    if (cleanup) cleanup();
  } finally { vi.useRealTimers(); }
});

it.each(['오늘은 그만하고 싶어', '듣기 싫어요'])('finishes %s through the relay farewell and never opens another capture', async text => {
  const view = useAutomaticConversation(useApp.getState().active, async () => true);
  const cleanup = native.effects[0]();
  await view.start();
  let finish!: (result: string) => void;
  native.submit.mockResolvedValueOnce({status:'ok',text:ELDER_CLOSING_FAREWELL,chunksB64:['pcm']});
  native.play.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  native.input!(text);
  await vi.waitFor(() => expect(native.play).toHaveBeenCalledTimes(2));
  expect(native.submit).toHaveBeenCalledExactlyOnceWith(text);
  expect(useApp.getState().active!.safety).toMatchObject({recommendation:'end_session',caregiverAlert:null});
  expect(useApp.getState().active!.turns.at(-1)?.text).toBe(ELDER_CLOSING_FAREWELL);
  expect(native.close).not.toHaveBeenCalled();
  finish('completed');
  await vi.waitFor(() => expect(useApp.getState().active!.playbackByTurnId?.[useApp.getState().active!.turns.at(-1)!.id]?.result).toBe('completed'));
  expect(native.listen).toHaveBeenCalledOnce();
  native.remote!('ended','elder_closing');
  await vi.waitFor(() => expect(native.status.at(-1)).toMatchObject({phase:'stopped'}));
  await view.resume();
  expect(native.contexts).toHaveLength(1);
  expect(native.listen).toHaveBeenCalledOnce();
  if (cleanup) cleanup();
});

it('rejects an ordinary model response when only the fixed farewell is allowed', async () => {
  const view = useAutomaticConversation(useApp.getState().active, async () => true);
  const cleanup = native.effects[0](); await view.start();
  native.input!('듣기 싫어요');
  await vi.waitFor(() => expect(native.status.at(-1)).toMatchObject({phase:'stopped'}));
  expect(native.submit).toHaveBeenCalledOnce();
  expect(native.play).toHaveBeenCalledOnce();
  expect(useApp.getState().active!.turns.at(-1)?.speaker).toBe('Elderly');
  if (cleanup) cleanup();
});

it.each(['죽고 싶어요','너무 힘들어서 못 견디겠어 그만할래'])('still stops immediately without asking for a farewell for %s', async text => {
  const view = useAutomaticConversation(useApp.getState().active, async () => true);
  const cleanup = native.effects[0](); await view.start();
  native.input!(text);
  await vi.waitFor(() => expect(native.status.at(-1)).toMatchObject({phase:'stopped'}));
  expect(native.submit).not.toHaveBeenCalled();
  expect(native.play).toHaveBeenCalledOnce();
  expect(useApp.getState().active!.safety.caregiverAlert).toBeTruthy();
  if (cleanup) cleanup();
});

it('allows ordinary grief to receive a response while preserving the comfort recommendation across pause and resume', async () => {
  const view = useAutomaticConversation(useApp.getState().active, async () => true);
  const cleanup = native.effects[0](); await view.start();
  native.input!('고향의 골목이 그리워요.');
  await vi.waitFor(() => expect(native.listen).toHaveBeenCalledTimes(2));
  expect(useApp.getState().active!.safety).toMatchObject({recommendation:'comfort',caregiverAlert:null});
  await view.pause(); await view.resume();
  expect(native.contexts).toHaveLength(2);
  expect(native.listen).toHaveBeenCalledTimes(3);
  if (cleanup) cleanup();
});

it('keeps a completed farewell receipt when the relay ends before playback resolves', async () => {
  const view = useAutomaticConversation(useApp.getState().active, async () => true);
  const cleanup = native.effects[0](); await view.start();
  native.submit.mockResolvedValueOnce({status:'ok',text:ELDER_CLOSING_FAREWELL,chunksB64:['pcm']});
  native.play.mockImplementationOnce(async () => {
    native.remote!('ended', 'elder_closing');
    return 'completed';
  });
  native.input!('듣기 싫어요');
  await vi.waitFor(() => {
    const active = useApp.getState().active!;
    expect(active.playbackByTurnId?.[active.turns.at(-1)!.id]?.result).toBe('completed');
  });
  expect(native.status.at(-1)).toMatchObject({phase:'stopped'});
  expect(native.listen).toHaveBeenCalledOnce();
  if (cleanup) cleanup();
});

it('never resumes or adopts a late farewell after a pause while closing', async () => {
  const view = useAutomaticConversation(useApp.getState().active, async () => true);
  const cleanup = native.effects[0](); await view.start();
  let answer!: (value: {status:'ok';text:string;chunksB64:string[]}) => void;
  native.submit.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  native.input!('오늘은 그만하고 싶어');
  await vi.waitFor(() => expect(native.submit).toHaveBeenCalledOnce());
  await view.pause(); await view.resume();
  answer({status:'ok',text:ELDER_CLOSING_FAREWELL,chunksB64:['pcm']});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(native.status.at(-1)).toMatchObject({phase:'stopped'});
  expect(native.play).toHaveBeenCalledOnce();
  expect(native.contexts).toHaveLength(1);
  expect(useApp.getState().active!.turns.at(-1)?.speaker).toBe('Elderly');
  if (cleanup) cleanup();
});

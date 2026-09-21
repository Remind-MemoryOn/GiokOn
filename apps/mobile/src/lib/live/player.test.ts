import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ create: vi.fn(), write: vi.fn(), remove: vi.fn(), mode: vi.fn() }));
vi.mock('expo-av', () => ({ Audio: { Sound: { createAsync: native.create }, setAudioModeAsync: native.mode } }));
vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'cache/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: native.write, deleteAsync: native.remove }));
import { playPcmTurn, stopPlayback } from './player';

const pcm = 'AAAA'.repeat(32);
const sound = () => ({ playAsync: vi.fn(async () => {}), unloadAsync: vi.fn(async () => {}), setOnPlaybackStatusUpdate: vi.fn() });
beforeEach(async () => { await stopPlayback(); vi.clearAllMocks(); native.write.mockResolvedValue(undefined); native.remove.mockResolvedValue(undefined); native.mode.mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());
describe('native playback cancellation', () => {
  it('bounds a stuck unload and blocks new playback until that unload really completes', async () => {
    vi.useFakeTimers();
    const s = sound(); let unloaded!: () => void;
    s.unloadAsync.mockImplementationOnce(() => new Promise(resolve => { unloaded = resolve; }));
    native.create.mockResolvedValueOnce({sound:s});
    const playing = playPcmTurn([pcm]);
    await vi.advanceTimersByTimeAsync(1);
    const stopping = stopPlayback();
    const rejected = expect(stopping).rejects.toThrow('오디오 정리');
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(await playing).toBe('interrupted');
    const next = playPcmTurn([pcm]);
    const nextRejected = expect(next).rejects.toThrow('오디오 정리');
    await vi.advanceTimersByTimeAsync(5000); await nextRejected;
    expect(native.create).toHaveBeenCalledOnce();
    unloaded(); await vi.advanceTimersByTimeAsync(1);
    await stopPlayback();
    expect(native.remove).toHaveBeenCalledOnce();
  });
  it('settles on stop even when the native play request never settles', async () => {
    const s = sound(); s.playAsync.mockImplementation(() => new Promise(() => {}));
    native.create.mockResolvedValueOnce({ sound: s });
    let result: string | undefined;
    void playPcmTurn([pcm]).then(value => { result = value; });
    await vi.waitFor(() => expect(s.playAsync).toHaveBeenCalled());
    await stopPlayback();
    await vi.waitFor(() => expect(result).toBe('interrupted'));
  });

  it('times out and unloads even when the native play request never settles', async () => {
    vi.useFakeTimers();
    const s = sound(); s.playAsync.mockImplementation(() => new Promise(() => {}));
    native.create.mockResolvedValueOnce({ sound: s });
    let error: unknown;
    void playPcmTurn([pcm]).catch(value => { error = value; });
    await vi.advanceTimersByTimeAsync(90001);
    expect(error).toBeInstanceOf(Error);
    expect(s.unloadAsync).toHaveBeenCalledOnce();
  });
  it('does not auto-play a sound that finishes loading after stop', async () => {
    const s = sound(); let ready!: (value: { sound: typeof s }) => void;
    native.create.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
    const playing = playPcmTurn([pcm]);
    await vi.waitFor(() => expect(native.create).toHaveBeenCalled());
    expect(native.create.mock.calls[0][1]).toEqual({ shouldPlay: false });
    await stopPlayback(); ready({ sound: s });
    expect(await playing).toBe('interrupted');
    expect(s.playAsync).not.toHaveBeenCalled();
    expect(s.unloadAsync).toHaveBeenCalledOnce();
  });
  it('settles playback when stopped even without a native completion event', async () => {
    const s = sound(); native.create.mockResolvedValueOnce({ sound: s });
    const playing = playPcmTurn([pcm]);
    await vi.waitFor(() => expect(s.setOnPlaybackStatusUpdate).toHaveBeenCalled());
    await stopPlayback(); expect(await playing).toBe('interrupted');
    expect(s.unloadAsync).toHaveBeenCalledOnce();
  });
  it('finishes and removes the temporary audio after native completion', async () => {
    const s = sound(); native.create.mockResolvedValueOnce({ sound: s });
    const playing = playPcmTurn([pcm]);
    await vi.waitFor(() => expect(s.setOnPlaybackStatusUpdate).toHaveBeenCalled());
    s.setOnPlaybackStatusUpdate.mock.calls[0][0]({ isLoaded: true, didJustFinish: true });
    expect(await playing).toBe('completed'); expect(native.remove).toHaveBeenCalled();
  });
  it('does not treat missing audio as delivered speech', async () => {
    expect(await playPcmTurn([])).toBe('empty');
    expect(await playPcmTurn(['AAAA'])).toBe('empty');
    expect(native.create).not.toHaveBeenCalled();
  });
  it('does not authorize more playback after native unload explicitly fails', async () => {
    vi.resetModules();
    const isolated = await import('./player');
    const s = sound(); s.unloadAsync.mockRejectedValueOnce(new Error('native failure'));
    native.create.mockResolvedValueOnce({sound:s});
    const playing = isolated.playPcmTurn([pcm]);
    await vi.waitFor(() => expect(s.playAsync).toHaveBeenCalled());
    await expect(isolated.stopPlayback()).rejects.toThrow('앱을 다시 실행');
    expect(await playing).toBe('interrupted');
    await expect(isolated.playPcmTurn([pcm])).rejects.toThrow('앱을 다시 실행');
    expect(native.create).toHaveBeenCalledOnce();
  });
});

describe('native preparation boundaries',()=>{
  it.each(['write','mode','create'] as const)('cancels a stuck %s and gates reuse until late cleanup',async stage=>{
    vi.useFakeTimers();
    const s=sound(); let finish!:(value:unknown)=>void;
    native.create.mockResolvedValue({sound:s});
    native[stage].mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const playing=playPcmTurn([pcm]);
    await vi.advanceTimersByTimeAsync(1);
    await stopPlayback();
    let result:unknown; void playing.then(value=>{result=value;});
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe('interrupted');
    const next=playPcmTurn([pcm]);
    const rejected=expect(next).rejects.toThrow('준비');
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    finish(stage==='create'?{sound:s}:undefined);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.playAsync).not.toHaveBeenCalled();
    if(stage==='create') expect(s.unloadAsync).toHaveBeenCalledOnce();
    expect(native.remove).toHaveBeenCalledOnce();
    await stopPlayback();
  });
  it.each(['write','mode','create'] as const)('bounds %s preparation without claiming native cancellation',async stage=>{
    vi.useFakeTimers();
    const s=sound(); let finish!:(value:unknown)=>void;
    native.create.mockResolvedValue({sound:s});
    native[stage].mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const playing=playPcmTurn([pcm]);
    const rejected=expect(playing).rejects.toThrow('준비');
    await vi.advanceTimersByTimeAsync(15001); await rejected;
    expect(s.playAsync).not.toHaveBeenCalled();
    finish(stage==='create'?{sound:s}:undefined);
    await vi.advanceTimersByTimeAsync(1);
    expect(native.remove).toHaveBeenCalledOnce();
    await stopPlayback();
  });
});

describe('native playback state interruptions',()=>{
  it('ends as interrupted when native playback unexpectedly pauses, even before a late finish',async()=>{
    const s=sound();native.create.mockResolvedValueOnce({sound:s});
    let result:unknown;
    const playing=playPcmTurn([pcm]).then(value=>{result=value;return value;});
    await vi.waitFor(()=>expect(s.setOnPlaybackStatusUpdate).toHaveBeenCalled());
    const update=s.setOnPlaybackStatusUpdate.mock.calls[0][0];
    update({isLoaded:true,isPlaying:true,isBuffering:false,didJustFinish:false});
    update({isLoaded:true,isPlaying:false,isBuffering:false,didJustFinish:false});
    update({isLoaded:true,isPlaying:false,isBuffering:false,didJustFinish:true});
    await vi.waitFor(()=>expect(result).toBe('interrupted'));
    await playing;expect(s.unloadAsync).toHaveBeenCalledOnce();
  });
  it('does not mistake startup or buffering status for an interruption',async()=>{
    const s=sound();native.create.mockResolvedValueOnce({sound:s});
    let result:unknown;
    const playing=playPcmTurn([pcm]).then(value=>{result=value;return value;});
    await vi.waitFor(()=>expect(s.setOnPlaybackStatusUpdate).toHaveBeenCalled());
    const update=s.setOnPlaybackStatusUpdate.mock.calls[0][0];
    update({isLoaded:true,isPlaying:false,isBuffering:false,didJustFinish:false});
    update({isLoaded:true,isPlaying:true,isBuffering:false,didJustFinish:false});
    update({isLoaded:true,isPlaying:false,isBuffering:true,didJustFinish:false});
    await new Promise(resolve=>setTimeout(resolve,0));expect(result).toBeUndefined();
    update({isLoaded:true,isPlaying:false,isBuffering:false,didJustFinish:true});
    expect(await playing).toBe('completed');
  });
});

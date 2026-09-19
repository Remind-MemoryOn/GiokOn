import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ create: vi.fn(), write: vi.fn(), remove: vi.fn(), mode: vi.fn() }));
vi.mock('expo-av', () => ({ Audio: { Sound: { createAsync: native.create }, setAudioModeAsync: native.mode } }));
vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'cache/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: native.write, deleteAsync: native.remove }));
import { playPcmTurn, stopPlayback } from './player';

const pcm = 'AAAA'.repeat(32);
const sound = () => ({ playAsync: vi.fn(async () => {}), unloadAsync: vi.fn(async () => {}), setOnPlaybackStatusUpdate: vi.fn() });
beforeEach(async () => { await stopPlayback(); vi.clearAllMocks(); native.write.mockResolvedValue(undefined); native.remove.mockResolvedValue(undefined); native.mode.mockResolvedValue(undefined); });
describe('native playback cancellation', () => {
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
});

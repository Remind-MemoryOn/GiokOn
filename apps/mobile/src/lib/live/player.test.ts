import { afterEach, expect, it, vi } from 'vitest';
import { createDuplexAdapter } from './duplex-adapter';
import type { DuplexModule } from '../../../modules/giokon-duplex/src/GiokonDuplexModule';

function fixture() {
  const listeners: Record<string, ((value: never) => void)[]> = {};
  const native = {
    startCapture: vi.fn(async (_id: number) => {}), stopCapture: vi.fn(async () => {}),
    play: vi.fn(async (_data: string): Promise<'completed' | 'interrupted'> => 'completed'),
    stopPlayback: vi.fn(async () => {}), close: vi.fn(async () => {}),
    addListener: vi.fn((name: string, callback: (value: never) => void) => {
      (listeners[name] ??= []).push(callback); return {remove: vi.fn()};
    }),
  };
  return { native, adapter: createDuplexAdapter(() => native as DuplexModule), emit: (name: string, value: unknown) => listeners[name]?.forEach(cb => cb(value as never)) };
}
afterEach(() => vi.useRealTimers());
it('keeps capture and playback simultaneous and stops playback without closing capture', async () => {
  const f = fixture(), data = vi.fn();
  const microphone = f.adapter.start({onData:data}); await microphone.ready;
  f.native.play.mockImplementation(() => new Promise(() => {}));
  const playing = f.adapter.play(['AQACAA==']);
  await vi.waitFor(() => expect(f.native.play).toHaveBeenCalled());
  f.emit('onAudio', {captureId:1,data:'AQACAA=='});
  await f.adapter.stopPlayback();
  expect(await playing).toBe('interrupted');
  expect(data).toHaveBeenCalledWith('AQACAA==');
  expect(f.native.stopCapture).not.toHaveBeenCalled();
  await f.adapter.close();
});
it('does not start late capture after stop, and ignores queued events from the old capture', async () => {
  const f = fixture(), old = vi.fn(), next = vi.fn();
  const first = f.adapter.start({onData:old}); first.stop(); await first.ready;
  const second = f.adapter.start({onData:next}); await second.ready;
  f.emit('onAudio',{captureId:1,data:'old'}); f.emit('onAudio',{captureId:2,data:'new'});
  expect(old).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledExactlyOnceWith('new');
  expect(f.native.startCapture).toHaveBeenCalledExactlyOnceWith(2);
  await f.adapter.close();
});
it('does not start a new recorder before the previous native stop has finished', async () => {
  const f = fixture();
  const first = f.adapter.start({onData:vi.fn()}); await first.ready;
  let release!: () => void;
  f.native.stopCapture.mockImplementationOnce(() => new Promise(resolve => {release=resolve;}));
  first.stop(); const second = f.adapter.start({onData:vi.fn()});
  await vi.waitFor(() => expect(f.native.stopCapture).toHaveBeenCalled());
  expect(f.native.startCapture).toHaveBeenCalledOnce();
  release(); await second.ready;
  expect(f.native.startCapture).toHaveBeenCalledTimes(2);
  await f.adapter.close();
});
it('rejects AEC initialization failure instead of falling back to untreated input', async () => {
  const f = fixture(), error = vi.fn();
  f.native.startCapture.mockRejectedValue(new Error('AEC_UNAVAILABLE'));
  await expect(f.adapter.start({onData:vi.fn(),onError:error}).ready).rejects.toThrow('AEC_UNAVAILABLE');
  expect(error).toHaveBeenCalled();
  expect(() => f.adapter.start({onData:vi.fn()})).toThrow();
  await f.adapter.close();
  f.native.startCapture.mockResolvedValue(undefined);
  const next=f.adapter.start({onData:vi.fn()}); await next.ready;
  expect(f.native.startCapture).toHaveBeenCalledTimes(2);
  await f.adapter.close();
});
it('records completion only after native completion, with concatenated PCM', async () => {
  const f = fixture(); let done!: (result:'completed') => void;
  f.native.play.mockImplementationOnce(() => new Promise(resolve => {done=resolve;}));
  let result: string | undefined;
  const pending = f.adapter.play(['AQACAA==','AwAEAA==']).then(value => {result=value;});
  await vi.waitFor(() => expect(f.native.play).toHaveBeenCalledWith('AQACAAMABAA='));
  expect(result).toBeUndefined(); done('completed'); await pending;
  expect(result).toBe('completed'); await f.adapter.close();
});
it('bounds native playback that never completes and prevents reuse after failed cleanup', async () => {
  vi.useFakeTimers(); const f=fixture();
  f.native.play.mockImplementation(() => new Promise(() => {}));
  const pending=f.adapter.play(['AQACAA==']); const rejected=expect(pending).rejects.toThrow('AUDIO_PLAYBACK_TIMEOUT');
  await vi.advanceTimersByTimeAsync(6100); await rejected;
  expect(() => f.adapter.start({onData:vi.fn()})).toThrow();
  await f.adapter.close();
});
it('does not start playback when interrupted during preparation', async () => {
  const f=fixture(); let stopped!: () => void;
  f.native.stopPlayback.mockImplementationOnce(() => new Promise(resolve => {stopped=resolve;}));
  const play=f.adapter.play(['AQACAA==']);
  await vi.waitFor(() => expect(f.native.stopPlayback).toHaveBeenCalled());
  const stop=f.adapter.stopPlayback(); stopped(); await stop;
  expect(await play).toBe('interrupted'); expect(f.native.play).not.toHaveBeenCalled();
});

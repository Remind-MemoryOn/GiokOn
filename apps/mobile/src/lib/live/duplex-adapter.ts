import type { DuplexModule } from '../../../modules/giokon-duplex/src/GiokonDuplexModule';
import { base64ToBytes, bytesToBase64 } from './pcm';
import type { MicStartOptions } from './mic-adapter';
import type { PcmAudioStream } from './pcm-stream';

/** Serialize native capture/stop commands; playback completion never blocks an interrupt. */
export function createDuplexAdapter(load: () => DuplexModule) {
  let module: DuplexModule | undefined;
  let queue = Promise.resolve();
  let failed = false;
  let captureId = 0;
  let active: { stop(): void } | null = null;
  let playbackGeneration = 0;
  let cancelPlayback: (() => void) | undefined;
  const get = () => module ??= load();
  const command = (action: () => Promise<void>) => {
    const next = queue.then(action);
    queue = next.catch(() => { failed = true; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([next, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { failed = true; reject(new Error('AUDIO_COMMAND_TIMEOUT')); }, 5000);
    })]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
  };
  return {
    supported(): boolean { try { get(); return true; } catch { return false; } },
    start(options: MicStartOptions): {stop(): void; ready: Promise<void>} {
      if (active || failed) throw new Error('AUDIO_CAPTURE_UNAVAILABLE');
      const native = get(), id = ++captureId;
      let stopped = false;
      const audio = native.addListener('onAudio', event => {
        if (!stopped && event.captureId === id) options.onData(event.data);
      });
      const error = native.addListener('onError', event => {
        if (!stopped) options.onError?.(new Error(event.message));
      });
      const stop = () => {
        if (stopped) return;
        stopped = true; audio.remove(); error.remove(); active = null;
        void command(() => native.stopCapture()).catch(error => options.onError?.(error));
      };
      active = {stop};
      const ready = command(async () => {
        if (stopped) return;
        if (failed) throw new Error('AUDIO_CLEANUP_FAILED');
        await native.startCapture(id);
      });
      void ready.catch(error => { stop(); options.onError?.(error); });
      return {stop, ready};
    },
    async play(chunks: string[]): Promise<'completed' | 'interrupted' | 'empty'> {
      const generation = ++playbackGeneration;
      cancelPlayback?.();
      await command(() => get().stopPlayback());
      if (generation !== playbackGeneration) return 'interrupted';
      if (failed) throw new Error('AUDIO_CLEANUP_FAILED');
      const parts = chunks.map(base64ToBytes);
      const size = parts.reduce((total, part) => total + part.length, 0);
      if (!size) return 'empty';
      if (size % 2 || size > 4320000) throw new Error('INVALID_PLAYBACK_PCM');
      const pcm = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { pcm.set(part, offset); offset += part.length; }
      let cancel!: () => void;
      const cancelled = new Promise<'interrupted'>(resolve => { cancel = () => resolve('interrupted'); });
      cancelPlayback = cancel;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([get().play(bytesToBase64(pcm)), cancelled, new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            failed = true;
            void command(() => get().stopPlayback()).catch(() => {});
            reject(new Error('AUDIO_PLAYBACK_TIMEOUT'));
          }, size / 48 + 6000);
        })]);
        return generation === playbackGeneration ? result : 'interrupted';
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (cancelPlayback === cancel) cancelPlayback = undefined;
      }
    },
    async playStream(stream: PcmAudioStream): Promise<'completed' | 'interrupted'> {
      const generation = ++playbackGeneration;
      cancelPlayback?.();
      await command(() => get().stopPlayback());
      if (generation !== playbackGeneration) { stream.cancel(); return 'interrupted'; }
      if (failed) throw new Error('AUDIO_CLEANUP_FAILED');
      let cancel!: () => void;
      const cancelled = new Promise<'interrupted'>(resolve => { cancel = () => { stream.cancel(); resolve('interrupted'); }; });
      cancelPlayback = cancel;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let ended = false;
      const native = get();
      const rendering = native.startStream().then(result => {
        if (result === 'completed' && !ended) throw new Error('AUDIO_STREAM_EARLY_COMPLETION');
        return result;
      });
      const feeding = (async () => {
        for await (const data of stream) {
          if (generation !== playbackGeneration) return;
          await command(async () => { if (generation === playbackGeneration) await native.appendStream(data); });
        }
        if (generation !== playbackGeneration) return;
        ended = true;
        await command(() => native.finishStream());
      })();
      try {
        const result = await Promise.race([
          Promise.all([rendering, feeding]).then(([result]) => result), cancelled,
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('AUDIO_PLAYBACK_TIMEOUT')), 216000); }),
        ]);
        return generation === playbackGeneration ? result : 'interrupted';
      } catch (error) {
        if (generation === playbackGeneration) playbackGeneration++;
        stream.cancel();
        await command(() => native.stopPlayback());
        throw error;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (cancelPlayback === cancel) cancelPlayback = undefined;
      }
    },
    async stopPlayback(): Promise<void> {
      playbackGeneration++;
      cancelPlayback?.();
      await command(() => get().stopPlayback());
    },
    async close(): Promise<void> {
      playbackGeneration++;
      cancelPlayback?.();
      active?.stop();
      if (module) {
        await command(() => get().close());
        // A successful queued close proves previous work settled and releases a transient init failure.
        failed = false;
      }
    },
  };
}

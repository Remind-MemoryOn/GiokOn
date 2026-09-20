// react-native-live-audio-stream 1.1.1의 default export / start·stop·on 계약.
export type MicStartOptions = {
  onData: (base64Chunk: string) => void;
  onError?: (error: unknown) => void;
};

interface StreamModule {
  init(options: Record<string, unknown>): void;
  start(): void;
  stop(): void;
  on(event: 'data', callback: (chunk: string) => void): { remove(): void };
}

export function createMicAdapter(load: () => unknown) {
  let cached: StreamModule | null | undefined;
  let active: { stop(): void } | null = null;
  let stopFailed = false;

  function getModule(): StreamModule | null {
    if (cached !== undefined) return cached;
    try {
      const raw = load();
      const value = raw && typeof raw === 'object' && 'default' in raw ? raw.default : raw;
      if (!value || typeof value !== 'object' ||
          !['init', 'start', 'stop', 'on'].every((key) =>
            typeof (value as Record<string, unknown>)[key] === 'function')) {
        return cached = null;
      }
      return cached = value as StreamModule;
    } catch {
      return cached = null;
    }
  }

  return {
    supported: () => getModule() !== null,
    start({ onData, onError }: MicStartOptions): { stop(): void } {
      if (stopFailed) throw new Error('마이크 중지를 확인하지 못했어요. 앱을 다시 실행해 주세요.');
      // 이벤트 리스너를 모듈이 전역 교체하므로 중복 시작은 명시적으로 거부한다.
      if (active) throw new Error('마이크가 이미 사용 중이에요.');
      const stream = getModule();
      if (!stream) throw new Error('마이크 스트리밍 모듈을 사용할 수 없습니다.');
      let subscription: { remove(): void } | undefined;
      let stopped = false;
      const handle = {
        stop() {
          if (stopped) return;
          stopped = true;
          active = null;
          let failure: unknown;
          let failed = false;
          try { stream.stop(); } catch (e) { failed = true; failure = e; }
          try { subscription?.remove(); } catch (e) { failed = true; failure ??= e; }
          if (failed) {
            stopFailed = true;
            try { onError?.(failure); } catch { /* Preserve the native failure below. */ }
            throw failure;
          }
        },
      };
      try {
        stream.init({ sampleRate: 16000, channels: 1, bitsPerSample: 16,
          audioSource: 6, bufferSize: 4096 });
        subscription = stream.on('data', (data) => {
          if (!stopped) onData(data);
        });
        if (!subscription || typeof subscription.remove !== 'function') {
          throw new Error('마이크 이벤트 연결에 실패했어요.');
        }
        active = handle;
        stream.start();
        return handle;
      } catch (e) {
        handle.stop();
        throw e;
      }
    },
  };
}

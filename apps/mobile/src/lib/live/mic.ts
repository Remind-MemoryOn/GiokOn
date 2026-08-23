// 마이크 → PCM 스트리밍 래퍼 (react-native-live-audio-stream).
//
// ⚠️ 네이티브 모듈이라 Expo Go 에선 동작하지 않는다(dev-client/EAS 빌드 필요).
// 모듈 로드 실패 시 isSupported=false 로 보고해 호출부가 기존 파이프라인으로 폴백한다.

type StartOptions = { onData: (base64Chunk: string) => void; onError?: (e: unknown) => void };

interface LiveAudioStreamModule {
  init(options: Record<string, unknown>): void;
  startRecording(): void;
  stopRecording(): void;
  ondata: ((data: string) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

let cached: LiveAudioStreamModule | null | undefined;

function loadModule(): LiveAudioStreamModule | null {
  if (cached !== undefined) return cached;
  try {
    // 정적 import 하면 네이티브 모듈이 없는 환경(Expo Go)에서 모듈 로드 자체가
    // 터져 폴백을 못 한다 → 지연 require 로만 안전하게 탐색할 수 있다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-live-audio-stream') as LiveAudioStreamModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function micStreamingSupported(): boolean {
  return loadModule() !== null;
}

/**
 * 16kHz·mono·16bit 녹음을 시작하고 청크(base64 PCM)를 onData 로 흘린다.
 * 반환값의 stop() 으로 끊는다. 중복 start 는 내부에서 무시한다.
 */
export function startMicStream({ onData, onError }: StartOptions): { stop: () => void } {
  const stream = loadModule();
  if (!stream) throw new Error('마이크 스트리밍 모듈을 사용할 수 없습니다.');
  stream.init({
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION — 배경 소리 억제
    bufferSize: 4096,
  });
  stream.ondata = onData;
  stream.onerror = (e) => onError?.(e);
  stream.startRecording();
  return {
    stop: () => {
      try {
        stream.stopRecording();
      } catch (e) {
        onError?.(e);
      }
      stream.ondata = null;
      stream.onerror = null;
    },
  };
}

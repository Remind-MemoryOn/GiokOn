import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createMicAdapter } from './mic-adapter';

// 설치된 패키지의 JS 래퍼를 실행한다. 모듈 계약을 테스트 안에서 다시 만들지 않는다.
function installedModule() {
  const native = { init: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const listeners = new Map<string, (chunk: string) => void>();
  class Emitter {
    removeAllListeners(event: string) { listeners.delete(event); }
    addListener(event: string, cb: (chunk: string) => void) {
      listeners.set(event, cb);
      return { remove: () => { listeners.delete(event); } };
    }
  }
  const source = readFileSync(createRequire(import.meta.url).resolve('react-native-live-audio-stream'), 'utf8');
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    require: () => ({ NativeModules: { RNLiveAudioStream: native }, NativeEventEmitter: Emitter }),
  });
  return { exports, native, listeners };
}

describe('실제 설치 마이크 라이브러리 계약', () => {
  it.each([true, false])('default export 정규화=%s, PCM 수신 및 정리', (wrapped) => {
    const m = installedModule();
    const adapter = createMicAdapter(() => wrapped ? m.exports : m.exports.default);
    expect(adapter.supported()).toBe(true);
    const onData = vi.fn();
    const h = adapter.start({ onData });
    expect(m.native.init).toHaveBeenCalledWith(expect.objectContaining({ sampleRate: 16000, channels: 1, bitsPerSample: 16 }));
    expect(m.native.start).toHaveBeenCalledOnce();
    m.listeners.get('data')!('PCM');
    expect(onData).toHaveBeenCalledWith('PCM');
    expect(() => adapter.start({ onData })).toThrow('이미 사용');
    h.stop(); h.stop();
    expect(m.native.stop).toHaveBeenCalledOnce();
    expect(m.listeners.size).toBe(0);
    adapter.start({ onData }).stop();
    expect(m.native.start).toHaveBeenCalledTimes(2);
  });

  it('부분 API/모듈 로드 실패를 지원한다고 표시하지 않는다', () => {
    expect(createMicAdapter(() => ({ init() {} })).supported()).toBe(false);
    expect(createMicAdapter(() => { throw new Error('missing native module'); }).supported()).toBe(false);
  });

  it('시작 실패 후 리스너를 제거하고 재시도할 수 있다', () => {
    const m = installedModule();
    m.native.start.mockImplementationOnce(() => { throw new Error('native failed'); });
    const adapter = createMicAdapter(() => m.exports);
    expect(() => adapter.start({ onData: vi.fn() })).toThrow('native failed');
    expect(m.listeners.size).toBe(0);
    adapter.start({ onData: vi.fn() }).stop();
  });

  it('중지 실패도 알리고 리스너는 정리한다', () => {
    const m = installedModule();
    m.native.stop.mockImplementationOnce(() => { throw new Error('stop failed'); });
    const onError = vi.fn();
    createMicAdapter(() => m.exports).start({ onData: vi.fn(), onError }).stop();
    expect(onError).toHaveBeenCalledOnce();
    expect(m.listeners.size).toBe(0);
  });
});

// 마이크 → 에코 제거된 PCM 스트리밍 래퍼 (GiokonDuplex).
//
// ⚠️ 네이티브 모듈이라 Expo Go 에선 동작하지 않는다(dev-client/EAS 빌드 필요).
// 모듈 로드 실패 시 supported=false로 보고하고 대화를 시작하지 않는다.
// 권한은 ensureMicPermission() 으로 **청취 시작 전에** 명시 요청한다 — 개발자 빌드는
// 자동 부여되지만 심사용 production 빌드에서 최초 거절 시 무반응이 되는 것을 막는다.

import { Audio } from 'expo-av';
import type { MicStartOptions } from './mic-adapter';
import { duplexAudio as adapter } from './duplex';

/** 마이크 녹음 권한 확인·요청. false면 호출부가 안내 후 중단해야 한다. */
export async function ensureMicPermission(): Promise<boolean> {
  const current = await Audio.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Audio.requestPermissionsAsync();
  return requested.granted;
}

/** Recheck without prompting during automatic turns; an unresponsive native query is denial. */
export async function hasMicPermission(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Audio.getPermissionsAsync().then(permission => permission.granted),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 5000); }),
    ]);
  } catch { return false; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export function micStreamingSupported(): boolean {
  return adapter.supported();
}

/**
 * 16kHz·mono·16bit 녹음을 시작하고 청크(base64 PCM)를 onData 로 흘린다.
 * 반환값의 stop() 으로 끊는다. 중복 start는 거부하고 stop은 멱등 처리한다.
 */
export function startMicStream(options: MicStartOptions): { stop: () => void; ready: Promise<void> } {
  return adapter.start(options);
}

export const closeMicAudio = () => adapter.close();

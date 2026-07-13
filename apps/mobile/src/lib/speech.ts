// 음성 입출력 — @giokon/core의 SpeechProvider 계약 구현(Expo).
//
// TTS: expo-speech(단말 내장 음성)로 AI 질문을 자동 재생한다. 실 서비스에서는
//   Clova Voice(Edge Function)로 교체하되 이 계약은 유지한다.
// STT: 실 STT(gpt-4o-transcribe/Clova) 연동 전이라 여기선 미지원(null)으로 두고,
//   화면은 모의 STT(mockStt)로 어르신 발화를 시뮬레이션한다. 실연동 시 startStt가
//   onFinal 콜백으로 인식 텍스트를 전달하도록 교체한다.

import * as Speech from 'expo-speech';
import type { SpeechProvider, SpeechTtsOptions, SttCallbacks, SttHandle } from '@giokon/core';

export const ExpoSpeechProvider: SpeechProvider = {
  isTtsSupported() {
    return true;
  },
  speak(text: string, opts?: SpeechTtsOptions) {
    return new Promise<void>((resolve) => {
      Speech.stop();
      Speech.speak(text, {
        language: 'ko-KR',
        rate: opts?.rate ?? 0.92, // 노인 대상: 조금 느리게
        pitch: opts?.pitch ?? 1.0,
        volume: opts?.volume ?? 1.0,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  },
  cancelSpeak() {
    Speech.stop();
  },
  isSttSupported() {
    return false; // 실 STT 연동(Edge Function) 후 true로 전환
  },
  startStt(_cb: SttCallbacks): SttHandle | null {
    return null;
  },
};

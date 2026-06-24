// 음성 입출력 추상화 (플랫폼 무관 계약)
//
// 웹은 Web Speech API, 모바일은 Expo AV/실 STT·TTS(Edge Function)로 각각 구현한다.
// DOM 전용 타입(SpeechSynthesisVoice 등)은 여기에 두지 않는다.

export interface SpeechTtsOptions {
  rate?: number // 0.1 ~ 10, 기본 느리게(노인 대상)
  pitch?: number // 0 ~ 2
  volume?: number // 0 ~ 1
}

export interface SttCallbacks {
  onPartial?: (text: string) => void
  onFinal: (text: string) => void
  onError?: (err: string) => void
  onEnd?: () => void
}

export interface SttHandle {
  stop: () => void
  abort: () => void
}

export interface SpeechProvider {
  isTtsSupported(): boolean
  /** AI 질문 음성 재생. 재생 완료 시 resolve. */
  speak(text: string, opts?: SpeechTtsOptions): Promise<void>
  cancelSpeak(): void
  isSttSupported(): boolean
  /** 마이크 입력 시작. 지원하지 않으면 null. */
  startStt(cb: SttCallbacks): SttHandle | null
}

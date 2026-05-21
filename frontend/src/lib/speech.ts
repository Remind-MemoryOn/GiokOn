// Web Speech API wrappers — 브라우저 내장 TTS/STT 사용
// (Clova/Whisper API 키 없이도 한국어 음성 입출력 시연 가능)

export interface TtsOptions {
  rate?: number;   // 0.1 ~ 10, 기본 1
  pitch?: number;  // 0 ~ 2, 기본 1
  volume?: number; // 0 ~ 1, 기본 1
  voice?: SpeechSynthesisVoice;
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getKoreanVoice(): SpeechSynthesisVoice | undefined {
  if (!isTtsSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'ko-KR' && /female|Female|여/.test(v.name)) ||
    voices.find((v) => v.lang === 'ko-KR') ||
    voices.find((v) => v.lang.startsWith('ko'))
  );
}

let cachedKoVoice: SpeechSynthesisVoice | undefined;
export function primeVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (!isTtsSupported()) return resolve();
    const tryNow = () => {
      cachedKoVoice = getKoreanVoice();
      if (cachedKoVoice || window.speechSynthesis.getVoices().length > 0) {
        resolve();
      }
    };
    tryNow();
    if (!cachedKoVoice) {
      window.speechSynthesis.onvoiceschanged = () => {
        cachedKoVoice = getKoreanVoice();
        resolve();
      };
      setTimeout(resolve, 1200);
    }
  });
}

export function speak(text: string, opts: TtsOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isTtsSupported() || !text.trim()) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = opts.rate ?? 0.85; // 노인 대상 — 느리게
      u.pitch = opts.pitch ?? 1.05;
      u.volume = opts.volume ?? 1;
      const voice = opts.voice || cachedKoVoice || getKoreanVoice();
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = (e) => {
        // 'interrupted' 는 정상 동작(다음 음성 시작)이므로 무시
        if ((e as SpeechSynthesisErrorEvent).error === 'interrupted') {
          resolve();
        } else {
          reject(e);
        }
      };
      window.speechSynthesis.speak(u);
    } catch (e) {
      reject(e);
    }
  });
}

export function cancelSpeak() {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}

// --- STT ---------------------------------------------------------------

type AnySpeechRecognition = any;

export function isSttSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface SttHandle {
  stop: () => void;
  abort: () => void;
}

export interface SttCallbacks {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
}

export function startStt(cb: SttCallbacks): SttHandle | null {
  if (!isSttSupported()) {
    cb.onError?.('이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome / Edge 권장)');
    return null;
  }
  const w = window as any;
  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  const rec: AnySpeechRecognition = new Rec();
  rec.lang = 'ko-KR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';

  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interim) cb.onPartial?.(finalText + interim);
  };
  rec.onerror = (e: any) => {
    cb.onError?.(String(e?.error || 'STT 오류'));
  };
  rec.onend = () => {
    if (finalText.trim()) cb.onFinal(finalText.trim());
    cb.onEnd?.();
  };

  try {
    rec.start();
  } catch (e) {
    cb.onError?.(String(e));
    return null;
  }

  return {
    stop: () => {
      try { rec.stop(); } catch {}
    },
    abort: () => {
      try { rec.abort(); } catch {}
    },
  };
}

// 음성 중계 주소 — 앱의 **유일한** 음성 경로(2026-09-23 중계 단일화, 계획 M1).
//
// 예전에는 이 값이 비어 있으면 앱이 Gemini Live 에 직접 붙었다(검열되지 않은 원본 오디오
// 경로). 이제 직접 경로는 코드에 없다 — 값이 없거나 형식이 틀리면 세션 시작을 막는다.
// 규칙: wss + 호스트(+포트) + 경로 정확히 `/voice`. 계정 정보·쿼리·해시 없음
// (토큰은 URL 이 아니라 첫 프레임으로만 보낸다).
//
// ⚠️ `new URL()` 로 검사하지 않는다 — React Native 내장 URL(Libraries/Blob/URL.js)은
// `pathname` 을 `https?://` 에서만 파싱해 `wss://…/voice` 에 항상 `'/'` 를 돌려주고,
// 생성자가 끝에 `/` 를 덧붙인다. Node(테스트)의 WHATWG URL 과 결과가 달라 테스트는 통과하고
// 기기에서는 모든 중계 주소가 거절됐다. 런타임에 기대지 않는 정규식으로 판정한다.

const RELAY_URL = /^wss:\/\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?::\d{1,5})?\/voice$/;

export function parseVoiceRelayUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && RELAY_URL.test(value) ? value : null;
}

/** 빌드에 박힌 `EXPO_PUBLIC_VOICE_RELAY_URL`(검증된 값) — 없으면 null. */
export function voiceRelayUrl(): string | null {
  return parseVoiceRelayUrl(process.env.EXPO_PUBLIC_VOICE_RELAY_URL);
}

export const VOICE_RELAY_MISSING_MESSAGE =
  '음성 중계 서버 주소가 설정되지 않은 앱이에요. 관리자에게 앱 설정을 확인해 달라고 요청해 주세요.';

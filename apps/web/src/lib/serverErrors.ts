// 서버 오류 코드 → 화면 문구 변환의 공통 본체. 판정은 서버가 하고, 여기서는 식별자
// (`ORG_INVITE_INVALID` 등)를 읽을 수 있는 말로만 바꾼다 — 화면에서 다시 판정하지 않는다.

/** 오류 → 화면 문구. 표에 있는 코드가 들어 있으면 그 문구, 아니면 원래 문구, 그것도 없으면 `fallback`. */
export function serverErrorMessage(messages: Record<string, string>, error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = Object.keys(messages).find((k) => raw.includes(k));
  return code ? messages[code] : raw || fallback;
}

// 위기 기록의 발화 근거 표시(T25.17 웹 파트) — 판정은 core `safetyEvidenceState`, 여기는 **보이는 말**만.
// 발췌가 비어 있는 것을 안내 문구(caregiver_alert)로 덮지 않는다 — 근거가 없다는 사실을 그대로 보인다.
import { safetyEvidenceState } from '@giokon/core';

export const EVIDENCE_PENDING_TEXT = '발화 근거를 저장하는 중이에요.';
export const EVIDENCE_MISSING_TEXT = '발화 근거 저장 실패 — 판정만 기록됐어요.';

/** `발화: “…”` · 저장 중 · 저장 실패 중 하나. */
export function safetyEvidenceText(ev: { excerpt: string | null; created_at: string }, now: number = Date.now()): string {
  const state = safetyEvidenceState(ev.excerpt, ev.created_at, now);
  if (state === 'present') return `발화: “${ev.excerpt!.trim()}”`;
  return state === 'pending' ? EVIDENCE_PENDING_TEXT : EVIDENCE_MISSING_TEXT;
}

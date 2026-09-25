// 단일 대화 분석의 표시 값 — 정성 등급은 실측값에서 파생한다(임의값 아님 — 기준을 코드에 명시).
import { NO_VALUE } from '../../lib/format';

/** 대화 시간 "12분 5초". 끝나지 않았으면 '—'. */
export function durationLabel(startIso: string, endIso?: string): string {
  if (!endIso) return NO_VALUE;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

/** 대화 집중도 — 참여율(0~1) 기준. */
export function focusLabel(participation: number): string {
  return participation >= 0.5 ? '높음' : participation >= 0.25 ? '보통' : '낮음';
}

/** 표현 빈도 — 발화당 평균 글자 수 기준. */
export function expressLabel(avgUtteranceChars: number): string {
  return avgUtteranceChars >= 30 ? '높음' : avgUtteranceChars >= 15 ? '보통' : '낮음';
}

/** 대화 길이 — 세션 분 기준. 기록이 없으면(0) '—'. */
export function lengthLabel(minutes: number): string {
  return minutes >= 15 ? '긺' : minutes >= 8 ? '보통' : minutes > 0 ? '짧음' : NO_VALUE;
}

/** 요약은 문장 단위 불릿으로(근거 없으면 빈 목록). */
export function summaryBullets(summary: string): string[] {
  return summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

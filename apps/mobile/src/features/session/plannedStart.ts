import type { SessionStartFailure } from '../../data/session-persistence';

// 세션 시작 직전 "오늘의 설계" 판정(감사 P1-7 · T25.15).
//
// 화면이 렌더 때 받아 둔 조회 결과는 믿지 않는다 — 조회 중·실패가 `null`(설계 없음)과 구별되지 않아
// 설계를 버린 즉석 세션이 만들어졌고, 동의 확인을 기다리는 동안 조회가 끝나도 옛 `null` 을 썼다.
// 시작 직전에 한 번 더 조회해 그 결과로만 정한다: 성공한 "없음"일 때만 즉석 시작, 조회 실패면 세션을 만들지 않는다.

export type StartPlan<Row> =
  | { kind: 'planned'; row: Row }
  | { kind: 'instant' }
  | { kind: 'unavailable' };

export async function resolveStartPlan<Row>(fetchDuePlanned: () => Promise<Row | null>): Promise<StartPlan<Row>> {
  let row: Row | null;
  try {
    row = await fetchDuePlanned();
  } catch {
    return { kind: 'unavailable' };
  }
  return row ? { kind: 'planned', row } : { kind: 'instant' };
}

export const PLAN_UNAVAILABLE_ALERT = {
  title: '오늘의 대화 설계를 확인하지 못했어요',
  body: '설계된 대화가 있는지 확인한 뒤에 시작해요.\n연결을 확인하고 다시 시도해 주세요.',
} as const;

/**
 * DB 가 시작을 거절한 이유별 안내(T21.13 · T25.11 · T25.19). DB 가 판정하고 앱은 이유만 보여 준다.
 * 다른 기기에서 진행 중인 세션을 조용히 덮어쓰거나 끝내지 않는다 — 감독 화면의 원격 종료로 정리한다.
 */
export const START_FAILURE_ALERT: Record<SessionStartFailure, { title: string; body: string }> = {
  // 요양보호사 1명당 동시 진행 4대(사용자 확정 2026-09-24).
  supervisor_limit: {
    title: '진행 중인 대화가 이미 4개예요',
    body: '한 분이 동시에 진행할 수 있는 대화는 4개까지예요.\n끝난 대화를 저장한 뒤 다시 시작해 주세요.',
  },
  elder_busy: {
    title: '이 어르신은 다른 기기에서 대화 중이에요',
    body: '한 어르신과는 한 번에 한 대화만 할 수 있어요.\n감독 화면에서 진행 중인 대화를 종료한 뒤 다시 시작해 주세요.',
  },
  already_started: {
    title: '이미 시작된 대화 설계예요',
    body: '다른 선생님이 이 설계로 대화를 시작했거나 끝냈어요.\n화면을 새로 고친 뒤 다시 확인해 주세요.',
  },
  consent_required: {
    title: '대화 처리 동의를 확인해 주세요',
    body: '어르신의 대화 처리 동의가 없어 대화를 시작할 수 없어요.',
  },
  failed: {
    title: '대화를 시작하지 못했어요',
    body: '동의·이용 권한 또는 서버 연결을 확인한 뒤 다시 시도해 주세요.',
  },
};

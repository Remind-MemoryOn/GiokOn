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

// @giokon/data — 전량 조회 페이징 헬퍼
//
// PostgREST 는 한 응답의 행 수에 상한이 있고(기본 1000), 호출부가 `.limit(n)` 을 주면
// 거기서 잘린다. 목록 화면은 최근 N건만 보여 주면 되지만 **집계 화면은 다르다** —
// 앱의 전체 분석·인지 효과 분석·주제별 추이는 세션/분석 전량을 모아 비율과 추이를
// 계산하므로, 잘린 데이터로 계산하면 화면이 조용히 틀린 값을 보여 준다
// (근거 없는 값을 만들지 않는다는 원칙에 정면으로 어긋난다).
//
// 그래서 집계용 조회는 range 로 끝까지 훑는다. 무한정 받지 않도록 상한을 두고,
// 상한에 걸리면 `truncated` 로 알려 호출부가 사실대로 표시할 수 있게 한다.

/** 한 번에 받아 오는 행 수(PostgREST 기본 상한과 동일). */
export const PAGE_SIZE = 1000

/** 안전 상한 — 이보다 많으면 더 받지 않는다(메모리·응답시간 보호). */
export const MAX_ROWS = 20_000

export interface PagedResult<T> {
  rows: T[]
  /** 상한(MAX_ROWS)에 걸려 뒤쪽 데이터를 받지 못했는지. */
  truncated: boolean
}

/**
 * `range(from, to)` 로 끝까지 페이징한다.
 *
 * @param fetchPage 주어진 구간을 조회하는 함수(정렬은 호출부가 고정해야 한다 —
 *   정렬이 불안정하면 페이지 사이에 행이 중복·누락될 수 있다).
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
): Promise<PagedResult<T>> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, MAX_ROWS) - 1
    const page = await fetchPage(from, to)
    rows.push(...page)
    if (page.length < to - from + 1) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

import { describe, expect, it } from 'vitest'
import { MAX_ROWS, PAGE_SIZE, fetchAllPages } from './paging'

/** from..to 구간을 잘라 주는 가짜 서버(총 total 행). */
function server(total: number) {
  const all = Array.from({ length: total }, (_, i) => i)
  const calls: [number, number][] = []
  return {
    calls,
    fetch: async (from: number, to: number) => {
      calls.push([from, to])
      return all.slice(from, to + 1)
    },
  }
}

describe('fetchAllPages', () => {
  it('한 페이지에 다 들어가면 한 번만 호출한다', async () => {
    const s = server(10)
    const { rows, truncated } = await fetchAllPages(s.fetch)
    expect(rows).toHaveLength(10)
    expect(truncated).toBe(false)
    expect(s.calls).toEqual([[0, PAGE_SIZE - 1]])
  })

  it('페이지 경계를 넘으면 끝까지 이어 받는다', async () => {
    const s = server(PAGE_SIZE + 7)
    const { rows, truncated } = await fetchAllPages(s.fetch)
    expect(rows).toHaveLength(PAGE_SIZE + 7)
    expect(truncated).toBe(false)
    expect(s.calls).toHaveLength(2)
  })

  it('정확히 페이지 배수면 빈 페이지를 한 번 더 받고 끝낸다(누락 없음)', async () => {
    const s = server(PAGE_SIZE)
    const { rows, truncated } = await fetchAllPages(s.fetch)
    expect(rows).toHaveLength(PAGE_SIZE)
    expect(truncated).toBe(false)
    expect(s.calls).toHaveLength(2)
  })

  it('안전 상한을 넘으면 거기서 멈추고 truncated 로 알린다(조용히 자르지 않는다)', async () => {
    const s = server(MAX_ROWS + PAGE_SIZE)
    const { rows, truncated } = await fetchAllPages(s.fetch)
    expect(rows).toHaveLength(MAX_ROWS)
    expect(truncated).toBe(true)
  })
})

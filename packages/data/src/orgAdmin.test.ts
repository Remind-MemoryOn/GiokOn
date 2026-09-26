import { describe, expect, it } from 'vitest'
import { ORG_CAPABILITIES, parseTopicList, toCapabilityTable } from './hooks/orgAdmin'

describe('toCapabilityTable — 권한표 행을 3종 전부로(서버 기본 집합 폴백과 같다)', () => {
  it('행이 없으면 기본 집합(관리자·사회복지사·센터장)', () => {
    const t = toCapabilityTable([])
    for (const c of ORG_CAPABILITIES) expect(t[c]).toEqual(['org_admin', 'social_worker', 'center_director'])
  })
  it('행이 있는 권한은 그 역할만 · 원본 배열을 공유하지 않는다', () => {
    const src = [{ capability: 'journal_finalize' as const, allowed_roles: ['caregiver' as const] }]
    const t = toCapabilityTable(src)
    expect(t.journal_finalize).toEqual(['caregiver'])
    t.journal_finalize.push('org_admin')
    expect(src[0].allowed_roles).toEqual(['caregiver'])
  })
})

describe('parseTopicList — 기본 피할 주제 입력', () => {
  it('쉼표·줄바꿈으로 나누고 공백·빈 값·중복을 걸러 낸다', () => {
    expect(parseTopicList(' 전쟁, 가족사\n전쟁 ,, 병원 ')).toEqual(['전쟁', '가족사', '병원'])
  })
  it('최대 30개(DB 제약)', () => {
    expect(parseTopicList(Array.from({ length: 40 }, (_, i) => `주제${i}`).join(','))).toHaveLength(30)
  })
})

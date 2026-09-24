import { describe, expect, it } from 'vitest'
import { buildJournalDraft } from './journal'

describe('buildJournalDraft (요양일지 AI 초안 — mock)', () => {
  it('문장을 관찰 카테고리로 묶어 구조화한다', () => {
    const draft = buildJournalDraft({
      elderName: '이순자',
      source: 'voice',
      rawText: '점심 식사를 남김없이 드셨어요. 오후에 산책을 20분 하셨습니다. 따님이 방문해서 기분이 밝으셨어요.',
      date: '2026-07-18',
    })
    expect(draft).toContain('[이순자 어르신 요양일지 · 2026-07-18]')
    expect(draft).toContain('입력 방식: 음성 입력')
    expect(draft).toContain('■ 식사')
    expect(draft).toContain('- 점심 식사를 남김없이 드셨어요.')
    expect(draft).toContain('■ 활동')
    // '방문+기분' 복합 문장은 선순위 카테고리(기분·표정) 한 곳에만 정리된다.
    expect(draft).toContain('■ 기분·표정')
    expect(draft).toContain('- 따님이 방문해서 기분이 밝으셨어요.')
    // 사람 확인 게이트 고지(F-25).
    expect(draft).toContain('확인·수정한 뒤 저장')
  })

  it('분류되지 않는 문장은 기타 관찰로 정리한다', () => {
    const draft = buildJournalDraft({
      elderName: '김복순',
      source: 'typed',
      rawText: '오늘따라 창밖을 오래 바라보셨다',
    })
    expect(draft).toContain('■ 기타 관찰')
    expect(draft).toContain('- 오늘따라 창밖을 오래 바라보셨다')
  })

  it('빈 원문은 거부한다', () => {
    expect(() =>
      buildJournalDraft({ elderName: '김복순', source: 'typed', rawText: '   ' }),
    ).toThrow('일지 원문이 비어 있습니다')
  })

  it('진단·판정 표현을 만들지 않는다(관찰 원문 그대로 정리)', () => {
    const draft = buildJournalDraft({
      elderName: '박영감',
      source: 'typed',
      rawText: '기침을 몇 번 하셨고 물을 자주 드셨다.',
    })
    // 원문 문장만 재배치 — '진단', '치매', '처방' 같은 판정 어휘를 추가하지 않는다.
    expect(draft).not.toMatch(/진단|처방|치료해야/)
    expect(draft).toContain('■ 건강 관찰')
  })
})

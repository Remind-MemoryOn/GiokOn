import { describe, expect, it } from 'vitest'
import { runAgentTurn, summarizeSharedForGuardian, AGENT_DISCLOSURE } from './agent'

describe('runAgentTurn (웹 에이전트 — mock 의도 분류)', () => {
  it('요양보호사: 일지 요청은 초안 도구를 제안하고 사람 확인을 요구한다', () => {
    const reply = runAgentTurn('caregiver', '점심 잘 드시고 산책하셨어 일지 초안 만들어줘')
    expect(reply.action?.kind).toBe('draft_journal')
    expect(reply.requiresConfirmation).toBe(true)
    if (reply.action?.kind === 'draft_journal') {
      expect(reply.action.rawText).toContain('산책')
    }
  })

  it('요양보호사: 공개 요청은 공개 도구를 제안하고 사람 확인을 요구한다', () => {
    expect(runAgentTurn('caregiver', '오늘 일지 공개해줘').action?.kind).toBe('publish_journal')
    expect(runAgentTurn('caregiver', '최근 분석 공개해줘').action?.kind).toBe('publish_analysis')
    expect(runAgentTurn('caregiver', '오늘 일지 공개해줘').requiresConfirmation).toBe(true)
  })

  it('요양보호사: 해석 불가 입력은 도구 없이 도움말만 준다', () => {
    const reply = runAgentTurn('caregiver', '안녕?')
    expect(reply.action).toBeNull()
    expect(reply.requiresConfirmation).toBe(false)
  })

  it('보호자: 의료 질문은 도구 없이 사람 상담으로 안내한다(비의료 락다운)', () => {
    const reply = runAgentTurn('guardian', '우리 어머니 치매인가요? 약을 바꿔야 할까요?')
    expect(reply.action).toBeNull()
    expect(reply.message).toContain('의료')
    expect(reply.message).not.toMatch(/진단해|치료하|처방/)
  })

  it('보호자: 요약 요청은 설명 도구(읽기 전용 — 게이트 불필요)를 실행한다', () => {
    const reply = runAgentTurn('guardian', '최근 소식 요약해줘')
    expect(reply.action?.kind).toBe('explain_shared')
    expect(reply.requiresConfirmation).toBe(false)
  })

  it('AI 고지 문구는 의료 판단 배제를 명시한다', () => {
    expect(AGENT_DISCLOSURE).toContain('의학적 판단은 제공하지 않아요')
  })
})

describe('summarizeSharedForGuardian (보호자 설명 도구)', () => {
  it('공개 데이터만 근거로 관찰 언어 요약을 만든다', () => {
    const text = summarizeSharedForGuardian({
      journalCount: 2,
      analysisCount: 1,
      latestJournalExcerpt: '점심 잘 드시고 산책하셨어요',
      latestAnalysisSummary: '고향 이야기에 호응이 좋으셨어요.',
    })
    expect(text).toContain('요양일지 2건')
    expect(text).toContain('대화 관찰 요약 1건')
    expect(text).toContain('의학적 판단이 아니니')
    expect(text).not.toMatch(/진단|호전|악화|치료 효과/)
  })

  it('공개 데이터가 없으면 그렇게 말한다', () => {
    expect(summarizeSharedForGuardian({ journalCount: 0, analysisCount: 0 })).toContain(
      '공개된 소식이 없어요',
    )
  })
})

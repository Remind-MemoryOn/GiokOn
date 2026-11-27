import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_DELETION_TITLE,
  AI_REPORT_REASONS,
  AI_REPORT_TEXT_MAX,
  AI_REPORT_TITLE_PREFIX,
  SUPPORT_NOTE_MAX,
  buildAccountDeletionInquiry,
  buildAiReportInquiry,
} from './support-requests'

// 문의 테이블 check 제약(제목 2~100 · 본문 2~5000)을 넘지 않아야 접수가 실패하지 않는다.
const fitsInquiry = ({ title, content }: { title: string; content: string }) =>
  title.trim().length >= 2 && title.trim().length <= 100 && content.trim().length >= 2 && content.trim().length <= 5000

describe('계정 삭제 요청 문의', () => {
  it('고정 제목(운영자 식별자)과 계정·경로를 담는다', () => {
    const r = buildAccountDeletionInquiry({ email: 'a@example.com', role: '요양보호사', orgName: '해든센터', source: 'app', appVersion: '1.0.0' })
    expect(r.title).toBe(ACCOUNT_DELETION_TITLE)
    expect(r.content).toContain('계정(이메일): a@example.com')
    expect(r.content).toContain('요청 경로: 앱 v1.0.0')
    expect(fitsInquiry(r)).toBe(true)
  })
  it('모르는 값은 지어내지 않고 — 로 둔다', () => {
    const r = buildAccountDeletionInquiry({ email: null, role: null, orgName: null, source: 'web' })
    expect(r.content).toContain('기관: —')
    expect(r.content).toContain('요청 경로: 웹')
    expect(r.content).not.toContain('남기신 말')
  })
  it('긴 메모는 잘라 본문 상한을 넘지 않는다', () => {
    const r = buildAccountDeletionInquiry({ email: 'a@example.com', role: null, orgName: null, source: 'web', note: 'x'.repeat(SUPPORT_NOTE_MAX * 20) })
    expect(fitsInquiry(r)).toBe(true)
  })
})

describe('AI 응답 신고 문의', () => {
  it('사유 문구를 제목에, 발화 원문과 세션을 본문에 남긴다', () => {
    const r = buildAiReportInquiry({ reason: 'unsafe_advice', aiText: '  약을 두 배로 드세요  ', sessionId: 's-1', turnId: 't-1', source: 'app' })
    expect(r.title).toBe(`${AI_REPORT_TITLE_PREFIX} 건강·약·안전에 관한 위험한 조언`)
    expect(r.content).toContain('AI 응답:\n약을 두 배로 드세요')
    expect(r.content).toContain('세션: s-1')
    expect(r.content).toContain('대화 턴: t-1')
    expect(fitsInquiry(r)).toBe(true)
  })
  it('모든 사유가 제목 상한 안에 든다', () => {
    for (const reason of AI_REPORT_REASONS) {
      expect(fitsInquiry(buildAiReportInquiry({ reason: reason.id, aiText: '안녕하세요', sessionId: null, source: 'app' }))).toBe(true)
    }
  })
  it('빈 발화는 신고하지 않는다', () => {
    expect(() => buildAiReportInquiry({ reason: 'other', aiText: '   ', sessionId: null, source: 'app' })).toThrow()
  })
  it('아주 긴 발화·메모도 본문 상한 안으로 자른다', () => {
    const r = buildAiReportInquiry({ reason: 'other', aiText: '가'.repeat(AI_REPORT_TEXT_MAX * 3), sessionId: null, source: 'app', note: '나'.repeat(5000) })
    expect(fitsInquiry(r)).toBe(true)
    expect(r.content).toContain('(이하 생략)')
  })
})

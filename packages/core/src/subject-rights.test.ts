import { describe, expect, it } from 'vitest'
import {
  SUBJECT_EXPORT_FORMAT,
  buildAccountDeletionPlan,
  buildElderDeletionPlan,
  buildSubjectDataExport,
} from './subject-rights'

describe('buildSubjectDataExport — 이동권', () => {
  it('계정·어르신·동의 데이터를 이식 가능한 구조로 감싼다', () => {
    const out = buildSubjectDataExport({
      subjectUserId: 'u1',
      account: { name: '김복순' },
      elders: [{ id: 'p1' }, { id: 'p2' }],
      consents: [{ type: 'sensitive_health_voice' }],
    })
    expect(out.meta.format).toBe(SUBJECT_EXPORT_FORMAT)
    expect(out.meta.subjectUserId).toBe('u1')
    expect(typeof out.meta.exportedAt).toBe('string')
    expect(out.elders).toHaveLength(2)
    expect(out.consents).toHaveLength(1)
  })

  it('consents 미지정 시 빈 배열', () => {
    const out = buildSubjectDataExport({ subjectUserId: 'u1', account: {}, elders: [] })
    expect(out.consents).toEqual([])
  })
})

describe('삭제 계획 — 멀티테넌시·보존 정합', () => {
  it('계정 삭제: 어르신 데이터는 재귀속(파기 아님)', () => {
    const plan = buildAccountDeletionPlan()
    const elders = plan.find((p) => p.scope.includes('어르신'))
    expect(elders?.action).toBe('reassign')
  })

  it('계정 삭제: 동의는 익명화 보존, 감사로그는 2년 보존', () => {
    const plan = buildAccountDeletionPlan()
    expect(plan.find((p) => p.scope.includes('동의'))?.action).toBe('anonymize')
    const audit = plan.find((p) => p.scope.includes('audit_log'))
    expect(audit?.action).toBe('retain')
    expect(audit?.retention).toMatch(/2년/)
  })

  it('계정 삭제: 식별정보 파기는 재귀속·보존 이후(마지막)', () => {
    const plan = buildAccountDeletionPlan()
    const idx = plan.findIndex((p) => p.scope.includes('계정 식별정보'))
    expect(idx).toBe(plan.length - 1)
  })

  it('어르신 삭제: 관련 데이터·동의 파기, 감사로그는 보존', () => {
    const plan = buildElderDeletionPlan()
    expect(plan.some((p) => p.action === 'delete')).toBe(true)
    expect(plan.find((p) => p.scope.includes('audit_log'))?.action).toBe('retain')
  })
})

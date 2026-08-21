import { describe, expect, it } from 'vitest'
import {
  CONSENT_CATALOG,
  CONSENT_SUBJECT_OPTIONS,
  CONSENT_VERSION,
  GUARDIAN_RISK_NOTICE,
  canStartElderSession,
  capacityForSubject,
  consentBasis,
  hasSensitiveConsent,
  missingRequiredConsents,
  requiredAccountConsents,
  requiredElderConsents,
  type ConsentType,
} from './consent'

describe('동의 카탈로그', () => {
  it('민감정보(건강·음성)는 별도 동의·필수로 표시', () => {
    const d = CONSENT_CATALOG.sensitive_health_voice
    expect(d.sensitive).toBe(true)
    expect(d.required).toBe(true)
    expect(d.subject).toBe('elder')
  })

  it('국외이전은 crossBorder 플래그', () => {
    expect(CONSENT_CATALOG.cross_border_transfer.crossBorder).toBe(true)
  })

  it('마케팅은 선택(required=false)', () => {
    expect(CONSENT_CATALOG.marketing_optional.required).toBe(false)
  })

  it('모든 정의의 버전은 현재 버전과 일치', () => {
    for (const d of Object.values(CONSENT_CATALOG)) {
      expect(d.version).toBe(CONSENT_VERSION)
    }
  })
})

describe('필수 동의 판정', () => {
  it('계정 필수 = privacy_required', () => {
    expect(requiredAccountConsents()).toEqual(['privacy_required'])
  })

  it('어르신 필수 = 민감·국외이전·AI고지', () => {
    expect(requiredElderConsents().sort()).toEqual(
      ['ai_processing', 'cross_border_transfer', 'sensitive_health_voice'].sort(),
    )
  })

  it('누락 필수 동의를 정확히 계산', () => {
    const granted: ConsentType[] = ['sensitive_health_voice']
    expect(missingRequiredConsents('elder', granted).sort()).toEqual(
      ['ai_processing', 'cross_border_transfer'].sort(),
    )
  })

  it('필수 동의 모두 확보 시 세션 시작 가능', () => {
    const all: ConsentType[] = requiredElderConsents()
    expect(canStartElderSession(all)).toBe(true)
    expect(canStartElderSession(['sensitive_health_voice'])).toBe(false)
  })

  it('민감정보 동의 여부 판정', () => {
    expect(hasSensitiveConsent(['sensitive_health_voice'])).toBe(true)
    expect(hasSensitiveConsent(['ai_processing'])).toBe(false)
  })
})

describe('동의 주체 · 의사능력', () => {
  it('의사능력은 주체에서 파생한다(화면에 선택이 없다)', () => {
    expect(capacityForSubject('self')).toBe('capable')
    expect(capacityForSubject('legal_representative')).toBe('incapable')
    // 후견 미개시 보호자는 판정 근거가 없다 — limited 로 낮춰 잡지 않는다.
    expect(capacityForSubject('guardian')).toBe('unknown')
  })

  it('본인이 아니면 대리 동의자 정보가 필요하다(DB consents_guardian_check)', () => {
    const proxy = CONSENT_SUBJECT_OPTIONS.filter((o) => o.proxy).map((o) => o.value)
    expect(proxy).toEqual(['legal_representative', 'guardian'])
  })

  it('보호자 동의만 법적 한계 근거를 남긴다', () => {
    expect(consentBasis('guardian')).toBe(GUARDIAN_RISK_NOTICE.body)
    expect(consentBasis('self')).toBeNull()
    expect(consentBasis('legal_representative')).toBeNull()
  })
})

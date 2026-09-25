// 어르신 동의 — 판정과 저장 입력을 한 곳에서 만든다(어르신 상세 · 동의 관리 · 어르신 등록).
// ⛔ 화면의 '동의 완료' 판정은 DB 의 세션 처리 판정(app.has_processing_consent)과 같은 기준이어야 한다 —
//    다른 종류의 행을 대신 인정하면 화면은 '완료'인데 세션이 막힌다. 그래서 판정을 여기 하나로 둔다.
import {
  CONSENT_VERSION,
  capacityForSubject,
  consentBasis,
  isCurrentConsent,
  type ConsentSubjectType,
  type ConsentType,
} from '@giokon/core';
import type { ConsentRow } from '@giokon/data';

/** 이 종류의 유효한 동의 증빙(현재 버전·미철회·부여). 없으면 undefined. */
export function currentConsentOf(rows: ConsentRow[] | undefined, type: ConsentType): ConsentRow | undefined {
  return (rows ?? []).find((row) => row.consent_type === type && isCurrentConsent(row));
}

/** 동의 부여 기록 입력 — 본인 동의면 대리인 칸을 비우고, 동의 주체에서 능력·근거를 정한다. */
export function elderConsentGrant(input: {
  profileId: string;
  userId: string;
  orgId: string | null;
  type: ConsentType;
  subject: ConsentSubjectType;
  proxyName: string;
  proxyRelation: string;
}) {
  const self = input.subject === 'self';
  return {
    profile_id: input.profileId,
    user_id: input.userId,
    org_id: input.orgId,
    consent_type: input.type,
    granted: true,
    version: CONSENT_VERSION,
    subject_type: input.subject,
    capacity: capacityForSubject(input.subject),
    guardian_name: self ? null : input.proxyName.trim(),
    guardian_relation: self ? null : input.proxyRelation.trim(),
    basis: consentBasis(input.subject),
  };
}

/** 저장 실패 문구 — 서버에 동의 종류(enum)가 아직 없으면 그 사실을 알린다. 아니면 원래 문구. */
export function consentSaveError(message: string): string {
  return message.includes('elder_privacy_required') && message.includes('consent_type')
    ? '서비스의 어르신 개인정보 동의 설정이 아직 서버에 반영되지 않았어요.'
    : message;
}

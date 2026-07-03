// @giokon/core — 정보주체 권리 도메인 (M9.4)
//
// 개인정보보호법상 정보주체의 열람·정정·삭제·이동(다운로드) 권리 처리의 도메인 규칙.
// 데이터 레이어가 행을 패칭하고, 여기서 이식 가능한 산출물/삭제 계획으로 조립한다.
// (실 파기·익명화 실행은 서버사이드[Edge Function]에서 이 계획을 따른다.)

import { nowIso } from './utils'

export const SUBJECT_EXPORT_FORMAT = 'giokon.subject-export.v1'

export interface SubjectDataExport<TAccount = unknown, TElder = unknown, TConsent = unknown> {
  meta: {
    format: typeof SUBJECT_EXPORT_FORMAT
    exportedAt: string
    subjectUserId: string
    note: string
  }
  account: TAccount
  elders: TElder[]
  consents: TConsent[]
}

/** 이동권(다운로드): 본인 계정 + 소속 어르신·동의 데이터를 이식 가능한 구조로 조립. */
export function buildSubjectDataExport<TAccount, TElder, TConsent>(input: {
  subjectUserId: string
  account: TAccount
  elders: TElder[]
  consents?: TConsent[]
}): SubjectDataExport<TAccount, TElder, TConsent> {
  return {
    meta: {
      format: SUBJECT_EXPORT_FORMAT,
      exportedAt: nowIso(),
      subjectUserId: input.subjectUserId,
      note: '개인정보 이동권(다운로드) 산출물. 본인 계정 및 소속 어르신·동의 데이터 포함.',
    },
    account: input.account,
    elders: input.elders,
    consents: input.consents ?? [],
  }
}

export type DeletionAction = 'delete' | 'anonymize' | 'reassign' | 'retain'

export interface DeletionPlanItem {
  scope: string
  action: DeletionAction
  reason: string
  /** retain/anonymize 시 보존 근거·기간. */
  retention?: string
}

/**
 * 계정(요양보호사) 삭제 요청 처리 계획.
 * 기관 귀속 데이터는 파기하지 않고 재귀속, 법정 보존 대상(감사로그·동의증빙)은 보존한다.
 * (멀티테넌시 원칙: 요양보호사 퇴사/삭제해도 어르신 데이터는 기관에 남는다.)
 */
export function buildAccountDeletionPlan(): DeletionPlanItem[] {
  return [
    {
      scope: '어르신(profiles)·연대기·세션·대화로그',
      action: 'reassign',
      reason: '기관 귀속 데이터 — 요양보호사 삭제 시 기관 관리자에게 재귀속(파기 아님)',
    },
    {
      scope: '음성 원본(Storage)',
      action: 'delete',
      reason: '민감정보 — 보관기간 만료분 즉시 파기',
    },
    {
      scope: '동의 이력(consents)',
      action: 'anonymize',
      reason: '동의·철회 증빙은 보존하되 계정 식별 링크(user_id) 해제',
      retention: '관련 분쟁 소멸시효 경과 후 파기',
    },
    {
      scope: '접속·처리기록(audit_log)',
      action: 'retain',
      reason: '안전성 확보조치 기준 의무 보존',
      retention: '최소 2년 경과 후 파기',
    },
    {
      scope: '계정 식별정보(auth.users·public.users)',
      action: 'delete',
      reason: '재귀속·보존 처리 완료 후 본인 식별정보 파기',
    },
  ]
}

/** 어르신(정보주체) 데이터 삭제(보호자/후견 요청) 처리 계획. */
export function buildElderDeletionPlan(): DeletionPlanItem[] {
  return [
    {
      scope: '어르신 프로필·연대기·세션·대화로그·음성',
      action: 'delete',
      reason: '정보주체 삭제권 — 어르신 관련 개인정보 파기(cascade)',
    },
    {
      scope: '해당 어르신 동의 이력(consents)',
      action: 'delete',
      reason: '어르신 파기 시 관련 동의 증빙도 함께 파기(profile_id cascade)',
    },
    {
      scope: '접속·처리기록(audit_log)',
      action: 'retain',
      reason: '기록 자체는 법정 보존(식별 최소화)',
      retention: '최소 2년 경과 후 파기',
    },
  ]
}

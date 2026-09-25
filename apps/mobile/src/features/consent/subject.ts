// 동의 주체 선택 규칙 — 본인이 아닌 동의(법정 대리인·보호자)는 대리 동의자 성함·관계가 필요하다.
// DB 제약 `consents_guardian_check` 가 본인이 아닌 동의에 `guardian_name` 을 요구하므로, 없으면 저장이 실패한다.
import type { ConsentSubjectType } from '@giokon/core';

export interface SubjectSelection {
  /** 본인이 아닌 동의 — 대리 동의자 입력칸을 보인다. */
  isProxy: boolean;
  canProceed: boolean;
  /** 다음 화면(필수 동의)으로 넘길 값. 본인 동의면 둘 다 빈 문자열. */
  guardianName: string;
  guardianRelation: string;
}

export function subjectSelection(
  subject: ConsentSubjectType | null,
  name: string,
  relation: string,
): SubjectSelection {
  const isProxy = subject !== null && subject !== 'self';
  const canProceed =
    subject !== null && (!isProxy || (name.trim().length > 0 && relation.length > 0));
  return {
    isProxy,
    canProceed,
    guardianName: isProxy ? name.trim() : '',
    guardianRelation: isProxy ? relation : '',
  };
}

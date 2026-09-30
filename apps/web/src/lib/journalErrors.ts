// 프로그램 일지 서버 오류 코드 → 요양보호사용 문구(D5 트리거·RLS).
// 서버 문구를 그대로 띄우면 `JOURNAL_FINALIZE_FORBIDDEN` 같은 식별자가 보인다. 규칙 판정은 서버가 하고
// 여기서는 **읽을 수 있는 말로만** 바꾼다 — 화면에서 다시 판정하지 않는다.
import { serverErrorMessage } from './serverErrors';

const MESSAGES: Record<string, string> = {
  JOURNAL_FINALIZE_FORBIDDEN: '일지 확정 권한이 없어요. 기관 권한표에서 확정 권한을 받은 분이 확정할 수 있어요.',
  JOURNAL_FINALIZE_HUMAN_ONLY: '일지 확정은 담당자가 직접 해야 해요.',
  JOURNAL_FACILITATOR_REQUIRED: '진행한 요양보호사가 있어야 확정할 수 있어요.',
  JOURNAL_FACILITATOR_INVALID: '진행자는 같은 기관의 돌봄 직원이어야 해요.',
  JOURNAL_CONTENT_REQUIRED: '활동 내용을 입력해 주세요.',
  JOURNAL_FINAL_LOCKED: '확정된 일지는 확정 전 상태로 되돌릴 수 없어요.',
  JOURNAL_EDIT_REASON_REQUIRED: '확정된 일지를 고치려면 수정 사유가 필요해요.',
  JOURNAL_EDIT_FORBIDDEN: '확정된 일지를 고칠 권한이 없어요.',
  JOURNAL_WORKER_FIELDS: '자동 생성 중인 항목은 바꿀 수 없어요.',
  JOURNAL_GUARDIAN_TEXT_REQUIRED: '보호자 문장을 먼저 입력해 주세요.',
  SHARE_REVOKE_FORBIDDEN: '공개 철회 권한이 없어요. 기관 권한 위임 표에서 공개 철회 권한을 받은 분이 철회할 수 있어요.',
  SHARE_JOURNAL_NOT_READY: '확정되고 보호자 문장이 승인된 일지만 보호자에게 공개할 수 있어요.',
  JOURNAL_RETRY_NOT_FAILED: '생성에 실패한 일지만 다시 시도할 수 있어요.',
};

/** 오류 → 화면 문구. 알려진 코드가 아니면 원래 문구를 그대로 둔다. */
export function journalErrorMessage(error: unknown, fallback = '저장하지 못했어요.'): string {
  return serverErrorMessage(MESSAGES, error, fallback);
}

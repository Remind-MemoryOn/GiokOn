// 직원 합류 서버 오류 코드 → 화면 문구(파일럿 D3 · W9).
// 판정은 서버가 한다. 여기서는 식별자(ORG_INVITE_INVALID 등)를 읽을 수 있는 말로만 바꾼다.
const MESSAGES: Record<string, string> = {
  ORG_INVITE_INVALID: '초대 코드가 맞지 않거나 만료·회수된 코드예요. 기관 관리자에게 새 코드를 받아 주세요.',
  ORG_JOIN_PENDING: '이미 승인을 기다리는 합류 요청이 있어요.',
  ORG_JOIN_FORBIDDEN: '지금 계정 상태에서는 합류를 요청할 수 없어요.',
  ORG_JOIN_NOT_FOUND: '대기 중인 합류 요청이 없어요.',
  ORG_INVITE_FORBIDDEN: '초대 코드는 기관 관리자와 센터장만 만들거나 회수할 수 있어요.',
  ORG_INVITE_ROLE: '초대로 줄 수 없는 역할이에요.',
  ORG_INVITE_EXPIRY: '유효 기간은 1~30일로 정해 주세요.',
  ORG_INVITE_NOT_FOUND: '이미 회수됐거나 없는 초대 코드예요.',
  ORG_JOIN_SELF: '본인의 합류 요청은 승인할 수 없어요.',
  ORG_JOIN_NOT_PENDING: '이미 처리된 요청이에요. 화면을 새로고침해 주세요.',
  ORG_JOIN_INVITE_REVOKED: '회수된 초대 코드로 온 요청이라 승인할 수 없어요. 새 코드로 다시 요청하게 해 주세요.',
  ORG_JOIN_STALE: '요청한 계정이 이미 다른 기관에 속했거나 상태가 바뀌어 승인할 수 없어요.',
};

/** 오류 → 화면 문구. 알려진 코드가 아니면 원래 문구를 그대로 둔다. */
export function orgJoinErrorMessage(error: unknown, fallback = '처리하지 못했어요.'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  return code ? MESSAGES[code] : raw || fallback;
}

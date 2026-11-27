// 로그인·소셜 로그인·비밀번호 찾기 오류 → 한국어 안내(2026-11-27 Play 출시 준비).
//
// 앱 로그인 실패 알림에 Supabase 영문 원문(`Invalid login credentials` 등)이 그대로 보였다. 문구는 웹
// `apps/web/src/lib/errorText.ts` 의 같은 코드 안내를 그대로 옮겼다(앱은 인증 화면에 필요한 것만 둔다).
// 판정은 서버가 하고 여기서는 읽을 수 있는 말로만 바꾼다. 영문 원문은 돌려주지 않는다.

const NETWORK = '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';

const AUTH_CODES: Record<string, string> = {
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않아요.',
  email_not_confirmed: '이메일 인증이 아직 끝나지 않았어요. 받은 메일의 인증 링크를 눌러 주세요.',
  over_request_rate_limit: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
  over_email_send_rate_limit: '인증 메일 발송 요청이 많아 잠시 막혔어요. 잠시 뒤(최대 1시간) 다시 시도해 주세요.',
  user_banned: '이용이 제한된 계정이에요. 관리자에게 문의해 주세요.',
  email_address_invalid: '사용할 수 없는 이메일 주소예요. 주소를 다시 확인해 주세요.',
  validation_failed: '입력한 내용을 다시 확인해 주세요.',
  provider_disabled: '지금은 이 방법으로 로그인할 수 없어요.',
  email_provider_disabled: '지금은 이메일로 가입·로그인할 수 없어요. 관리자에게 문의해 주세요.',
  flow_state_expired: '로그인 시간이 지났어요. 처음부터 다시 시도해 주세요.',
  flow_state_not_found: '로그인 정보를 찾지 못했어요. 처음부터 다시 시도해 주세요.',
  identity_already_exists: '이미 다른 계정에 연결된 로그인 수단이에요.',
  request_timeout: '응답이 늦어 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
};

const PATTERNS: readonly [RegExp, string][] = [
  [/email rate limit/, AUTH_CODES.over_email_send_rate_limit],
  [/rate limit|too many requests/, AUTH_CODES.over_request_rate_limit],
  [/invalid login credentials/, AUTH_CODES.invalid_credentials],
  [/email not confirmed/, AUTH_CODES.email_not_confirmed],
  [/unable to validate email|invalid email/, AUTH_CODES.email_address_invalid],
  [/failed to fetch|network request failed|networkerror|load failed|fetch failed/, NETWORK],
  [/timeout|timed out/, AUTH_CODES.request_timeout],
];

export const AUTH_ERROR_FALLBACK = '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

export function authErrorText(error: unknown, fallback: string = AUTH_ERROR_FALLBACK): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code ?? '') : '';
  if (code && AUTH_CODES[code]) return AUTH_CODES[code];
  const raw = (error instanceof Error ? error.message : typeof error === 'string' ? error : '').trim();
  if (!raw) return fallback;
  if (/[가-힣]/.test(raw)) return raw; // 앱·서버가 만든 한국어 안내는 그대로
  const lower = raw.toLowerCase();
  for (const [re, ko] of PATTERNS) if (re.test(lower)) return ko;
  return fallback;
}

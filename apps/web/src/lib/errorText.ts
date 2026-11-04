// 오류 → 한국어 안내(2026-11-04 사용자 요청: "에러 메시지들 전부 한국어 안내로").
//
// Supabase(인증·DB·Storage)와 브라우저 네트워크 오류는 영문 원문을 준다(예: `email rate limit exceeded`).
// 화면에는 원문 대신 이 함수의 결과를 보인다. 판정은 서버가 하고 여기서는 **읽을 수 있는 말로만** 바꾼다.
// 순서: 인증 오류 코드 → DB 오류 코드 → 이미 한국어인 문구(서버·화면이 만든 안내)는 그대로 →
//       알려진 영문 표현 → 그래도 모르면 화면이 준 fallback(영문 원문은 보이지 않는다).

/** Supabase Auth 오류 코드(`AuthError.code`). https://supabase.com/docs/guides/auth/debugging/error-codes */
const AUTH_CODES: Record<string, string> = {
  over_email_send_rate_limit: '인증 메일 발송 요청이 많아 잠시 막혔어요. 잠시 뒤(최대 1시간) 다시 시도해 주세요.',
  over_request_rate_limit: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
  over_sms_send_rate_limit: '문자 발송 요청이 많아 잠시 막혔어요. 잠시 뒤 다시 시도해 주세요.',
  email_address_invalid: '사용할 수 없는 이메일 주소예요. 주소를 다시 확인해 주세요.',
  email_address_not_authorized: '지금은 이 이메일 주소로 메일을 보낼 수 없어요. 관리자에게 문의해 주세요.',
  email_exists: '이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요.',
  user_already_exists: '이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요.',
  identity_already_exists: '이미 다른 계정에 연결된 로그인 수단이에요.',
  weak_password: '비밀번호가 너무 약해요. 더 길고 추측하기 어려운 비밀번호로 정해 주세요.',
  same_password: '지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.',
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않아요.',
  email_not_confirmed: '이메일 인증이 아직 끝나지 않았어요. 받은 메일의 인증 링크를 눌러 주세요.',
  phone_not_confirmed: '휴대폰 인증이 아직 끝나지 않았어요.',
  user_not_found: '가입 정보를 찾지 못했어요.',
  user_banned: '이용이 제한된 계정이에요. 관리자에게 문의해 주세요.',
  signup_disabled: '지금은 새로 가입할 수 없어요. 관리자에게 문의해 주세요.',
  email_provider_disabled: '지금은 이메일로 가입·로그인할 수 없어요. 관리자에게 문의해 주세요.',
  provider_disabled: '지금은 이 방법으로 로그인할 수 없어요.',
  otp_expired: '인증 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.',
  otp_disabled: '지금은 이 방법으로 인증할 수 없어요.',
  flow_state_expired: '로그인 시간이 지났어요. 처음부터 다시 시도해 주세요.',
  flow_state_not_found: '로그인 정보를 찾지 못했어요. 처음부터 다시 시도해 주세요.',
  bad_code_verifier: '로그인을 시작한 브라우저에서 링크를 열어 주세요. 다른 브라우저라면 처음부터 다시 시도해 주세요.',
  bad_jwt: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  session_not_found: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  session_expired: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  refresh_token_not_found: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  refresh_token_already_used: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  reauthentication_needed: '보안을 위해 다시 로그인한 뒤 시도해 주세요.',
  captcha_failed: '자동 입력 방지 확인에 실패했어요. 다시 시도해 주세요.',
  validation_failed: '입력한 내용을 다시 확인해 주세요.',
  request_timeout: '응답이 늦어 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  conflict: '다른 요청과 겹쳐 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  unexpected_failure: '일시적인 문제로 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
}

/** Postgres·PostgREST 오류 코드(`PostgrestError.code`). */
const DB_CODES: Record<string, string> = {
  '42501': '이 작업을 할 권한이 없어요.',
  '23505': '이미 등록된 내용이에요.',
  '23503': '연결된 정보가 없거나 다른 곳에서 쓰고 있어 처리하지 못했어요.',
  '23514': '입력한 내용이 허용 범위를 벗어났어요. 다시 확인해 주세요.',
  '23502': '꼭 입력해야 하는 항목이 비어 있어요.',
  '22001': '입력한 글이 너무 길어요.',
  '22P02': '입력 형식이 올바르지 않아요.',
  '40001': '다른 변경과 겹쳤어요. 다시 시도해 주세요.',
  '57014': '처리 시간이 너무 길어 중단됐어요. 잠시 뒤 다시 시도해 주세요.',
  PGRST301: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  PGRST303: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  PGRST116: '해당 정보를 찾지 못했어요.',
}

/** 코드가 없을 때 영문 원문에서 알아보는 표현(소문자 비교). 앞에 있는 것이 우선. */
const PATTERNS: readonly [RegExp, string][] = [
  [/email rate limit|over_email_send_rate_limit/, AUTH_CODES.over_email_send_rate_limit],
  [/rate limit|too many requests/, AUTH_CODES.over_request_rate_limit],
  [/invalid login credentials/, AUTH_CODES.invalid_credentials],
  [/email not confirmed/, AUTH_CODES.email_not_confirmed],
  [/user already registered|already been registered/, AUTH_CODES.user_already_exists],
  [/password should be|password is too weak|weak password/, AUTH_CODES.weak_password],
  [/different from the old password|same password/, AUTH_CODES.same_password],
  [/unable to validate email|invalid email|email address .*invalid/, AUTH_CODES.email_address_invalid],
  [/email link is invalid|has expired|otp.*expired|token has expired/, AUTH_CODES.otp_expired],
  [/code verifier|code challenge/, AUTH_CODES.bad_code_verifier],
  [/jwt expired|invalid refresh token|refresh token not found|auth session missing|session.*expired/, AUTH_CODES.session_expired],
  [/signups? not allowed|signup is disabled/, AUTH_CODES.signup_disabled],
  [/row-level security|permission denied|not authorized|unauthorized|forbidden/, DB_CODES['42501']],
  [/duplicate key|already exists/, DB_CODES['23505']],
  [/violates foreign key/, DB_CODES['23503']],
  [/violates check constraint/, DB_CODES['23514']],
  [/violates not-null/, DB_CODES['23502']],
  [/value too long/, DB_CODES['22001']],
  [/invalid input syntax/, DB_CODES['22P02']],
  [/payload too large|exceeded the maximum allowed size|entity too large|file size/, '파일이 너무 커요. 더 작은 파일로 다시 올려 주세요.'],
  [/invalid mime type|mime type .* not supported/, '올릴 수 없는 파일 형식이에요.'],
  [/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network|err_internet/, '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'],
  [/timeout|timed out/, AUTH_CODES.request_timeout],
  [/not found/, '해당 정보를 찾지 못했어요.'],
]

/** 화면이 따로 정하지 않았을 때의 마지막 안내. */
export const DEFAULT_ERROR_TEXT = '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

const HANGUL = /[가-힣]/

/** 한글이 하나도 없는 문구 = 사람이 읽을 안내가 아니다(영문 원문·내부 식별자). */
export function isUntranslated(text: string): boolean {
  return !HANGUL.test(text)
}

/**
 * 오류 → 한국어 안내. 알려진 코드·표현이면 그 안내, 이미 한국어면 그대로, 모르면 fallback.
 * 영문 원문은 어떤 경우에도 돌려주지 않는다.
 */
export function errorText(error: unknown, fallback: string = DEFAULT_ERROR_TEXT): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code ?? '') : ''
  if (code && AUTH_CODES[code]) return AUTH_CODES[code]
  if (code && DB_CODES[code]) return DB_CODES[code]
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const text = raw.trim()
  if (!text) return fallback
  if (!isUntranslated(text)) return text
  const lower = text.toLowerCase()
  for (const [re, ko] of PATTERNS) if (re.test(lower)) return ko
  return fallback
}

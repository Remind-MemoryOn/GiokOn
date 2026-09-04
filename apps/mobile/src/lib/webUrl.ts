// 웹 주소 한 곳 — 앱에 없는 화면(법적 고지·회원가입·비밀번호 재설정)은 웹이 담당한다.
//
// ⚠️ 도메인을 코드에 박지 않는다. 예전에는 `https://giokon.app/reset` 이 하드코딩돼
// 있었는데, 실제 웹 라우트는 `/reset-password` 라 **재설정 메일의 링크가 404** 로
// 갔다. 경로는 여기 상수로 모으고 도메인은 env 로만 받는다.

const BASE = process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/+$/, '') || null;

/** 웹 라우트 — `apps/web/src/App.tsx` 의 실제 경로와 1:1 로 맞춘다. */
export const WEB_ROUTES = {
  privacy: '/privacy',
  terms: '/terms',
  resetPassword: '/reset-password',
  signup: '/signup',
} as const;

/** 설정되지 않았으면 null — 호출부는 링크 대신 안내 문구를 띄운다. */
export function webUrl(path: string): string | null {
  return BASE ? `${BASE}${path}` : null;
}

/** 웹 주소가 설정돼 있는지. */
export const hasWebUrl = BASE !== null;

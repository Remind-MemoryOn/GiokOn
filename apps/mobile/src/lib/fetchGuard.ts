// fetch 폴리필이 던지는 "status 0" 크래시 방어망
//
// RN 의 fetch 는 whatwg-fetch(XHR) 다. XHR 이 status 0 을 돌려주면 폴리필이
// `new Response(body, { status: 0 })` 를 만들다 RangeError 를 던지는데, 그 코드가
// **setTimeout 콜백 안**이라 호출부의 try/catch·프라미스 체인으로는 잡을 수 없다.
// 결과는 앱을 죽이는 Uncaught Error:
//   "Failed to construct 'Response': The status provided (0) is outside the range [200, 599]"
//
// status 0 이 나오는 경우: 스킴 없는(상대) URL · content:// 같은 비 HTTP 스킴 ·
// 일부 취소된 요청. 근본 원인은 각각 고쳐야 하지만(예: lib/supabase.ts 의 URL 검증),
// 폴리필 내부에서 나는 이 예외 하나 때문에 앱 전체가 죽는 것은 막는다.
//
// ⚠️ 다른 예외는 그대로 기본 처리기로 넘긴다 — 오류를 삼키는 방어망이 아니다.

const SIGNATURE = /Failed to construct 'Response'|status provided \(0\)/i;

interface ErrorUtilsLike {
  getGlobalHandler(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/** 앱 시작 시 한 번 호출한다(중복 설치 방지). */
let installed = false;

export function installFetchGuard(): void {
  if (installed) return;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  installed = true;

  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    const message = error instanceof Error ? error.message : String(error);
    if (SIGNATURE.test(message)) {
      // 이 요청은 응답을 받지 못한다(프라미스가 영영 풀리지 않는다). 화면은 로딩으로
      // 남지만 앱은 살아 있다 — 원인 URL 을 알 수 있도록 로그는 남긴다.
      console.error('[giokon] 응답을 만들 수 없는 요청(status 0)을 무시했습니다.', message);
      return;
    }
    previous?.(error, isFatal);
  });
}

import type { QueryClient } from '@tanstack/react-query';

/** 화면에서 구독 중인 서버 조회가 실패하면 빈 상태와 혼동하지 않도록 알린다. */
export function hasActiveQueryFailure(client: QueryClient): boolean {
  return client.getQueryCache().findAll().some(
    (query) => query.getObserversCount() > 0 && query.state.status === 'error',
  );
}

/**
 * 배너를 띄워도 되는 화면인가. 대화 화면(`/session/talk`)은 요양보호사가 기기를 어르신께 건네는
 * **어르신 표시 모드**(계획 M2·M3)를 품고 있다 — 어르신 화면에는 요양보호사 UI 를 두지 않는다.
 * 표시 모드 여부는 그 화면의 지역 상태라 루트에서 알 수 없으므로 화면 단위로 막는다.
 */
export function queryFailureBannerAllowed(pathname: string | null | undefined): boolean {
  return !(pathname ?? '').startsWith('/session/talk');
}

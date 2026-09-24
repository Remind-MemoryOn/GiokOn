import type { QueryClient } from '@tanstack/react-query';

/** 화면에서 구독 중인 서버 조회가 실패하면 빈 상태와 혼동하지 않도록 알린다. */
export function hasActiveQueryFailure(client: QueryClient): boolean {
  return client.getQueryCache().findAll().some(
    (query) => query.getObserversCount() > 0 && query.state.status === 'error',
  );
}

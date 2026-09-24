import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { hasActiveQueryFailure, queryFailureBannerAllowed } from './queryFailure';

describe('active query failure notice', () => {
  it('does not call an empty or still-loading record set a failure', () => {
    const client = new QueryClient();
    expect(hasActiveQueryFailure(client)).toBe(false);
    const observer = new QueryObserver(client, { queryKey: ['records'], queryFn: async () => [] });
    const unsubscribe = observer.subscribe(() => {});
    expect(hasActiveQueryFailure(client)).toBe(false);
    unsubscribe();
    client.clear();
  });

  it('shows a failure only while an errored query is observed by a screen', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(client, {
      queryKey: ['records'],
      queryFn: async () => { throw new Error('read denied'); },
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    expect(hasActiveQueryFailure(client)).toBe(true);
    unsubscribe();
    expect(hasActiveQueryFailure(client)).toBe(false);
    client.clear();
  });

  it('never shows the caregiver banner on the talk screen that hosts the elder display mode', () => {
    expect(queryFailureBannerAllowed('/session/talk')).toBe(false);
    expect(queryFailureBannerAllowed('/session/start')).toBe(true);
    expect(queryFailureBannerAllowed('/')).toBe(true);
    expect(queryFailureBannerAllowed(undefined)).toBe(true);
  });
});

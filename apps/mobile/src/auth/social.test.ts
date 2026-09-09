import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  open: vi.fn(), oauth: vi.fn(), exchange: vi.fn(), setSession: vi.fn(), fetch: vi.fn(),
}));
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: mocks.open }));
vi.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'giokon://auth/callback',
  CodeChallengeMethod: { S256: 'S256' },
  AuthRequest: class {
    codeChallenge = 'c'.repeat(43);
    codeVerifier = 'v'.repeat(64);
    async getAuthRequestConfigAsync() { return {}; }
  },
}));
vi.mock('@giokon/data', () => ({ waitForSignOut: async () => {}, getGiokonClient: () => ({ auth: {
  signInWithOAuth: mocks.oauth, exchangeCodeForSession: mocks.exchange, setSession: mocks.setSession,
} }) }));

import { signInWithNaver, signInWithSupabaseProvider } from './social';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.oauth.mockResolvedValue({ data: { url: 'https://synthetic.invalid/authorize' }, error: null });
  mocks.open.mockResolvedValue({ type: 'success', url: 'giokon://auth/callback?code=auth%2Bcode%2F123' });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.setSession.mockResolvedValue({ error: null });
  mocks.fetch.mockResolvedValue(Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://synthetic.invalid');
  vi.stubEnv('EXPO_PUBLIC_LIVE_TOKEN_URL', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('모바일 Supabase PKCE', () => {
  it.each(['google', 'kakao'] as const)('%s의 URL에서 인가 코드만 디코딩해 교환한다', async (provider) => {
    expect(await signInWithSupabaseProvider(provider)).toEqual({ ok: true });
    expect(mocks.oauth).toHaveBeenCalledWith({ provider, options: {
      redirectTo: 'giokon://auth/callback', skipBrowserRedirect: true,
    } });
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('auth+code/123');
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'dismiss'])('%s 결과는 인증 코드 교환 없이 취소한다', async (type) => {
    mocks.open.mockResolvedValueOnce({ type });
    expect(await signInWithSupabaseProvider('google')).toEqual({ ok: false, canceled: true });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it.each([
    'giokon://auth/callback?error=access_denied&code=ignore',
    'giokon://auth/callback#error_description=denied',
    'https://evil.invalid/callback?code=ignore',
    'giokon://auth/wrong?code=ignore',
    'giokon://auth/callback',
  ])('오류·잘못된 콜백에서는 로그인 성공을 반환하지 않는다: %s', async (url) => {
    mocks.open.mockResolvedValueOnce({ type: 'success', url });
    await expect(signInWithSupabaseProvider('google')).rejects.toThrow();
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it('동일 로그인 중복 호출은 한 번만 교환하고 다른 공급자 동시 시도는 차단한다', async () => {
    let finish!: (result: { type: string; url: string }) => void;
    mocks.open.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = signInWithSupabaseProvider('google');
    const second = signInWithSupabaseProvider('google');
    expect(first).toBe(second);
    await expect(signInWithSupabaseProvider('kakao')).rejects.toThrow('진행 중인 로그인');
    finish({ type: 'success', url: 'giokon://auth/callback?code=once' });
    await Promise.all([first, second]);
    expect(mocks.oauth).toHaveBeenCalledTimes(1);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('once');
  });

  it('코드 교환 실패를 전달하고 새 시도를 허용한다', async () => {
    mocks.exchange.mockResolvedValueOnce({ error: new Error('exchange failed') });
    await expect(signInWithSupabaseProvider('google')).rejects.toThrow('exchange failed');
    expect(await signInWithSupabaseProvider('kakao')).toEqual({ ok: true });
  });

  it('기존 암시적 콜백은 두 토큰이 모두 있을 때만 세션을 설정한다', async () => {
    mocks.open.mockResolvedValueOnce({ type: 'success', url: 'giokon://auth/callback#access_token=synthetic-access&refresh_token=synthetic-refresh' });
    expect(await signInWithSupabaseProvider('google')).toEqual({ ok: true });
    expect(mocks.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});

describe('모바일 Naver 일회성 교환', () => {
  const callback = (state = 'c'.repeat(43)) => ({ type: 'success',
    url: `giokon://auth/callback#transaction_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&state=${state}` });

  it('서버 authorize에 challenge만 보내고 verifier는 최종 POST로 전달한다', async () => {
    mocks.open.mockResolvedValueOnce(callback());
    expect(await signInWithNaver()).toEqual({ ok: true });
    const url = new URL(mocks.open.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://synthetic.invalid/functions/v1/naver-auth/authorize');
    expect(url.searchParams.get('challenge')).toBe('c'.repeat(43));
    expect(url.toString()).not.toContain('v'.repeat(64));
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
      transaction_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', code_verifier: 'v'.repeat(64),
    });
    expect(mocks.setSession).toHaveBeenCalledTimes(1);
  });

  it('다른 로그인 요청의 콜백은 교환하지 않는다', async () => {
    mocks.open.mockResolvedValueOnce(callback('other-request'));
    await expect(signInWithNaver()).rejects.toThrow('state');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it('취소 후 재시도하며 중복 탭은 하나의 시도만 수행한다', async () => {
    mocks.open.mockResolvedValueOnce({ type: 'cancel' });
    const first = signInWithNaver();
    expect(signInWithNaver()).toBe(first);
    await expect(signInWithSupabaseProvider('google')).rejects.toThrow('진행 중인 로그인');
    expect(await first).toEqual({ ok: false, canceled: true });
    mocks.open.mockResolvedValueOnce(callback());
    expect(await signInWithNaver()).toEqual({ ok: true });
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it('만료/재사용으로 서버가 거부하면 세션을 설정하지 않는다', async () => {
    mocks.open.mockResolvedValueOnce(callback());
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'expired' }, { status: 400 }));
    await expect(signInWithNaver()).rejects.toThrow('400');
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

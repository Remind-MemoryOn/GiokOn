import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  open: vi.fn(), oauth: vi.fn(), exchange: vi.fn(), setSession: vi.fn(),
}));
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: mocks.open }));
vi.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'giokon://auth/callback' }));
vi.mock('@giokon/data', () => ({ getGiokonClient: () => ({ auth: {
  signInWithOAuth: mocks.oauth, exchangeCodeForSession: mocks.exchange, setSession: mocks.setSession,
} }) }));

import { signInWithSupabaseProvider } from './social';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.oauth.mockResolvedValue({ data: { url: 'https://synthetic.invalid/authorize' }, error: null });
  mocks.open.mockResolvedValue({ type: 'success', url: 'giokon://auth/callback?code=auth%2Bcode%2F123' });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.setSession.mockResolvedValue({ error: null });
});

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

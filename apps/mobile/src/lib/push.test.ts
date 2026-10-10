import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  os: 'android' as string,
  environment: 'standalone',
  loaded: vi.fn(),
  permission: { granted: true, canAskAgain: true },
  requested: { granted: true, canAskAgain: true },
  token: vi.fn(async () => ({ data: 'ExponentPushToken[synthetic]' })),
  register: vi.fn(async () => {}),
  revoke: vi.fn(async () => {}),
  channel: vi.fn(async () => null),
  request: vi.fn(),
  handler: vi.fn(),
  projectId: 'project' as string | undefined,
}));
vi.mock('react-native', () => ({ Platform: { get OS() { return native.os; } } }));
vi.mock('expo-constants', () => ({ ExecutionEnvironment: { StoreClient: 'storeClient' }, default: { get executionEnvironment() { return native.environment; }, get expoConfig() { return { extra: { eas: { projectId: native.projectId } } }; }, easConfig: null } }));
vi.mock('@giokon/data', () => ({ registerPushToken: native.register, revokePushToken: native.revoke }));

async function fresh() {
  vi.resetModules();
  vi.doMock('expo-notifications', () => {
    native.loaded();
    return {
      AndroidImportance: { HIGH: 4 },
      setNotificationHandler: native.handler,
      setNotificationChannelAsync: native.channel,
      getPermissionsAsync: async () => native.permission,
      requestPermissionsAsync: async () => { native.request(); return native.requested; },
      getExpoPushTokenAsync: native.token,
    };
  });
  return await import('./push');
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useRealTimers();
  native.environment = 'standalone';
  native.os = 'android'; native.projectId = 'project';
  native.permission = { granted: true, canAskAgain: true };
  native.requested = { granted: true, canAskAgain: true };
  native.token.mockResolvedValue({ data: 'ExponentPushToken[synthetic]' });
  native.register.mockResolvedValue(undefined); native.revoke.mockResolvedValue(undefined);
});

describe('푸시 토큰 등록(M6)', () => {
  it.each(['android', 'ios'])('Expo Go(%s)는 시작·등록·로그아웃 모두 알림 모듈을 실행하지 않는다', async os => {
    native.os = os;
    native.environment = 'storeClient';
    const push = await fresh();
    expect(native.loaded).not.toHaveBeenCalled();
    expect(await push.registerForPush('u1')).toBe('unavailable');
    await push.revokePushRegistration();
    expect(native.loaded).not.toHaveBeenCalled();
    expect(native.token).not.toHaveBeenCalled();
    expect(native.register).not.toHaveBeenCalled();
  });

  it('권한이 있으면 채널을 만들고 EAS 프로젝트 토큰을 서버 RPC 로 등록한다 — 같은 사용자는 한 번만', async () => {
    const push = await fresh();
    expect(await push.registerForPush('u1')).toBe('registered');
    expect(native.channel).toHaveBeenCalled();
    expect(native.token).toHaveBeenCalledWith({ projectId: 'project' });
    expect(native.register).toHaveBeenCalledWith('ExponentPushToken[synthetic]', 'android');
    expect(await push.registerForPush('u1')).toBe('registered');
    expect(native.register).toHaveBeenCalledTimes(1);
    expect(native.handler).toHaveBeenCalledTimes(1);
  });
  it('권한을 한 번 묻고, 거부되면 토큰을 만들지 않는다', async () => {
    const push = await fresh();
    native.permission = { granted: false, canAskAgain: true };
    native.requested = { granted: false, canAskAgain: false };
    expect(await push.registerForPush('u1')).toBe('denied');
    expect(native.request).toHaveBeenCalledTimes(1);
    expect(native.token).not.toHaveBeenCalled();
  });
  it('다시 물을 수 없으면 묻지 않는다', async () => {
    const push = await fresh();
    native.permission = { granted: false, canAskAgain: false };
    expect(await push.registerForPush('u1')).toBe('denied');
    expect(native.request).not.toHaveBeenCalled();
  });
  it.each([['web', 'project'], ['ios', undefined]])('지원하지 않는 환경(%s · projectId %s)은 조용히 건너뛴다', async (os, projectId) => {
    const push = await fresh();
    native.os = os; native.projectId = projectId;
    expect(await push.registerForPush('u1')).toBe('unavailable');
    expect(native.register).not.toHaveBeenCalled();
  });
  it('시뮬레이터·서버 거부는 앱을 막지 않고 실패로만 알린다(다음에 다시 시도)', async () => {
    const push = await fresh();
    native.register.mockRejectedValueOnce(new Error('PUSH_TOKEN_ROLE'));
    expect(await push.registerForPush('u1')).toBe('failed');
    expect(await push.registerForPush('u1')).toBe('registered');
  });
  it('사용자가 바뀌면 다시 등록한다(기기 인계)', async () => {
    const push = await fresh();
    await push.registerForPush('u1');
    await push.registerForPush('u2');
    expect(native.register).toHaveBeenCalledTimes(2);
  });
});

describe('로그아웃 시 회수(M6)', () => {
  it('등록한 토큰을 회수하고, 진행 중인 등록이 끝난 뒤에 회수한다', async () => {
    const push = await fresh();
    let finish!: () => void;
    native.register.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const registering = push.registerForPush('u1');
    const revoking = push.revokePushRegistration();
    await vi.waitFor(() => expect(native.register).toHaveBeenCalled());
    expect(native.revoke).not.toHaveBeenCalled();
    finish();
    await registering; await revoking;
    expect(native.revoke).toHaveBeenCalledWith('ExponentPushToken[synthetic]');
    await push.registerForPush('u1');
    expect(native.register).toHaveBeenCalledTimes(2); // 회수 뒤 재로그인은 다시 등록
  });
  it('등록한 적이 없으면 서버를 부르지 않는다', async () => {
    const push = await fresh();
    await push.revokePushRegistration();
    expect(native.revoke).not.toHaveBeenCalled();
  });
  it('회수가 실패하거나 늦어도 로그아웃을 오래 막지 않는다', async () => {
    const push = await fresh();
    await push.registerForPush('u1');
    vi.useFakeTimers();
    native.revoke.mockImplementationOnce(() => new Promise(() => {}));
    let done = false;
    void push.revokePushRegistration().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(push.PUSH_REVOKE_WAIT_MS);
    expect(done).toBe(true);
  });
});

describe('알림 수신 역할', () => {
  it('기관 소속 돌봄팀만 받는다', async () => {
    const push = await fresh();
    for (const role of ['caregiver', 'org_admin', 'social_worker', 'center_director'])
      expect(push.receivesCareAlerts({ role, org_id: 'o' })).toBe(true);
    expect(push.receivesCareAlerts({ role: 'guardian', org_id: 'o' })).toBe(false);
    expect(push.receivesCareAlerts({ role: 'caregiver', org_id: null })).toBe(false);
    expect(push.receivesCareAlerts(null)).toBe(false);
  });
});

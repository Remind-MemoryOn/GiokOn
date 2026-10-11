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
  listeners: [] as ((response: unknown) => void)[],
  removed: vi.fn(),
  last: null as unknown,
  clearLast: vi.fn(),
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
      DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
      addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
        native.listeners.push(listener);
        return { remove: () => { native.removed(); native.listeners = native.listeners.filter(l => l !== listener); } };
      },
      getLastNotificationResponse: () => native.last,
      clearLastNotificationResponse: () => { native.clearLast(); native.last = null; },
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
  native.listeners = []; native.last = null;
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

describe('안전 알림 탭 → 감독 화면(T21.10 후속)', () => {
  const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';
  const tap = (identifier: string, data: unknown, actionIdentifier = DEFAULT) =>
    ({ actionIdentifier, notification: { request: { identifier, content: { data } } } });
  const safety = { type: 'safety', notificationId: 'n1' };
  /** 구독이 붙을 때까지(모듈 로드는 비동기) 기다린다 — 고정 시간 대기는 전체 실행에서 흔들린다. */
  const subscribed = () => vi.waitFor(() => expect(native.listeners).toHaveLength(1));
  /** 진행 중인 알림 모듈 로드가 끝날 때까지 — 같은 모듈 약속을 기다리면 앞서 건 then 이 먼저 돈다. */
  const moduleSettled = async () => { await import('expo-notifications'); await Promise.resolve(); };

  it('앱을 쓰는 중에 안전 알림을 탭하면 한 번만 연다(같은 알림은 다시 열지 않는다)', async () => {
    const push = await fresh();
    const open = vi.fn();
    push.watchSafetyPushTaps(open);
    await subscribed();
    native.listeners.forEach(l => l(tap('a', safety)));
    native.listeners.forEach(l => l(tap('a', safety)));
    expect(open).toHaveBeenCalledOnce();
  });

  it('앱이 꺼져 있다가 탭으로 열리면(마지막 응답) 한 번 열고 지운다 — 다시 구독해도 다시 열지 않는다', async () => {
    const push = await fresh();
    native.last = tap('cold', safety);
    const open = vi.fn();
    const stop = push.watchSafetyPushTaps(open);
    await subscribed();
    expect(open).toHaveBeenCalledOnce();
    expect(native.clearLast).toHaveBeenCalledOnce();
    stop();
    push.watchSafetyPushTaps(open);
    await subscribed();
    expect(open).toHaveBeenCalledOnce();
  });

  it('안전 알림이 아니거나, 탭이 아닌 동작(닫기 등)이면 열지 않는다', async () => {
    const push = await fresh();
    const open = vi.fn();
    push.watchSafetyPushTaps(open);
    await subscribed();
    native.listeners.forEach(l => l(tap('b', { type: 'journal_ready' })));
    native.listeners.forEach(l => l(tap('c', null)));
    native.listeners.forEach(l => l(tap('d', safety, 'com.apple.UNNotificationDismissActionIdentifier')));
    expect(open).not.toHaveBeenCalled();
  });

  it('구독을 끝내면(로그아웃·역할 변경) 탭해도 열지 않는다 — 모듈을 불러오기 전에 끝내도 마찬가지', async () => {
    const push = await fresh();
    const open = vi.fn();
    const stop = push.watchSafetyPushTaps(open);
    await subscribed();
    stop();
    expect(native.removed).toHaveBeenCalledOnce();
    expect(native.listeners).toHaveLength(0);
    const early = push.watchSafetyPushTaps(open);
    early();
    native.last = tap('late', safety);
    await moduleSettled();
    expect(native.listeners).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });

  it('Expo Go 에서는 알림 모듈을 불러오지 않는다', async () => {
    native.environment = 'storeClient';
    const push = await fresh();
    push.watchSafetyPushTaps(vi.fn());
    // 불러오지 않았음을 보려면 불러오기가 끝날 시간을 줘야 한다(부정 단언 — 시간이 길어도 통과 쪽은 흔들리지 않는다).
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(native.loaded).not.toHaveBeenCalled();
    expect(native.listeners).toHaveLength(0);
  });

  it('안전 알림 판정은 서버 push-dispatch 의 data 모양만 인정한다', async () => {
    const push = await fresh();
    expect(push.isSafetyPush({ type: 'safety', notificationId: 'x' })).toBe(true);
    for (const data of [null, undefined, 'safety', { type: 'Safety' }, {}]) expect(push.isSafetyPush(data)).toBe(false);
  });
});

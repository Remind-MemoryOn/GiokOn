// 푸시 토큰 등록 (계획 M6 · T21.10) — 돌봄팀 기기가 위기·일지·원격 정지 알림을 받게 한다.
//
// 발송은 서버(C4 `push-dispatch`)가 `notifications` 행을 소비해 Expo Push 로 한다(계획 결정 F).
// 앱은 **토큰만** 등록·회수한다:
//   - 로그인한 돌봄팀(보호자 제외, 기관 소속)이면 알림 권한을 묻고 Expo 토큰을 `register_push_token` 으로 등록.
//   - 로그아웃 **전에** `revoke_push_token` — 이 기기로 앞사람 알림이 계속 오지 않게.
//   - 거부·시뮬레이터·네트워크 실패는 앱 사용을 막지 않는다(알림은 보조 경로 — 감독 화면이 1차).
// 알림 본문에는 어르신 성함·발화가 없다(서버 고정 문구). 잠금화면에 그대로 뜨기 때문이다.

import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { registerPushToken, revokePushToken } from '@giokon/data';

export type PushRegistration = 'registered' | 'denied' | 'unavailable' | 'failed';

/** 로그아웃이 알림 해제를 기다리는 최대 시간 — 네트워크가 없어도 로그아웃은 된다. */
export const PUSH_REVOKE_WAIT_MS = 3000;

const ANDROID_CHANNEL = 'default';
let registered: { userId: string; token: string } | null = null;
// 등록·회수를 한 줄로 세운다 — 회수가 진행 중인 등록보다 먼저 끝나 토큰이 되살아나지 않게.
let work: Promise<unknown> = Promise.resolve();
let handlerInstalled = false;

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = work.then(operation);
  work = result.catch(() => {});
  return result;
}

function installForegroundHandler(Notifications: typeof import('expo-notifications')): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  // 앱을 보고 있을 때도 배너로 보인다(위기 알림을 놓치지 않게).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : undefined;
}

/** 이 기기를 이 사용자의 알림 수신처로 등록한다. 같은 사용자로 이미 등록했으면 다시 하지 않는다. */
export function registerForPush(userId: string): Promise<PushRegistration> {
  return enqueue(async (): Promise<PushRegistration> => {
    // Expo Go에서는 import 자체가 원격 푸시 경고를 발생시킨다.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'unavailable';
    if (registered?.userId === userId) return 'registered';
    const platform = Platform.OS;
    if (platform !== 'ios' && platform !== 'android') return 'unavailable';
    const id = projectId();
    if (!id) return 'unavailable';
    try {
      const Notifications = await import('expo-notifications');
      installForegroundHandler(Notifications);
      // Android 13+ 는 채널이 있어야 권한 요청이 뜬다.
      if (platform === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
          name: '돌봄 알림', importance: Notifications.AndroidImportance.HIGH,
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return 'denied';
      const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
      await registerPushToken(token, platform);
      registered = { userId, token };
      return 'registered';
    } catch (e) {
      // 시뮬레이터(토큰 없음)·오프라인·역할 거부 — 앱 사용은 계속한다.
      console.info('[giokon] 푸시 등록 생략', e instanceof Error ? e.message : e);
      return 'failed';
    }
  });
}

/** 로그아웃 전에 부른다. 실패해도 로그아웃을 막지 않되, 기다리는 시간은 `PUSH_REVOKE_WAIT_MS` 까지. */
export function revokePushRegistration(): Promise<void> {
  const revoking = enqueue(async () => {
    const current = registered;
    registered = null;
    if (current) await revokePushToken(current.token);
  }).catch(e => { console.info('[giokon] 푸시 해제 실패', e instanceof Error ? e.message : e); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>(resolve => { timer = setTimeout(resolve, PUSH_REVOKE_WAIT_MS); });
  return Promise.race([revoking, limit]).finally(() => clearTimeout(timer));
}

type NotificationsModule = typeof import('expo-notifications');
type TapResponse = { actionIdentifier: string; notification: { request: { identifier: string; content: { data?: unknown } } } };

/** 이미 처리한 알림 탭 — 같은 알림으로 감독 화면을 두 번 열지 않게(재로그인·리마운트). */
const handledTaps = new Set<string>();

/** 서버 `push-dispatch` 가 보내는 안전 알림인가(`data: { type: 'safety', notificationId }`). */
export function isSafetyPush(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'safety';
}

/**
 * 안전 알림을 탭하면 `onSafetyTap` 을 부른다(T21.10 후속 — T25.16 "알림 탭 → 감독 화면").
 * 앱이 꺼져 있다가 탭으로 열린 경우(마지막 응답)도 한 번만 처리한다. 알림을 그냥 닫은 동작은 무시한다.
 * Expo Go 에서는 알림 모듈을 불러오지 않는다(원격 푸시 미지원 — 불러오기만 해도 오류 로그가 난다).
 * 반환값을 부르면 구독을 끝낸다.
 */
export function watchSafetyPushTaps(onSafetyTap: () => void): () => void {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return () => {};
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => {};
  let active = true;
  let subscription: { remove(): void } | null = null;
  const handle = (Notifications: NotificationsModule, response: TapResponse | null) => {
    if (!active || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = response.notification.request;
    if (handledTaps.has(identifier)) return;
    handledTaps.add(identifier);
    Notifications.clearLastNotificationResponse();
    if (isSafetyPush(content.data)) onSafetyTap();
  };
  import('expo-notifications')
    .then(Notifications => {
      if (!active) return;
      subscription = Notifications.addNotificationResponseReceivedListener(response => handle(Notifications, response));
      handle(Notifications, Notifications.getLastNotificationResponse());
    })
    .catch(e => { console.info('[giokon] 알림 탭 처리 생략', e instanceof Error ? e.message : e); });
  return () => {
    active = false;
    subscription?.remove();
  };
}

/** 알림을 받는 역할 — 돌봄팀(기관 소속). 보호자는 받지 않는다(서버도 등록을 거부한다). */
export function receivesCareAlerts(row: { role?: string | null; org_id?: string | null } | null): boolean {
  return Boolean(row?.org_id) && ['caregiver', 'org_admin', 'social_worker', 'center_director'].includes(row?.role ?? '');
}

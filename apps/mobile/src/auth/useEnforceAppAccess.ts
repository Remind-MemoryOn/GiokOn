// 앱 진입 자격 집행 — 판정(appAccess.ts)을 화면 동작으로 옮긴다.
//
// 자격 미달이면 **사유를 알리고 로그아웃**한다. 그냥 로그인 화면으로 되돌리면
// 세션이 남아 있어 곧바로 다시 들어오고, 무엇이 잘못됐는지도 알 수 없다.

import { useEffect, useRef } from 'react';
import { Alert, Linking, type AlertButton } from 'react-native';
import { useAuth } from './AuthProvider';
import { evaluateAppAccess } from './appAccess';
import { webUrl, WEB_ROUTES } from '../lib/webUrl';

export function useEnforceAppAccess(enforce = true): { ready: boolean; target: '/main' | '/login' } {
  const { authed, loading, userRow, signOut } = useAuth();
  const access = evaluateAppAccess({ authed, loading, userRow });
  // 같은 사유로 알림이 반복되지 않게 한 번만 띄운다(스플래쉬↔로그인 왕복).
  const noticed = useRef<string | null>(null);

  useEffect(() => {
    if (access.status !== 'blocked') noticed.current = null;
    if (!enforce || access.status !== 'blocked') return;
    if (noticed.current === access.title) return;
    noticed.current = access.title;
    Alert.alert(access.title, access.message, blockedNoticeButtons(access.webPath));
    void signOut().catch(() => {});
  }, [access, signOut, enforce]);

  return {
    ready: access.status !== 'loading',
    target: access.status === 'ok' ? '/main' : '/login',
  };
}

/**
 * 막힌 계정 알림의 버튼 — 막다른 안내로 끝나지 않게 웹으로 이어 준다(2026-11-27 Play 출시 준비).
 * 앱에서 소셜 로그인으로 막 만든 계정도 앱 설정에 들어올 수 없으므로, 계정 삭제 안내를 여기서도 연다
 * (Play 계정 삭제 정책 — 앱에서 만든 계정은 앱에서 삭제 요청 경로를 찾을 수 있어야 한다).
 * 웹 주소가 설정되지 않은 빌드에서는 확인 버튼만 둔다.
 */
export function blockedNoticeButtons(webPath: string | undefined): AlertButton[] {
  const buttons: AlertButton[] = [{ text: '확인', style: 'cancel' }];
  const deletion = webUrl(WEB_ROUTES.accountDeletion);
  if (deletion && webPath) buttons.push({ text: '계정 삭제 안내', onPress: () => void Linking.openURL(deletion) });
  const next = webPath ? webUrl(webPath) : null;
  if (next) buttons.push({ text: '웹에서 계속하기', onPress: () => void Linking.openURL(next) });
  return buttons;
}

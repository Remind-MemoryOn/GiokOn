// 앱 진입 자격 집행 — 판정(appAccess.ts)을 화면 동작으로 옮긴다.
//
// 자격 미달이면 **사유를 알리고 로그아웃**한다. 그냥 로그인 화면으로 되돌리면
// 세션이 남아 있어 곧바로 다시 들어오고, 무엇이 잘못됐는지도 알 수 없다.

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthProvider';
import { evaluateAppAccess } from './appAccess';

export function useEnforceAppAccess(): { ready: boolean; target: '/main' | '/login' } {
  const { authed, loading, userRow, signOut } = useAuth();
  const access = evaluateAppAccess({ authed, loading, userRow });
  // 같은 사유로 알림이 반복되지 않게 한 번만 띄운다(스플래쉬↔로그인 왕복).
  const noticed = useRef<string | null>(null);

  useEffect(() => {
    if (access.status !== 'blocked') return;
    if (noticed.current === access.title) return;
    noticed.current = access.title;
    Alert.alert(access.title, access.message);
    void signOut();
  }, [access, signOut]);

  return {
    ready: access.status !== 'loading',
    target: access.status === 'ok' ? '/main' : '/login',
  };
}

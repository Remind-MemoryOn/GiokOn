// 모바일 인증 컨텍스트 — 웹 apps/web/src/auth/AuthProvider.tsx 미러.
//
// 실제 Auth 세션 + public.users row(역할·이름·기관)를 앱 전역에 제공한다
// (웹과 동일 패턴 — getSession·onAuthStateChange·getCurrentUserRow).
// 화면은 이 컨텍스트(useAuth)만 본다.
//
// ⚠️ 목업 브리지는 없다(2026-09-04 제거). Supabase 미설정이면 app/_layout.tsx 가
// 설정 오류 화면에서 멈추므로 여기까지 내려오지 않는다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryScope } from '../lib/supabase';
import {
  getGiokonClient,
  getSession,
  onAuthStateChange,
  signInWithEmail,
  signOut as authSignOut,
  type Session,
  type User,
  type UserRow,
} from '@giokon/data';
import { AccessMonitor } from './accessMonitor';
import { loadAccessSnapshot, resetAccessResources } from './accessResources';
import { receivesCareAlerts, registerForPush, revokePushRegistration } from '../lib/push';

interface MobileAuthState {
  accessRevision: number;
  session: Session | null;
  user: User | null;
  /** public.users row — 역할·기관·이름(조회 전이면 null). */
  userRow: UserRow | null;
  /** 로그인 여부. */
  authed: boolean;
  /** 화면 표시용 요양보호사 이름. */
  caregiverName: string;
  /** 세션·row 초기 판별 중(가드는 이 동안 렌더를 미룬다). */
  loading: boolean;
  /** 이메일(아이디)+비밀번호 로그인. 진입 자격 판정에 쓰도록 users row 를 돌려준다. */
  signIn: (email: string, password: string) => Promise<UserRow | null>;
  /** 로그아웃. */
  signOut: () => Promise<void>;
  /** 온보딩·연결 변경 직후 users row 재조회. */
  refreshUserRow: () => Promise<UserRow | null>;
}

const AuthContext = createContext<MobileAuthState>({
  accessRevision: 0,
  session: null,
  user: null,
  userRow: null,
  authed: false,
  caregiverName: '요양 보호사',
  loading: false,
  signIn: async () => null,
  signOut: async () => {},
  refreshUserRow: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useSyncExternalStore(queryScope.subscribe, queryScope.getSnapshot);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // users row는 uid별로 캐시·파생한다(로그아웃 시 null 파생 — effect 내 동기 setState 회피).
  const [fetched, setFetched] = useState<{ uid: string; row: UserRow | null } | null>(null);
  const [accessRevision, setAccessRevision] = useState(0);
  const [monitor] = useState(() => new AccessMonitor({
    load: loadAccessSnapshot,
    publish: (uid, row) => setFetched({ uid, row }),
    reset: () => {
      resetAccessResources();
      setAccessRevision(value => value + 1);
    },
  }));
  const refreshUserRow = useCallback(() => monitor.refresh(), [monitor]);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const accept = (s: Session | null) => {
      monitor.identify(s?.user.id ?? null);
      setSession(s);
      setSessionLoading(false);
    };
    getSession()
      .then((s) => {
        if (active && !authEventReceived) accept(s);
      })
      .catch(() => {
        /* 세션 조회 실패 → 미인증으로 처리 */
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    const subscription = onAuthStateChange((_event, s) => {
      if (!active) return;
      authEventReceived = true;
      accept(s);
      // Never await Supabase operations inside its auth-state callback.
      setTimeout(() => { if (active) void refreshUserRow(); }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [monitor, refreshUserRow]);

  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (!uid) return;
    void refreshUserRow();
    const client = getGiokonClient();
    const channel = client.channel(`mobile-access:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${uid}` },
        () => { void refreshUserRow(); })
      .subscribe();
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshUserRow();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refreshUserRow();
    }, 30_000);
    return () => {
      clearInterval(timer);
      foreground.remove();
      void client.removeChannel(channel);
    };
  }, [uid, refreshUserRow]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<UserRow | null> => {
      await signInWithEmail({ email, password });
      return refreshUserRow();
    },
    [refreshUserRow],
  );

  const signOut = useCallback(async (): Promise<void> => {
    // 토큰 회수는 로그인 상태(JWT)에서만 된다 — 세션을 지우기 전에, 최대 몇 초만 기다린다(M6).
    await revokePushRegistration();
    monitor.identify(null);
    setSession(null);
    setFetched(null);
    await authSignOut();
  }, [monitor]);

  const userRow = uid && fetched?.uid === uid ? fetched.row : null;
  const alerts = uid !== null && receivesCareAlerts(userRow);

  // 돌봄팀이 확인되면 이 기기를 알림 수신처로 등록한다(M6). 거부·실패는 앱 사용을 막지 않는다.
  useEffect(() => {
    if (uid && alerts) void registerForPush(uid);
  }, [uid, alerts]);

  const authed = Boolean(session);
  const caregiverName = userRow?.name ?? session?.user?.email ?? '요양 보호사';
  const loading = sessionLoading || (Boolean(uid) && fetched?.uid !== uid);

  return (
    <AuthContext.Provider
      value={{
        accessRevision,
        session,
        user: session?.user ?? null,
        userRow,
        authed,
        caregiverName,
        loading,
        signIn,
        signOut,
        refreshUserRow,
      }}
    >
      <QueryClientProvider key={query.generation} client={query.client}>
        {children}
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): MobileAuthState {
  return useContext(AuthContext);
}

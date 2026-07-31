// 모바일 인증 컨텍스트 — 웹 apps/web/src/auth/AuthProvider.tsx 미러(+목업 브리지).
//
// Supabase 설정 시: 실제 Auth 세션 + public.users row(역할·이름·기관)를 앱 전역에
//   제공한다(웹과 동일 패턴 — getSession·onAuthStateChange·getCurrentUserRow).
// 미설정 시: 기존 목업(useApp.caregiver)으로 브리지해 시연 흐름을 그대로 유지한다
//   (로그인=useApp.login, 로그아웃=useApp.logout, 이름=caregiver.name).
//
// 화면은 이 컨텍스트(useAuth)만 보면 두 모드에서 동일하게 동작한다 — 화면 코드에
// isSupabaseConfigured 분기를 두지 않기 위한 단일 진입점.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getCurrentUserRow,
  getSession,
  onAuthStateChange,
  signInWithEmail,
  signOut as authSignOut,
  type Session,
  type User,
  type UserRow,
} from '@giokon/data';
import { isSupabaseConfigured } from '../lib/supabase';
import { useApp } from '../store/appStore';

interface MobileAuthState {
  isConfigured: boolean;
  session: Session | null;
  user: User | null;
  /** public.users row — 역할·기관·이름(라이브 모드만, 없으면 null). */
  userRow: UserRow | null;
  /** 로그인 여부(모드 무관). */
  authed: boolean;
  /** 화면 표시용 요양보호사 이름. */
  caregiverName: string;
  /** 세션·row 초기 판별 중(가드는 이 동안 렌더를 미룬다). */
  loading: boolean;
  /** 이메일(아이디)+비밀번호 로그인. 미설정 시 목업 login. */
  signIn: (email: string, password: string) => Promise<void>;
  /** 로그아웃. 미설정 시 목업 logout. */
  signOut: () => Promise<void>;
  /** 온보딩·연결 변경 직후 users row 재조회(라이브 모드만). */
  refreshUserRow: () => Promise<UserRow | null>;
}

const AuthContext = createContext<MobileAuthState>({
  isConfigured: false,
  session: null,
  user: null,
  userRow: null,
  authed: false,
  caregiverName: '요양 보호사',
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
  refreshUserRow: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  // users row는 uid별로 캐시·파생한다(로그아웃 시 null 파생 — effect 내 동기 setState 회피).
  const [fetched, setFetched] = useState<{ uid: string; row: UserRow | null } | null>(null);

  // 목업 모드 인증 상태(useApp.caregiver 구독).
  const mockCaregiver = useApp((s) => s.caregiver);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getSession()
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {
        /* 세션 조회 실패 → 미인증으로 처리 */
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    const subscription = onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured || !uid) return;
    if (fetched?.uid === uid) return; // 이미 이 사용자로 조회 완료
    let active = true;
    getCurrentUserRow()
      .then((row) => {
        if (active) setFetched({ uid, row });
      })
      .catch(() => {
        if (active) setFetched({ uid, row: null });
      });
    return () => {
      active = false;
    };
  }, [uid, fetched]);

  const refreshUserRow = useCallback(async (): Promise<UserRow | null> => {
    if (!isSupabaseConfigured) return null;
    try {
      const row = await getCurrentUserRow();
      if (row) setFetched({ uid: row.id, row });
      return row;
    } catch {
      return null;
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      if (!isSupabaseConfigured) {
        // 목업: 아이디를 표시 이름으로 사용(기존 시연 동작 유지).
        useApp.getState().login(email);
        return;
      }
      await signInWithEmail({ email, password });
      await refreshUserRow();
    },
    [refreshUserRow],
  );

  const signOut = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      useApp.getState().logout();
      return;
    }
    await authSignOut();
    setFetched(null);
  }, []);

  const userRow = uid && fetched?.uid === uid ? fetched.row : null;

  const authed = isSupabaseConfigured ? Boolean(session) : Boolean(mockCaregiver);
  const caregiverName = isSupabaseConfigured
    ? (userRow?.name ?? session?.user?.email ?? '요양 보호사')
    : (mockCaregiver?.name ?? '요양 보호사');
  const loading = sessionLoading || (Boolean(uid) && fetched?.uid !== uid);

  return (
    <AuthContext.Provider
      value={{
        isConfigured: isSupabaseConfigured,
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
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): MobileAuthState {
  return useContext(AuthContext);
}

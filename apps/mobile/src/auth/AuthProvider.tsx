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

interface MobileAuthState {
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
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // users row는 uid별로 캐시·파생한다(로그아웃 시 null 파생 — effect 내 동기 setState 회피).
  const [fetched, setFetched] = useState<{ uid: string; row: UserRow | null } | null>(null);

  useEffect(() => {
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
    if (!uid) return;
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
    try {
      const row = await getCurrentUserRow();
      if (row) setFetched({ uid: row.id, row });
      return row;
    } catch {
      return null;
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<UserRow | null> => {
      await signInWithEmail({ email, password });
      return refreshUserRow();
    },
    [refreshUserRow],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await authSignOut();
    setFetched(null);
  }, []);

  const userRow = uid && fetched?.uid === uid ? fetched.row : null;

  const authed = Boolean(session);
  const caregiverName = userRow?.name ?? session?.user?.email ?? '요양 보호사';
  const loading = sessionLoading || (Boolean(uid) && fetched?.uid !== uid);

  return (
    <AuthContext.Provider
      value={{
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

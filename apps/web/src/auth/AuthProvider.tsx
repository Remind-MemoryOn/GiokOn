// 웹 인증 컨텍스트 — Supabase Auth 세션 + public.users row 를 앱 전역에 제공한다.
// Supabase 미설정(.env 없음) 시엔 미인증 상태로 두어 로그인 화면이 안내를 띄운다.
//
// 인증 개편(T17.4·T17.6): 세션만이 아니라 users row(role·org_id·onboarded_at)를
// 함께 노출한다 — 온보딩 게이트·역할 기반 라우팅(caregiver→/caregiver,
// guardian→/guardian)의 판단 근거. 온보딩 완료 직후에는 refreshUserRow()로 갱신.

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
  type Session,
  type User,
  type UserRow,
} from '@giokon/data';
import { isSupabaseConfigured } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** public.users row — 역할·기관·온보딩 상태. 세션 없거나 조회 전이면 null. */
  userRow: UserRow | null;
  /** 세션·users row 초기 판별 중(가드는 이 동안 렌더를 미룬다). */
  loading: boolean;
  isConfigured: boolean;
  /** 온보딩 완료·연결 변경 직후 users row 재조회. */
  refreshUserRow: () => Promise<UserRow | null>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  userRow: null,
  loading: false,
  isConfigured: false,
  refreshUserRow: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  // users row 는 uid 별로 캐시하고 파생한다(로그아웃 시 자동으로 null 파생 —
  // effect 안 동기 setState 회피).
  const [fetched, setFetched] = useState<{ uid: string; row: UserRow | null } | null>(null);

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

  const userRow = uid && fetched?.uid === uid ? fetched.row : null;
  const loading = sessionLoading || (Boolean(uid) && fetched?.uid !== uid);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        userRow,
        loading,
        isConfigured: isSupabaseConfigured,
        refreshUserRow,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}

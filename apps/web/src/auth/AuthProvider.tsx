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
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getCurrentUserRow,
  getSession,
  onAuthStateChange,
  signOut as authSignOut,
  type Session,
  type User,
  type UserRow,
} from '@giokon/data';
import { QueryClientProvider } from '@tanstack/react-query';
import { isSupabaseConfigured, queryScope } from '../lib/supabase';
import { useStore } from '../store/store';

interface AuthState {
  signOut: () => Promise<void>;
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
  signOut: async () => {},
  session: null,
  user: null,
  userRow: null,
  loading: false,
  isConfigured: false,
  refreshUserRow: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useSyncExternalStore(queryScope.subscribe, queryScope.getSnapshot);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const request = useRef(0);
  const lastRow = useRef<UserRow | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  // users row 는 uid 별로 캐시하고 파생한다(로그아웃 시 자동으로 null 파생 —
  // effect 안 동기 setState 회피).
  const [fetched, setFetched] = useState<{ uid: string; row: UserRow | null } | null>(null);

  const acceptSession = useCallback((next: Session | null) => {
    generation.current++;
    const nextUid = next?.user.id ?? null;
    if (identity.current !== nextUid) {
      identity.current = nextUid;
      request.current++;
      lastRow.current = null;
      queryScope.reset();
      useStore.getState().resetForAuth();
      setFetched(null);
    }
    setSession(next);
    setSessionLoading(false);
  }, []);

  const refreshUserRow = useCallback(async (): Promise<UserRow | null> => {
    const uid = identity.current;
    if (!isSupabaseConfigured || !uid) return null;
    const ticket = ++request.current;
    let row: UserRow | null;
    try { row = await getCurrentUserRow(); } catch { row = null; }
    if (ticket !== request.current || uid !== identity.current) return null;
    if (row?.id !== uid) row = null;
    const old = lastRow.current;
    if (old && (old.role !== row?.role || old.org_id !== row?.org_id)) {
      queryScope.reset();
      useStore.getState().resetForAuth();
    }
    lastRow.current = row;
    setFetched({ uid, row });
    return row;
  }, []);

  const signOut = useCallback(async () => {
    acceptSession(null);
    await authSignOut();
  }, [acceptSession]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const initialGeneration = generation.current;
    getSession()
      .then((s) => {
        if (active && generation.current === initialGeneration) acceptSession(s);
      })
      .catch(() => {
        /* 세션 조회 실패 → 미인증으로 처리 */
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    const subscription = onAuthStateChange((_event, s) => {
      if (!active) return;
      acceptSession(s);
      setTimeout(() => { if (active) void refreshUserRow(); }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [acceptSession, refreshUserRow]);

  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured || !uid) return;
    void refreshUserRow();
  }, [uid, refreshUserRow]);

  const userRow = uid && fetched?.uid === uid ? fetched.row : null;
  const loading = sessionLoading || (Boolean(uid) && fetched?.uid !== uid);

  return (
    <AuthContext.Provider
      value={{
        signOut,
        session,
        user: session?.user ?? null,
        userRow,
        loading,
        isConfigured: isSupabaseConfigured,
        refreshUserRow,
      }}
    >
      <QueryClientProvider key={query.generation} client={query.client}>
        {children}
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}

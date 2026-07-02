// 웹 인증 컨텍스트 — Supabase Auth 세션을 앱 전역에 제공한다.
// Supabase 미설정(.env 없음) 시엔 미인증 상태로 두어 로그인 화면이 안내를 띄운다.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession, onAuthStateChange, type Session, type User } from '@giokon/data';
import { isSupabaseConfigured } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: false,
  isConfigured: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

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
        if (active) setLoading(false);
      });
    const subscription = onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, isConfigured: isSupabaseConfigured }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}

import '../global.css';
import { useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { useGiokonRealtime, type RealtimeEvent } from '@giokon/data';
import { initSupabase, isSupabaseConfigured, supabaseConfigProblem, queryClient } from '../src/lib/supabase';
import { installFetchGuard } from '../src/lib/fetchGuard';
import { useAppStateRefetch } from '../src/lib/queryFocus';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ConfigError } from '../src/components/ConfigError';
import { FONT_MAP } from '../src/lib/fonts';

// fetch 폴리필의 status 0 크래시 방어망을 먼저 건다(요청이 나가기 전에).
installFetchGuard();
// 데이터 레이어 초기화. 웹 main.tsx와 동일 패턴. 미설정이면 아래 부팅 게이트가 막는다.
initSupabase();

/**
 * 실시간 브리지 — sessions·session_analyses·safety_events 변경 시 관련 쿼리 캐시를
 * 무효화한다(다기기·웹↔앱 동기).
 */
function RealtimeBridge() {
  const { authed, user, refreshUserRow } = useAuth();
  const onEvent = useCallback((event: RealtimeEvent) => {
    if (event.table === 'profile_caregivers' || event.table === 'profile_guardians') {
      // users row는 Query 캐시 밖에 있으므로 별도로 갱신한다.
      void refreshUserRow();
    }
  }, [refreshUserRow]);
  useGiokonRealtime({ enabled: authed, onEvent, scopeKey: user?.id });
  // 연결이 끊긴 동안 놓친 변경은 복귀 시 재검증한다.
  useAppStateRefetch();
  return null;
}

export default function RootLayout() {
  // Pretendard(Figma 기준 서체) 등록. 로드 전에는 흰 화면을 유지해 시스템 폰트로
  // 먼저 그려졌다가 바뀌는 깜빡임(FOUT)을 막는다. 실패해도(error) 앱은 진행한다.
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  // 부팅 게이트 — 서버 연결 정보가 없으면 앱을 열지 않는다.
  // 예시 데이터로 조용히 도는 것보다, 무엇이 잘못됐는지 말하고 멈추는 편이 안전하다.
  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ConfigError reason={supabaseConfigProblem ?? '알 수 없는 설정 오류입니다.'} />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RealtimeBridge />
            <StatusBar style="dark" />
            <ErrorBoundary>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#ffffff' },
                  animation: 'fade',
                }}
              />
            </ErrorBoundary>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

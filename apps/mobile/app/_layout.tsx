import '../global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { useGiokonRealtime } from '@giokon/data';
import { initSupabase, isSupabaseConfigured, queryClient } from '../src/lib/supabase';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { FONT_MAP } from '../src/lib/fonts';

// 데이터 레이어 초기화(미설정 시 목업). 웹 main.tsx와 동일 패턴.
initSupabase();

/**
 * 실시간 브리지 — 라이브 모드에서 sessions·session_analyses·safety_events 변경 시
 * 관련 쿼리 캐시를 무효화한다(다기기·웹↔앱 동기). 미설정 시 유휴.
 */
function RealtimeBridge() {
  useGiokonRealtime({ enabled: isSupabaseConfigured });
  return null;
}

export default function RootLayout() {
  // Pretendard(Figma 기준 서체) 등록. 로드 전에는 흰 화면을 유지해 시스템 폰트로
  // 먼저 그려졌다가 바뀌는 깜빡임(FOUT)을 막는다. 실패해도(error) 앱은 진행한다.
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
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

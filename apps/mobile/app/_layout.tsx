import '../global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';
import { useGiokonRealtime } from '@giokon/data';
import { initSupabase, isSupabaseConfigured, queryClient } from '../src/lib/supabase';
import { useAppStateRefetch } from '../src/lib/queryFocus';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { FONT_MAP } from '../src/lib/fonts';

// 데이터 레이어 초기화(미설정 시 목업). 웹 main.tsx와 동일 패턴.
initSupabase();

/**
 * 실시간 브리지 — 라이브 모드에서 sessions·session_analyses·safety_events 변경 시
 * 관련 쿼리 캐시를 무효화한다(다기기·웹↔앱 동기). 미설정 시 유휴.
 */
/**
 * Supabase 미설정(목업) 안내 — 앱 실행 시 한 번.
 *
 * 미설정이면 앱은 예시 데이터로 조용히 동작한다. 콘솔 로그 한 줄뿐이라 기기에서
 * 화면만 보면 라이브인지 목업인지 구분되지 않고, 요양보호사가 실제로 저장되고 있다고
 * 믿을 수 있다(감사 지적). 저장되지 않는다는 사실은 눈에 보여야 한다.
 */
let demoNoticeShown = false;

function DemoModeNotice() {
  useEffect(() => {
    if (isSupabaseConfigured || demoNoticeShown) return;
    demoNoticeShown = true;
    Alert.alert(
      '예시 데이터로 실행 중이에요',
      '서버 연결 정보가 없어 화면의 어르신·대화 기록은 모두 예시입니다. ' +
        '입력한 내용은 저장되지 않고 앱을 닫으면 사라집니다.',
    );
  }, []);
  return null;
}

function RealtimeBridge() {
  useGiokonRealtime({ enabled: isSupabaseConfigured });
  // Realtime publication 에 없는 테이블(profiles·chronicle_entries)은 이벤트가 오지
  // 않으므로, 앱 복귀 시 재조회로 웹 수정 사항을 따라잡는다.
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RealtimeBridge />
            <DemoModeNotice />
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

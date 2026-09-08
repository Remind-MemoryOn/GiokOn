// 앱 포그라운드 복귀 시 서버 상태 재조회(웹 → 앱 반영).
//
// Realtime은 연결이 끊긴 동안의 이벤트를 재생하지 않는다.
// RN AppState를 focusManager에 연결하고, 복귀 시 활성 쿼리를 재검증한다.
// 공통 refetchOnWindowFocus=false 때문에 focus 이벤트 연결만으로는 충분하지 않다.

import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { focusManager, useQueryClient } from '@tanstack/react-query';

export function useAppStateRefetch(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      // 웹(Expo Web)은 기본 window focus 처리를 그대로 쓴다.
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
      // 공통 refetchOnWindowFocus=false 설정과 무관하게 누락 변경을 따라잡는다.
      if (Platform.OS !== 'web' && status === 'active') void queryClient.invalidateQueries();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [queryClient]);
}

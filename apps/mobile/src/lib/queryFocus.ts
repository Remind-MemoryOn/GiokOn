// 앱 포그라운드 복귀 시 서버 상태 재조회(웹 → 앱 반영).
//
// 배경: 웹에서 연대기·어르신 정보를 고쳐도 앱에는 즉시 반영되지 않는다.
//   - Realtime publication 에 들어 있는 테이블은 sessions·session_analyses·
//     guardian_shares·safety_events 뿐이다(profiles·chronicle_entries 는 없다).
//   - TanStack Query 의 `refetchOnWindowFocus` 는 브라우저 window 이벤트 기반이라
//     React Native 에서는 아무 일도 하지 않는다.
// 그래서 화면을 켜 둔 채로는 웹 수정이 영영 반영되지 않았다. RN 의 AppState 를
// focusManager 에 연결해, 앱으로 돌아올 때 stale 쿼리를 재조회하게 한다.
//
// (완전한 실시간이 필요해지면 publication 에 profiles·chronicle_entries 를 추가하는
//  마이그레이션이 필요하다 — DB 변경이라 별도 결정 사항.)

import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

export function useAppStateRefetch(): void {
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      // 웹(Expo Web)은 기본 window focus 처리를 그대로 쓴다.
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);
}

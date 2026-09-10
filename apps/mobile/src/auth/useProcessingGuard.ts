import { useEffect } from 'react';
import { Alert } from 'react-native';
import { canProcessSession } from '@giokon/data';
import { useApp } from '../store/appStore';
import { queryScope } from '../lib/supabase';
import { peekLiveEngine } from '../lib/live/engine';
import { resetAccessResources } from './accessResources';

/** The typed/local fallback must also stop if consent or session access is lost. */
export function useProcessingGuard(): void {
  const remoteId = useApp(state => state.active?.remoteId);
  useEffect(() => {
    if (!remoteId) return;
    const lease = queryScope.capture();
    let alive = true;
    let checking = false;
    const check = async () => {
      // A connected engine already checks permission every two seconds.
      if (checking || peekLiveEngine()?.available) return;
      checking = true;
      let allowed = false;
      try { allowed = await canProcessSession(remoteId); } catch { /* fail closed */ }
      finally { checking = false; }
      if (!alive || !lease.current() || useApp.getState().active?.remoteId !== remoteId) return;
      if (!allowed) {
        resetAccessResources();
        Alert.alert('대화를 중단했어요', '필수 동의와 이용 권한을 확인한 뒤 다시 시작해 주세요.');
      }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [remoteId]);
}

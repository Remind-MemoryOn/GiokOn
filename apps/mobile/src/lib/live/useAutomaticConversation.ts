import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { screenAiUtterance } from '@giokon/core';
import { getTranscriptStorageVersion } from '@giokon/data';
import { queryScope } from '../supabase';
import { useApp, type ActiveSession } from '../../store/appStore';
import { acquireLiveEngine, closeLiveEngine } from './engine';
import { ensureMicPermission } from './mic';
import { AutomaticConversation, type AutomaticPhase } from './automatic';

export function useAutomaticConversation(enabled: boolean, session: ActiveSession | null, save: () => Promise<boolean>) {
  const controller = useRef<AutomaticConversation | null>(null);
  const [state, setState] = useState<{phase: AutomaticPhase; reason?: string}>({phase:'idle'});
  useEffect(() => {
    if (!enabled || !session?.remoteId) return;
    const lease = queryScope.capture();
    const id = session.session.id;
    let disposed=false;
    const flow = new AutomaticConversation({
      current: () => !disposed && lease.current() && useApp.getState().active?.session.id === id,
      ready: async () => AppState.currentState === 'active' && useApp.getState().active?.turns.length === 1 &&
        await getTranscriptStorageVersion() === 1 && await ensureMicPermission(),
      connect: (onInput,onFailure) => acquireLiveEngine(`${session.elder.id}:${session.startedAt}`,
        session.elder,session.chronicles,session.design,
        {onDraftFinal:onInput,onError:onFailure,onProcessingDenied:onFailure},session.remoteId),
      cancelPending: closeLiveEngine,
      input: text => useApp.getState().adoptAutomaticInput(text),
      output: (text,opener) => {
        if (!screenAiUtterance(text).allowed) return false;
        if (!opener) return useApp.getState().acceptAutomaticResponse(text);
        useApp.getState().overrideQuestion(text);
        return useApp.getState().active?.currentQuestion === text;
      },
      save,
      status: (phase,reason) => setState({phase,reason}),
    });
    controller.current=flow;
    const subscription=AppState.addEventListener('change',next=>{
      if (next!=='active') void flow.stop('앱이 백그라운드로 전환되어 대화를 멈췄어요. 기록을 저장해 주세요.');
    });
    return () => { disposed=true; subscription.remove(); controller.current=null; void flow.stop(); };
    // One controller owns one remote session. Its save callback and auth lease
    // remain scoped to that session; account changes invalidate the lease.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled,session?.remoteId,session?.session.id]);
  return { ...state, start: () => controller.current?.start(), stop: () => controller.current?.stop() };
}

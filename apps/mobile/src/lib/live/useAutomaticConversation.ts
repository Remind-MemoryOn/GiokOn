import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { VOICE_FAILURE_MESSAGES, screenAiUtterance, selectVoiceResumeContext, type VoiceResumeContext } from '@giokon/core';
import { getTranscriptStorageVersion } from '@giokon/data';
import { queryScope } from '../supabase';
import { useApp, type ActiveSession } from '../../store/appStore';
import { acquireLiveEngine, closeLiveEngine } from './engine';
import { ensureMicPermission } from './mic';
import { AutomaticConversation, type AutomaticPhase } from './automatic';

export function useAutomaticConversation(session: ActiveSession | null, save: () => Promise<boolean>) {
  const controller = useRef<AutomaticConversation | null>(null);
  const [state, setState] = useState<{phase: AutomaticPhase; reason?: string}>({phase:'idle'});
  useEffect(() => {
    if (!session?.remoteId) return;
    const lease = queryScope.capture();
    const id = session.session.id;
    let disposed=false;
    let outputTurn: {id:string; text:string} | undefined;
    let restoration: {context:VoiceResumeContext; lastId:string; listen:boolean} | undefined;
    let restoringOutput = false;
    // Paused before the relay greeting arrived: resuming asks for the opener again.
    let openerPending = false;
    let connectionGeneration = 0;
    const resumable = () => {
      const active=useApp.getState().active;
      return !disposed && lease.current() && AppState.currentState === 'active' && active?.session.id === id && active.pendingStt === null &&
        !active.safety.caregiverAlert && active.safety.recommendation === 'continue' ? active : null;
    };
    const flow = new AutomaticConversation({
      current: () => !disposed && lease.current() && useApp.getState().active?.session.id === id,
      ready: async resuming => {
        restoringOutput=false;
        restoration=undefined;
        openerPending=false;
        if (AppState.currentState !== 'active' || await getTranscriptStorageVersion() !== 1 || !await ensureMicPermission()) return false;
        // No local opener exists: the conversation starts empty until the relay greets.
        if (!resuming) return useApp.getState().active?.turns.length === 0;
        if (!resumable() || !await save()) return false;
        const active=resumable(), last=active?.turns.at(-1);
        if (!active) return false;
        if (!last) { openerPending=true; return true; }
        try {
          const context=selectVoiceResumeContext(active.turns,active.playbackByTurnId ?? {});
          const observed=active.playbackByTurnId?.[last.id];
          restoration={context,lastId:last.id,listen:last.speaker === 'AI' && observed?.text === last.text && observed.result === 'completed'};
          return true;
        } catch { return false; }
      },
      connect: (onInput,onFailure,resuming) => {
        const generation=++connectionGeneration;
        return acquireLiveEngine(`${session.elder.id}:${session.startedAt}`,
        {onDraftFinal:onInput,onError: message => {
            if (generation !== connectionGeneration || disposed || !lease.current() || useApp.getState().active?.session.id !== id) return;
            if (message === VOICE_FAILURE_MESSAGES.INPUT_REVIEW_REQUIRED) useApp.getState().requireRelayReview();
            onFailure(message);
          },onProcessingDenied:onFailure,
          onDraftInterrupted: text => {
            if (generation === connectionGeneration && !disposed && lease.current() && useApp.getState().active?.session.id === id)
              useApp.getState().setPendingStt(text, 'gemini_live');
          }},session.remoteId,resuming ? restoration?.context : undefined);
      },
      resume: async engine => {
        if (openerPending) return resumable()?.turns.length === 0 ? await engine.requestOpener() : null;
        if (!restoration || resumable()?.turns.at(-1)?.id !== restoration.lastId) return null;
        if (restoration.listen) return 'listen';
        restoringOutput=true;
        return await engine.requestContinuation?.() ?? null;
      },
      cancelPending: closeLiveEngine,
      input: text => useApp.getState().adoptAutomaticInput(text),
      output: (text,opener) => {
        if (!screenAiUtterance(text).allowed) return false;
        if (restoringOutput) {
          restoringOutput=false;
          if (!restoration || !useApp.getState().acceptResumedResponse(text,restoration.lastId)) return false;
        }
        else if (opener || openerPending) {
          openerPending=false;
          if (!useApp.getState().acceptOpener(text)) return false;
        }
        else if (!useApp.getState().acceptAutomaticResponse(text)) return false;
        const turn = useApp.getState().active?.turns.at(-1);
        if (turn?.speaker !== 'AI' || turn.text !== text) return false;
        outputTurn = {id:turn.id,text};
        return true;
      },
      playback: result => {
        if (outputTurn) useApp.getState().markTurnPlayback(outputTurn.id, outputTurn.text, result);
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
  }, [session?.remoteId,session?.session.id]);
  return { ...state, pause: () => controller.current?.pause(), resume: () => controller.current?.resume(), start: () => controller.current?.start(), stop: () => controller.current?.stop() };
}

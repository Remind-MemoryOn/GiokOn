// 세션 실행 영속화 (앱 → 공유 DB) — 대화 종료 시 완료 세션을 배치로 저장한다.
//
// 방향(앱→웹): 여기서 sessions·session_logs·session_analyses·safety_events를 insert
// 하면, 웹 대시보드가 useGiokonRealtime로 즉시 반영한다(별도 전송 채널 없음 — 공유 DB).
//
// 설계: 세션 런타임 상태(active)는 계속 useApp(Zustand)가 SoT. 종료 시점에 한 번만
// DB에 쓴다(턴별 실시간 스트리밍 아님) — id 상관·부분 실패를 피하는 견고한 배치.
// DB가 세션 id를 생성하므로(insert→select) 로컬 목업 id와 상관시킬 필요가 없다.
// 미설정(목업) 시에는 아무것도 쓰지 않고 목업 logId를 그대로 반환한다.
//
// 실패 처리(2026-08-18 감사에서 고친 두 가지):
//   ① 실패를 삼키지 않는다 — 예전에는 console.warn 만 남기고 "저장되었습니다" 화면으로
//      넘어가, 요양보호사가 대화 전량이 사라진 걸 알 수 없었다. 이제 결과를 돌려주고
//      화면이 재시도/포기를 묻는다. 실패한 묶음은 스토어에 남겨 재시도할 수 있다.
//   ② 반쪽 저장을 남기지 않는다 — sessions 만 들어가고 로그가 실패하면 turn_count 는
//      있는데 대화가 0건인 유령 세션이 DB에 영구히 남았다. 이제 뒤 단계가 실패하면
//      만들어 둔 세션 행을 지운다(session_logs·session_analyses 는 FK cascade 로 함께
//      정리되고, safety_events 는 마지막 단계라 이 시점에 아직 없다).

import { useCallback } from 'react';
import { getGiokonClient, queryKeys, type Json } from '@giokon/data';
import { isSupabaseConfigured, queryClient } from '../lib/supabase';
import { useApp, type FinishedSessionBundle } from '../store/appStore';
import { useAuth } from '../auth/AuthProvider';

/** 세션 저장 결과 — 화면이 이동/재시도를 결정하는 근거. */
export type SessionSaveResult =
  /** 목업 모드(Supabase 미설정) — 로컬 기록만 남았다. */
  | { status: 'mock'; logId: string | null }
  /** 라이브 저장 성공 — logId 는 DB 세션 id. */
  | { status: 'saved'; logId: string }
  /** 라이브 저장 실패 — 대화는 아직 어디에도 없다(재시도 가능). */
  | { status: 'failed'; logId: null; message: string };

/**
 * 네트워크 일시 오류에 견디는 소규모 재시도(지수 백오프).
 *
 * 아래 4단계는 모두 **단일 문장**(다중행 insert 도 한 문장이라 all-or-nothing)이거나
 * upsert 라, 실패 뒤 재시도해도 중복이 생기지 않는다.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

/** 뒤 단계가 실패했을 때 만들어 둔 세션 행을 되돌린다(실패해도 흐름은 막지 않는다). */
async function rollbackSession(sessionId: string): Promise<void> {
  try {
    await getGiokonClient().from('sessions').delete().eq('id', sessionId);
  } catch (e) {
    console.warn('[giokon] 실패한 세션 행을 정리하지 못했습니다.', e);
  }
}

/**
 * 완료 세션 묶음을 DB에 저장하고 생성된 세션 id를 반환한다(실패 시 throw).
 * org_id는 INSERT 트리거가 스탬프하므로 지정하지 않는다. RLS(본인+기관·배정)가 인가.
 */
async function persistCompletedSession(
  b: FinishedSessionBundle,
  userId: string,
): Promise<string> {
  const client = getGiokonClient();

  // 1) 세션 메타(종료 상태).
  const session = await withRetry(async () => {
    const { data, error } = await client
      .from('sessions')
      .insert({
        profile_id: b.elder.id,
        user_id: userId,
        status: 'ended',
        turn_count: b.turns.length,
        duration_seconds: b.durationSeconds,
        current_topic: b.currentTopic,
        started_at: b.startedAt,
        ended_at: b.endedAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
  const sessionId = session.id;

  try {
    // 2) 대화 전문(턴 순서).
    if (b.turns.length > 0) {
      await withRetry(async () => {
        const { error } = await client.from('session_logs').insert(
          b.turns.map((t, i) => ({
            session_id: sessionId,
            profile_id: b.elder.id,
            user_id: userId,
            turn_index: i + 1, // DB 제약: turn_index >= 1 (1-기반)
            role: t.speaker === 'AI' ? ('ai' as const) : ('user' as const),
            content: t.text,
            // 보정 전 STT 원문(고친 경우만). DB 제약상 어르신 턴에만 허용된다.
            original_content: t.speaker === 'AI' ? null : (t.originalText ?? null),
            topic: t.topic ?? null,
            spoken_at: t.timestamp,
          })),
        );
        if (error) throw new Error(error.message);
      });
    }

    // 3) 자동 분석(세션당 1건 — 재분석 시 갱신).
    await withRetry(async () => {
      const { error } = await client.from('session_analyses').upsert(
        {
          session_id: sessionId,
          profile_id: b.elder.id,
          user_id: userId,
          analysis: b.analysis as unknown as Json,
          version: b.analysis.version,
        },
        { onConflict: 'session_id' },
      );
      if (error) throw new Error(error.message);
    });

    // 4) 안전 이벤트(있으면) — 위기/관찰. guardian은 RLS로 배제된다.
    if (b.events.length > 0) {
      await withRetry(async () => {
        const { error } = await client.from('safety_events').insert(
          b.events.map((ev) => ({
            profile_id: b.elder.id,
            session_id: sessionId,
            user_id: userId,
            level: ev.level,
            categories: ev.categories as string[],
            matched_terms: ev.matchedTerms,
            excerpt: ev.excerpt,
            caregiver_alert: ev.caregiverAlert,
            // 세션 중 요양보호사가 배너에서 확인한 이벤트는 확인 상태로 저장한다.
            // (DB 제약 safety_events_ack_pair_check: at/by 는 둘 다 또는 둘 다 없음)
            acknowledged_at: ev.acknowledgedAt,
            acknowledged_by: ev.acknowledgedAt ? userId : null,
          })),
        );
        if (error) throw new Error(error.message);
      });
    }
  } catch (e) {
    // 반쪽 저장을 남기지 않는다 — 세션을 지우면 로그·분석도 FK cascade 로 사라진다.
    await rollbackSession(sessionId);
    throw e;
  }

  // 앱 자체 캐시 무효화(웹은 Realtime로 자동). 재조회 시 최신 반영.
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(b.elder.id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessionAnalyses(b.elder.id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.recentSessions });

  return sessionId;
}

function failure(message: string): SessionSaveResult {
  return { status: 'failed', logId: null, message };
}

/**
 * 세션 종료·저장 브리지.
 *
 *  - `finishAndPersist` : 대화를 끝내고(목업 갱신) 라이브면 DB에 저장한다.
 *  - `retrySave`        : 실패로 남아 있는 묶음을 다시 저장한다.
 *  - `discardUnsaved`   : 사용자가 재시도를 포기했을 때 묶음을 버린다.
 *
 * 저장에 성공해야만 묶음을 비운다 — 실패한 대화를 스토어에 남겨 두어야 재시도할 수 있다.
 */
export function useSessionPersistence(): {
  finishAndPersist: () => Promise<SessionSaveResult>;
  retrySave: () => Promise<SessionSaveResult>;
  discardUnsaved: () => void;
} {
  const { user } = useAuth();

  const save = useCallback(async (): Promise<SessionSaveResult> => {
    const bundle = useApp.getState().lastFinished;
    if (!bundle) return failure('저장할 대화를 찾지 못했어요.');
    if (!user) return failure('로그인이 풀렸어요. 다시 로그인한 뒤 저장해 주세요.');
    try {
      const sessionId = await persistCompletedSession(bundle, user.id);
      useApp.getState().clearLastFinished();
      return { status: 'saved', logId: sessionId };
    } catch (e) {
      console.warn('[giokon] 세션 저장 실패', e);
      return failure(e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.');
    }
  }, [user]);

  const finishAndPersist = useCallback(async (): Promise<SessionSaveResult> => {
    const logId = useApp.getState().finishSession();
    if (!isSupabaseConfigured) {
      useApp.getState().clearLastFinished();
      return { status: 'mock', logId }; // 목업 흐름 보존
    }
    return save();
  }, [save]);

  const discardUnsaved = useCallback((): void => {
    useApp.getState().clearLastFinished();
  }, []);

  return { finishAndPersist, retrySave: save, discardUnsaved };
}

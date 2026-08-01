// 세션 실행 영속화 (앱 → 공유 DB) — 대화 종료 시 완료 세션을 배치로 저장한다.
//
// 방향(앱→웹): 여기서 sessions·session_logs·session_analyses·safety_events를 insert
// 하면, 웹 대시보드가 useGiokonRealtime로 즉시 반영한다(별도 전송 채널 없음 — 공유 DB).
//
// 설계: 세션 런타임 상태(active)는 계속 useApp(Zustand)가 SoT. 종료 시점에 한 번만
// DB에 쓴다(턴별 실시간 스트리밍 아님) — id 상관·부분 실패를 피하는 견고한 배치.
// DB가 세션 id를 생성하므로(insert→select) 로컬 목업 id와 상관시킬 필요가 없다.
// 미설정(목업) 시에는 아무것도 쓰지 않고 목업 logId를 그대로 반환한다.

import { useCallback } from 'react';
import { getGiokonClient, queryKeys, type Json } from '@giokon/data';
import { isSupabaseConfigured, queryClient } from '../lib/supabase';
import { useApp, type FinishedSessionBundle } from '../store/appStore';
import { useAuth } from '../auth/AuthProvider';

/**
 * 네트워크 일시 오류에 견디는 소규모 재시도(지수 백오프). 첫 쓰기처럼 **재시도해도
 * 중복 위험이 없는** 작업에만 쓴다(중복 insert 위험이 있는 단계엔 쓰지 않는다).
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

/**
 * 완료 세션 묶음을 DB에 저장하고 생성된 세션 id를 반환한다(실패 시 throw).
 * org_id는 INSERT 트리거가 스탬프하므로 지정하지 않는다. RLS(본인+기관·배정)가 인가.
 */
async function persistCompletedSession(
  b: FinishedSessionBundle,
  userId: string,
): Promise<string> {
  const client = getGiokonClient();

  // 1) 세션 메타(종료 상태). 첫 쓰기라 실패 시 재시도해도 중복 위험이 없다.
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

  // 2) 대화 전문(턴 순서).
  if (b.turns.length > 0) {
    const { error: lErr } = await client.from('session_logs').insert(
      b.turns.map((t, i) => ({
        session_id: sessionId,
        profile_id: b.elder.id,
        user_id: userId,
        turn_index: i + 1, // DB 제약: turn_index >= 1 (1-기반)
        role: t.speaker === 'AI' ? ('ai' as const) : ('user' as const),
        content: t.text,
        topic: t.topic ?? null,
        spoken_at: t.timestamp,
      })),
    );
    if (lErr) throw new Error(lErr.message);
  }

  // 3) 자동 분석(세션당 1건 — 재분석 시 갱신).
  const { error: aErr } = await client.from('session_analyses').upsert(
    {
      session_id: sessionId,
      profile_id: b.elder.id,
      user_id: userId,
      analysis: b.analysis as unknown as Json,
      version: b.analysis.version,
    },
    { onConflict: 'session_id' },
  );
  if (aErr) throw new Error(aErr.message);

  // 4) 안전 이벤트(있으면) — 위기/관찰. guardian은 RLS로 배제된다.
  if (b.events.length > 0) {
    const { error: eErr } = await client.from('safety_events').insert(
      b.events.map((ev) => ({
        profile_id: b.elder.id,
        session_id: sessionId,
        user_id: userId,
        level: ev.level,
        categories: ev.categories as string[],
        matched_terms: ev.matchedTerms,
        excerpt: ev.excerpt,
        caregiver_alert: ev.caregiverAlert,
      })),
    );
    if (eErr) throw new Error(eErr.message);
  }

  // 앱 자체 캐시 무효화(웹은 Realtime로 자동). 재조회 시 최신 반영.
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(b.elder.id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessionAnalyses(b.elder.id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.recentSessions });

  return sessionId;
}

/**
 * 세션 종료 브리지. finishSession(목업 갱신)을 호출한 뒤, 라이브면 완료 세션을 DB에
 * 저장하고 이동에 쓸 id를 반환한다.
 *  - 목업 모드: 목업 logId(로컬)를 반환 → /log/[logId]가 목업으로 해석.
 *  - 라이브 모드: DB 세션 id를 반환 → /log/[id]가 DB에서 조회. 실패 시 null(목록으로).
 */
export function useSessionPersistence(): { finishAndPersist: () => Promise<string | null> } {
  const { user } = useAuth();

  const finishAndPersist = useCallback(async (): Promise<string | null> => {
    const logId = useApp.getState().finishSession();
    if (!isSupabaseConfigured) return logId; // 목업 흐름 보존

    const bundle = useApp.getState().lastFinished;
    useApp.getState().clearLastFinished();
    if (!bundle || !user) return null;

    try {
      return await persistCompletedSession(bundle, user.id);
    } catch (e) {
      // 저장 실패해도 앱 흐름은 막지 않는다(라이브에서 로컬 id는 해석 불가 → null).
      console.warn('[giokon] 세션 저장 실패 — 목록으로 이동합니다.', e);
      return null;
    }
  }, [user]);

  return { finishAndPersist };
}

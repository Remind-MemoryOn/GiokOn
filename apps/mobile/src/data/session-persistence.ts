// 세션 실행 영속화 (앱 → 공유 DB)
//
// 방향(앱→웹): 여기서 sessions·session_logs·session_analyses·safety_events를 쓰면,
// 웹 대시보드가 useGiokonRealtime로 즉시 반영한다(별도 전송 채널 없음 — 공유 DB).
//
// ── 저장 시점(2026-08-18 변경) ────────────────────────────────────────────────
// 예전에는 **종료 시 한 번만** 배치로 썼다. 그래서 앱이 강제 종료되거나 배터리가
// 나가면 대화 전체가 사라졌고, 진행 중인 대화를 웹에서 볼 수도 없었다(감사 지적).
// 이제 대화가 **진행되는 동안** 기록한다:
//   시작   → sessions insert (status='active')
//   턴마다 → session_logs upsert + sessions(turn_count·current_topic) update
//   위기   → safety_events insert, 요양보호사가 확인하면 acknowledged_at update
//   종료   → sessions update (status='ended') + session_analyses upsert
// 세션 런타임 상태 자체는 계속 useApp(Zustand)이 SoT다. 이 파일은 그 상태를 DB에
// 비추는 단방향 브리지다.
//
// 견고성:
//   - 턴 기록은 (session_id, turn_index) 유니크 위에서 upsert 라 재시도해도 멱등하다.
//   - 진행 중 동기화가 실패해도 대화는 막지 않는다(다음 턴·종료 때 다시 시도한다).
//   - 시작 시 세션 생성이 실패하면 remoteId 가 null 로 남고, 종료 시 예전처럼 일괄
//     저장으로 폴백한다. 그 경로에서도 뒤 단계가 실패하면 만들어 둔 세션을 지워
//     반쪽 저장을 남기지 않는다.

import { useCallback } from 'react';
import {
  getGiokonClient,
  queryKeys,
  toSessionLogInsert,
  type Json,
  type SessionLogOwner,
} from '@giokon/data';
import type { ConversationTurn } from '@giokon/core';
import { isSupabaseConfigured, queryClient } from '../lib/supabase';
import { useApp, type FinishedSessionBundle, type SessionSafetyEvent } from '../store/appStore';
import { useAuth } from '../auth/AuthProvider';

/** 세션 저장 결과 — 화면이 이동/재시도를 결정하는 근거. */
export type SessionSaveResult =
  /** 목업 모드(Supabase 미설정) — 로컬 기록만 남았다. */
  | { status: 'mock'; logId: string | null }
  /** 라이브 저장 성공 — logId 는 DB 세션 id. */
  | { status: 'saved'; logId: string }
  /** 라이브 저장 실패 — 대화가 온전히 남지 않았다(재시도 가능). */
  | { status: 'failed'; logId: null; message: string };

/**
 * 네트워크 일시 오류에 견디는 소규모 재시도(지수 백오프).
 * 아래 쓰기는 모두 단일 문장(다중행 insert 포함)이거나 upsert 라 재시도가 안전하다.
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

/** 아직 기록하지 않은 턴을 이어서 쓴다. 반환값 = 기록 완료 턴 수. */
async function writeTurns(
  turns: ConversationTurn[],
  from: number,
  ids: SessionLogOwner,
): Promise<number> {
  if (from >= turns.length) return turns.length;
  const rows = turns.slice(from).map((_, i) => toSessionLogInsert(turns, from + i, ids));
  await withRetry(async () => {
    const { error } = await getGiokonClient()
      .from('session_logs')
      .upsert(rows, { onConflict: 'session_id,turn_index' });
    if (error) throw new Error(error.message);
  });
  return turns.length;
}

/**
 * 아직 기록하지 않은 안전 이벤트를 넣고, 확인된 이벤트의 확인 시각을 반영한다.
 * 이벤트는 세션당 0~2건 수준이라 한 건씩 처리해 id 대응을 확실히 한다.
 */
async function writeSafetyEvents(
  events: SessionSafetyEvent[],
  ids: SessionLogOwner,
): Promise<SessionSafetyEvent[]> {
  const client = getGiokonClient();
  const out: SessionSafetyEvent[] = [];
  for (const ev of events) {
    let next = ev;
    if (next.remoteId === null) {
      const row = await withRetry(async () => {
        const { data, error } = await client
          .from('safety_events')
          .insert({
            profile_id: ids.profileId,
            session_id: ids.sessionId,
            user_id: ids.userId,
            level: next.level,
            categories: next.categories as string[],
            matched_terms: next.matchedTerms,
            excerpt: next.excerpt,
            caregiver_alert: next.caregiverAlert,
            // DB 제약 safety_events_ack_pair_check: at/by 는 둘 다 또는 둘 다 없음
            acknowledged_at: next.acknowledgedAt,
            acknowledged_by: next.acknowledgedAt ? ids.userId : null,
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        return data;
      });
      next = { ...next, remoteId: row.id, ackSynced: next.acknowledgedAt !== null };
    } else if (next.acknowledgedAt !== null && !next.ackSynced) {
      await withRetry(async () => {
        const { error } = await client
          .from('safety_events')
          .update({ acknowledged_at: next.acknowledgedAt, acknowledged_by: ids.userId })
          .eq('id', next.remoteId as string);
        if (error) throw new Error(error.message);
      });
      next = { ...next, ackSynced: true };
    }
    out.push(next);
  }
  return out;
}

/** 뒤 단계가 실패했을 때 만들어 둔 세션 행을 되돌린다(실패해도 흐름은 막지 않는다). */
async function rollbackSession(sessionId: string): Promise<void> {
  try {
    await getGiokonClient().from('sessions').delete().eq('id', sessionId);
  } catch (e) {
    console.warn('[giokon] 실패한 세션 행을 정리하지 못했습니다.', e);
  }
}

function invalidateFor(profileId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(profileId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessionAnalyses(profileId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.recentSessions });
}

function failure(message: string): SessionSaveResult {
  return { status: 'failed', logId: null, message };
}

/**
 * 종료 시 일괄 저장(폴백) — 시작 시 세션 생성이 실패해 remoteId 가 없을 때만 쓴다.
 * 뒤 단계가 실패하면 세션 행을 지운다(logs·analyses 는 FK cascade 로 함께 사라지고,
 * safety_events 는 마지막 단계라 이 시점에 아직 없다).
 */
async function persistWholeSession(b: FinishedSessionBundle, userId: string): Promise<string> {
  const client = getGiokonClient();
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

  const ids = { sessionId: session.id, profileId: b.elder.id, userId };
  try {
    await writeTurns(b.turns, 0, ids);
    await writeAnalysis(b, ids);
    await writeSafetyEvents(b.events, ids);
  } catch (e) {
    await rollbackSession(session.id);
    throw e;
  }
  return session.id;
}

async function writeAnalysis(
  b: FinishedSessionBundle,
  ids: SessionLogOwner,
): Promise<void> {
  await withRetry(async () => {
    const { error } = await getGiokonClient().from('session_analyses').upsert(
      {
        session_id: ids.sessionId,
        profile_id: ids.profileId,
        user_id: ids.userId,
        analysis: b.analysis as unknown as Json,
        version: b.analysis.version,
      },
      { onConflict: 'session_id' },
    );
    if (error) throw new Error(error.message);
  });
}

/** 진행 중에 만들어 둔 세션을 마무리한다(나머지 턴·이벤트 + 종료 상태 + 분석). */
async function finalizeSession(b: FinishedSessionBundle, userId: string): Promise<string> {
  const sessionId = b.remoteId as string;
  const ids = { sessionId, profileId: b.elder.id, userId };
  await writeTurns(b.turns, b.syncedTurns, ids);
  await writeSafetyEvents(b.events, ids);
  await writeAnalysis(b, ids);
  await withRetry(async () => {
    const { error } = await getGiokonClient()
      .from('sessions')
      .update({
        status: 'ended',
        ended_at: b.endedAt,
        duration_seconds: b.durationSeconds,
        turn_count: b.turns.length,
        current_topic: b.currentTopic,
      })
      .eq('id', sessionId);
    if (error) throw new Error(error.message);
  });
  return sessionId;
}

/** 진행 중 동기화가 겹치지 않도록 하는 간단한 잠금(턴이 빨리 이어져도 중복 쓰기 방지). */
let syncing = false;

/**
 * 세션 실행 ↔ DB 브리지.
 *
 *  - `openRemoteSession` : 대화 시작 시 DB 세션(active)을 만든다.
 *  - `syncProgress`      : 진행 중 턴·안전 이벤트를 이어서 기록한다(실패해도 무시).
 *  - `finishAndPersist`  : 대화를 끝내고 마무리 저장한다.
 *  - `retrySave`         : 실패로 남아 있는 묶음을 다시 저장한다.
 *  - `discardUnsaved`    : 사용자가 재시도를 포기했을 때 묶음을 버린다.
 */
export function useSessionPersistence(): {
  openRemoteSession: () => Promise<void>;
  syncProgress: () => Promise<void>;
  finishAndPersist: () => Promise<SessionSaveResult>;
  retrySave: () => Promise<SessionSaveResult>;
  discardUnsaved: () => void;
} {
  const { user } = useAuth();

  const openRemoteSession = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured || !user) return;
    const a = useApp.getState().active;
    if (!a || a.remoteId) return;
    try {
      const row = await withRetry(async () => {
        const { data, error } = await getGiokonClient()
          .from('sessions')
          .insert({
            profile_id: a.elder.id,
            user_id: user.id,
            status: 'active',
            turn_count: a.turns.length,
            current_topic: a.currentTopic,
            started_at: a.startedAt,
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        return data;
      });
      useApp.getState().attachRemoteSession(row.id);
      invalidateFor(a.elder.id);
    } catch (e) {
      // 시작 시 저장에 실패해도 대화는 진행한다 — 종료 시 일괄 저장으로 폴백한다.
      console.warn('[giokon] 진행 중 세션 생성 실패 — 종료 시 일괄 저장합니다.', e);
    }
  }, [user]);

  const syncProgress = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured || !user || syncing) return;
    const a = useApp.getState().active;
    if (!a?.remoteId) return;
    syncing = true;
    try {
      const ids = { sessionId: a.remoteId, profileId: a.elder.id, userId: user.id };
      const turns = await writeTurns(a.turns, a.syncedTurns, ids);
      const events = await writeSafetyEvents(a.events, ids);
      useApp.getState().markSynced({ turns, events });
      await withRetry(async () => {
        const { error } = await getGiokonClient()
          .from('sessions')
          .update({ turn_count: a.turns.length, current_topic: a.currentTopic })
          .eq('id', ids.sessionId);
        if (error) throw new Error(error.message);
      });
    } catch (e) {
      // 진행 중 실패는 대화를 막지 않는다 — 다음 턴이나 종료 때 다시 시도한다.
      console.warn('[giokon] 진행 중 동기화 실패 — 다음 턴에 다시 시도합니다.', e);
    } finally {
      syncing = false;
    }
  }, [user]);

  const save = useCallback(async (): Promise<SessionSaveResult> => {
    const bundle = useApp.getState().lastFinished;
    if (!bundle) return failure('저장할 대화를 찾지 못했어요.');
    if (!user) return failure('로그인이 풀렸어요. 다시 로그인한 뒤 저장해 주세요.');
    try {
      const sessionId = bundle.remoteId
        ? await finalizeSession(bundle, user.id)
        : await persistWholeSession(bundle, user.id);
      useApp.getState().clearLastFinished();
      invalidateFor(bundle.elder.id);
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
    const bundle = useApp.getState().lastFinished;
    useApp.getState().clearLastFinished();
    // 진행 중에 만들어 둔 세션이 있으면 'active' 로 남겨 두지 않는다 — 그대로 두면
    // 웹에서 영원히 "진행 중"으로 보인다. 여기까지 기록된 대화는 그대로 남긴다
    // (사용자가 포기한 것은 재시도이지, 이미 저장된 기록이 아니다).
    if (!isSupabaseConfigured || !bundle?.remoteId) return;
    void withRetry(async () => {
      const { error } = await getGiokonClient()
        .from('sessions')
        .update({
          status: 'ended',
          ended_at: bundle.endedAt,
          duration_seconds: bundle.durationSeconds,
          turn_count: bundle.syncedTurns,
          current_topic: bundle.currentTopic,
        })
        .eq('id', bundle.remoteId as string);
      if (error) throw new Error(error.message);
    }).catch((e) => console.warn('[giokon] 세션 종료 표시 실패', e));
  }, []);

  return { openRemoteSession, syncProgress, finishAndPersist, retrySave: save, discardUnsaved };
}

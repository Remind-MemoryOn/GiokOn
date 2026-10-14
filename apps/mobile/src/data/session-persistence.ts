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
//   - 동기화 결과를 반환한다. 자동 대화는 실패 시 멈추고, 수동 경로는 종료 때 재시도한다.
//   - 시작 시 DB 승인이 실패하면 remoteId 가 null 로 남고 시작 화면에서 중단한다.
//     과거 미저장 묶음의 일괄 저장 경로도 현재 DB 동의 검사를 통과해야 한다.

import { useCallback } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  getGiokonClient,
  queryKeys,
  persistConversationTurns,
  type Json,
  type SessionLogOwner,
  type QueryLease,
} from '@giokon/data';
import type { ConversationTurn } from '@giokon/core';
import { queryScope } from '../lib/supabase';
import { useApp, type FinishedSessionBundle, type SessionSafetyEvent } from '../store/appStore';
import { useAuth } from '../auth/AuthProvider';

/** 세션 저장 결과 — 화면이 이동/재시도를 결정하는 근거. */
export type SessionSaveResult =
  /** 저장 성공 — logId 는 DB 세션 id. */
  | { status: 'saved'; logId: string }
  /** 라이브 저장 실패 — 대화가 온전히 남지 않았다(재시도 가능). */
  | { status: 'failed'; logId: null; message: string };

/** 대화 시작 실패 사유 — 화면이 안내를 고르는 근거. */
export type SessionStartFailure = 'supervisor_limit' | 'elder_busy' | 'already_started' | 'consent_required' | 'failed';

/**
 * 서버가 **정책으로** 거절한 경우(재시도해도 같다) — 재시도하지 않고 사유를 돌려준다(DB 가 판정, 앱은 이유만 안내).
 * SESSION_SUPERVISOR_LIMIT: 요양보호사 1명당 동시 진행 4대(T21.13) · ELDER_SESSION_ACTIVE: 어르신 1명당 실행 중 세션 1개(T25.19) ·
 * SESSION_ALREADY_STARTED: 설계 세션을 다른 사람이 이미 시작·종료(T25.11) · PROCESSING_CONSENT_REQUIRED: 처리 동의 없음 ·
 * SESSION_START_FORBIDDEN: 돌봄팀 아님·없는 세션·다른 기관(존재 여부를 구분하지 않는다 — 일반 실패로 안내).
 */
const POLICY_REASONS: [code: string, reason: SessionStartFailure][] = [
  ['SESSION_SUPERVISOR_LIMIT', 'supervisor_limit'],
  ['ELDER_SESSION_ACTIVE', 'elder_busy'],
  ['SESSION_ALREADY_STARTED', 'already_started'],
  ['PROCESSING_CONSENT_REQUIRED', 'consent_required'],
  ['SESSION_START_FORBIDDEN', 'failed'],
];
class PolicyRejection extends Error {
  constructor(readonly reason: SessionStartFailure) { super(reason); }
}
function policyRejection(message: string): PolicyRejection | null {
  const hit = POLICY_REASONS.find(([code]) => message.includes(code));
  return hit ? new PolicyRejection(hit[1]) : null;
}

/**
 * 네트워크 일시 오류에 견디는 소규모 재시도(지수 백오프).
 * 아래 쓰기는 모두 단일 문장(다중행 insert 포함)이거나 upsert 라 재시도가 안전하다.
 */
async function withRetry<T>(lease: QueryLease, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      lease.assertCurrent();
      const result = await fn();
      lease.assertCurrent();
      return result;
    } catch (e) {
      lease.assertCurrent();
      if (e instanceof PolicyRejection) throw e;
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
  lease: QueryLease,
): Promise<number> {
  if (from >= turns.length) return turns.length;
  await withRetry(lease, async () => {
    await persistConversationTurns(turns, from, ids, () => lease.assertCurrent());
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
  lease: QueryLease,
): Promise<SessionSafetyEvent[]> {
  const client = getGiokonClient();
  const out: SessionSafetyEvent[] = [];
  for (const ev of events) {
    let next = ev;
    if (next.remoteId === null) {
      const insert = {
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
      };
      const reservedId = next.reservedId;
      if (reservedId) {
        // T25.17 — 중계가 만든 사건 id 로 '없을 때만' 넣는다. 중계 재시도가 먼저 들어갔으면 아무것도 하지 않는다
        // (그 행이 근거까지 가진 원본이다). 어느 쪽이 먼저든 사건은 1건 — 확인 시각은 아래에서 따로 반영한다.
        await withRetry(lease, async () => {
          const { error } = await client
            .from('safety_events')
            .upsert({ ...insert, id: reservedId }, { onConflict: 'id', ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        });
        next = { ...next, remoteId: reservedId, reservedId: null, ackSynced: false };
      } else {
        const row = await withRetry(lease, async () => {
          const { data, error } = await client
            .from('safety_events')
            .insert(insert)
            .select('id')
            .single();
          if (error) throw new Error(error.message);
          return data;
        });
        next = { ...next, remoteId: row.id, ackSynced: next.acknowledgedAt !== null };
      }
    }
    if (next.remoteId !== null && next.acknowledgedAt !== null && !next.ackSynced) {
      await withRetry(lease, async () => {
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
async function rollbackSession(sessionId: string, lease: QueryLease): Promise<void> {
  try {
    lease.assertCurrent();
    await getGiokonClient().from('sessions').delete().eq('id', sessionId);
  } catch (e) {
    console.warn('[giokon] 실패한 세션 행을 정리하지 못했습니다.', e);
  }
}

function invalidateFor(profileId: string, lease: QueryLease): void {
  void lease.client.invalidateQueries({ queryKey: queryKeys.sessions(profileId) });
  void lease.client.invalidateQueries({ queryKey: queryKeys.sessionAnalyses(profileId) });
  void lease.client.invalidateQueries({ queryKey: queryKeys.recentSessions });
}

function failure(message: string): SessionSaveResult {
  return { status: 'failed', logId: null, message };
}

/**
 * 종료 시 일괄 저장(폴백) — 시작 시 세션 생성이 실패해 remoteId 가 없을 때만 쓴다.
 *
 * 순서: 세션(`recording` — 실행 불가 기록 전용, T25.18) 생성 → 턴 → 분석 → 안전 이벤트 → `ended`(finalizeSession 처럼 종료가 마지막).
 * 예전에는 처음부터 `ended` 로 넣어, 세션이 끝난 시점에 턴·분석 행이 아직 없었다 —
 * 세션 종료를 계기로 도는 후속 처리(프로그램 일지 초안 생성 등)가 빈 기록을 보게 된다.
 * 마지막 update 는 종료 필드(status·ended_at·duration_seconds)만 바꾼다 — 동의 가드
 * (`app.require_processing_consent`)가 허용하는 종료 경로와 같은 모양이다.
 * 뒤 단계가 실패하면 세션 행을 지운다(logs·analyses 는 FK cascade 로 함께 사라진다).
 * ⚠️ safety_events 는 `on delete set null` 이라 지워지지 않는다 — 롤백 뒤 재시도에서
 * 중복으로 남지 않도록 이벤트는 쓰기 단계의 **맨 뒤**에 둔다(finalizeSession 과 다른 이유).
 */
async function persistWholeSession(b: FinishedSessionBundle, userId: string, lease: QueryLease): Promise<string> {
  const client = getGiokonClient();
  const session = await withRetry(lease, async () => {
    const { data, error } = await client
      .from('sessions')
      .insert({
        profile_id: b.elder.id,
        user_id: userId,
        // 실행 중(active)이 아니라 기록 전용 — 과거 시각을 남기되 중계·토큰 권한이 없고 ended 로만 간다(T25.18).
        status: 'recording',
        turn_count: b.turns.length,
        current_topic: b.currentTopic,
        started_at: b.startedAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

  const ids = { sessionId: session.id, profileId: b.elder.id, userId };
  try {
    await writeTurns(b.turns, 0, ids, lease);
    await writeAnalysis(b, ids, lease);
    await writeSafetyEvents(b.events, ids, lease);
    await withRetry(lease, async () => {
      const { error } = await client
        .from('sessions')
        .update({ status: 'ended', ended_at: b.endedAt, duration_seconds: b.durationSeconds })
        .eq('id', session.id);
      if (error) throw new Error(error.message);
    });
  } catch (e) {
    await rollbackSession(session.id, lease);
    throw e;
  }
  return session.id;
}

async function writeAnalysis(
  b: FinishedSessionBundle,
  ids: SessionLogOwner,
  lease: QueryLease,
): Promise<void> {
  await withRetry(lease, async () => {
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
async function finalizeSession(b: FinishedSessionBundle, userId: string, lease: QueryLease): Promise<string> {
  const sessionId = b.remoteId as string;
  const ids = { sessionId, profileId: b.elder.id, userId };
  await writeTurns(b.turns, b.syncedTurns, ids, lease);
  await writeSafetyEvents(b.events, ids, lease);
  await writeAnalysis(b, ids, lease);
  await withRetry(lease, async () => {
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
const syncing = new Set<string>();
/** Keep one insert identity across retries/rerenders without retaining finished sessions. */
const instantSessionIds = new WeakMap<object, string>();

/**
 * 세션 실행 ↔ DB 브리지.
 *
 *  - `openRemoteSession` : 대화 시작 시 DB 세션(active)을 만든다.
 *  - `syncProgress`      : 진행 중 턴·안전 이벤트를 기록하고 완료 여부를 반환한다.
 *  - `finishAndPersist`  : 대화를 끝내고 마무리 저장한다.
 *  - `retrySave`         : 실패로 남아 있는 묶음을 다시 저장한다.
 *  - `discardUnsaved`    : 사용자가 재시도를 포기했을 때 묶음을 버린다.
 */
export function useSessionPersistence(): {
  openRemoteSession: () => Promise<SessionStartFailure | null>;
  /**
   * 웹 설계 세션(planned)을 **채택**해 active 로 전환한다(B1-c).
   * 새 행을 만들지 않고 같은 행을 이어 쓰므로 '설계됨' 좀비가 남지 않는다.
   */
  adoptPlannedSession: (sessionId: string) => Promise<SessionStartFailure | null>;
  syncProgress: () => Promise<boolean>;
  finishAndPersist: () => Promise<SessionSaveResult>;
  retrySave: () => Promise<SessionSaveResult>;
  discardUnsaved: () => void;
} {
  const { user } = useAuth();
  const lease = queryScope.capture();

  const openRemoteSession = useCallback(async (): Promise<SessionStartFailure | null> => {
    if (!user || !lease.current()) return 'failed';
    const a = useApp.getState().active;
    if (!a || a.remoteId) return a?.remoteId ? null : 'failed';
    try {
      const sessionId = instantSessionIds.get(a.session) ?? randomUUID();
      instantSessionIds.set(a.session, sessionId);
      const recover = async () => {
        lease.assertCurrent();
        const { data, error } = await getGiokonClient().from('sessions')
          .select('id,profile_id,user_id,status,paused_at,ended_at')
          .eq('id', sessionId).eq('user_id', user.id).eq('profile_id', a.elder.id).maybeSingle();
        lease.assertCurrent();
        if (error) throw new Error(error.message);
        if (data && (data.id !== sessionId || data.user_id !== user.id || data.profile_id !== a.elder.id ||
            data.status !== 'active' || data.paused_at !== null || data.ended_at !== null))
          throw new PolicyRejection('already_started');
        return data;
      };
      const row = await withRetry(lease, async () => {
        const existing = await recover();
        if (existing) return existing;
        lease.assertCurrent();
        try {
          const { data, error } = await getGiokonClient()
            .from('sessions')
            .insert({
              id: sessionId,
              profile_id: a.elder.id,
              user_id: user.id,
              status: 'active',
              turn_count: a.turns.length,
              current_topic: a.currentTopic,
              // started_at 은 보내지 않는다 — 실행 중 세션의 시작 시각은 서버가 정한다(T25.18, 보내도 무시된다).
            })
            .select('id')
            .single();
          lease.assertCurrent();
          if (error) throw policyRejection(error.message) ?? new Error(error.message);
          if (data?.id !== sessionId) throw new Error('SESSION_CREATE_RESPONSE_INVALID');
          return data;
        } catch (error) {
          // The insert may have committed even when its response was lost.
          // Recover this exact attempt, including after the final retry.
          const existing = await recover();
          if (existing) return existing;
          throw error;
        }
      });
      if (useApp.getState().active?.session.id !== a.session.id) return 'failed';
      useApp.getState().attachRemoteSession(row.id);
      invalidateFor(a.elder.id, lease);
      return null;
    } catch (e) {
      // 시작 화면은 remoteId가 없으면 음성/AI 처리에 진입하지 않는다.
      console.warn('[giokon] 진행 중 세션 생성 실패 — 시작을 중단합니다.', e);
      return e instanceof PolicyRejection ? e.reason : 'failed';
    }
  }, [user, lease]);

  /**
   * planned 세션 채택 — DB 시작 RPC(`start_planned_session`, T25.11)가 시작 권한·처리 동의·동시 한도·어르신당 1세션을
   * 확인하고 **호출한 사람을 진행자로** planned → active 를 원자적으로 바꾼다(설계자는 planned_by 로 남는다).
   * 시작 시각은 서버 시각. 같은 사람의 재호출(응답 유실 재시도)은 같은 값으로 성공한다.
   * 이후 syncProgress/finalize 가 같은 행에 이어 쓴다. 승인이 없으면 런타임에 붙이지 않고 시작 화면에서 중단한다.
   */
  const adoptPlannedSession = useCallback(
    async (sessionId: string): Promise<SessionStartFailure | null> => {
      if (!user || !lease.current()) return 'failed';
      const original = useApp.getState().active;
      if (!original) return 'failed';
      try {
        await withRetry(lease, async () => {
          const { data, error } = await getGiokonClient().rpc('start_planned_session', { p_session_id: sessionId });
          if (error) throw policyRejection(error.message) ?? new Error(error.message);
          if (!data || data.session_id !== sessionId) throw new Error('설계 세션의 시작 승인을 받지 못했어요.');
        });
      } catch (e) {
        console.warn('[giokon] 설계 세션 시작 실패', e);
        return e instanceof PolicyRejection ? e.reason : 'failed';
      }
      if (!lease.current() || useApp.getState().active?.session.id !== original.session.id) return 'failed';
      useApp.getState().attachRemoteSession(sessionId);
      const a = useApp.getState().active;
      if (a) invalidateFor(a.elder.id, lease);
      return null;
    },
    [user, lease],
  );

  const syncProgress = useCallback(async (): Promise<boolean> => {
    if (!user || !lease.current()) return false;
    const a = useApp.getState().active;
    if (!a?.remoteId) return false;
    const syncKey = `${lease.generation}:${a.session.id}`;
    if (syncing.has(syncKey)) return false;
    syncing.add(syncKey);
    try {
      const ids = { sessionId: a.remoteId, profileId: a.elder.id, userId: user.id };
      const turns = await writeTurns(a.turns, a.syncedTurns, ids, lease);
      const events = await writeSafetyEvents(a.events, ids, lease);
      if (!lease.current() || useApp.getState().active?.session.id !== a.session.id) return false;
      useApp.getState().markSynced({ turns, events });
      await withRetry(lease, async () => {
        const { error } = await getGiokonClient()
          .from('sessions')
          .update({ turn_count: a.turns.length, current_topic: a.currentTopic })
          .eq('id', ids.sessionId);
        if (error) throw new Error(error.message);
      });
      return lease.current() && useApp.getState().active?.session.id === a.session.id;
    } catch (e) {
      // 자동 루프는 false를 받으면 회수한다. 종료/명시적 재시도로 기록을 복구한다.
      console.warn('[giokon] 진행 중 동기화 실패 — 다음 턴에 다시 시도합니다.', e);
      return false;
    } finally {
      syncing.delete(syncKey);
    }
  }, [user, lease]);

  const save = useCallback(async (): Promise<SessionSaveResult> => {
    if (!lease.current()) return failure('인증 상태가 변경되어 저장을 중단했어요.');
    const bundle = useApp.getState().lastFinished;
    if (!bundle) return failure('저장할 대화를 찾지 못했어요.');
    if (!user) return failure('로그인이 풀렸어요. 다시 로그인한 뒤 저장해 주세요.');
    try {
      const sessionId = bundle.remoteId
        ? await finalizeSession(bundle, user.id, lease)
        : await persistWholeSession(bundle, user.id, lease);
      lease.assertCurrent();
      if (useApp.getState().lastFinished !== bundle) return failure('저장 대상 세션이 변경되었어요.');
      useApp.getState().clearLastFinished();
      invalidateFor(bundle.elder.id, lease);
      return { status: 'saved', logId: sessionId };
    } catch (e) {
      console.warn('[giokon] 세션 저장 실패', e);
      return failure(e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.');
    }
  }, [user, lease]);

  const finishAndPersist = useCallback(async (): Promise<SessionSaveResult> => {
    if (!lease.current()) return failure('인증 상태가 변경되어 작업을 중단했어요.');
    useApp.getState().finishSession();
    return save();
  }, [save, lease]);

  const discardUnsaved = useCallback((): void => {
    if (!lease.current()) return;
    const bundle = useApp.getState().lastFinished;
    useApp.getState().clearLastFinished();
    // 진행 중에 만들어 둔 세션이 있으면 'active' 로 남겨 두지 않는다 — 그대로 두면
    // 웹에서 영원히 "진행 중"으로 보인다. 여기까지 기록된 대화는 그대로 남긴다
    // (사용자가 포기한 것은 재시도이지, 이미 저장된 기록이 아니다).
    if (!bundle?.remoteId) return;
    void withRetry(lease, async () => {
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
  }, [lease]);

  return { openRemoteSession, adoptPlannedSession, syncProgress, finishAndPersist, retrySave: save, discardUnsaved };
}

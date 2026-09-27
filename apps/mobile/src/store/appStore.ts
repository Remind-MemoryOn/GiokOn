// 앱 상태 스토어 (Zustand) — 요양보호사 세션 실행 런타임(UI 상태) 전용.
//
// 백엔드 로직은 전부 @giokon/core를 재사용한다(신규 도메인 로직 없음):
//   - 발화 안전 평가: evaluateUserTurn (위기·중단·거부 → 알림·이벤트·세션 권고)
//   - AI 출력 채택 전 검열: screenAiUtterance
//   - 종료 분석: analyzeSession (비의료 관찰 지표)
// AI 질문은 앱이 만들지 않는다 — 음성 중계가 만들고 서버에서 검증한 것만 받아 기록한다
// (2026-09 규칙 기반 생성기 ai.ts 삭제, 계획 C1).

import { create } from 'zustand';
import {
  analyzeSession,
  detectTurnTopic,
  evaluateUserTurn,
  resolveSessionRecommendation,
  screenAiUtterance,
  snapshotVoicePlayback,
  VOICE_FAILURE_MESSAGES,
  nowIso,
  uid,
  type ChronicleEntry,
  type ConversationTurn,
  type ElderProfile,
  type SafetyEventDraft,
  type Session,
  type SessionAnalysis,
  type SessionDesign,
  type SessionRecommendation,
  type TherapyType,
  type VoicePlaybackObservation,
} from '@giokon/core';

export interface RuntimeSafety {
  escalate: boolean;
  caregiverAlert: string | null;
  level: 'watch' | 'crisis' | null;
  recommendation: SessionRecommendation;
  acknowledged: boolean;
}

export type SessionPhase = 'idle' | 'ai_speaking' | 'mic_ready' | 'processing' | 'ended';

/**
 * 세션 중 발생한 안전 이벤트 + **요양보호사 확인 시각**.
 *
 * 위기 배너의 "확인"은 지금까지 화면 상태로만 남고 DB 에 가지 않았다 —
 * `safety_events.acknowledged_at/by` 컬럼이 있는데도 항상 null 이라 웹 안전 알림
 * 대시보드에서 앱에서 이미 확인한 알림이 미확인으로 보였다. 확인 시각을 이벤트에
 * 붙여 종료 저장 때 함께 기록한다(DB 제약: at/by 는 둘 다 있거나 둘 다 없어야 한다).
 */
export interface SessionSafetyEvent extends SafetyEventDraft {
  acknowledgedAt: string | null;
  /** DB safety_events.id — 아직 기록 전이면 null. */
  remoteId: string | null;
  /** 확인 시각까지 DB 에 반영됐는지(중복 update 방지). */
  ackSynced: boolean;
}

export interface ActiveSession {
  elder: ElderProfile;
  session: Session;
  /**
   * 웹에서 설계한 세션 값(planned 채택 시). 대화 진행 입력 — 프롬프트 주입·
   * avoid_topics 가드가 이 값을 읽는다. 즉석 시작 세션이면 undefined.
   */
  design?: SessionDesign;
  /**
   * 세션 시작 시 넘겨받은 어르신 연대기(대화 개인화·종료 분석의 근거).
   *
   * ⚠️ 종료 분석이 연대기를 다시 조회하면 **라이브 모드에서
   * 빈 배열**이 된다 — 라이브 어르신 id 는 목업 배열에 없다. 그러면 대화는 실제
   * 연대기로 열어 놓고 저장되는 분석의 추천 주제만 근거 없이 계산된다.
   * 시작 시점의 연대기를 그대로 들고 있다가 분석에 쓴다.
   */
  chronicles: ChronicleEntry[];
  /** 대화 기록. 중계의 첫 인사(acceptOpener)가 오기 전에는 비어 있다 — 가짜 첫 질문을 두지 않는다. */
  turns: ConversationTurn[];
  /** Runtime device observation only; absence is unknown, not completed delivery. */
  playbackByTurnId?: Record<string, VoicePlaybackObservation>;
  startedAt: string;
  /** 화면에 보이는 현재 AI 질문. 첫 인사 전에는 ''. */
  currentQuestion: string;
  /** 근거(AI 질문 텍스트의 결정론 태깅)가 있을 때만 값이 있다 — 없으면 null. */
  currentTopic: string | null;
  /** 중단된 청취의 부분 전사 — 요양보호사가 확인/수정하기 전의 원문. */
  pendingStt: string | null;
  pendingInputSource: 'gemini_live' | 'manual' | 'unknown';
  phase: SessionPhase;
  safety: RuntimeSafety;
  events: SessionSafetyEvent[];
  /**
   * DB `sessions.id` — 대화를 **시작할 때** 만든다(status='active').
   *
   * 예전에는 종료 시점에 한 번만 썼기 때문에, 앱이 강제 종료되거나 배터리가 나가면
   * 대화 전체가 사라졌고 웹에서 진행 상황을 볼 수도 없었다(감사 지적).
   * 생성에 실패하면(오프라인 등) null 로 두고 종료 시 일괄 저장으로 폴백한다.
   */
  remoteId: string | null;
  /** 이미 DB(session_logs)에 기록한 턴 수 — 다음 동기화의 시작점. */
  syncedTurns: number;
}

/**
 * 종료된 세션 1건의 전체 묶음 — 라이브 영속화 레이어(useSessionPersistence)가
 * DB(sessions·session_logs·session_analyses·safety_events)에 쓰기 위한 스냅샷.
 * finishSession이 이 값을 채우고, 영속화 후 clearLastFinished로 비운다.
 */
export interface FinishedSessionBundle {
  logId: string;
  elder: ElderProfile;
  turns: ConversationTurn[];
  playbackByTurnId?: Record<string, VoicePlaybackObservation>;
  events: SessionSafetyEvent[];
  analysis: SessionAnalysis;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  currentTopic: string | null;
  /** 진행 중에 만들어 둔 DB 세션 id(없으면 종료 시 새로 만든다). */
  remoteId: string | null;
  /** 이미 기록한 턴 수 — 나머지만 이어서 쓴다. */
  syncedTurns: number;
}

const SAFE_INITIAL: RuntimeSafety = {
  escalate: false,
  caregiverAlert: null,
  level: null,
  recommendation: 'continue',
  acknowledged: false,
};

interface AppState {
  // ── 세션 실행 런타임 ──
  //
  // 이 스토어는 **진행 중인 대화 한 건**만 들고 있다(UI 상태). 어르신·연대기·기록·
  // 분석·동의는 전부 DB 가 SoT 이고 src/data/reads.ts·writes.ts 로만 오간다.
  // (2026-09-04 목업 컬렉션 제거 — 예시 데이터가 실제 기록처럼 보이던 경로를 없앴다.)
  active: ActiveSession | null;
  // 어르신·연대기는 호출자(화면)가 어댑터로 조회해 넘긴다 — 런타임을 데이터 조회에서
  // 분리(라이브 어르신으로도 세션 시작 가능).
  beginSession: (
    elder: ElderProfile,
    chronicles: ChronicleEntry[],
    input: { title: string; therapyType: TherapyType; note?: string },
    /** 웹 설계 값(planned 채택 시) — 대화 진행 입력으로 보존된다. */
    design?: SessionDesign,
  ) => void;
  setPendingStt: (text: string, source?: 'gemini_live' | 'manual' | 'unknown') => void;
  /** 확인 취소 → 대기 중 STT 폐기하고 마이크 대기 상태로. */
  discardUtterance: () => void;
  adoptAutomaticInput: (text: string) => 'continue' | 'help';
  acceptAutomaticResponse: (text: string) => boolean;
  acceptResumedResponse: (text: string, previousTurnId: string) => boolean;
  markTurnPlayback: (turnId: string, text: string, result: 'completed' | 'interrupted' | 'empty') => boolean;
  confirmRecoveredInput: (text: string) => boolean;
  /**
   * 첫 AI 턴(중계 인사) 채택 — 아직 턴이 없을 때만, 출력 가드를 통과한 텍스트만.
   * 채택하지 못하면 false(호출부가 재생하지 않고 세션을 멈춘다).
   */
  acceptOpener: (text: string) => boolean;
  acknowledgeSafety: () => void;
  /**
   * 중계가 위험 발화로 멈췄다 — 요양보호사 확인 배너 + 안전 이벤트.
   * `remoteId` = 중계가 이미 기록한 safety_events 행(T21.4). 있으면 다시 기록하지 않고 확인 시각만 반영한다.
   */
  requireRelayReview: (remoteId?: string) => void;
  cancelSession: () => void;

  // ── 진행 중 DB 동기화(영속화 계층이 호출) ──
  /** 시작 시 만든 DB 세션 id 를 런타임에 붙인다. */
  attachRemoteSession: (remoteId: string) => void;
  /**
   * DB 반영 결과를 되돌려 받는다.
   * `events` 는 **앞에서부터 index 로 맞춰** 병합한다 — 동기화 중에 새 이벤트가
   * 뒤에 붙을 수 있으므로 배열을 통째로 갈아끼우지 않는다.
   */
  markSynced: (patch: { turns: number; events: SessionSafetyEvent[] }) => void;
  /** 종료 → 로그·분석 저장, logId 반환. lastFinished도 채운다(라이브 영속화용). */
  finishSession: () => string | null;

  // ── 라이브 영속화 인계(useSessionPersistence가 소비) ──
  lastFinished: FinishedSessionBundle | null;
  clearLastFinished: () => void;
}

function makeTurn(
  speaker: ConversationTurn['speaker'],
  text: string,
  topic?: string | null,
  originalText?: string,
): ConversationTurn {
  return { id: uid('turn_'), speaker, text, timestamp: nowIso(), topic: topic ?? undefined, originalText };
}

/** 어르신 턴 평가 → 런타임 안전 상태·이벤트(자동 채택·사람 확인 경로 공용). */
function evaluateElderTurn(a: ActiveSession, turns: ConversationTurn[], text: string) {
  const evaluated = evaluateUserTurn(turns, text);
  const recommendation = resolveSessionRecommendation(evaluated.session.recommendation, turns.filter(t => t.speaker === 'Elderly').length);
  const safety: RuntimeSafety = { escalate: evaluated.escalate, caregiverAlert: evaluated.caregiverAlert,
    level: evaluated.event?.level ?? (evaluated.caregiverAlert ? 'watch' : null), recommendation, acknowledged: false };
  const events: SessionSafetyEvent[] = evaluated.event
    ? [...a.events, { ...evaluated.event, acknowledgedAt: null, remoteId: null, ackSynced: false }] : a.events;
  return { safety, events, help: Boolean(evaluated.caregiverAlert) || recommendation !== 'continue' };
}

export const useApp = create<AppState>((set, get) => ({
  active: null,
  lastFinished: null,
  clearLastFinished: () => set({ lastFinished: null }),

  beginSession: (elder, chronicles, input, design) => {
    const ts = nowIso();
    const session: Session = {
      id: uid('ses_'),
      title: input.title,
      therapyType: input.therapyType,
      note: input.note,
      durationMinutes: 0,
      elderId: elder.id,
      design,
      createdAt: ts,
      updatedAt: ts,
    };
    set({
      active: {
        elder,
        session,
        design,
        chronicles,
        turns: [],
        startedAt: ts,
        currentQuestion: '',
        currentTopic: null,
        pendingStt: null,
        pendingInputSource: 'unknown',
        phase: 'ai_speaking',
        safety: { ...SAFE_INITIAL },
        events: [],
        remoteId: null,
        syncedTurns: 0,
      },
    });
  },

  setPendingStt: (text, source = 'unknown') => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, pendingStt: text, pendingInputSource: source } });
  },
  discardUtterance: () => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, pendingStt: null, phase: 'mic_ready' } });
  },

  adoptAutomaticInput: (text) => {
    const a = get().active;
    if (!a || !text.trim() || a.turns.at(-1)?.speaker !== 'AI') return 'help';
    const turn = makeTurn('Elderly', text, a.currentTopic);
    turn.provenance = { kind: 'automatic', presentedText: text, inputSource: 'gemini_live' };
    const turns = [...a.turns, turn];
    const { safety, events, help } = evaluateElderTurn(a, turns, text);
    set({ active: { ...a, turns, pendingStt: null, phase: 'processing', safety, events } });
    return help ? 'help' : 'continue';
  },

  acceptAutomaticResponse: (text) => {
    const a = get().active;
    if (!a || a.turns.at(-1)?.speaker !== 'Elderly' || !text.trim() || !screenAiUtterance(text).allowed) return false;
    const topic = detectTurnTopic(text) ?? a.currentTopic;
    set({ active: { ...a, turns: [...a.turns, makeTurn('AI', text, topic)], currentQuestion: text,
      currentTopic: topic, phase: 'ai_speaking' } });
    return true;
  },

  acceptResumedResponse: (text, previousTurnId) => {
    const a = get().active;
    if (!a || a.pendingStt !== null || a.turns.at(-1)?.id !== previousTurnId ||
        a.safety.caregiverAlert || a.safety.recommendation !== 'continue' ||
        !text.trim() || !screenAiUtterance(text).allowed) return false;
    const topic = detectTurnTopic(text) ?? a.currentTopic;
    set({ active: { ...a, turns: [...a.turns, makeTurn('AI', text, topic)], currentQuestion: text,
      currentTopic: topic, phase: 'ai_speaking' } });
    return true;
  },

  markTurnPlayback: (turnId, text, result) => {
    const a = get().active;
    if (!a?.turns.some(t => t.id === turnId && t.speaker === 'AI' && t.text === text)) return false;
    const previous = a.playbackByTurnId?.[turnId];
    if (previous?.text === text && previous.result === 'completed') return true;
    set({ active: { ...a, playbackByTurnId: { ...a.playbackByTurnId,
      [turnId]: { text, result, observedAt: nowIso() } } } });
    return true;
  },

  confirmRecoveredInput: (text) => {
    const a = get().active;
    if (!a || a.pendingStt === null || !text.trim() || text.length > 4000 || a.turns.at(-1)?.speaker !== 'AI') return false;
    const turn = makeTurn('Elderly', text, a.currentTopic);
    turn.provenance = { kind: 'caregiver_confirmed', presentedText: a.pendingStt || null, inputSource: a.pendingInputSource };
    if (a.pendingStt && a.pendingStt !== text) turn.originalText = a.pendingStt;
    const turns = [...a.turns, turn];
    const { safety, events } = evaluateElderTurn(a, turns, text);
    set({ active: { ...a, turns, pendingStt: null, phase: 'processing', safety, events } });
    return true;
  },

  acceptOpener: (text) => {
    const a = get().active;
    if (!a || a.turns.length !== 0 || !text.trim() || !screenAiUtterance(text).allowed) return false;
    const topic = detectTurnTopic(text) ?? null;
    set({ active: { ...a, turns: [makeTurn('AI', text, topic)], currentQuestion: text, currentTopic: topic, phase: 'ai_speaking' } });
    return true;
  },

  requireRelayReview: (remoteId) => {
    const a=get().active;
    // Keep an existing, more specific assessment and avoid duplicate stop events.
    if (!a || a.safety.caregiverAlert) return;
    const caregiverAlert=VOICE_FAILURE_MESSAGES.INPUT_REVIEW_REQUIRED;
    const event: SessionSafetyEvent = {level:'watch',categories:[],matchedTerms:[],excerpt:'',caregiverAlert,
      acknowledgedAt:null,remoteId:remoteId ?? null,ackSynced:false};
    set({active:{...a,events:[...a.events,event],safety:{...a.safety,caregiverAlert,
      level:'watch',recommendation:'end_session',acknowledged:false}}});
  },

  acknowledgeSafety: () => {
    const a = get().active;
    if (!a) return;
    // 배너가 보여 주는 것은 **가장 최근** 안전 이벤트다 → 그 이벤트에 확인 시각을 남긴다
    // (종료 저장 때 safety_events.acknowledged_at/by 로 기록된다).
    const at = nowIso();
    const events = a.events.map((ev, i) =>
      i === a.events.length - 1 && ev.acknowledgedAt === null ? { ...ev, acknowledgedAt: at } : ev,
    );
    set({ active: { ...a, events, safety: { ...a.safety, acknowledged: true } } });
  },

  attachRemoteSession: (remoteId) => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, remoteId } });
  },

  markSynced: ({ turns, events }) => {
    const a = get().active;
    if (!a) return;
    set({
      active: {
        ...a,
        syncedTurns: Math.max(a.syncedTurns, turns),
        events: a.events.map((ev, i) => events[i] ?? ev),
      },
    });
  },

  cancelSession: () => set({ active: null }),

  finishSession: () => {
    const a = get().active;
    if (!a) return null;
    const endedAt = nowIso();
    const durationMs = new Date(endedAt).getTime() - new Date(a.startedAt).getTime();
    // 대화 시간은 전문만 보는 analyzeSession 이 알 수 없다 → 여기서 붙인다(보호자 요약 화면이 읽는다).
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
    const analysis = { ...analyzeSession(a.elder, a.turns, a.chronicles), durationMinutes };
    // 로컬 id — 영속화가 DB 세션 id 를 받기 전까지 화면이 이 세션을 가리키는 임시 키다.
    const logId = uid('log_');
    set(() => ({
      lastFinished: {
        logId,
        elder: a.elder,
        turns: a.turns,
        playbackByTurnId: snapshotVoicePlayback(a.turns, a.playbackByTurnId ?? {}),
        events: a.events,
        analysis,
        startedAt: a.startedAt,
        endedAt,
        durationSeconds: Math.max(0, Math.round(durationMs / 1000)),
        currentTopic: a.currentTopic,
        remoteId: a.remoteId,
        syncedTurns: a.syncedTurns,
      },
      active: null,
    }));
    return logId;
  },
}));

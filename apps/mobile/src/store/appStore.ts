// 앱 상태 스토어 (Zustand) — 요양보호사 세션 실행 런타임 + 목업 데이터.
//
// 백엔드 로직은 전부 @giokon/core를 재사용한다(신규 도메인 로직 없음):
//   - 대화 진행: openConversation / respondToUserTurn (안전 가드 통합)
//   - 종료 분석: analyzeSession (비의료 관찰 지표)
//   - 동의 게이팅: canStartElderSession / requiredElderConsents
//
// Supabase 실연동 전에는 웹과 동일하게 목업 스토어로 동작한다(@giokon/data 훅은
// 서울 리전 배선 후 활성화 — client.ts 참고). 화면은 이 스토어를 읽는다.

import { create } from 'zustand';
import {
  analyzeSession,
  openConversation,
  resolveSessionRecommendation,
  respondToUserTurn,
  nowIso,
  uid,
  pickAvatarColor,
  DEFAULT_APPEARANCE,
  type ChronicleEntry,
  type ConsentType,
  type ConversationLog,
  type ConversationTurn,
  type ElderProfile,
  type SafetyEventDraft,
  type Session,
  type SessionAnalysis,
  type SessionRecommendation,
  type TherapyType,
} from '@giokon/core';
import { MOCK_CHRONICLES, MOCK_ELDERS, MOCK_LOGS, MOCK_SESSIONS, seedAnalyses } from '../lib/mockData';
import { pickElderUtterance } from '../lib/mockStt';

export interface RuntimeSafety {
  escalate: boolean;
  caregiverAlert: string | null;
  level: 'watch' | 'crisis' | null;
  recommendation: SessionRecommendation;
  acknowledged: boolean;
}

export type SessionPhase = 'idle' | 'ai_speaking' | 'mic_ready' | 'processing' | 'ended';

export interface ActiveSession {
  elder: ElderProfile;
  session: Session;
  turns: ConversationTurn[];
  startedAt: string;
  currentQuestion: string;
  currentTopic: string;
  /** STT가 인식했지만 아직 요양보호사가 확인/수정하지 않은 원문. */
  pendingStt: string | null;
  phase: SessionPhase;
  safety: RuntimeSafety;
  events: SafetyEventDraft[];
}

/**
 * 종료된 세션 1건의 전체 묶음 — 라이브 영속화 레이어(useSessionPersistence)가
 * DB(sessions·session_logs·session_analyses·safety_events)에 쓰기 위한 스냅샷.
 * finishSession이 목업 갱신과 함께 이 값을 채우고, 영속화 후 clearLastFinished로 비운다.
 */
export interface FinishedSessionBundle {
  logId: string;
  elder: ElderProfile;
  turns: ConversationTurn[];
  events: SafetyEventDraft[];
  analysis: SessionAnalysis;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  currentTopic: string;
}

const SAFE_INITIAL: RuntimeSafety = {
  escalate: false,
  caregiverAlert: null,
  level: null,
  recommendation: 'continue',
  acknowledged: false,
};

interface AppState {
  // ── 인증(요양보호사) — 시연용 목업 ──
  caregiver: { name: string } | null;
  login: (name: string) => void;
  logout: () => void;

  // ── 데이터(목업) ──
  elders: ElderProfile[];
  sessions: Session[];
  chronicles: ChronicleEntry[];
  logs: ConversationLog[];
  analyses: Record<string, SessionAnalysis>; // key: logId

  getElder: (id: string) => ElderProfile | undefined;
  eldersSorted: () => ElderProfile[];
  chroniclesByElder: (elderId: string) => ChronicleEntry[];
  sessionsByElder: (elderId: string) => Session[];
  logsByElder: (elderId: string) => ConversationLog[];
  getLog: (id: string) => ConversationLog | undefined;
  getAnalysis: (logId: string) => SessionAnalysis | undefined;

  upsertElder: (
    patch: Partial<ElderProfile> & Pick<ElderProfile, 'name' | 'birthYear'> & { id?: string },
  ) => ElderProfile;
  upsertChronicle: (
    c: Omit<ChronicleEntry, 'id' | 'recordedAt' | 'updatedAt' | 'source'> & { id?: string },
  ) => ChronicleEntry;
  /** 연대기 항목 삭제(연대기 수정 화면의 주요 기억 X 버튼). */
  deleteChronicle: (id: string) => void;

  // ── 동의 게이팅(어르신별) — @giokon/core consent 카탈로그 사용 ──
  consentsByElder: Record<string, ConsentType[]>;
  grantElderConsents: (elderId: string, types: ConsentType[]) => void;
  elderConsents: (elderId: string) => ConsentType[];

  // ── 세션 실행 런타임 ──
  active: ActiveSession | null;
  // 어르신·연대기는 호출자(화면)가 어댑터로 조회해 넘긴다 — 런타임을 목업 데이터에서
  // 분리(라이브 어르신으로도 세션 시작 가능).
  beginSession: (
    elder: ElderProfile,
    chronicles: ChronicleEntry[],
    input: { title: string; therapyType: TherapyType; note?: string },
  ) => void;
  /** 마이크(모의 STT) — 어르신 발화를 인식해 확인 화면으로 넘긴다. */
  captureUtterance: () => void;
  setPendingStt: (text: string) => void;
  /** 확인 취소 → 대기 중 STT 폐기하고 마이크 대기 상태로. */
  discardUtterance: () => void;
  /** 확인/수정 완료 → 어르신 턴 반영 + 다음 AI 질문 생성(core). */
  confirmUtterance: (finalText: string) => void;
  acknowledgeSafety: () => void;
  cancelSession: () => void;
  /** 종료 → 로그·분석 저장, logId 반환. lastFinished도 채운다(라이브 영속화용). */
  finishSession: () => string | null;

  // ── 라이브 영속화 인계(useSessionPersistence가 소비) ──
  lastFinished: FinishedSessionBundle | null;
  clearLastFinished: () => void;
}

function makeTurn(speaker: ConversationTurn['speaker'], text: string, topic?: string): ConversationTurn {
  return { id: uid('turn_'), speaker, text, timestamp: nowIso(), topic };
}

export const useApp = create<AppState>((set, get) => ({
  caregiver: { name: '홍길동' }, // 시연: 이미 로그인된 상태로 시작(스플래시→메인)
  login: (name) => set({ caregiver: { name: name.trim() || '요양보호사' } }),
  logout: () => set({ caregiver: null, active: null }),

  elders: MOCK_ELDERS,
  sessions: MOCK_SESSIONS,
  chronicles: MOCK_CHRONICLES,
  logs: MOCK_LOGS,
  analyses: seedAnalyses(),

  getElder: (id) => get().elders.find((e) => e.id === id),
  eldersSorted: () => [...get().elders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  chroniclesByElder: (elderId) =>
    get()
      .chronicles.filter((c) => c.elderId === elderId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  sessionsByElder: (elderId) =>
    get()
      .sessions.filter((s) => s.elderId === elderId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  logsByElder: (elderId) =>
    get()
      .logs.filter((l) => l.elderId === elderId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  getLog: (id) => get().logs.find((l) => l.id === id),
  getAnalysis: (logId) => get().analyses[logId],

  upsertElder: (patch) => {
    const ts = nowIso();
    const existing = patch.id ? get().elders.find((e) => e.id === patch.id) : undefined;
    if (existing) {
      const updated: ElderProfile = { ...existing, ...patch, updatedAt: ts };
      set((s) => ({ elders: s.elders.map((e) => (e.id === updated.id ? updated : e)) }));
      return updated;
    }
    const created: ElderProfile = {
      id: patch.id ?? uid('eld_'),
      name: patch.name,
      birthYear: patch.birthYear,
      hometown: patch.hometown,
      job: patch.job,
      family: patch.family,
      hobbies: patch.hobbies,
      photoPath: patch.photoPath,
      gender: patch.gender,
      guardian: patch.guardian,
      appearance: patch.appearance ?? DEFAULT_APPEARANCE,
      avatarColor: patch.avatarColor ?? pickAvatarColor(patch.name + ts),
      createdAt: ts,
      updatedAt: ts,
    };
    set((s) => ({ elders: [created, ...s.elders] }));
    return created;
  },

  upsertChronicle: (patch) => {
    const ts = nowIso();
    const existing = patch.id ? get().chronicles.find((c) => c.id === patch.id) : undefined;
    if (existing) {
      const updated: ChronicleEntry = { ...existing, ...patch, updatedAt: ts };
      set((s) => ({ chronicles: s.chronicles.map((c) => (c.id === updated.id ? updated : c)) }));
      return updated;
    }
    const created: ChronicleEntry = {
      id: patch.id ?? uid('chr_'),
      elderId: patch.elderId,
      topic: patch.topic,
      content: patch.content,
      keywords: patch.keywords,
      source: 'Caregiver',
      recordedAt: ts,
      updatedAt: ts,
    };
    set((s) => ({ chronicles: [created, ...s.chronicles] }));
    return created;
  },

  deleteChronicle: (id) => set((s) => ({ chronicles: s.chronicles.filter((c) => c.id !== id) })),

  consentsByElder: {},
  grantElderConsents: (elderId, types) =>
    set((s) => {
      const have = new Set(s.consentsByElder[elderId] ?? []);
      for (const t of types) have.add(t);
      return { consentsByElder: { ...s.consentsByElder, [elderId]: [...have] } };
    }),
  elderConsents: (elderId) => get().consentsByElder[elderId] ?? [],

  active: null,
  lastFinished: null,
  clearLastFinished: () => set({ lastFinished: null }),

  beginSession: (elder, chronicles, input) => {
    const ts = nowIso();
    const session: Session = {
      id: uid('ses_'),
      title: input.title,
      therapyType: input.therapyType,
      note: input.note,
      durationMinutes: 0,
      elderId: elder.id,
      createdAt: ts,
      updatedAt: ts,
    };
    const guarded = openConversation(elder, session, chronicles);
    const aiTurn = makeTurn('AI', guarded.response.question, guarded.response.topic);
    set({
      active: {
        elder,
        session,
        turns: [aiTurn],
        startedAt: ts,
        currentQuestion: guarded.response.question,
        currentTopic: guarded.response.topic,
        pendingStt: null,
        phase: 'ai_speaking',
        safety: { ...SAFE_INITIAL },
        events: [],
      },
    });
  },

  captureUtterance: () => {
    const a = get().active;
    if (!a) return;
    const text = pickElderUtterance(a.currentTopic, a.turns.length);
    set({ active: { ...a, pendingStt: text, phase: 'processing' } });
  },
  setPendingStt: (text) => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, pendingStt: text } });
  },
  discardUtterance: () => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, pendingStt: null, phase: 'mic_ready' } });
  },

  confirmUtterance: (finalText) => {
    const a = get().active;
    if (!a) return;
    const elderTurn = makeTurn('Elderly', finalText);
    const history = [...a.turns, elderTurn];
    const guarded = respondToUserTurn(a.elder, a.session, history, finalText);
    const aiTurn = makeTurn('AI', guarded.response.question, guarded.response.topic);
    // 자동 종료: 안전 권고가 없고 설계 세션 길이에 도달하면 마무리를 권고한다(core 정책).
    const elderTurns = history.filter((t) => t.speaker === 'Elderly').length;
    const recommendation = resolveSessionRecommendation(guarded.session.recommendation, elderTurns);
    const safety: RuntimeSafety = {
      escalate: guarded.escalate,
      caregiverAlert: guarded.caregiverAlert,
      level: guarded.event?.level ?? (guarded.caregiverAlert ? 'watch' : null),
      recommendation,
      acknowledged: false,
    };
    set({
      active: {
        ...a,
        turns: [...history, aiTurn],
        currentQuestion: guarded.response.question,
        currentTopic: guarded.response.topic,
        pendingStt: null,
        phase: 'ai_speaking',
        safety,
        events: guarded.event ? [...a.events, guarded.event] : a.events,
      },
    });
  },

  acknowledgeSafety: () => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, safety: { ...a.safety, acknowledged: true } } });
  },

  cancelSession: () => set({ active: null }),

  finishSession: () => {
    const a = get().active;
    if (!a) return null;
    const endedAt = nowIso();
    const durationMs = new Date(endedAt).getTime() - new Date(a.startedAt).getTime();
    const chronicle = get().chroniclesByElder(a.elder.id);
    const analysis = analyzeSession(a.elder, a.turns, chronicle);
    const logId = uid('log_');
    const log: ConversationLog = {
      id: logId,
      sessionId: a.session.id,
      elderId: a.elder.id,
      therapyType: a.session.therapyType,
      turns: a.turns,
      status: 'ended',
      startedAt: a.startedAt,
      endedAt,
      chronicleEntriesAdded: [],
    };
    const session: Session = {
      ...a.session,
      durationMinutes: Math.max(1, Math.round(durationMs / 60000)),
      updatedAt: endedAt,
    };
    set((s) => ({
      logs: [log, ...s.logs],
      sessions: [session, ...s.sessions],
      analyses: { ...s.analyses, [logId]: analysis },
      lastFinished: {
        logId,
        elder: a.elder,
        turns: a.turns,
        events: a.events,
        analysis,
        startedAt: a.startedAt,
        endedAt,
        durationSeconds: Math.max(0, Math.round(durationMs / 1000)),
        currentTopic: a.currentTopic,
      },
      active: null,
    }));
    return logId;
  },
}));

// 앱 상태 스토어 (Zustand) — 요양보호사 세션 실행 런타임(UI 상태) 전용.
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
  detectTurnTopic,
  openConversation,
  resolveSessionRecommendation,
  respondToUserTurn,
  screenAiUtterance,
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
  turns: ConversationTurn[];
  startedAt: string;
  currentQuestion: string;
  currentTopic: string;
  /** STT가 인식했지만 아직 요양보호사가 확인/수정하지 않은 원문. */
  pendingStt: string | null;
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
  events: SessionSafetyEvent[];
  analysis: SessionAnalysis;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  currentTopic: string;
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
  /** 마이크(폴백) — 요양보호사가 들은 말을 입력할 빈 패널을 연다. */
  captureUtterance: () => void;
  setPendingStt: (text: string) => void;
  /** 확인 취소 → 대기 중 STT 폐기하고 마이크 대기 상태로. */
  discardUtterance: () => void;
  /** 확인/수정 완료 → 어르신 턴 반영 + 다음 AI 질문 생성(core). */
  /**
   * Live 모드용 — 모델 응답을 그대로 이번 AI 발화로 채택한다.
   * 안전 평가·이벤트는 여전히 core 파이프라인(respondToUserTurn)이 계산하고,
   * 질문 본문만 교체한다(출력 가드 screenAiUtterance 재적용). 위기 시엔 호출하지
   * 않는다 — 로컬 안전 응답이 우선이다.
   */
  confirmUtterance: (finalText: string, live?: { question: string }) => void;
  /**
   * 오프너 교체(Live 모델 인사 도착 시) — 첫 AI 턴 텍스트만 바꾼다.
   * 출력 가드를 통과한 텍스트만 채택한다. 채택 결과는 `active.currentQuestion` 으로
   * 확인한다(호출부가 오디오 재생 여부를 그걸로 판단한다).
   */
  overrideQuestion: (text: string) => void;
  acknowledgeSafety: () => void;
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
  topic?: string,
  originalText?: string,
): ConversationTurn {
  return { id: uid('turn_'), speaker, text, timestamp: nowIso(), topic, originalText };
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
    const guarded = openConversation(elder, session, chronicles);
    const aiTurn = makeTurn('AI', guarded.response.question, guarded.response.topic);
    set({
      active: {
        elder,
        session,
        design,
        chronicles,
        turns: [aiTurn],
        startedAt: ts,
        currentQuestion: guarded.response.question,
        currentTopic: guarded.response.topic,
        pendingStt: null,
        phase: 'ai_speaking',
        safety: { ...SAFE_INITIAL },
        events: [],
        remoteId: null,
        syncedTurns: 0,
      },
    });
  },

  /**
   * 폴백(Live 미가용) 입력 — **빈** 입력 패널을 연다.
   *
   * ⚠️ 예전에는 여기서 `pickElderUtterance()` 가 미리 써 둔 어르신 발화를 골라
   * 넣었다(mockStt). 요양보호사가 그대로 저장하면 **어르신이 하지 않은 말**이
   * session_logs 에 실제 기록으로 남았다 — 개인 기록을 임의값으로 만드는 것이라
   * 비의료·정부심사 기준에서 특히 위험하다. 근거 없는 값은 만들지 않는다.
   * 이제 요양보호사가 실제로 들은 말을 직접 입력한다(빈 문자열 = 패널 열림).
   */
  captureUtterance: () => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, pendingStt: '', phase: 'processing' } });
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

  confirmUtterance: (finalText, live) => {
    const a = get().active;
    if (!a || !finalText.trim()) return;
    // 요양보호사가 STT 결과를 고쳤으면 원문을 함께 남긴다(session_logs.original_content).
    const original = a.pendingStt && a.pendingStt !== finalText ? a.pendingStt : undefined;
    // 어르신 턴에도 **직전 AI 질문의 주제**를 붙인다 — 분석은 앞선 AI 턴에서 주제를
    // 이어받으므로 계산 결과는 같지만, DB 의 session_logs.topic 이 비어 있으면 나중에
    // 기록만 보고는 어떤 주제에 대한 대답인지 알 수 없다(감사 지적).
    const elderTurn = makeTurn('Elderly', finalText, a.currentTopic, original);
    // Only the explicit caregiver confirmation action may assign this source.
    // Automatic adoption must use a separate path and persistence contract.
    elderTurn.provenance = { kind: 'caregiver_confirmed', presentedText: a.pendingStt || null };
    const history = [...a.turns, elderTurn];
    // 안전 평가·이벤트는 항상 core 파이프라인이 산출한다 — Live 모드에서도 동일.
    const guarded = respondToUserTurn(a.elder, a.session, history, finalText);

    // Live 응답 채택 여부 — 출력 가드(screenAiUtterance)를 **다시** 통과시킨다.
    // 막히면 안전 대체문으로 바꾸고, 그조차 없으면 로컬(core) 생성 질문을 유지한다.
    let question = guarded.response.question;
    let topic = guarded.response.topic;
    if (live) {
      const screen = screenAiUtterance(live.question);
      if (screen.allowed) {
        question = live.question;
        // Live 질문의 주제를 텍스트에서 판별한다(core detectTurnTopic — 결정론 태깅).
        // 근거가 있으면 화제 이동까지 기록된다(session_logs.switch_topic, 매퍼가
        // 직전 턴 주제와 비교해 산출). 근거가 없으면 직전 주제를 유지한다 —
        // 근거 없는 주제는 만들지 않는다(실서비스 원칙).
        topic = detectTurnTopic(live.question) ?? a.currentTopic ?? topic;
      } else if (screen.safeAlternative) {
        question = screen.safeAlternative;
        topic = a.currentTopic ?? topic;
      }
    }

    const aiTurn = makeTurn('AI', question, topic);
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
        currentQuestion: question,
        currentTopic: topic,
        pendingStt: null,
        phase: 'ai_speaking',
        safety,
        events: guarded.event
          ? [...a.events, { ...guarded.event, acknowledgedAt: null, remoteId: null, ackSynced: false }]
          : a.events,
      },
    });
  },

  overrideQuestion: (text) => {
    const a = get().active;
    if (!a || !text.trim()) return;
    // 출력 가드(screenAiUtterance)를 **오프너에도** 적용한다.
    // 그전에는 첫 질문만 검열을 건너뛰어, 모델 인사가 화면과 음성으로 그대로 나갔다.
    // 막히면 안전 대체문으로, 대체문조차 없으면 기존(로컬 생성) 질문을 유지한다.
    const screen = screenAiUtterance(text);
    const adopted = screen.allowed ? text : (screen.safeAlternative ?? a.currentQuestion);
    if (!adopted) return;
    // 첫 AI 턴(오프너)만 교체한다 — Live 모델의 인사가 도착했을 때 사용.
    const turns = a.turns.slice();
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].speaker === 'AI') {
        turns[i] = { ...turns[i], text: adopted };
        break;
      }
    }
    set({ active: { ...a, turns, currentQuestion: adopted } });
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

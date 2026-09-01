// 앱 데이터 읽기 어댑터 — 화면이 보는 단일 진입점.
//
// Supabase 설정 시: @giokon/data 쿼리 훅 + mappers로 라이브 DB(RLS 범위)를 읽는다.
// 미설정 시: 기존 목업 스토어(useApp)를 그대로 읽는다(시연 동작 보존).
// 화면은 이 훅만 호출하므로 isSupabaseConfigured 분기가 화면에 새지 않는다.
//
// 반환 타입은 목업 셀렉터와 동일한 @giokon/core 도메인 타입 → 화면 JSX 불변.
// 라이브 쿼리는 미설정 시 유휴화한다(getGiokonClient 미초기화 throw 방지):
// id 인자 훅은 undefined로, 목록 훅은 enabled:false로 끈다.
//
// 스코프: 어르신·연대기·세션기록·로그·분석 상세에 더해 **관찰지표 집계까지 라이브**다
// (T1 에서 목업 결합 analytics.ts 를 걷어내고 @giokon/core 순수함수 + 아래 어댑터로
// 대체했다 — src/data/observations.ts). 즉 앱의 모든 조회 화면이 같은 경로를 탄다.

import {
  useChronicles as useChroniclesData,
  useConsents as useConsentsData,
  useOrgSessionAnalyses as useOrgSessionAnalysesData,
  useProfile as useProfileData,
  useProfiles as useProfilesData,
  useRecentSessions as useRecentSessionsData,
  useSession as useSessionData,
  useSessionAnalyses as useSessionAnalysesData,
  useSessionAnalysisBySession as useSessionAnalysisData,
  useSessionLogs as useSessionLogsData,
  useSessions as useSessionsData,
  parseSessionAnalysis,
  toChronicleEntry,
  toConversationLog,
  toElderProfile,
  toSession,
} from '@giokon/data';
import type {
  ChronicleEntry,
  ConsentType,
  ConversationLog,
  ElderProfile,
  Session,
  SessionAnalysis,
} from '@giokon/core';

/** 분석 + 기록 시각 — core 의 기간 집계 함수가 요구하는 형태. */
export type DatedAnalysis = SessionAnalysis & { at: string };
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isSupabaseConfigured as CFG } from '../lib/supabase';
import { useApp } from '../store/appStore';

/** 셀렉터가 매번 새 배열을 만들지 않도록 하는 빈 배열 상수(스냅샷 안정화). */
const EMPTY_LOGS: ConversationLog[] = [];

/** 라이브 행 → DatedAnalysis (셀렉터 밖에서만 호출). */
function datedFromRows(rows: { created_at: string }[] | undefined): DatedAnalysis[] {
  return (rows ?? [])
    .map((row) => {
      const a = parseSessionAnalysis(row as Parameters<typeof parseSessionAnalysis>[0]);
      return a ? { ...a, at: row.created_at } : null;
    })
    .filter((x): x is DatedAnalysis => Boolean(x));
}

/** 목업 로그+분석 → DatedAnalysis (셀렉터 밖에서만 호출). */
function datedFromMock(
  logs: ConversationLog[],
  analyses: Record<string, SessionAnalysis>,
): DatedAnalysis[] {
  return logs
    .map((l) => {
      const a = analyses[l.id];
      return a ? { ...a, at: l.startedAt } : null;
    })
    .filter((x): x is DatedAnalysis => Boolean(x));
}

// Zustand v5는 useSyncExternalStore를 쓰므로, 셀렉터가 매 렌더 "새 배열/객체"를 반환하면
// 스냅샷이 매번 바뀐 것으로 간주돼 무한 리렌더("getSnapshot should be cached" 경고 +
// "Maximum update depth")가 난다. 파생 배열을 만드는 셀렉터는 useShallow로 감싸 얕은 비교
// (원소 참조 동일 시 동일 취급)로 안정화한다. .find()·함수·원시 state 슬라이스는 안정 참조라 제외.

/** 담당 어르신 목록(최신순). */
export function useElders(): ElderProfile[] {
  const mock = useApp(useShallow((s) => s.eldersSorted()));
  const live = useProfilesData({ enabled: CFG });
  const rows = live.data;
  const mapped = useMemo(
    () =>
      (rows ?? []).map(toElderProfile).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [rows],
  );
  return CFG ? mapped : mock;
}

/** 단일 어르신. */
export function useElder(id: string | undefined): ElderProfile | undefined {
  return useElderView(id).elder;
}

/**
 * 단일 어르신 + 조회 진행 여부.
 *
 * 화면이 "어르신을 찾을 수 없어요"를 **조회가 끝난 뒤에만** 띄우게 하려고 loading 을
 * 함께 돌려준다. 등록 직후 상세로 이동하면 상세 쿼리는 아직 비어 있어서, 예전처럼
 * `data` 유무만 보면 방금 만든 어르신이 "없음"으로 보였다(사용자 지적 2026-08-13).
 */
export function useElderView(id: string | undefined): {
  elder: ElderProfile | undefined;
  loading: boolean;
} {
  const mock = useApp((s) => (id ? s.getElder(id) : undefined));
  const live = useProfileData(CFG ? id : undefined);
  if (!CFG) return { elder: mock, loading: false };
  return {
    elder: live.data ? toElderProfile(live.data) : undefined,
    // 아직 한 번도 성공적으로 받아오지 못한 상태(초기 로딩·재시도 중)
    loading: Boolean(id) && live.isPending,
  };
}

/** 어르신 연대기(최신순). */
export function useChronicles(elderId: string | undefined): ChronicleEntry[] {
  const mock = useApp(useShallow((s) => (elderId ? s.chroniclesByElder(elderId) : [])));
  const live = useChroniclesData(CFG ? elderId : undefined);
  if (!CFG) return mock;
  return (live.data ?? []).map(toChronicleEntry);
}

/**
 * 어르신 세션 **이력**(최신순, 목록 카드용).
 *
 * ⚠️ 웹에서 설계만 해 둔 세션(`planned`)은 아직 일어나지 않은 일이라 이력이 아니다 —
 * 여기 세우면 턴 0 짜리 빈 기록으로 보인다. 설계는 `usePlannedSession` 이 읽는다.
 */
export function useElderSessions(elderId: string | undefined): Session[] {
  const mock = useApp(useShallow((s) => (elderId ? s.sessionsByElder(elderId) : [])));
  const live = useSessionsData(CFG ? elderId : undefined);
  const rows = live.data;
  const mapped = useMemo(
    () => (rows ?? []).filter((r) => r.status !== 'planned').map(toSession),
    [rows],
  );
  if (!CFG) return mock;
  return mapped;
}

/**
 * 웹에서 설계해 둔 다음 세션(`sessions.status='planned'`).
 *
 * 요양보호사가 웹 "회상 세션 설계"(`196:272`)에서 만든 것이고, 앱은 그 설계대로
 * 대화를 연다(제목·키워드·목표·**피해갈 내용**). 설계가 없으면 undefined —
 * 앱이 예전처럼 스스로 주제를 고른다.
 *
 * 여러 건이면 **기록일(planned_date)이 이른 것부터**, 같으면 먼저 만든 것부터 한다.
 * 목업 모드에는 설계 개념이 없다(웹에서만 만든다) → 항상 undefined.
 */
export function usePlannedSession(elderId: string | undefined): Session | undefined {
  const live = useSessionsData(CFG ? elderId : undefined);
  const rows = live.data;
  return useMemo(() => {
    if (!CFG) return undefined;
    const planned = (rows ?? []).filter((r) => r.status === 'planned');
    if (planned.length === 0) return undefined;
    const next = [...planned].sort((a, b) => {
      const byDate = (a.planned_date ?? '').localeCompare(b.planned_date ?? '');
      return byDate !== 0 ? byDate : a.started_at.localeCompare(b.started_at);
    })[0];
    return toSession(next);
  }, [rows]);
}

/**
 * 어르신 대화 로그 목록. 라이브에서는 세션 1건이 곧 로그 1건이라 로그 id = 세션 id.
 * (목록에서는 전문 턴이 필요 없어 turns=[]로 매핑 — 상세는 useLog가 전문을 읽는다.)
 */
export function useElderLogs(elderId: string | undefined): ConversationLog[] {
  const mock = useApp(useShallow((s) => (elderId ? s.logsByElder(elderId) : [])));
  const live = useSessionsData(CFG ? elderId : undefined);
  const rows = live.data;
  // 설계만 해 둔 세션에는 대화 전문이 없다 — 로그가 아니다(useElderSessions 와 같은 이유).
  const mapped = useMemo(
    () => (rows ?? []).filter((r) => r.status !== 'planned').map((row) => toConversationLog(row, [])),
    [rows],
  );
  if (!CFG) return mock;
  return mapped;
}

/** 단일 대화 로그(전문 포함). 라이브에서 id는 세션 id. */
export function useLog(id: string | undefined): ConversationLog | undefined {
  const mock = useApp((s) => (id ? s.getLog(id) : undefined));
  const session = useSessionData(CFG ? id : undefined);
  const logs = useSessionLogsData(CFG ? id : undefined);
  if (!CFG) return mock;
  return session.data ? toConversationLog(session.data, logs.data ?? []) : undefined;
}

/** 세션 자동 분석. 라이브에서 logId는 세션 id(분석은 세션당 1건). */
export function useAnalysis(logId: string | undefined): SessionAnalysis | undefined {
  const mock = useApp((s) => (logId ? s.getAnalysis(logId) : undefined));
  const live = useSessionAnalysisData(CFG ? logId : undefined);
  if (!CFG) return mock;
  return live.data ? (parseSessionAnalysis(live.data) ?? undefined) : undefined;
}

/** 어르신 유효 동의 타입(세션 게이팅용) — granted && 미철회. */
export function useElderConsents(elderId: string | undefined): ConsentType[] {
  const mock = useApp(useShallow((s) => (elderId ? s.elderConsents(elderId) : [])));
  const live = useConsentsData(CFG ? elderId : undefined);
  if (!CFG) return mock;
  const active = (live.data ?? []).filter((c) => c.granted && !c.revoked_at);
  return [...new Set(active.map((c) => c.consent_type as ConsentType))];
}

// ── 관찰지표 집계용 데이터(T1) — 순수 집계 함수(@giokon/core)에 주입할 배열 ──────────

/** 어르신 세션 분석 목록. */
export function useElderAnalyses(elderId: string | undefined): SessionAnalysis[] {
  const mock = useApp(
    useShallow((s) =>
      elderId
        ? s
            .logsByElder(elderId)
            .map((l) => s.getAnalysis(l.id))
            .filter((a): a is SessionAnalysis => Boolean(a))
        : [],
    ),
  );
  const live = useSessionAnalysesData(CFG ? elderId : undefined);
  const rows = live.data;
  const mapped = useMemo(
    () => (rows ?? []).map(parseSessionAnalysis).filter((a): a is SessionAnalysis => Boolean(a)),
    [rows],
  );
  return CFG ? mapped : mock;
}

/**
 * 어르신 세션 분석 + **기록 시각**(기간 대비 변화·월별 추이 집계용).
 * 라이브는 session_analyses.created_at, 목업은 로그의 startedAt 을 쓴다.
 *
 * ⚠️ 파생 객체({...a, at})는 **셀렉터 밖**에서 만든다. Zustand v5 는 useSyncExternalStore
 * 라서 셀렉터가 매 렌더 새 객체를 담은 배열을 돌려주면 useShallow(원소 참조 비교)로도
 * 스냅샷이 매번 달라져 무한 리렌더("Maximum update depth exceeded")가 난다
 * (사용자 기기에서 인지효과분석·주제별 분석 진입 시 재현, 2026-08-13).
 * 셀렉터는 **원본 참조**만 고르고, 합성은 useMemo 로 한다.
 */
export function useElderAnalysesDated(elderId: string | undefined): DatedAnalysis[] {
  const mockLogs = useApp(useShallow((s) => (elderId ? s.logsByElder(elderId) : EMPTY_LOGS)));
  const mockAnalyses = useApp((s) => s.analyses);
  const live = useSessionAnalysesData(CFG ? elderId : undefined);
  const liveRows = live.data;
  return useMemo(
    () => (CFG ? datedFromRows(liveRows) : datedFromMock(mockLogs, mockAnalyses)),
    [liveRows, mockLogs, mockAnalyses],
  );
}

/** 담당 전체 분석 + 기록 시각(전체 인지 효과 분석·전체 주제 추이). */
export function useAllAnalysesDated(): DatedAnalysis[] {
  const mockLogs = useApp((s) => s.logs);
  const mockAnalyses = useApp((s) => s.analyses);
  const live = useOrgSessionAnalysesData({ enabled: CFG, fetchAll: true });
  const liveRows = live.data;
  return useMemo(
    () => (CFG ? datedFromRows(liveRows) : datedFromMock(mockLogs, mockAnalyses)),
    [liveRows, mockLogs, mockAnalyses],
  );
}

/** 담당 전체 세션(전체 분석·관찰지표 집계용). */
export function useAllSessions(): Session[] {
  const mock = useApp((s) => s.sessions);
  const live = useRecentSessionsData({ enabled: CFG, fetchAll: true });
  const rows = live.data;
  const mapped = useMemo(() => (rows ?? []).map(toSession), [rows]);
  return CFG ? mapped : mock;
}

/**
 * 어르신별 **최근 대화 시각**(ISO) — 메인 화면 카드의 "최근 대화" 표시용.
 * 실제 세션 기록에서 파생한다(예시 날짜 하드코딩 금지). 기록이 없는 어르신은 키가 없다.
 */
export function useLastTalkByElder(): Record<string, string> {
  const sessions = useAllSessions();
  const map: Record<string, string> = {};
  for (const s of sessions) {
    const prev = map[s.elderId];
    if (!prev || s.createdAt > prev) map[s.elderId] = s.createdAt;
  }
  return map;
}

/** 담당 전체 세션 분석(전체 관찰지표 집계용). */
export function useAllAnalyses(): SessionAnalysis[] {
  const mock = useApp(useShallow((s) => Object.values(s.analyses)));
  const live = useOrgSessionAnalysesData({ enabled: CFG, fetchAll: true });
  const rows = live.data;
  const mapped = useMemo(
    () => (rows ?? []).map(parseSessionAnalysis).filter((a): a is SessionAnalysis => Boolean(a)),
    [rows],
  );
  return CFG ? mapped : mock;
}

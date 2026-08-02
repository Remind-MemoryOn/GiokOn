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
// 스코프(2026-07-31 사용자 확정 "핵심 양방향만"): 어르신·연대기·세션기록·로그·분석
// 상세까지 라이브. 관찰지표 집계(observations/analytics/topics·elder 종합분석 탭)는
// analytics.ts가 목업 스토어에 결합돼 있어 이번 범위 밖(후속) — 계속 목업으로 동작.

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
import { useShallow } from 'zustand/react/shallow';
import { isSupabaseConfigured as CFG } from '../lib/supabase';
import { useApp } from '../store/appStore';

// Zustand v5는 useSyncExternalStore를 쓰므로, 셀렉터가 매 렌더 "새 배열/객체"를 반환하면
// 스냅샷이 매번 바뀐 것으로 간주돼 무한 리렌더("getSnapshot should be cached" 경고 +
// "Maximum update depth")가 난다. 파생 배열을 만드는 셀렉터는 useShallow로 감싸 얕은 비교
// (원소 참조 동일 시 동일 취급)로 안정화한다. .find()·함수·원시 state 슬라이스는 안정 참조라 제외.

/** 담당 어르신 목록(최신순). */
export function useElders(): ElderProfile[] {
  const mock = useApp(useShallow((s) => s.eldersSorted()));
  const live = useProfilesData({ enabled: CFG });
  if (!CFG) return mock;
  return (live.data ?? [])
    .map(toElderProfile)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 단일 어르신. */
export function useElder(id: string | undefined): ElderProfile | undefined {
  const mock = useApp((s) => (id ? s.getElder(id) : undefined));
  const live = useProfileData(CFG ? id : undefined);
  if (!CFG) return mock;
  return live.data ? toElderProfile(live.data) : undefined;
}

/** 어르신 연대기(최신순). */
export function useChronicles(elderId: string | undefined): ChronicleEntry[] {
  const mock = useApp(useShallow((s) => (elderId ? s.chroniclesByElder(elderId) : [])));
  const live = useChroniclesData(CFG ? elderId : undefined);
  if (!CFG) return mock;
  return (live.data ?? []).map(toChronicleEntry);
}

/** 어르신 세션 이력(최신순, 목록 카드용). */
export function useElderSessions(elderId: string | undefined): Session[] {
  const mock = useApp(useShallow((s) => (elderId ? s.sessionsByElder(elderId) : [])));
  const live = useSessionsData(CFG ? elderId : undefined);
  if (!CFG) return mock;
  return (live.data ?? []).map(toSession);
}

/**
 * 어르신 대화 로그 목록. 라이브에서는 세션 1건이 곧 로그 1건이라 로그 id = 세션 id.
 * (목록에서는 전문 턴이 필요 없어 turns=[]로 매핑 — 상세는 useLog가 전문을 읽는다.)
 */
export function useElderLogs(elderId: string | undefined): ConversationLog[] {
  const mock = useApp(useShallow((s) => (elderId ? s.logsByElder(elderId) : [])));
  const live = useSessionsData(CFG ? elderId : undefined);
  if (!CFG) return mock;
  return (live.data ?? []).map((row) => toConversationLog(row, []));
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
  if (!CFG) return mock;
  return (live.data ?? [])
    .map(parseSessionAnalysis)
    .filter((a): a is SessionAnalysis => Boolean(a));
}

/** 담당 전체 세션(전체 분석·관찰지표 집계용). */
export function useAllSessions(): Session[] {
  const mock = useApp((s) => s.sessions);
  const live = useRecentSessionsData({ enabled: CFG, limit: 500 });
  if (!CFG) return mock;
  return (live.data ?? []).map(toSession);
}

/** 담당 전체 세션 분석(전체 관찰지표 집계용). */
export function useAllAnalyses(): SessionAnalysis[] {
  const mock = useApp(useShallow((s) => Object.values(s.analyses)));
  const live = useOrgSessionAnalysesData({ enabled: CFG, limit: 500 });
  if (!CFG) return mock;
  return (live.data ?? [])
    .map(parseSessionAnalysis)
    .filter((a): a is SessionAnalysis => Boolean(a));
}

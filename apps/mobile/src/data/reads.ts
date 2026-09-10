// 앱 데이터 읽기 어댑터 — 화면이 보는 단일 진입점.
//
// @giokon/data 쿼리 훅 + mappers 로 라이브 DB(RLS 범위)를 읽는다. 반환 타입은
// @giokon/core 도메인 타입이라 화면 JSX 는 DB 스키마를 몰라도 된다.
//
// ⚠️ 목업 모드는 없다(2026-09-04 제거). 예전에는 Supabase 미설정 시 예시 데이터를
// 조용히 보여 줬는데, 어르신 개인 기록을 다루는 서비스에서 "지금 보는 게 진짜인지"
// 화면만 봐서는 알 수 없다는 것이 더 큰 위험이었다. 이제 키가 없으면 부팅 단계에서
// 설정 오류 화면으로 멈춘다(app/_layout.tsx) — 이 파일까지 내려오지 않는다.

import {
  useChronicles as useChroniclesData,
  useConsents as useConsentsData,
  useDuePlannedSession as useDuePlannedSessionData,
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
import { useMemo } from 'react';
import { isCurrentConsent } from '@giokon/core';

/** 분석 + 기록 시각 — core 의 기간 집계 함수가 요구하는 형태. */
export type DatedAnalysis = SessionAnalysis & { at: string };

/** 분석 행 → DatedAnalysis. */
function datedFromRows(rows: { created_at: string }[] | undefined): DatedAnalysis[] {
  return (rows ?? [])
    .map((row) => {
      const a = parseSessionAnalysis(row as Parameters<typeof parseSessionAnalysis>[0]);
      return a ? { ...a, at: row.created_at } : null;
    })
    .filter((x): x is DatedAnalysis => Boolean(x));
}

/** 담당 어르신 목록(최신순). */
export function useElders(): ElderProfile[] {
  const rows = useProfilesData().data;
  return useMemo(
    () => (rows ?? []).map(toElderProfile).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [rows],
  );
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
  const live = useProfileData(id);
  return {
    elder: live.data ? toElderProfile(live.data) : undefined,
    // 아직 한 번도 성공적으로 받아오지 못한 상태(초기 로딩·재시도 중)
    loading: Boolean(id) && live.isPending,
  };
}

/** 어르신 연대기(최신순). */
export function useChronicles(elderId: string | undefined): ChronicleEntry[] {
  const rows = useChroniclesData(elderId).data;
  return useMemo(() => (rows ?? []).map(toChronicleEntry), [rows]);
}

/** 어르신 세션 이력(최신순, 목록 카드용). */
export function useElderSessions(elderId: string | undefined): Session[] {
  const rows = useSessionsData(elderId).data;
  // 웹 설계(planned) 행은 **아직 진행하지 않은 세션**이다 — 실행 이력 목록에서 제외한다.
  // 채택은 세션 시작 화면(useDuePlannedRow → adoptPlannedSession)이 전담한다(B1-d).
  return useMemo(
    () => (rows ?? []).filter((row) => row.status !== 'planned').map(toSession),
    [rows],
  );
}

/**
 * 어르신 대화 로그 목록. 세션 1건이 곧 로그 1건이라 로그 id = 세션 id.
 * (목록에서는 전문 턴이 필요 없어 turns=[]로 매핑 — 상세는 useLog가 전문을 읽는다.)
 */
export function useElderLogs(elderId: string | undefined): ConversationLog[] {
  const rows = useSessionsData(elderId).data;
  return useMemo(
    () =>
      (rows ?? [])
        .filter((row) => row.status !== 'planned') // 설계만 한 행은 대화 기록이 아니다(B1-d).
        .map((row) => toConversationLog(row, [])),
    [rows],
  );
}

/**
 * 오늘 진행할 웹 설계 세션(planned, 기록일 도래)의 DB 행 — 세션 시작 화면이
 * 채택 여부를 결정하는 근거(B1-a).
 * 도메인 Session 이 아닌 **raw 행**을 그대로 노출한다 — status/planned_date 등
 * 채택 판정에 필요한 필드가 도메인 매핑엔 없기 때문이다.
 */
export function useDuePlannedRow(
  elderId: string | undefined,
): ReturnType<typeof useDuePlannedSessionData>['data'] {
  return useDuePlannedSessionData(elderId).data ?? null;
}

/** 단일 대화 로그(전문 포함). id 는 세션 id. */
export function useLog(id: string | undefined): ConversationLog | undefined {
  const session = useSessionData(id);
  const logs = useSessionLogsData(id);
  const row = session.data;
  const turns = logs.data;
  return useMemo(() => (row ? toConversationLog(row, turns ?? []) : undefined), [row, turns]);
}

/** 세션 자동 분석. logId 는 세션 id(분석은 세션당 1건). */
export function useAnalysis(logId: string | undefined): SessionAnalysis | undefined {
  const row = useSessionAnalysisData(logId).data;
  return useMemo(() => (row ? (parseSessionAnalysis(row) ?? undefined) : undefined), [row]);
}

/** 현재 버전·주체 증빙이 유효한 동의 타입. 실제 시작 승인은 서버가 재검사한다. */
export function useElderConsents(elderId: string | undefined): ConsentType[] {
  const rows = useConsentsData(elderId).data;
  return useMemo(() => {
    const active = (rows ?? []).filter((c) => isCurrentConsent(c));
    return [...new Set(active.map((c) => c.consent_type as ConsentType))];
  }, [rows]);
}

// ── 관찰지표 집계용 데이터(T1) — 순수 집계 함수(@giokon/core)에 주입할 배열 ──────────

/** 어르신 세션 분석 목록. */
export function useElderAnalyses(elderId: string | undefined): SessionAnalysis[] {
  const rows = useSessionAnalysesData(elderId).data;
  return useMemo(
    () => (rows ?? []).map(parseSessionAnalysis).filter((a): a is SessionAnalysis => Boolean(a)),
    [rows],
  );
}

/**
 * 어르신 세션 분석 + **기록 시각**(기간 대비 변화·월별 추이 집계용).
 *
 * ⚠️ 파생 객체({...a, at})는 반드시 useMemo 안에서 만든다. 매 렌더 새 배열을 돌려주면
 * 이 값을 의존성으로 쓰는 하위 계산이 통째로 다시 돌아간다(예전 Zustand 셀렉터에서는
 * 무한 리렌더까지 났다 — 인지효과분석·주제별 분석 진입 시 재현, 2026-08-13).
 */
export function useElderAnalysesDated(elderId: string | undefined): DatedAnalysis[] {
  const rows = useSessionAnalysesData(elderId).data;
  return useMemo(() => datedFromRows(rows), [rows]);
}

/** 담당 전체 분석 + 기록 시각(전체 인지 효과 분석·전체 주제 추이). */
export function useAllAnalysesDated(): DatedAnalysis[] {
  const rows = useOrgSessionAnalysesData({ fetchAll: true }).data;
  return useMemo(() => datedFromRows(rows), [rows]);
}

/** 담당 전체 세션(전체 분석·관찰지표 집계용). */
export function useAllSessions(): Session[] {
  const rows = useRecentSessionsData({ fetchAll: true }).data;
  return useMemo(() => (rows ?? []).map(toSession), [rows]);
}

/**
 * 어르신별 **최근 대화 시각**(ISO) — 메인 화면 카드의 "최근 대화" 표시용.
 * 실제 세션 기록에서 파생한다(예시 날짜 하드코딩 금지). 기록이 없는 어르신은 키가 없다.
 */
export function useLastTalkByElder(): Record<string, string> {
  const sessions = useAllSessions();
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) {
      const prev = map[s.elderId];
      if (!prev || s.createdAt > prev) map[s.elderId] = s.createdAt;
    }
    return map;
  }, [sessions]);
}

/** 담당 전체 세션 분석(전체 관찰지표 집계용). */
export function useAllAnalyses(): SessionAnalysis[] {
  const rows = useOrgSessionAnalysesData({ fetchAll: true }).data;
  return useMemo(
    () => (rows ?? []).map(parseSessionAnalysis).filter((a): a is SessionAnalysis => Boolean(a)),
    [rows],
  );
}

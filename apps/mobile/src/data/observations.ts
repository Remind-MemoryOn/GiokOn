// 관찰지표 집계 훅(T1) — 화면이 보는 단일 진입점.
//
// reads.ts 어댑터(live/mock 자동 전환)로 데이터를 모아 @giokon/core의 순수 집계 함수에
// 주입한다. 화면은 이 훅만 호출하므로 목업/라이브 분기가 화면에 새지 않고, 계산 로직은
// 코어(테스트됨)에 단일화된다.

import {
  computeAxisObservations,
  computeMonthlyAxisTrend,
  computeMonthlyTopicTrend,
  computeOverall,
  computeParticipation,
  computeTopicShares,
  type AxisObservation,
  type MonthlyAxisTrend,
  type MonthlyTopicTrend,
  type OverallObservations,
  type ParticipationSummary,
  type TopicShare,
} from '@giokon/core';
import { useMemo } from 'react';
import { withinPeriod, type PeriodMonths } from '../lib/period';
import {
  useAllAnalysesDated,
  useAllSessions,
  useChronicles,
  useElderAnalyses,
  useElderAnalysesDated,
  useElders,
  useElderSessions,
} from './reads';

export interface ElderObservations {
  participation: ParticipationSummary;
  topics: TopicShare[];
}

/** 어르신 관찰 요약(참여도 + 주제 반응). elderId 없으면 기본값. */
export function useElderObservations(elderId: string | undefined): ElderObservations {
  const sessions = useElderSessions(elderId);
  const analyses = useElderAnalyses(elderId);
  const chronicles = useChronicles(elderId);
  return useMemo(
    () => ({
      participation: computeParticipation(sessions, analyses),
      topics: computeTopicShares(chronicles, analyses),
    }),
    [sessions, analyses, chronicles],
  );
}

/**
 * 담당 어르신 전체 관찰 요약(전체 분석 화면).
 *
 * `months` 는 기간 pill 이 고른 값 — null 이면 전체 기간. 어르신 수는 명단 크기라
 * 기간과 무관하게 두고, 세션·분석만 기간으로 자른다.
 */
export function useOverallObservations(months: PeriodMonths = null): OverallObservations {
  const profiles = useElders();
  const sessions = useAllSessions();
  const analyses = useAllAnalysesDated();
  return useMemo(
    () =>
      computeOverall(
        profiles,
        withinPeriod(sessions, (s) => s.createdAt, months),
        withinPeriod(analyses, (a) => a.at, months),
      ),
    [profiles, sessions, analyses, months],
  );
}

// ── 인지 효과 분석 화면(5축 + 기간 대비 변화) / 주제별 추이 ────────────────
// Figma 의 "기억 회상력 23% ▲향상" 은 자리표시자였다. 사용자 확정(2026-08-13)대로
// 5축을 실측 관찰지표로 재정의하고 변화량은 직전 기간과의 실제 차이로 계산한다.

/** 어르신 관찰 5축 + 최근 N개월 대비 변화(근거 없으면 null). */
export function useElderAxisObservations(
  elderId: string | undefined,
  months = 3,
): AxisObservation[] {
  const dated = useElderAnalysesDated(elderId);
  return useMemo(() => computeAxisObservations(dated, months), [dated, months]);
}

/** 담당 전체 관찰 5축 + 변화. */
export function useOverallAxisObservations(months = 3): AxisObservation[] {
  const dated = useAllAnalysesDated();
  return useMemo(() => computeAxisObservations(dated, months), [dated, months]);
}

/** 어르신 관찰 5축 월별 추이(지표별 변화 추이 그래프). */
export function useElderAxisTrend(elderId: string | undefined, months = 3): MonthlyAxisTrend {
  const dated = useElderAnalysesDated(elderId);
  return useMemo(() => computeMonthlyAxisTrend(dated, months), [dated, months]);
}

/** 담당 전체 관찰 5축 월별 추이. */
export function useOverallAxisTrend(months = 3): MonthlyAxisTrend {
  const dated = useAllAnalysesDated();
  return useMemo(() => computeMonthlyAxisTrend(dated, months), [dated, months]);
}

/** 어르신 월별 주제 점유율 추이. */
export function useElderTopicTrend(elderId: string | undefined, months = 6): MonthlyTopicTrend {
  const dated = useElderAnalysesDated(elderId);
  return useMemo(() => computeMonthlyTopicTrend(dated, months), [dated, months]);
}

/** 담당 전체 월별 주제 점유율 추이. */
export function useOverallTopicTrend(months = 6): MonthlyTopicTrend {
  const dated = useAllAnalysesDated();
  return useMemo(() => computeMonthlyTopicTrend(dated, months), [dated, months]);
}

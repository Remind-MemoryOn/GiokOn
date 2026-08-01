// 관찰지표 집계 훅(T1) — 화면이 보는 단일 진입점.
//
// reads.ts 어댑터(live/mock 자동 전환)로 데이터를 모아 @giokon/core의 순수 집계 함수에
// 주입한다. 화면은 이 훅만 호출하므로 목업/라이브 분기가 화면에 새지 않고, 계산 로직은
// 코어(테스트됨)에 단일화된다.

import {
  computeOverall,
  computeParticipation,
  computeTopicShares,
  type OverallObservations,
  type ParticipationSummary,
  type TopicShare,
} from '@giokon/core';
import {
  useAllAnalyses,
  useAllSessions,
  useChronicles,
  useElderAnalyses,
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
  return {
    participation: computeParticipation(sessions, analyses),
    topics: computeTopicShares(chronicles, analyses),
  };
}

/** 담당 어르신 전체 관찰 요약(전체 분석·관찰지표 화면). */
export function useOverallObservations(): OverallObservations {
  const profiles = useElders();
  const sessions = useAllSessions();
  const analyses = useAllAnalyses();
  return computeOverall(profiles, sessions, analyses);
}

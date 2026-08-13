// 주제별 분석 (Figma `140:562`, 프레임 393×852)
//
// Figma 실측(@4x 픽셀 대조로 확정):
//   헤더 0..114 (뒤로 @(29,74) · "주제별 분석" Medium 18/30 @(155,71) · 공유 18×20 @(347,74))
//   "종합 관심 주제 변화" SemiBold 17 @(29,145) + 기간 pill 99×25 @(266,147)
//   범례 12점 + Regular 12: 점 x 35/161/284 × 행 top 192/223 — 라벨 박스 = 점+18
//   꺾은선 블록 top 269 (0% ↔ X축선 y417 / 100% ↔ 269) · X축선 290×1 @(72,417)
//     ※ 이 화면만 X축선이 72(다른 화면 71) — 공용 컴포넌트라 71 유지(편차 1px)
//   구분선 @473 · "주제별 상세 분석" @(29,498) + 주제 pill 73×25 @(292,500)
//     상세 카드 103×87 r5 #fefbf8/#f8d7bb @(29/146/262, 546)
//       라벨 Regular 13 잉크 rel+25.75 · 값 SemiBold 16 잉크 rel+47.25
//   구분선 @671 · "주요 키워드" @(29,699)
//     키워드 칩 h25 r5 #fefbf8/#f8d7bb @746 (gap 10) — 텍스트 **SemiBold 14 #e9822b**
//
// ⚠️ 79%·75회·88%·8분 45초·예시 키워드는 자리표시자다. 전부 실집계(core)와
//   분석 결과의 실제 키워드에 바인딩하고, 근거가 없으면 '—'/빈 상태로 둔다.
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessEngagement } from '@giokon/core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { DETAIL, Divider, PeriodPill, SectionHeading } from '../../src/components/detail';
import { TrendChart } from '../../src/components/charts';
import {
  useAllAnalyses,
  useAllSessions,
  useElder,
  useElderAnalyses,
  useElderLogs,
  useElderSessions,
} from '../../src/data/reads';
import {
  useElderObservations,
  useElderTopicTrend,
  useOverallObservations,
  useOverallTopicTrend,
} from '../../src/data/observations';
import { metric, NO_VALUE } from '../../src/lib/format';
import iconShare from '../../assets/brand/icon-share.png';

/** 주제 시계열 색(개인 인지효과분석 범례와 같은 팔레트). */
const SERIES_COLORS = ['#e9822b', '#8cd565', '#2bc9e9', '#e92b90', '#d147dd'];

/** 범례 항목 위치 — Figma 점 좌측 35/161/284 − 콘텐츠 원점 29, 행 pitch 31. */
const LEGEND_POS = [
  { left: 6, top: 0 },
  { left: 132, top: 0 },
  { left: 255, top: 0 },
  { left: 6, top: 31 },
  { left: 132, top: 31 },
];

/** 상세 카드 103×87 — 잉크 rel +25.75 / +47.25. */
function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        width: 103,
        height: 87,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        alignItems: 'center',
      }}
    >
      <Text
        className="text-[13px] font-normal text-black"
        style={{ lineHeight: 30, marginTop: 15.5 }}
      >
        {label}
      </Text>
      <Text
        className="text-[16px] font-semibold text-black"
        style={{ lineHeight: 30, marginTop: -7.25 }}
      >
        {value}
      </Text>
    </View>
  );
}

function KeywordChip({ text }: { text: string }) {
  return (
    <View
      style={{
        height: 25,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        paddingHorizontal: 14,
        justifyContent: 'center',
      }}
    >
      <Text className="text-[14px] font-semibold text-accent" style={{ lineHeight: 25 }}>
        {text}
      </Text>
    </View>
  );
}

export default function Topics() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elderId = id === 'all' ? undefined : id;
  const elder = useElder(elderId);

  const elderObs = useElderObservations(elderId);
  const overall = useOverallObservations();
  const elderAnalyses = useElderAnalyses(elderId);
  const allAnalyses = useAllAnalyses();
  const elderTrend = useElderTopicTrend(elderId, 6);
  const overallTrend = useOverallTopicTrend(6);
  const elderSessions = useElderSessions(elderId);
  const allSessions = useAllSessions();
  const logs = useElderLogs(elderId);

  const isElder = Boolean(elder);
  const topics = isElder ? elderObs.topics : overall.topTopics;
  const analyses = isElder ? elderAnalyses : allAnalyses;
  const sessions = isElder ? elderSessions : allSessions;
  const trend = isElder ? elderTrend : overallTrend;

  // 상세 분석 대상 주제 = 관찰된 1위 주제(임의 선택 금지).
  const focus = topics[0];

  // 언급 빈도 — 해당 주제의 어르신 발화 수 합.
  const mentions = focus
    ? analyses.reduce(
        (n, a) => n + (a.topicOutcomes.find((o) => o.topic === focus.label)?.elderTurns ?? 0),
        0,
      )
    : 0;
  // "긍정 반응률" → 우리가 실제로 세는 값: 해당 주제에서 활발히 응답한 비율.
  const elderUtterances = logs.flatMap((l) => l.turns.filter((t) => t.speaker === 'Elderly'));
  const rich = elderUtterances.filter((t) => assessEngagement(t.text) === 'rich').length;
  const engagedRate = elderUtterances.length
    ? Math.round((rich / elderUtterances.length) * 100)
    : null;
  const avgMinutes = sessions.length
    ? Math.round(sessions.reduce((n, s) => n + s.durationMinutes, 0) / sessions.length)
    : null;
  const keywords = [...new Set(analyses.flatMap((a) => a.interestKeywords))].slice(0, 8);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title="주제별 분석"
        rightIcon={iconShare}
        rightIconSize={{ width: 18, height: 20 }}
        rightIconTop={74}
        rightLabel="보호자 공유 안내"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 31, paddingBottom: 44 }}
      >
        <View className="flex-row items-center justify-between" style={{ width: DETAIL.width }}>
          <SectionHeading>종합 관심 주제 변화</SectionHeading>
          <PeriodPill label="최근 6개월" />
        </View>

        {/* 범례 — 3열 × 2행. Figma x 가 균등하지 않아 실측 좌표로 절대 배치. */}
        <View style={{ width: DETAIL.width, height: 62, marginTop: 8.75 }}>
          {trend.series.slice(0, LEGEND_POS.length).map((s, i) => (
            <View key={s.label} className="absolute" style={LEGEND_POS[i]}>
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 8.25,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
                }}
              />
              <Text
                className="absolute text-[12px] font-normal text-black"
                style={{ left: 18, top: 0, lineHeight: 30 }}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* 꺾은선 — 블록 top 269 (범례 하단 245.75 + 23.25) */}
        <View style={{ marginTop: 23.25 }}>
          <TrendChart
            labels={trend.months.map((m) => `${Number(m.slice(5))}월`)}
            series={trend.series.map((s, i) => ({
              label: s.label,
              points: s.points,
              color: SERIES_COLORS[i % SERIES_COLORS.length],
            }))}
          />
        </View>

        <View style={{ marginTop: 25 }}>
          <Divider />
        </View>

        <View
          className="flex-row items-center justify-between"
          style={{ width: DETAIL.width, marginTop: 24 }}
        >
          <SectionHeading>주제별 상세 분석</SectionHeading>
          <PeriodPill label={focus?.label ?? NO_VALUE} width={73} labelInset={17} />
        </View>

        {/* 좌우 끝을 29/365 에 고정(간격 13.5) */}
        <View className="flex-row justify-between" style={{ width: DETAIL.width, marginTop: 18 }}>
          <DetailCard label="언급 빈도" value={focus ? `${mentions}회` : NO_VALUE} />
          <DetailCard label="활발 응답률" value={metric(engagedRate, '%')} />
          <DetailCard label="평균 대화 시간" value={metric(avgMinutes, '분')} />
        </View>

        <View style={{ marginTop: 38 }}>
          <Divider />
        </View>

        <View style={{ marginTop: 27 }}>
          <SectionHeading>주요 키워드</SectionHeading>
        </View>

        {keywords.length === 0 ? (
          <Text className="text-[13px] font-normal text-muted" style={{ lineHeight: 30, marginTop: 17 }}>
            아직 관찰된 키워드가 없어요.
          </Text>
        ) : (
          <View
            className="flex-row flex-wrap"
            style={{ width: DETAIL.width, marginTop: 17, columnGap: 10, rowGap: 10 }}
          >
            {keywords.map((k) => (
              <KeywordChip key={k} text={k} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

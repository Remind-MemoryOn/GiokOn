// 인지 효과 분석 (Figma 개인 `134:94` 393×1685 / 전체 `144:201` 393×1554)
//
// 두 프레임은 레이더·지표 카드·변화율 카드·추이 그래프까지 **완전히 같은 레이아웃**이고
// 마지막 섹션만 다르다:
//   개인: "인지 효과 종합 평가" (스마일 54 + 등급 SemiBold 20 + 문장 + pill 176×25)
//   전체: "AI 종합 의견"        (AI 배지 37 + 제목 SemiBold 17 + 본문 Regular 13/25)
// 제목도 "인지 효과 분석" / "전체 인지 효과 분석" 로 다르다.
//
// Figma 실측(@4x 픽셀 대조로 확정):
//   헤더 0..114 · "인지 효과 지표" SemiBold 17 @(29,145) + 기간 pill 99×25 @(266,148)
//   레이더 블록 top 185.5 (중심 (196.5,318.5)) · 축 라벨 Medium 13/38
//   지표 카드 103×103 r5 #fefbf8/#f8d7bb 3+2 @(29/145.5/262, 457/574)
//     라벨 Medium 12 잉크 rel+21.5 · 값 SemiBold 16 잉크 rel+46.25 ·
//     배지 ▲ 8×7 #60bd66 + SemiBold 12 잉크 rel+73.25 (▲↔글자 간격 2.5)
//   구분선 @713 · "종합 인지 활동 효과 분석" (Figma 만 x32.5 — 다른 제목은 전부 29)
//     변화율 카드 162×95 2×2 @(29/203, 785/893) — 라벨 Regular 14 잉크 rel+23.5 ·
//       [아이콘 + 값 SemiBold 18 **#e9822b**] 잉크 rel+50.5 (아이콘↔값 간격 평균 12)
//   구분선 @1023 · "지표별 변화 추이" @(29,1045)
//     범례 12점 @x(34/160/283) · 라벨 Regular 12 박스 +18 · 행 top 1083.75 pitch 31
//     꺾은선 블록 top 1169 (0%↔1317 / 100%↔1169) · X축선 290 @(71,1317)
//   구분선 @1372 · "인지 효과 종합 평가" @(29,1394)
//     스마일 54 @(170,1446) · 평가 SemiBold 20 #e9822b 잉크 @1515
//     문장 Regular 13/25 w222 잉크 @1549.5 · 배지 pill 176×25 #fdf3ea @(109,1608) SemiBold 13
//
// ⚠️ Figma 의 "기억 회상력 23% ▲향상 / +23% / 전체 평균 대비 +17% 향상" 은 자리표시자다.
//   사용자 확정(2026-08-13)에 따라 5축을 **실측 관찰지표**로 재정의(core computeAxisObservations)
//   하고, "향상률"은 직전 동일 기간 대비 실제 변화량(%p)으로 계산한다. 근거가 없으면 '—'.
import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import type { AxisObservation, ObservationAxis } from '@giokon/core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { AiOpinion, DETAIL, Divider, PeriodPill, SectionHeading } from '../src/components/detail';
import { RadarChart, TrendChart } from '../src/components/charts';
import { useElder } from '../src/data/reads';
import {
  useElderAxisObservations,
  useElderAxisTrend,
  useOverallAxisObservations,
  useOverallAxisTrend,
} from '../src/data/observations';
import { metric, NO_VALUE } from '../src/lib/format';
import { TREND_PERIODS } from '../src/lib/period';
import iconShare from '../assets/brand/icon-share.png';
import iconSmileBig from '../assets/brand/icon-smile.png';
import statTime from '../assets/brand/stat-time.png';
import statSmile from '../assets/brand/stat-smile.png';
import statCount from '../assets/brand/stat-count.png';
import statTrend from '../assets/brand/stat-trend.png';

/** Figma 축 라벨(시계방향: 위 → 우 → 우하 → 좌하 → 좌). */
const AXIS_LABEL: Record<ObservationAxis, string> = {
  recall: '기억 회상력',
  emotion: '정서 안정감',
  participation: '대화 참여도',
  focus: '집중력',
  expression: '언어 표현력',
};
/** 레이더·범례 표시 순서(Figma 배치와 동일). */
const AXIS_ORDER: ObservationAxis[] = ['recall', 'emotion', 'participation', 'focus', 'expression'];
/** 추이 그래프 계열 색(Figma 범례 실측). */
const SERIES_COLOR: Record<ObservationAxis, string> = {
  recall: '#e9822b',
  emotion: '#8cd565',
  participation: '#2bc9e9',
  focus: '#e92b90',
  expression: '#d147dd',
};
const UP = '#60bd66';
const DOWN = '#d8503c';

/** ▲/▼ 삼각형 8×7 (Figma 실측). */
function DeltaMark({ up }: { up: boolean }) {
  return (
    <Svg width={8} height={7}>
      <Polygon points={up ? '4,0 8,7 0,7' : '0,0 8,0 4,7'} fill={up ? UP : DOWN} />
    </Svg>
  );
}

/** 지표 카드 103×103 — 값 + 변화 배지. */
function AxisCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: number | null;
  delta: number | null;
}) {
  return (
    <View
      style={{
        width: 103,
        height: 103,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        alignItems: 'center',
      }}
    >
      {/* 잉크 rel +21.5 / +46.25 / +73.25 에 맞춘 값 (카드 내부 top 은 테두리 1 포함) */}
      <Text
        className="text-[12px] font-medium text-black"
        style={{ lineHeight: 30, marginTop: 10.75 }}
      >
        {label}
      </Text>
      <Text
        className="text-[16px] font-semibold text-black"
        style={{ lineHeight: 30, marginTop: -3.5 }}
      >
        {metric(value, '%')}
      </Text>
      <View className="flex-row items-center" style={{ marginTop: -4.75 }}>
        {delta === null || delta === 0 ? (
          <Text className="text-[12px] font-semibold text-muted" style={{ lineHeight: 30 }}>
            {delta === 0 ? '변화 없음' : NO_VALUE}
          </Text>
        ) : (
          <>
            <DeltaMark up={delta > 0} />
            <Text
              className="text-[12px] font-semibold"
              style={{ lineHeight: 30, marginLeft: 2.5, color: delta > 0 ? UP : DOWN }}
            >
              {delta > 0 ? '향상' : '감소'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

/** 변화율 요약 카드 162×95 (전체 분석의 요약 카드와 같은 규격). */
function RateCard({
  label,
  icon,
  iconSize,
  delta,
}: {
  label: string;
  icon: number;
  iconSize: { width: number; height: number };
  delta: number | null;
}) {
  const text = delta === null ? NO_VALUE : `${delta > 0 ? '+' : ''}${delta}%`;
  return (
    <View
      style={{
        width: 162,
        height: 95,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        alignItems: 'center',
      }}
    >
      <Text className="text-[14px] font-normal text-black" style={{ lineHeight: 30, marginTop: 13 }}>
        {label}
      </Text>
      <View className="flex-row items-center" style={{ marginTop: -0.25 }}>
        <Image source={icon} style={iconSize} resizeMode="contain" />
        {/* Figma 는 이 카드의 값만 주황이다(전체 분석의 요약 카드는 검정) */}
        <Text
          className="text-[18px] font-semibold text-accent"
          style={{ lineHeight: 30, marginLeft: 12 }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

/** 범례 항목 x (Figma 점 좌측 34/160/283 − 콘텐츠 원점 29) + 행 배치 3+2. */
const LEGEND_POS = [
  { left: 5, top: 0 },
  { left: 131, top: 0 },
  { left: 254, top: 0 },
  { left: 5, top: 31 },
  { left: 131, top: 31 },
];

export default function Observations() {
  const { scope, id } = useLocalSearchParams<{ scope?: string; id?: string }>();
  const isElder = scope === 'elder' && Boolean(id);
  const elder = useElder(isElder ? id : undefined);
  // 기간 pill 선택값 — 직전 동일 기간과 비교하므로 3개월 이상만 고를 수 있다.
  const [months, setMonths] = useState(3);
  const periodLabel = TREND_PERIODS.find((p) => p.months === months)?.label ?? '최근 3개월';

  // 훅은 조건 없이 모두 호출하고(규칙), 범위에 맞는 결과만 쓴다.
  const elderAxes = useElderAxisObservations(isElder ? id : undefined, months);
  const overallAxes = useOverallAxisObservations(months);
  const elderTrend = useElderAxisTrend(isElder ? id : undefined, months);
  const overallTrend = useOverallAxisTrend(months);

  const axes = isElder ? elderAxes : overallAxes;
  const trend = isElder ? elderTrend : overallTrend;
  const byAxis = new Map<ObservationAxis, AxisObservation>(axes.map((a) => [a.axis, a]));
  const ordered = AXIS_ORDER.map((k) => byAxis.get(k) ?? { axis: k, value: null, delta: null });

  // 종합 평가 — 측정된 축의 평균 변화량으로 등급을 매긴다(임의 문구 금지).
  const deltas = ordered.map((a) => a.delta).filter((d): d is number => d !== null);
  const avgDelta = deltas.length
    ? Math.round(deltas.reduce((n, d) => n + d, 0) / deltas.length)
    : null;
  const grade =
    avgDelta === null
      ? null
      : avgDelta >= 10
        ? '매우 긍정적'
        : avgDelta > 0
          ? '긍정적'
          : avgDelta === 0
            ? '변화 없음'
            : '주의 관찰';
  const measured = ordered.filter((a) => a.value !== null).length;
  // 관찰 근거에서만 문장을 만든다(디자인의 예시 문장은 쓰지 않는다).
  const summarySentence =
    measured === 0
      ? '아직 관찰된 기록이 없어요. 대화가 쌓이면 지표를 보여드려요.'
      : avgDelta === null
        ? `${isElder ? (elder?.name ?? '어르신') + ' 어르신의' : '담당 어르신의'} 관찰 지표 ${measured}개를 측정했어요. 비교할 이전 기간 기록이 아직 없어요.`
        : `관찰 지표 ${measured}개 기준으로 직전 동일 기간 대비 평균 ${avgDelta > 0 ? '+' : ''}${avgDelta}%p 변화가 관찰됐어요.`;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title={isElder ? '인지 효과 분석' : '전체 인지 효과 분석'}
        rightIcon={iconShare}
        rightIconSize={{ width: 18, height: 20 }}
        rightIconTop={74}
        rightLabel="보호자 공유 안내"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 31, paddingBottom: 52 }}
      >
        <View className="flex-row items-center justify-between" style={{ width: DETAIL.width }}>
          <SectionHeading>인지 효과 지표</SectionHeading>
          <PeriodPill
            label={periodLabel}
            options={TREND_PERIODS.map((p) => ({ label: p.label, value: p.months as number }))}
            onSelect={setMonths}
            title="집계 기간"
          />
        </View>

        {/* 레이더 — 블록 top 185.5 (= 175 + 10.5) */}
        <View style={{ marginTop: 10.5 }}>
          <RadarChart axes={ordered.map((a) => ({ label: AXIS_LABEL[a.axis], value: a.value }))} />
        </View>

        {/* 지표 카드 3 + 2 (Figma 배치 순서: 기억·정서·참여 / 집중·표현) */}
        <View
          className="flex-row justify-between"
          style={{ width: DETAIL.width, marginTop: 18 }}
        >
          {ordered.slice(0, 3).map((a) => (
            <AxisCard key={a.axis} label={AXIS_LABEL[a.axis]} value={a.value} delta={a.delta} />
          ))}
        </View>
        <View className="flex-row" style={{ width: DETAIL.width, marginTop: 14, columnGap: 13 }}>
          {ordered.slice(3).map((a) => (
            <AxisCard key={a.axis} label={AXIS_LABEL[a.axis]} value={a.value} delta={a.delta} />
          ))}
        </View>

        <View style={{ marginTop: 36 }}>
          <Divider />
        </View>
        <View style={{ marginTop: 23 }}>
          <SectionHeading>종합 인지 활동 효과 분석</SectionHeading>
        </View>

        <View className="flex-row" style={{ width: DETAIL.width, marginTop: 18, columnGap: 12 }}>
          <RateCard
            label="기억 회상 향상률"
            icon={statTrend}
            iconSize={{ width: 29.25, height: 17.25 }}
            delta={byAxis.get('recall')?.delta ?? null}
          />
          <RateCard
            label="감정 표현 증가율"
            icon={statSmile}
            iconSize={{ width: 25, height: 25 }}
            delta={byAxis.get('emotion')?.delta ?? null}
          />
        </View>
        <View className="flex-row" style={{ width: DETAIL.width, marginTop: 13, columnGap: 12 }}>
          <RateCard
            label="대화 참여도 향상률"
            icon={statCount}
            iconSize={{ width: 26, height: 25.25 }}
            delta={byAxis.get('participation')?.delta ?? null}
          />
          <RateCard
            label="응답 지속 시간 증가율"
            icon={statTime}
            iconSize={{ width: 25, height: 25 }}
            delta={byAxis.get('expression')?.delta ?? null}
          />
        </View>

        <View style={{ marginTop: 35 }}>
          <Divider />
        </View>
        <View style={{ marginTop: 21 }}>
          <SectionHeading>지표별 변화 추이</SectionHeading>
        </View>

        {/* 범례 — 12점 + Regular 12, 3+2 배치. Figma x 가 균등하지 않아 실측 좌표로 절대 배치. */}
        <View style={{ width: DETAIL.width, height: 62, marginTop: 8.75 }}>
          {AXIS_ORDER.map((k, i) => (
            <View key={k} className="absolute" style={LEGEND_POS[i]}>
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 8.25,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: SERIES_COLOR[k],
                }}
              />
              <Text
                className="absolute text-[12px] font-normal text-black"
                style={{ left: 18, top: 0, lineHeight: 30 }}
              >
                {AXIS_LABEL[k]}
              </Text>
            </View>
          ))}
        </View>

        {/* 꺾은선 — 블록 top 1169 (범례 하단 1145.75 + 23.25) */}
        <View style={{ marginTop: 23.25 }}>
          <TrendChart
            labels={trend.months.map((m) => `${Number(m.slice(5))}월`)}
            series={AXIS_ORDER.map((k) => ({
              label: AXIS_LABEL[k],
              points: trend.series.find((s) => s.axis === k)?.points ?? [],
              color: SERIES_COLOR[k],
            }))}
          />
        </View>

        <View style={{ marginTop: 24 }}>
          <Divider />
        </View>

        {/* 전체 범위는 Figma `144:201` 처럼 AI 종합 의견 블록으로 끝난다 */}
        {!isElder ? (
          <View style={{ marginTop: 19 }}>
            <AiOpinion paragraphs={[summarySentence]} />
          </View>
        ) : (
          <>
            <View style={{ marginTop: 21 }}>
              <SectionHeading>인지 효과 종합 평가</SectionHeading>
            </View>

            <View className="items-center" style={{ width: DETAIL.width, marginTop: 22 }}>
              <Image source={iconSmileBig} style={{ width: 54, height: 54 }} resizeMode="contain" />
              <Text
                className="text-[20px] font-semibold text-accent"
                style={{ lineHeight: 30, marginTop: 9 }}
              >
                {grade ?? NO_VALUE}
              </Text>
              <Text
                className="text-[13px] font-normal text-black text-center"
                style={{ lineHeight: 25, width: 222, marginTop: 3.75 }}
              >
                {summarySentence}
              </Text>
              {avgDelta !== null ? (
                <View
                  className="items-center justify-center"
                  style={{
                    width: 176,
                    height: 25,
                    borderRadius: 12.5,
                    backgroundColor: DETAIL.chipBg,
                    marginTop: 15.25,
                  }}
                >
                  <Text className="text-[13px] font-semibold text-black" style={{ lineHeight: 25 }}>
                    직전 기간 대비 {avgDelta > 0 ? '+' : ''}
                    {avgDelta}%p
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

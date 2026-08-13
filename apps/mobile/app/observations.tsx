// 인지 효과 분석 (Figma 개인 `134:94` 393×1685 / 전체 `144:201` — 같은 레이아웃, 범위만 다름)
//
// Figma 실측:
//   헤더 0..114 · "인지 효과 지표" SemiBold 17 @(29,145) + 기간 pill 99×25 @(266,148)
//   레이더 링 5개(r 97.5~18.5) 중심 (196.5,318.5) · 축 라벨 Medium 13 @189~439
//   지표 카드 103×103 r5 #fefbf8/#f8d7bb 3+2 @(29/145/262, 457/574) gap 13/14
//     라벨 Medium 12 · 값 SemiBold 16 · 배지(▲ 11 + SemiBold 12 #60bd66) @+64
//   구분선 @713 · "종합 인지 활동 효과 분석" @(32,737)
//     요약 카드 162×95 2×2 @(29/203, 785/893) — 라벨 Regular 14 · 값 SemiBold 18
//   구분선 @1023 · "지표별 변화 추이" @(29,1045) · 범례 12점 2행 @1084/1115
//     꺾은선 0%↔1317 / 100%↔1169 · X축선 290 @(71,1317) · 월 라벨 @1321
//   구분선 @1372 · "인지 효과 종합 평가" @(29,1394)
//     스마일 54 @(170,1446) · 평가 SemiBold 20 #e9822b @(151,1509)
//     문장 Regular 13 w222 @(86,1543) · 배지 pill 176×25 #fdf3ea @(109,1608) SemiBold 13
//
// ⚠️ Figma 의 "기억 회상력 23% ▲향상 / +23% / 전체 평균 대비 +17% 향상" 은 자리표시자다.
//   사용자 확정(2026-08-13)에 따라 5축을 **실측 관찰지표**로 재정의(core computeAxisObservations)
//   하고, "향상률"은 직전 동일 기간 대비 실제 변화량(%p)으로 계산한다. 근거가 없으면 '—'.
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import type { AxisObservation, ObservationAxis } from '@giokon/core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { DETAIL, Divider, SectionHeading } from '../src/components/detail';
import { RadarChart, TrendChart } from '../src/components/charts';
import { useElder } from '../src/data/reads';
import {
  useElderAxisObservations,
  useElderAxisTrend,
  useOverallAxisObservations,
  useOverallAxisTrend,
} from '../src/data/observations';
import { metric, NO_VALUE } from '../src/lib/format';
import iconShare from '../assets/brand/icon-share.png';
import iconSmileBig from '../assets/brand/icon-smile.png';
import statTime from '../assets/brand/stat-time.png';
import statSmile from '../assets/brand/stat-smile.png';
import statCount from '../assets/brand/stat-count.png';

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

/** ▲/▼ 삼각형 11×11. */
function DeltaMark({ up }: { up: boolean }) {
  return (
    <Svg width={11} height={11}>
      <Polygon points={up ? '5.5,0 11,11 0,11' : '0,0 11,0 5.5,11'} fill={up ? UP : DOWN} />
    </Svg>
  );
}

/** 지표 카드 103×103 — 값 + 변화 배지. */
function AxisCard({ label, value, delta }: { label: string; value: number | null; delta: number | null }) {
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
      <Text className="text-[12px] font-medium text-black" style={{ lineHeight: 30, marginTop: 2.5 }}>
        {label}
      </Text>
      <Text className="text-[16px] font-semibold text-black" style={{ lineHeight: 30, marginTop: -5 }}>
        {metric(value, '%')}
      </Text>
      <View className="flex-row items-center" style={{ marginTop: -3 }}>
        {delta === null || delta === 0 ? (
          <Text className="text-[12px] font-semibold text-muted" style={{ lineHeight: 30 }}>
            {delta === 0 ? '변화 없음' : NO_VALUE}
          </Text>
        ) : (
          <>
            <DeltaMark up={delta > 0} />
            <Text
              className="text-[12px] font-semibold"
              style={{ lineHeight: 30, marginLeft: 4, color: delta > 0 ? UP : DOWN }}
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
      <Text className="text-[14px] font-normal text-black" style={{ lineHeight: 30, marginTop: 8.25 }}>
        {label}
      </Text>
      <View className="flex-row items-center" style={{ marginTop: 3 }}>
        <Image source={icon} style={iconSize} resizeMode="contain" />
        <Text className="text-[18px] font-semibold text-black" style={{ lineHeight: 30, marginLeft: 6.5 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

function PeriodPill({ label }: { label: string }) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: 99, height: 25, borderRadius: 5, borderWidth: 1, borderColor: '#d5d5d5' }}
    >
      <Text className="text-[12px] font-normal text-muted" style={{ lineHeight: 25 }}>
        {label}
      </Text>
    </View>
  );
}

export default function Observations() {
  const { scope, id } = useLocalSearchParams<{ scope?: string; id?: string }>();
  const isElder = scope === 'elder' && Boolean(id);
  const elder = useElder(isElder ? id : undefined);

  // 훅은 조건 없이 모두 호출하고(규칙), 범위에 맞는 결과만 쓴다.
  const elderAxes = useElderAxisObservations(isElder ? id : undefined, 3);
  const overallAxes = useOverallAxisObservations(3);
  const elderTrend = useElderAxisTrend(isElder ? id : undefined, 3);
  const overallTrend = useOverallAxisTrend(3);

  const axes = isElder ? elderAxes : overallAxes;
  const trend = isElder ? elderTrend : overallTrend;
  const byAxis = new Map<ObservationAxis, AxisObservation>(axes.map((a) => [a.axis, a]));
  const ordered = AXIS_ORDER.map(
    (k) => byAxis.get(k) ?? { axis: k, value: null, delta: null },
  );

  // 종합 평가 — 측정된 축의 평균 변화량으로 등급을 매긴다(임의 문구 금지).
  const deltas = ordered.map((a) => a.delta).filter((d): d is number => d !== null);
  const avgDelta = deltas.length ? Math.round(deltas.reduce((n, d) => n + d, 0) / deltas.length) : null;
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

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title="인지 효과 분석"
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
          <PeriodPill label="최근 3개월" />
        </View>

        <View style={{ marginTop: 14 }}>
          <RadarChart axes={ordered.map((a) => ({ label: AXIS_LABEL[a.axis], value: a.value }))} />
        </View>

        {/* 지표 카드 3 + 2 (Figma 배치 순서: 기억·정서·참여 / 집중·표현) */}
        <View className="flex-row" style={{ width: DETAIL.width, marginTop: 18, columnGap: 13 }}>
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
            icon={statSmile}
            iconSize={{ width: 25, height: 25 }}
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

        {/* 범례 — 12점 + Regular 12, 3+2 배치 */}
        <View className="flex-row flex-wrap" style={{ width: DETAIL.width, marginTop: 9 }}>
          {AXIS_ORDER.map((k, i) => (
            <View
              key={k}
              className="flex-row items-center"
              style={{ width: i === 2 || i === 4 ? 110 : 126, height: 31 }}
            >
              <View
                style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: SERIES_COLOR[k] }}
              />
              <Text className="text-[12px] font-normal text-black" style={{ lineHeight: 30, marginLeft: 6 }}>
                {AXIS_LABEL[k]}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 13 }}>
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
        <View style={{ marginTop: 21 }}>
          <SectionHeading>인지 효과 종합 평가</SectionHeading>
        </View>

        <View className="items-center" style={{ width: DETAIL.width, marginTop: 23 }}>
          <Image source={iconSmileBig} style={{ width: 54, height: 54 }} resizeMode="contain" />
          <Text
            className="text-[20px] font-semibold text-accent"
            style={{ lineHeight: 30, marginTop: 9 }}
          >
            {grade ?? NO_VALUE}
          </Text>
          <Text
            className="text-[13px] font-normal text-black text-center"
            style={{ lineHeight: 25, width: 222, marginTop: 4 }}
          >
            {measured === 0
              ? '아직 관찰된 기록이 없어요. 대화가 쌓이면 지표를 보여드려요.'
              : avgDelta === null
                ? `${isElder ? (elder?.name ?? '어르신') + ' 어르신의' : '담당 어르신의'} 관찰 지표 ${measured}개를 측정했어요. 비교할 이전 기간 기록이 아직 없어요.`
                : `관찰 지표 ${measured}개 기준으로 직전 3개월 대비 평균 ${avgDelta > 0 ? '+' : ''}${avgDelta}%p 변화가 관찰됐어요.`}
          </Text>
          {avgDelta !== null ? (
            <View
              className="items-center justify-center"
              style={{
                width: 176,
                height: 25,
                borderRadius: 12.5,
                backgroundColor: DETAIL.chipBg,
                marginTop: 16,
              }}
            >
              <Text className="text-[13px] font-semibold text-black" style={{ lineHeight: 25 }}>
                직전 기간 대비 {avgDelta > 0 ? '+' : ''}
                {avgDelta}%p
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

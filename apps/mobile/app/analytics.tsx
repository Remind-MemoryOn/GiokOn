// 전체 분석 (Figma `140:201`, 프레임 393×915) — 담당 어르신 전체 관찰 요약.
//
// Figma 실측:
//   헤더 0..114 (뒤로 @(29,74) · "전체 분석" Medium 18/30 · 공유 18×20 @(347,74))
//   "전체 요약" SemiBold 17/30 @(29,145) · 기간 pill 99×25 r5 bg #fbfbfb border #d5d5d5 @(266,148)
//     라벨 Regular 12 #7b7c7c 잉크 @(282.5,155.5) + ∨ 8.5×5.5 @(342,158.5)
//   요약 카드 162×95 r5 #fefbf8 border #f8d7bb 2×2 @(29/203, 198/306)
//     라벨 Regular 14 중앙 잉크 @rel+22.75 · [아이콘 + 값 SemiBold 18] 행 잉크 @rel+47
//     (아이콘↔값 간격은 Figma 가 카드마다 8.75~15.5 로 다르다 → 평균 12 로 통일)
//   "전체 인지 효과 분석 보기" 336×57 r10 #e9822b @(29,439)
//   구분선 336×1 #d9d9d9 @545 · "가장 많이 이야기한 주제 TOP 5" @(29,575)
//   막대: 라벨 Regular 13 @(30,616~) · 트랙 242×12 r6 @(75,+9) · 퍼센트 박스 @337
//   "주제별 분석 보기" 336×57 @(29,809) — 프레임 하단 49
//
// ⚠️ 52명·142회·12.4분·91%·79% 는 자리표시자다. 전부 computeOverall(실데이터 집계)에
//   바인딩하고, 근거가 없으면 '—'/빈 상태로 둔다.
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../src/components/ScreenHeader';
import {
  DETAIL,
  Divider,
  PeriodPill,
  SectionHeading,
  TopicBar,
  topicBarLayout,
} from '../src/components/detail';
import { useOverallObservations } from '../src/data/observations';
import { metric } from '../src/lib/format';
import { OVERALL_PERIODS, type PeriodMonths } from '../src/lib/period';
import iconShare from '../assets/brand/icon-share.png';
import statElders from '../assets/brand/stat-elders.png';
import statSmile from '../assets/brand/stat-smile.png';
import statTime from '../assets/brand/stat-time.png';
import statRate from '../assets/brand/stat-rate.png';

/** 요약 카드(Figma 162×95 — 폭은 줄을 나눠 갖는다) — 라벨 + [아이콘·값] 행. */
function SummaryCard({
  label,
  icon,
  iconSize,
  value,
}: {
  label: string;
  icon: number;
  iconSize: { width: number; height: number };
  /** 이미 포맷된 값(미측정이면 '—'). */
  value: string;
}) {
  return (
    <View
      style={{
        // Figma 162(336 폭에서 2칸 · 간격 12). 기기 폭에 따라 2칸이 줄을 나눠 갖는다.
        flex: 1,
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
        <Text className="text-[18px] font-semibold text-black" style={{ lineHeight: 30, marginLeft: 12 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function Analytics() {
  // 기간 pill 선택값 — 기본은 Figma 와 같은 '전체 기간'.
  const [period, setPeriod] = useState<PeriodMonths>(null);
  const periodLabel = OVERALL_PERIODS.find((p) => p.months === period)?.label ?? '전체 기간';
  const o = useOverallObservations(period);
  const top5 = o.topTopics.slice(0, 5);
  // 라벨이 잘리지 않도록 실제 주제명 길이에 맞춰 라벨 칸/트랙을 조정한다.
  const barLayout = topicBarLayout(
    top5.map((t) => t.label),
    { labelInset: 1, labelWidth: 45, percentGap: 20 },
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title="전체 분석"
        rightIcon={iconShare}
        rightIconSize={{ width: 18, height: 20 }}
        rightIconTop={74}
        rightLabel="보호자 공유 안내"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: DETAIL.left, paddingRight: DETAIL.right, paddingTop: 31, paddingBottom: 49 }}
      >
        {/* 전체 요약 + 기간 */}
        <View className="flex-row items-center justify-between">
          <SectionHeading>전체 요약</SectionHeading>
          <PeriodPill
            label={periodLabel}
            options={OVERALL_PERIODS.map((p) => ({ label: p.label, value: p.months }))}
            onSelect={setPeriod}
            title="집계 기간"
          />
        </View>

        <View className="flex-row" style={{ marginTop: 23, columnGap: 12 }}>
          <SummaryCard
            label="총 어르신 수"
            icon={statElders}
            iconSize={{ width: 31.75, height: 21.75 }}
            value={`${o.totalElders}명`}
          />
          <SummaryCard
            label="총 세션 수"
            icon={statSmile}
            iconSize={{ width: 25, height: 25 }}
            value={`${o.totalSessions}회`}
          />
        </View>
        <View className="flex-row" style={{ marginTop: 13, columnGap: 12 }}>
          <SummaryCard
            label="평균 대화 시간"
            icon={statTime}
            iconSize={{ width: 25, height: 25 }}
            value={metric(o.avgMinutes, '분')}
          />
          <SummaryCard
            label="평균 응답률"
            icon={statRate}
            iconSize={{ width: 24, height: 24 }}
            value={metric(o.avgResponseRate, '%')}
          />
        </View>

        <Pressable
          onPress={() => router.push('/observations')}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{
            height: 57,
            borderRadius: 10,
            backgroundColor: DETAIL.accent,
            marginTop: 38,
          }}
        >
          {/* Figma 카피 그대로 — 비의료 카피 정책과의 충돌은 사용자 "보류" 결정(2026-08-12) */}
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            전체 인지 효과 분석 보기
          </Text>
        </Pressable>

        <View style={{ marginTop: 49 }}>
          <Divider />
        </View>

        <View style={{ marginTop: 29 }}>
          <SectionHeading>가장 많이 이야기한 주제 TOP 5</SectionHeading>
        </View>

        <View style={{ marginTop: 11 }}>
          {top5.length === 0 ? (
            <Text className="text-[13px] font-normal text-muted" style={{ lineHeight: 30 }}>
              아직 관찰된 주제가 없어요.
            </Text>
          ) : (
            top5.map((t, i) => (
              <TopicBar key={t.label} label={t.label} percent={t.percent} rank={i} {...barLayout} />
            ))
          )}
        </View>

        <Pressable
          onPress={() => router.push('/topics/all')}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{
            height: 57,
            borderRadius: 10,
            backgroundColor: DETAIL.accent,
            // 막대 5개(각 32.25) 아래 → Figma top 809 (프레임 하단 49)
            marginTop: 31.75,
          }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            주제별 분석 보기
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

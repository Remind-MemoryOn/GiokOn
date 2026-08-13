// 전체 분석 (Figma `140:201`, 프레임 393×915) — 담당 어르신 전체 관찰 요약.
//
// Figma 실측:
//   헤더 0..114 (뒤로 @(29,74) · "전체 분석" Medium 18/30 · 공유 18×20 @(347,74))
//   "전체 요약" SemiBold 17/30 @(29,145) · 기간 pill 99×25 r? border #d5d5d5 @(266,148)
//     라벨 Regular 12 #7b7c7c @(282,146) + ∨ 8.4×5.45 @(350.4,164)
//   요약 카드 162×95 r5 #fefbf8 border #f8d7bb 2×2 @(29/203, 198/306)
//     라벨 Regular 14 중앙 @top+14 · [아이콘 + 값 SemiBold 18] 행 @top+44
//   "전체 인지 효과 분석 보기" 336×57 r10 #e9822b @(29,439)
//   구분선 336×1 #d9d9d9 @545 · "가장 많이 이야기한 주제 TOP 5" @(29,575)
//   막대: 라벨 Regular 13 @(30,616~) · 트랙 241×12 r6 @(76,+9) · 퍼센트 @(337, 같은 줄)
//   "주제별 분석 보기" 336×57 @(29,809) — 프레임 하단 49
//
// ⚠️ 52명·142회·12.4분·91%·79% 는 자리표시자다. 전부 computeOverall(실데이터 집계)에
//   바인딩하고, 근거가 없으면 '—'/빈 상태로 둔다.
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { DETAIL, Divider, SectionHeading, TopicBar } from '../src/components/detail';
import { useOverallObservations } from '../src/data/observations';
import { metric } from '../src/lib/format';
import iconShare from '../assets/brand/icon-share.png';
import iconChevronDown from '../assets/brand/icon-chevron-down.png';
import statElders from '../assets/brand/stat-elders.png';
import statSmile from '../assets/brand/stat-smile.png';
import statTime from '../assets/brand/stat-time.png';
import statRate from '../assets/brand/stat-rate.png';

/** 요약 카드(162×95) — 라벨 + [아이콘·값] 행. */
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
          {value}
        </Text>
      </View>
    </View>
  );
}

/** 기간 선택 pill — 현재는 전체 기간 하나(집계 기간 필터는 후속). */
function PeriodPill({ label }: { label: string }) {
  return (
    <View
      className="flex-row items-center"
      style={{
        width: 99,
        height: 25,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: '#d5d5d5',
        paddingLeft: 16,
      }}
    >
      <Text className="text-[12px] font-normal text-muted" style={{ lineHeight: 25 }}>
        {label}
      </Text>
      <Image
        source={iconChevronDown}
        style={{ position: 'absolute', right: 6.2, top: 8, width: 8.4, height: 5.45 }}
        resizeMode="contain"
      />
    </View>
  );
}

export default function Analytics() {
  const o = useOverallObservations();

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
        contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 31, paddingBottom: 49 }}
      >
        {/* 전체 요약 + 기간 */}
        <View className="flex-row items-center justify-between" style={{ width: DETAIL.width }}>
          <SectionHeading>전체 요약</SectionHeading>
          <PeriodPill label="전체 기간" />
        </View>

        <View className="flex-row" style={{ width: DETAIL.width, marginTop: 23, columnGap: 12 }}>
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
        <View className="flex-row" style={{ width: DETAIL.width, marginTop: 13, columnGap: 12 }}>
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
            width: DETAIL.width,
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
          {o.topTopics.length === 0 ? (
            <Text className="text-[13px] font-normal text-muted" style={{ lineHeight: 30 }}>
              아직 관찰된 주제가 없어요.
            </Text>
          ) : (
            o.topTopics
              .slice(0, 5)
              .map((t, i) => (
                <TopicBar key={t.label} label={t.label} percent={t.percent} rank={i} labelInset={1} labelWidth={46} />
              ))
          )}
        </View>

        <Pressable
          onPress={() => router.push('/topics/all')}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{
            width: DETAIL.width,
            height: 57,
            borderRadius: 10,
            backgroundColor: DETAIL.accent,
            marginTop: 43,
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

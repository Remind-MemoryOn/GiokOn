// 단일 대화 분석 (Figma `118:74`, 프레임 393×1035)
//
// Figma 실측:
//   헤더 0..114 (뒤로 @(29,74) · "대화 분석" Medium 18/30 @top71 · 공유 18×20 @(347,74))
//   크림 히어로 114..222 #fdf3ea (h108) — 날짜 Medium 14 #7b7c7c 잉크 top 150.75 ·
//     제목 SemiBold 20 잉크 top 175 (lineHeight 25/30 기준 박스 top 144.25 / 169)
//   흰 시트 top 222, 상단 라운드 30 (뒤로 크림이 보인다)
//   참여 타일 103×115 r5 #fefbf8/#f8d7bb @(29/146/262, 255) — 라벨 SemiBold 12 · 값 SemiBold 16
//     (좌우 끝을 29/365 에 고정 → space-between. Figma 는 화면마다 145/146 이 섞여 있다)
//   구분선 336×1 #d9d9d9 @400 · "핵심 요약" SemiBold 17 @(29,421)
//     불릿 Regular 13/26 — 점 잉크 x37.25 · 본문 박스 x48.5 · 행 pitch 26 (첫 행 잉크 top 458.75)
//   구분선 @555 · "대화 특성" @(29,574)
//     특성 카드 162×73 r5 #fefbf8/#f8d7bb 2×2 @(29/203, 615/700)
//       라벨 Regular 13 잉크 rel+20.75 · 값 SemiBold 16 잉크 rel+40.5
//     키워드 칩 76×32 r5 @(29/116/203/289, 788) — SemiBold 16 #e9822b
//   구분선 @850 · "감정 분석" @(29,873)
//     스마일 43 @(29,914) · 문장 Regular 12 @(84,910) · 수치 SemiBold 12 @(84/157.25/231.25, 932)
//     막대 336×12 @(29,973) — #e9822b / #f3bb8a / #fdf3ea
//
// ⚠️ 값은 전부 실측 관찰지표다. Figma 의 "12분 34초·6회·94%·긍정 82%·#고향" 등은 자리표시자다.
//   특히 "감정 분석 긍정/보통/부정 %"는 우리가 측정하지 않는 값이라, 대화에서 실제로 관찰한
//   **응답 정도 분포**(활발/짧게/무응답)로 바인딩한다(비의료 락다운: 판정이 아니라 관찰).
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessEngagement, EMOTION_META } from '@giokon/core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SessionReportPanel } from '../../src/components/SessionReportPanel';
import { SectionHeading, Divider, StatTile, DETAIL } from '../../src/components/detail';
import { useAnalysis, useElderSessions, useLog } from '../../src/data/reads';
import { clockLabel, longKoreanDate, metric } from '../../src/lib/format';
import { durationLabel, expressLabel, focusLabel, lengthLabel, summaryBullets } from '../../src/features/analysis/traits';
import iconShare from '../../assets/brand/icon-share.png';
import iconSmile from '../../assets/brand/icon-smile.png';
import statTime from '../../assets/brand/stat-time.png';
import statCount from '../../assets/brand/stat-count.png';
import statRate from '../../assets/brand/stat-rate.png';

const SHEET_RADIUS = 30;

/**
 * 어르신 발화의 응답 정도 분포(활발/짧게/무응답, %). 감정 판정이 아니라 관찰이다.
 * 발화가 없으면 모두 0.
 */
function engagementShares(turns: readonly { speaker: string; text: string }[]) {
  const elderTurns = turns.filter((t) => t.speaker === 'Elderly');
  const rich = elderTurns.filter((t) => assessEngagement(t.text) === 'rich').length;
  const silent = elderTurns.filter((t) => assessEngagement(t.text) === 'silent').length;
  const short = elderTurns.length - rich - silent;
  const total = elderTurns.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return { rich: pct(rich), short: pct(short), silent: pct(silent) };
}

/** 2×2 특성 카드 — 라벨은 Figma 그대로, 값은 실측 관찰지표에서 나온다. */
function TraitCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        width: 162,
        height: 73,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        alignItems: 'center',
      }}
    >
      {/* 잉크 위치를 Figma 실측(rel +20.75 / +40.5)에 맞춘 값 — 카드 내부 top 은 테두리 1 포함 */}
      <Text
        className="text-[13px] font-normal text-black"
        style={{ lineHeight: 30, marginTop: 10.5 }}
      >
        {label}
      </Text>
      <Text
        className="text-[16px] font-semibold text-black"
        style={{ lineHeight: 30, marginTop: -9.25 }}
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
        height: 32,
        minWidth: 76,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text className="text-[16px] font-semibold text-accent" style={{ lineHeight: 30 }}>
        {text}
      </Text>
    </View>
  );
}

export default function SingleAnalysis() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const log = useLog(logId);
  const analysis = useAnalysis(logId);
  const sessions = useElderSessions(log?.elderId);
  const session = log ? sessions.find((x) => x.id === log.sessionId || x.id === log.id) : undefined;

  if (!log || !analysis) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <ScreenHeader title="대화 분석" />
        <Text className="text-[18px] font-normal text-muted text-center" style={{ marginTop: 60 }}>
          분석 결과가 없어요.
        </Text>
      </SafeAreaView>
    );
  }

  const m = analysis.metrics;
  const share = engagementShares(log.turns);
  const tone = EMOTION_META[analysis.emotionTone];
  const bullets = summaryBullets(analysis.summary);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title="대화 분석"
        rightIcon={iconShare}
        rightIconSize={{ width: 18, height: 20 }}
        rightIconTop={74}
        rightLabel="보호자 공유 안내"
      />

      {/* 크림 히어로 114..222 (h108) */}
      <View style={{ height: 108, paddingLeft: DETAIL.left, backgroundColor: DETAIL.chipBg }}>
        <Text
          className="text-[14px] font-medium text-muted"
          style={{ lineHeight: 25, marginTop: 30.25 }}
        >
          {longKoreanDate(log.startedAt).replace(/^\d+년\s/, '')} {clockLabel(log.startedAt)}
        </Text>
        <Text
          className="text-[20px] font-semibold text-black"
          style={{ lineHeight: 30, marginTop: -0.25 }}
        >
          {session?.title ?? '회상 대화'}
        </Text>
      </View>

      {/* 흰 시트(상단 라운드 30) — 라운드 뒤로 크림이 보이도록 크림 바탕 위에 올린다 */}
      <View className="flex-1" style={{ backgroundColor: DETAIL.chipBg }}>
        <View
          className="flex-1 bg-white"
          style={{
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            overflow: 'hidden',
          }}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 33, paddingBottom: 50 }}
          >
            <SessionReportPanel key={logId} sessionId={logId} report={analysis.generatedReport} />
            {/* 참여 타일 3종 — 좌우 끝을 29/365 에 고정(간격 13.5) */}
            <View className="flex-row justify-between" style={{ width: DETAIL.width }}>
              <StatTile
                icon={statTime}
                iconSize={{ width: 24, height: 24 }}
                label="대화 시간"
                value={durationLabel(log.startedAt, log.endedAt)}
              />
              <StatTile
                icon={statCount}
                iconSize={{ width: 26, height: 25.25 }}
                label="대화 횟수"
                value={`${m.elderTurns}회`}
              />
              <StatTile
                icon={statRate}
                iconSize={{ width: 24, height: 24 }}
                label="응답률"
                value={metric(Math.round(m.responseRate * 100), '%')}
              />
            </View>

            <View style={{ marginTop: 30 }}>
              <Divider />
            </View>

            <View style={{ marginTop: 20 }}>
              <SectionHeading>핵심 요약</SectionHeading>
            </View>
            {bullets.length === 0 ? (
              <Text className="text-[13px] font-normal text-muted" style={{ lineHeight: 26 }}>
                아직 정리된 요약이 없어요.
              </Text>
            ) : (
              bullets.map((b) => (
                <View key={b} className="flex-row" style={{ width: DETAIL.width }}>
                  {/* 점 박스 x35.25(잉크 37.25) · 폭 13.25 → 본문 박스 x48.5 (Figma 실측) */}
                  <Text
                    className="text-[13px] font-normal text-black"
                    style={{ lineHeight: 26, marginLeft: 6.25, width: 13.25 }}
                  >
                    •
                  </Text>
                  <Text
                    className="flex-1 text-[13px] font-normal text-black"
                    style={{ lineHeight: 26 }}
                  >
                    {b}
                  </Text>
                </View>
              ))
            )}

            <View style={{ marginTop: 26 }}>
              <Divider />
            </View>

            <View style={{ marginTop: 18 }}>
              <SectionHeading>대화 특성</SectionHeading>
            </View>

            <View
              className="flex-row"
              style={{ width: DETAIL.width, marginTop: 11, columnGap: 12 }}
            >
              <TraitCard label="주요 감정" value={tone.label} />
              <TraitCard label="대화 집중도" value={focusLabel(m.participation)} />
            </View>
            <View
              className="flex-row"
              style={{ width: DETAIL.width, marginTop: 12, columnGap: 12 }}
            >
              <TraitCard label="표현 빈도" value={expressLabel(m.avgUtteranceChars)} />
              <TraitCard label="대화 길이" value={lengthLabel(session?.durationMinutes ?? 0)} />
            </View>

            {analysis.interestKeywords.length > 0 ? (
              <View
                className="flex-row flex-wrap"
                style={{ width: DETAIL.width, marginTop: 15, columnGap: 11, rowGap: 11 }}
              >
                {analysis.interestKeywords.slice(0, 4).map((k) => (
                  <KeywordChip key={k} text={`#${k}`} />
                ))}
              </View>
            ) : (
              <Text
                className="text-[13px] font-normal text-muted"
                style={{ lineHeight: 30, marginTop: 15 }}
              >
                아직 관찰된 키워드가 없어요.
              </Text>
            )}

            <View style={{ marginTop: 30 }}>
              <Divider />
            </View>

            <View style={{ marginTop: 22 }}>
              <SectionHeading>감정 분석</SectionHeading>
            </View>

            <View className="flex-row" style={{ marginTop: 7 }}>
              <Image
                source={iconSmile}
                style={{ width: 43, height: 43, marginTop: 4 }}
                resizeMode="contain"
              />
              <View style={{ marginLeft: 12 }}>
                <Text className="text-[12px] font-normal text-black" style={{ lineHeight: 30 }}>
                  {tone.label} 톤이 가장 많이 관찰됐어요
                </Text>
                {/* Figma 는 두 줄이 8px 겹쳐 있다(문장 box 910 / 수치 box 932) */}
                {/* 3열은 Figma 실측 x(84/157.25/231.25) = pitch 73.5 고정 — 라벨 길이가 달라도 정렬 유지 */}
                <View className="flex-row" style={{ marginTop: -8 }}>
                  <Text
                    className="text-[12px] font-semibold text-black"
                    style={{ lineHeight: 30, width: 73.5 }}
                    numberOfLines={1}
                  >
                    활발 {share.rich}%
                  </Text>
                  <Text
                    className="text-[12px] font-semibold text-black"
                    style={{ lineHeight: 30, width: 73.5 }}
                    numberOfLines={1}
                  >
                    짧게 {share.short}%
                  </Text>
                  <Text
                    className="text-[12px] font-semibold text-black"
                    style={{ lineHeight: 30 }}
                    numberOfLines={1}
                  >
                    무응답 {share.silent}%
                  </Text>
                </View>
              </View>
            </View>

            {/* 관찰된 응답 분포(3구간) — 값이 없으면 트랙만 보인다 */}
            <View
              className="flex-row"
              style={{
                width: DETAIL.width,
                height: 12,
                borderRadius: 6,
                backgroundColor: DETAIL.chipBg,
                overflow: 'hidden',
                marginTop: 11,
              }}
            >
              <View style={{ width: `${share.rich}%`, backgroundColor: DETAIL.accent }} />
              <View style={{ width: `${share.short}%`, backgroundColor: '#f3bb8a' }} />
              <View style={{ width: `${share.silent}%`, backgroundColor: '#fbe0c8' }} />
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

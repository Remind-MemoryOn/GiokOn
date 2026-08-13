// 단일 대화 분석 (Figma `118:74`, 프레임 393×1035)
//
// Figma 실측:
//   헤더 0..114 (뒤로 @(29,74) · "대화 분석" Medium 18/30 @top71 · 공유 18×20 @(347,74))
//   크림 히어로 114..224 #fdf3ea — 날짜 Medium 14 #7b7c7c @(29,142) · 제목 SemiBold 20 @(29,169)
//   흰 시트 top 224, 상단 라운드 30 (뒤로 크림이 보인다)
//   참여 타일 103×115 r5 #fefbf8/#f8d7bb @(29/146/262, 255) — 라벨 SemiBold 12 · 값 SemiBold 16
//   구분선 336×1 #d9d9d9 @400 · "핵심 요약" SemiBold 17 @(29,421) · 불릿 Regular 13/26 @(29,451)
//   구분선 @555 · "대화 특성" @(29,574)
//     특성 카드 162×73 r5 #fefbf8/#f8d7bb 2×2 @(29/203, 615/700) — 라벨 Regular 13 · 값 SemiBold 16
//     키워드 칩 76×32 r5 @(29/116/203/289, 788) — SemiBold 16 #e9822b
//   구분선 @850 · "감정 분석" @(29,873)
//     스마일 43 @(29,914) · 문장 Regular 12 @(84,910) · 수치 SemiBold 12 @(84/157/231, 932)
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
import { SectionHeading, Divider, StatTile, DETAIL } from '../../src/components/detail';
import { useAnalysis, useElderSessions, useLog } from '../../src/data/reads';
import { longKoreanDate, metric, NO_VALUE } from '../../src/lib/format';
import iconShare from '../../assets/brand/icon-share.png';
import iconSmile from '../../assets/brand/icon-smile.png';
import statTime from '../../assets/brand/stat-time.png';
import statCount from '../../assets/brand/stat-count.png';
import statRate from '../../assets/brand/stat-rate.png';

const SHEET_RADIUS = 30;

function durationLabel(startIso: string, endIso?: string): string {
  if (!endIso) return NO_VALUE;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

function hhmmLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
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
      <Text
        className="text-[13px] font-normal text-black"
        style={{ lineHeight: 30, marginTop: 5.75 }}
      >
        {label}
      </Text>
      <Text
        className="text-[16px] font-semibold text-black"
        style={{ lineHeight: 30, marginTop: -3.75 }}
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
  const elderTurns = log.turns.filter((t) => t.speaker === 'Elderly');
  const rich = elderTurns.filter((t) => assessEngagement(t.text) === 'rich').length;
  const silent = elderTurns.filter((t) => assessEngagement(t.text) === 'silent').length;
  const short = elderTurns.length - rich - silent;
  const total = elderTurns.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const tone = EMOTION_META[analysis.emotionTone];
  // 정성 등급은 실측값에서 파생한다(임의값 아님 — 기준을 코드에 명시).
  const focusLabel = m.participation >= 0.5 ? '높음' : m.participation >= 0.25 ? '보통' : '낮음';
  const expressLabel =
    m.avgUtteranceChars >= 30 ? '높음' : m.avgUtteranceChars >= 15 ? '보통' : '낮음';
  const minutes = session?.durationMinutes ?? 0;
  const lengthLabel =
    minutes >= 15 ? '긺' : minutes >= 8 ? '보통' : minutes > 0 ? '짧음' : NO_VALUE;
  // 요약은 문장 단위 불릿으로(근거 없으면 빈 상태).
  const bullets = analysis.summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title="대화 분석"
        rightIcon={iconShare}
        rightIconSize={{ width: 18, height: 20 }}
        rightIconTop={74}
        rightLabel="보호자 공유 안내"
      />

      {/* 크림 히어로 114..224 */}
      <View style={{ height: 110, paddingLeft: DETAIL.left, backgroundColor: DETAIL.chipBg }}>
        <Text
          className="text-[14px] font-medium text-muted"
          style={{ lineHeight: 25, marginTop: 21 }}
        >
          {longKoreanDate(log.startedAt).replace(/^\d+년\s/, '')} {hhmmLabel(log.startedAt)}
        </Text>
        <Text
          className="text-[20px] font-semibold text-black"
          style={{ lineHeight: 30, marginTop: 2 }}
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
            contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 31, paddingBottom: 50 }}
          >
            {/* 참여 타일 3종 */}
            <View className="flex-row" style={{ width: DETAIL.width, columnGap: 13 }}>
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
                  <Text
                    className="text-[13px] font-normal text-black"
                    style={{ lineHeight: 26, marginLeft: 8.5 }}
                  >
                    •
                  </Text>
                  <Text
                    className="flex-1 text-[13px] font-normal text-black"
                    style={{ lineHeight: 26, marginLeft: 7 }}
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
              <TraitCard label="대화 집중도" value={focusLabel} />
            </View>
            <View
              className="flex-row"
              style={{ width: DETAIL.width, marginTop: 12, columnGap: 12 }}
            >
              <TraitCard label="표현 빈도" value={expressLabel} />
              <TraitCard label="대화 길이" value={lengthLabel} />
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
                <View className="flex-row" style={{ marginTop: -8, columnGap: 22 }}>
                  <Text className="text-[12px] font-semibold text-black" style={{ lineHeight: 30 }}>
                    활발 {pct(rich)}%
                  </Text>
                  <Text className="text-[12px] font-semibold text-black" style={{ lineHeight: 30 }}>
                    짧게 {pct(short)}%
                  </Text>
                  <Text className="text-[12px] font-semibold text-black" style={{ lineHeight: 30 }}>
                    무응답 {pct(silent)}%
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
              <View style={{ width: `${pct(rich)}%`, backgroundColor: DETAIL.accent }} />
              <View style={{ width: `${pct(short)}%`, backgroundColor: '#f3bb8a' }} />
              <View style={{ width: `${pct(silent)}%`, backgroundColor: '#fbe0c8' }} />
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

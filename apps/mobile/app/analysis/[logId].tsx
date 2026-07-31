// 단일 대화 분석 — 관찰 지표(비의료). Figma의 "감정 분석 82%" 류는 효능/판정이 아니라
// 대화에서 직접 관찰한 '대화 반응'(활발/짧게/무응답) 분포로 순화한다.
import { View, Text } from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessEngagement, EMOTION_META } from '@giokon/core';
import { DetailHeader } from '../../src/components/AppHeader';
import { Card, Chip, SectionTitle, StatTile } from '../../src/components/ui';
import { ToneBar } from '../../src/components/brand';
import { NonMedicalFootnote } from '../../src/components/banners';
import { useLog, useAnalysis, useElderSessions } from '../../src/data/reads';
import { C } from '../../src/theme';

function durationLabel(startIso: string, endIso?: string): string {
  if (!endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

export default function SingleAnalysis() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const log = useLog(logId);
  const analysis = useAnalysis(logId);
  const sessions = useElderSessions(log?.elderId);
  const session = log ? sessions.find((x) => x.id === log.sessionId) : undefined;

  if (!log || !analysis) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="px-5">
          <DetailHeader title="대화 분석" />
        </View>
        <Text className="text-center text-muted mt-16">분석 결과가 없어요.</Text>
      </SafeAreaView>
    );
  }

  const m = analysis.metrics;
  const elderTurns = log.turns.filter((t) => t.speaker === 'Elderly');
  const rich = elderTurns.filter((t) => assessEngagement(t.text) === 'rich').length;
  const silent = elderTurns.filter((t) => assessEngagement(t.text) === 'silent').length;
  const short = elderTurns.length - rich - silent;
  const total = Math.max(1, elderTurns.length);
  const pct = (n: number) => Math.round((n / total) * 100);
  const participationLabel = m.participation >= 0.5 ? '높음' : m.participation >= 0.25 ? '보통' : '낮음';
  const lengthLabel = m.avgUtteranceChars >= 30 ? '많음' : m.avgUtteranceChars >= 15 ? '보통' : '짧음';
  const tone = EMOTION_META[analysis.emotionTone];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="대화 분석" rightIcon="share-outline" onRight={() => {}} />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[13px] text-muted mt-1">{log.startedAt.slice(0, 10).replace(/-/g, '. ')}</Text>
        <Text className="text-[20px] font-semibold text-ink mt-1 mb-4">{session?.title ?? '회상 대화'}</Text>

        {/* 관찰 지표 3종 */}
        <Card className="flex-row mb-6">
          <StatTile icon="time-outline" value={durationLabel(log.startedAt, log.endedAt)} label="대화 시간" />
          <StatTile icon="chatbubbles-outline" value={`${m.elderTurns}회`} label="대화 횟수" />
          <StatTile icon="pulse-outline" value={`${Math.round(m.responseRate * 100)}%`} label="응답률" />
        </Card>

        {/* 핵심 요약 */}
        <SectionTitle>핵심 요약</SectionTitle>
        <Card className="mb-6">
          <Text className="text-[15px] text-ink leading-[23px]">{analysis.summary}</Text>
        </Card>

        {/* 대화 특성(관찰) */}
        <SectionTitle>대화 특성</SectionTitle>
        <Card className="mb-6">
          <View className="flex-row justify-between mb-3">
            <View className="items-center flex-1">
              <Text className="text-[13px] text-muted mb-1">대화 참여도</Text>
              <Text className="text-[16px] font-semibold text-ink">{participationLabel}</Text>
            </View>
            <View className="items-center flex-1">
              <Text className="text-[13px] text-muted mb-1">발화량</Text>
              <Text className="text-[16px] font-semibold text-ink">{lengthLabel}</Text>
            </View>
            <View className="items-center flex-1">
              <Text className="text-[13px] text-muted mb-1">관심 톤</Text>
              <Text className="text-[16px] font-semibold text-ink">
                {tone.emoji} {tone.label}
              </Text>
            </View>
          </View>
          {analysis.interestKeywords.length > 0 ? (
            <View className="flex-row flex-wrap mt-2">
              {analysis.interestKeywords.map((k) => (
                <Chip key={k} label={`#${k}`} />
              ))}
            </View>
          ) : null}
        </Card>

        {/* 대화 반응(관찰) — Figma '감정 82%'를 관찰된 응답 분포로 순화 */}
        <SectionTitle>대화 반응</SectionTitle>
        <Card>
          <Text className="text-[14px] text-muted mb-3">대화에서 관찰된 응답 정도예요.</Text>
          <ToneBar
            segments={[
              { label: '활발히 응답', percent: pct(rich), color: C.positive },
              { label: '짧게 응답', percent: pct(short), color: C.accent },
              { label: '무응답', percent: pct(silent), color: C.border },
            ]}
          />
        </Card>

        <NonMedicalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
}

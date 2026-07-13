// 대화 기록 — 대화 전문(시간대별 말풍선) + 분석 결과 진입.
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatKoreanDate, type ConversationTurn } from '@giokon/core';
import { DetailHeader } from '../../src/components/AppHeader';
import { Button } from '../../src/components/ui';
import { RobotMascot } from '../../src/components/brand';
import { useApp } from '../../src/store/appStore';
import { ScrollView } from 'react-native';

function hhmm(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const hr = h % 12 || 12;
  return `${ampm} ${hr}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Bubble({ turn }: { turn: ConversationTurn }) {
  const ai = turn.speaker === 'AI';
  return (
    <View className={`flex-row mb-3 ${ai ? '' : 'justify-end'}`}>
      {ai ? (
        <View className="w-9 h-9 rounded-full bg-accent items-center justify-center mr-2 mt-1">
          <RobotMascot size={22} />
        </View>
      ) : null}
      <View className={`max-w-[76%] rounded-card px-4 py-3 ${ai ? 'bg-aicard' : 'bg-accent'}`}>
        <Text className={`text-[16px] leading-[24px] ${ai ? 'text-ink' : 'text-white'}`}>{turn.text}</Text>
        <Text className={`text-[11px] mt-1 ${ai ? 'text-muted' : 'text-white/80'}`}>{hhmm(turn.timestamp)}</Text>
      </View>
    </View>
  );
}

export default function LogTranscript() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const log = useApp((s) => (id ? s.getLog(id) : undefined));
  const analysis = useApp((s) => (id ? s.getAnalysis(id) : undefined));

  if (!log || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="px-5">
          <DetailHeader title="대화 기록" />
        </View>
        <Text className="text-center text-muted mt-16">기록을 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="대화 기록" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 16 }}>
        <Text className="text-center text-[13px] text-muted my-3">
          {formatKoreanDate(log.startedAt)}
        </Text>
        {log.turns.map((t) => (
          <Bubble key={t.id} turn={t} />
        ))}
      </ScrollView>
      {analysis ? (
        <View className="px-5 pt-3 pb-4 border-t border-line/60">
          <Button
            label="분석 결과"
            icon="bar-chart-outline"
            onPress={() => router.push(`/analysis/${id}`)}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// 어르신 상세 — Figma 3화면(프로필 / 세션 기록 / 종합 분석)을 탭으로 통합.
import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { canStartElderSession, initial, observationSummary } from '@giokon/core';
import { DetailHeader } from '../../src/components/AppHeader';
import { Button, Card, InfoRow, SectionTitle, StatTile, TopicBar } from '../../src/components/ui';
import {
  useElder,
  useChronicles,
  useElderSessions,
  useElderLogs,
  useElderConsents,
} from '../../src/data/reads';
import { useElderObservations } from '../../src/data/observations';
import { metric } from '../../src/lib/format';
import { ageOf, ELDER_GENDER } from '../../src/lib/mockData';
import { C } from '../../src/theme';

type Tab = 'profile' | 'sessions' | 'analysis';

const TABS: { key: Tab; label: string }[] = [
  { key: 'analysis', label: '종합 분석' },
  { key: 'sessions', label: '세션 기록' },
  { key: 'profile', label: '프로필' },
];

export default function ElderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const chronicles = useChronicles(id);
  const sessions = useElderSessions(id);
  const logs = useElderLogs(id);
  const consents = useElderConsents(id);
  const [tab, setTab] = useState<Tab>('profile');

  if (!elder || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="px-5">
          <DetailHeader title="어르신 상세" />
        </View>
        <Text className="text-center text-muted mt-16">어르신을 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  const gender = ELDER_GENDER[elder.id];
  const startTalk = () => {
    if (canStartElderSession(consents)) router.push(`/session/start?id=${elder.id}`);
    else router.push(`/consent/${elder.id}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="어르신 상세" rightIcon="share-outline" onRight={() => {}} />
      </View>

      {/* 프로필 요약 */}
      <View className="px-5 flex-row items-center pb-3">
        <View
          className="w-16 h-16 rounded-full items-center justify-center"
          style={{ backgroundColor: elder.avatarColor }}
        >
          <Text className="text-[20px] font-bold text-white">{initial(elder.name)}</Text>
        </View>
        <View className="ml-4">
          <Text className="text-[20px] font-semibold text-ink">{elder.name} 어르신</Text>
          <Text className="text-[15px] text-muted mt-0.5">
            {ageOf(elder.birthYear)}세{gender ? ` l ${gender}` : ''}
          </Text>
        </View>
      </View>

      {/* 탭 */}
      <View className="flex-row px-5 border-b border-line/60">
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} className="flex-1 items-center py-3">
            <Text className={`text-[15px] ${tab === t.key ? 'text-accent font-semibold' : 'text-muted'}`}>
              {t.label}
            </Text>
            {tab === t.key ? <View className="h-0.5 w-16 bg-accent mt-2 rounded-full" /> : null}
          </Pressable>
        ))}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingVertical: 16, paddingBottom: 96 }}>
        {tab === 'profile' && (
          <View>
            <InfoRow label="출생연도" value={`${elder.birthYear}년`} />
            {elder.hometown ? <InfoRow label="출신지" value={elder.hometown} /> : null}
            {elder.family ? <InfoRow label="가족 구성" value={elder.family} /> : null}
            {elder.job ? <InfoRow label="직업 이력" value={elder.job} /> : null}
            {elder.hobbies ? <InfoRow label="취미" value={elder.hobbies} /> : null}

            <View className="flex-row items-center justify-between mt-6 mb-2">
              <SectionTitle>주요 기억 ({chronicles.length})</SectionTitle>
              <Pressable onPress={() => router.push(`/chronicle/${elder.id}`)} className="active:opacity-60">
                <Text className="text-[14px] text-accent">연대기 수정</Text>
              </Pressable>
            </View>
            {chronicles.map((c) => (
              <Card key={c.id} className="mb-2">
                <Text className="text-[13px] text-accent mb-1">{c.topic}</Text>
                <Text className="text-[15px] text-ink leading-[22px]">{c.content}</Text>
              </Card>
            ))}
          </View>
        )}

        {tab === 'sessions' && (
          <View>
            {sessions.length === 0 ? (
              <Text className="text-center text-muted mt-10">아직 세션 기록이 없어요.</Text>
            ) : (
              sessions.map((s) => {
                const log = logs.find((l) => l.sessionId === s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => log && router.push(`/log/${log.id}`)}
                    className="flex-row items-center justify-between py-4 border-b border-line/60 active:opacity-70"
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-[16px] font-medium text-ink">{s.title}</Text>
                      <Text className="text-[13px] text-muted mt-1">
                        {s.createdAt.slice(0, 10).replace(/-/g, '. ')}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Text className="text-[14px] text-muted mr-2">{s.durationMinutes}분</Text>
                      {log ? <Ionicons name="chevron-forward" size={18} color={C.textSecondary} /> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {tab === 'analysis' && <AnalysisTab elderId={elder.id} />}
      </ScrollView>

      {tab === 'profile' && (
        <View className="absolute left-0 right-0 bottom-0 px-5 pt-3 pb-5 bg-white border-t border-line/60">
          <Button label="대화 시작하기" icon="chatbubble-ellipses-outline" onPress={startTalk} />
        </View>
      )}
    </SafeAreaView>
  );
}

function AnalysisTab({ elderId }: { elderId: string }) {
  // 관찰지표는 @giokon/core 순수 집계(어댑터가 live/mock 데이터 주입).
  const elder = useElder(elderId);
  const obs = useElderObservations(elderId);
  if (!elder) return null;
  const part = obs.participation;
  const topics = obs.topics;

  return (
    <View>
      <SectionTitle>종합 대화 참여도</SectionTitle>
      <Card className="flex-row bg-card mb-6">
        <StatTile icon="time-outline" value={metric(part.avgMinutes, '분')} label="평균 대화 시간" />
        <StatTile icon="chatbubbles-outline" value={`${part.totalSessions}회`} label="총 대화 횟수" />
        <StatTile icon="pulse-outline" value={metric(part.avgResponseRate, '%')} label="평균 응답률" />
      </Card>

      <SectionTitle>종합 관심 주제 TOP 5</SectionTitle>
      <View className="mb-6">
        {topics.length === 0 ? (
          <Text className="text-[14px] text-muted">아직 관찰된 주제가 없어요.</Text>
        ) : (
          topics.map((t) => <TopicBar key={t.label} label={t.label} percent={t.percent} />)
        )}
      </View>

      {/* 근거가 없으면 서술하지 않는다(실 AI 연동 시 이 자리에 LLM 요약) */}
      <Card className="mb-6">
        <View className="flex-row items-center mb-2">
          <Ionicons name="sparkles-outline" size={18} color={C.accent} />
          <Text className="text-[15px] font-semibold text-ink ml-2">AI 종합 의견</Text>
        </View>
        <Text className="text-[15px] text-ink leading-[23px]">
          {observationSummary(elder.name, topics) ?? '대화 기록이 쌓이면 관찰된 내용을 정리해 드려요.'}
        </Text>
      </Card>

      <Button
        label="관찰 지표 자세히 보기"
        variant="outline"
        icon="bar-chart-outline"
        onPress={() => router.push(`/observations?scope=elder&id=${elderId}`)}
      />
    </View>
  );
}

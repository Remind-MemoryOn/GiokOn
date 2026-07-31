// 관찰 지표 — Figma "인지 효과 분석 · 23% 향상"을 비의료로 순화한 화면.
// 효능/향상 주장 대신 대화에서 직접 관찰된 값(참여·응답·발화량·주제 반응·활동량)만 보여준다.
// (내부 목적은 인지활동 보조지만, 산출물은 판정이 아니라 관찰 기록이다.)
import { View, Text } from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DetailHeader } from '../src/components/AppHeader';
import { Card, SectionTitle, TopicBar } from '../src/components/ui';
import { NonMedicalFootnote } from '../src/components/banners';
import { useElder } from '../src/data/reads';
import {
  elderParticipation,
  elderTopicShares,
  elderObservationSummary,
  overallSummary,
} from '../src/lib/analytics';

function Indicator({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View className="w-1/2 p-1.5">
      <Card>
        <Text className="text-[13px] text-muted">{label}</Text>
        <Text className="text-[22px] font-bold text-ink mt-1">{value}</Text>
        <Text className="text-[12px] text-muted mt-1">{note}</Text>
      </Card>
    </View>
  );
}

export default function Observations() {
  const { scope, id } = useLocalSearchParams<{ scope?: string; id?: string }>();
  const isElder = scope === 'elder' && !!id;

  const elder = useElder(id);
  const title = isElder ? '관찰 지표' : '전체 관찰 지표';

  let participationPct: number;
  let responsePct: number;
  let uttLabel: string;
  let topicCount: number;
  let sessionCount: number;
  let topics: { label: string; percent: number }[];
  let summary: string;

  if (isElder && elder) {
    const p = elderParticipation(elder.id);
    participationPct = Math.round(p.avgResponseRate); // 관찰된 참여/응답
    responsePct = p.avgResponseRate;
    uttLabel = p.avgUtteranceChars >= 30 ? '많음' : p.avgUtteranceChars >= 15 ? '보통' : '짧음';
    topics = elderTopicShares(elder.id);
    topicCount = topics.length;
    sessionCount = p.totalSessions;
    summary = elderObservationSummary(elder);
  } else {
    const o = overallSummary();
    responsePct = o.avgResponseRate;
    participationPct = o.avgResponseRate;
    uttLabel = '보통';
    topics = o.topTopics;
    topicCount = o.topTopics.length;
    sessionCount = o.totalSessions;
    summary = `담당 어르신들의 대화 참여가 꾸준히 이어지고 있어요. 관심 주제는 ${o.topTopics
      .slice(0, 2)
      .map((t) => t.label)
      .join('·')} 순으로 관찰됩니다.`;
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title={title} />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[13px] text-muted mt-1 mb-4">
          최근 3개월 · 대화에서 관찰된 값입니다. (효능·향상 지표가 아닙니다)
        </Text>

        {/* 관찰 지표 그리드 */}
        <View className="flex-row flex-wrap -m-1.5 mb-4">
          <Indicator label="대화 참여도" value={`${participationPct}%`} note="응답한 비율(관찰)" />
          <Indicator label="응답률" value={`${responsePct}%`} note="질문 대비 응답(관찰)" />
          <Indicator label="발화량" value={uttLabel} note="평균 발화 길이(관찰)" />
          <Indicator label="관심 주제 수" value={`${topicCount}개`} note="반응한 주제(관찰)" />
        </View>

        {/* 주제별 반응 */}
        <SectionTitle>주제별 반응(관찰)</SectionTitle>
        <View className="mb-6">
          {topics.map((t) => (
            <TopicBar key={t.label} label={t.label} percent={t.percent} />
          ))}
        </View>

        {/* 활동량 */}
        <SectionTitle>대화 활동량</SectionTitle>
        <Card className="mb-6">
          <Text className="text-[15px] text-ink">
            최근 3개월간 총 <Text className="font-bold text-accent">{sessionCount}회</Text>의 대화가
            관찰되었습니다.
          </Text>
        </Card>

        {/* 관찰 의견 */}
        <Card>
          <Text className="text-[15px] font-semibold text-ink mb-2">AI 종합 의견</Text>
          <Text className="text-[15px] text-ink leading-[23px]">{summary}</Text>
        </Card>

        <NonMedicalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
}

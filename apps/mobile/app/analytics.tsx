// 전체 분석 — 담당 어르신 전체 관찰 요약(비의료).
import { View, Text } from 'react-native';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DetailHeader } from '../src/components/AppHeader';
import { Button, Card, SectionTitle, TopicBar } from '../src/components/ui';
import { NonMedicalFootnote } from '../src/components/banners';
import { useOverallObservations } from '../src/data/observations';
import { metric } from '../src/lib/format';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 p-1.5">
      <Card>
        <Text className="text-[13px] text-muted font-normal">{label}</Text>
        <Text className="text-[24px] font-bold text-ink mt-1">{value}</Text>
      </Card>
    </View>
  );
}

export default function Analytics() {
  const o = useOverallObservations();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="전체 분석" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="flex-row items-center justify-between mt-1 mb-3">
          <SectionTitle>전체 요약</SectionTitle>
          <Text className="text-[13px] text-muted font-normal">최근 3개월</Text>
        </View>

        <View className="flex-row flex-wrap -m-1.5 mb-5">
          <StatCard label="총 어르신 수" value={`${o.totalElders}명`} />
          <StatCard label="총 세션 수" value={`${o.totalSessions}회`} />
          <StatCard label="평균 대화 시간" value={metric(o.avgMinutes, '분')} />
          <StatCard label="평균 응답률" value={metric(o.avgResponseRate, '%')} />
        </View>

        <SectionTitle>가장 많이 이야기한 주제 TOP 5</SectionTitle>
        <View className="mb-6">
          {o.topTopics.length === 0 ? (
            <Text className="text-[14px] text-muted font-normal">아직 관찰된 주제가 없어요.</Text>
          ) : (
            o.topTopics.map((t) => <TopicBar key={t.label} label={t.label} percent={t.percent} />)
          )}
        </View>

        <Button
          label="전체 관찰 지표 보기"
          icon="bar-chart-outline"
          onPress={() => router.push('/observations?scope=all')}
        />
        <View className="mt-3">
          <Button
            label="주제별 분석 보기"
            variant="outline"
            icon="pricetags-outline"
            onPress={() => router.push('/topics/all')}
          />
        </View>

        <NonMedicalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
}

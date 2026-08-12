// 주제별 분석 — 관심 주제별 관찰 상세(언급 빈도·응답 반응·평균 시간). 비의료.
import { View, Text } from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DetailHeader } from '../../src/components/AppHeader';
import { Card, Chip, SectionTitle } from '../../src/components/ui';
import { NonMedicalFootnote } from '../../src/components/banners';
import { useAllAnalyses, useElder, useElderAnalyses } from '../../src/data/reads';
import { useElderObservations, useOverallObservations } from '../../src/data/observations';

// ⚠️ 실서비스 원칙: 키워드는 **실제 대화 분석에서 관찰된 것만** 보여준다.
// (이전 구현은 주제별 예시 키워드를 코드에 박아 넣어 관찰하지 않은 근거를 표시했다 — 제거.)

export default function Topics() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elderId = id === 'all' ? undefined : id;
  const elder = useElder(elderId);
  const elderObs = useElderObservations(elderId);
  const overall = useOverallObservations();
  const elderAnalyses = useElderAnalyses(elderId);
  const allAnalyses = useAllAnalyses();

  const topics = elder ? elderObs.topics : overall.topTopics;
  // 관찰된 관심 키워드(분석 결과에서 추출된 실제 값만).
  const analyses = elder ? elderAnalyses : allAnalyses;
  const keywords = [...new Set(analyses.flatMap((a) => a.interestKeywords))].slice(0, 12);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="주제별 분석" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[13px] text-muted mt-1 mb-4">
          {elder ? `${elder.name} 어르신` : '담당 어르신 전체'} · 관찰된 주제 반응
        </Text>

        {/* 관찰된 관심 키워드 — 실제 분석 결과가 있을 때만 노출 */}
        {keywords.length > 0 ? (
          <>
            <SectionTitle>관찰된 관심 키워드</SectionTitle>
            <View className="flex-row flex-wrap mb-4">
              {keywords.map((k) => (
                <Chip key={k} label={`#${k}`} />
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle>주제별 상세 분석</SectionTitle>
        {topics.length === 0 ? (
          <Text className="text-[14px] text-muted">아직 관찰된 주제 반응이 없어요.</Text>
        ) : null}
        {topics.map((t) => (
          <Card key={t.label} className="mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[17px] font-semibold text-ink">{t.label}</Text>
              <Text className="text-[15px] font-semibold text-accent">{t.percent}%</Text>
            </View>
            <View className="flex-row mt-3">
              <View className="flex-1">
                <Text className="text-[12px] text-muted">응답 반응(관찰)</Text>
                <Text className="text-[15px] font-medium text-ink mt-0.5">{t.percent}%</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[12px] text-muted">언급 빈도(관찰)</Text>
                <Text className="text-[15px] font-medium text-ink mt-0.5">
                  {t.percent >= 60 ? '높음' : t.percent >= 30 ? '보통' : '낮음'}
                </Text>
              </View>
            </View>
          </Card>
        ))}

        <NonMedicalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
}

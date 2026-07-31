// 주제별 분석 — 관심 주제별 관찰 상세(언급 빈도·응답 반응·평균 시간). 비의료.
import { View, Text } from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DetailHeader } from '../../src/components/AppHeader';
import { Card, Chip, SectionTitle } from '../../src/components/ui';
import { NonMedicalFootnote } from '../../src/components/banners';
import { useElder } from '../../src/data/reads';
import { elderTopicShares, overallSummary } from '../../src/lib/analytics';

// 주제별 대표 키워드(관찰 근거). 실데이터에선 대화 로그에서 추출된다.
const TOPIC_KEYWORDS: Record<string, string[]> = {
  고향: ['고향', '어린 시절', '동네', '추억'],
  가족: ['자녀', '손주', '남편', '명절'],
  직업: ['시장', '상인', '일', '보람'],
  취미: ['텃밭', '바둑', '노래'],
  음식: ['김치', '국수', '잔치'],
  '주요 기억': ['추억', '장터', '결혼식'],
};

export default function Topics() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id === 'all' ? undefined : id);

  const topics = elder ? elderTopicShares(elder.id) : overallSummary().topTopics;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="주제별 분석" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[13px] text-muted mt-1 mb-4">
          {elder ? `${elder.name} 어르신` : '담당 어르신 전체'} · 관찰된 주제 반응
        </Text>

        <SectionTitle>주제별 상세 분석</SectionTitle>
        {topics.map((t) => (
          <Card key={t.label} className="mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[17px] font-semibold text-ink">{t.label}</Text>
              <Text className="text-[15px] font-semibold text-accent">{t.percent}%</Text>
            </View>
            <View className="flex-row flex-wrap">
              {(TOPIC_KEYWORDS[t.label] ?? ['추억']).map((k) => (
                <Chip key={k} label={`#${k}`} />
              ))}
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

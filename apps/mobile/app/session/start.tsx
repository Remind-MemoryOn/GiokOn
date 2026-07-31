// 대화 시작 전(핸드오프) — "어르신께 기기를 전달" + AI 이용 사전 고지 + 시작/취소.
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { recommendNextTopics } from '@giokon/core';
import { RobotMascot } from '../../src/components/brand';
import { Button } from '../../src/components/ui';
import { AiDisclosureBanner } from '../../src/components/banners';
import { useApp } from '../../src/store/appStore';
import { useElder, useChronicles } from '../../src/data/reads';

export default function SessionStart() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const chronicles = useChronicles(id);
  const begin = useApp((s) => s.beginSession);

  if (!elder || !id) {
    return <SafeAreaView className="flex-1 bg-white" />;
  }

  const onStart = () => {
    const topic = recommendNextTopics(elder, chronicles)[0] ?? '오늘';
    begin(elder, chronicles, { title: `${topic} 이야기`, therapyType: 'reminiscence' });
    router.replace('/session/talk');
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-6" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center">
        <RobotMascot size={110} />
        <Text className="text-[24px] font-semibold text-ink text-center mt-8 leading-[34px]">
          {elder.name} 어르신과{'\n'}회상 대화를 시작합니다.
        </Text>
        <Text className="text-[16px] text-muted text-center mt-3">어르신께 기기를 전달해 주세요.</Text>
        <View className="mt-6">
          <AiDisclosureBanner />
        </View>
      </View>
      <View className="pb-6">
        <Button label="시작하기" onPress={onStart} />
        <View className="mt-3">
          <Button label="취소" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

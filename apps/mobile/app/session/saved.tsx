// 대화 저장 완료 — "오늘의 대화가 저장되었습니다." + 대화 기록 보기 / 목록으로.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui';
import { C } from '../../src/theme';

export default function SessionSaved() {
  const { logId } = useLocalSearchParams<{ logId?: string }>();

  return (
    <SafeAreaView className="flex-1 bg-white px-6" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center">
        <View className="w-24 h-24 rounded-full bg-accent/10 items-center justify-center">
          <Ionicons name="document-text-outline" size={48} color={C.accent} />
        </View>
        <Text className="text-[24px] font-semibold text-ink text-center mt-8 leading-[34px]">
          오늘의 대화가{'\n'}저장되었습니다.
        </Text>
      </View>
      <View className="pb-6">
        <Button
          label="대화 기록 보기"
          onPress={() => (logId ? router.replace(`/log/${logId}`) : router.replace('/main'))}
        />
        <View className="mt-3">
          <Button label="목록으로" variant="ghost" onPress={() => router.replace('/main')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

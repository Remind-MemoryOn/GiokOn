// 질문 로딩 — "곧 다음 질문을 들려드릴게요." (STT 확인 → 다음 AI 질문 준비 사이의 전이).
import { useEffect } from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RobotMascot } from '../../src/components/brand';
import { C } from '../../src/theme';

export default function QuestionLoading() {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/session/talk'), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
      <RobotMascot size={104} />
      <Text className="text-[22px] font-semibold text-ink text-center mt-8">
        곧 다음 질문을 들려드릴게요.
      </Text>
      <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 24 }} />
    </SafeAreaView>
  );
}

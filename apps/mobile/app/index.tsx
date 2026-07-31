// 스플래시 — "AI 맞춤형 회상 대화 플랫폼" + 워드마크 + 간편 계정 연결.
// 라이브(Supabase 설정) 모드에서 이미 로그인된(영속) 세션이 있으면 로그인을 건너뛰고
// 바로 메인으로 보낸다. 미설정(목업) 모드는 기존 시연 흐름을 그대로 유지한다.
import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradientLike } from '../src/components/decor';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wordmark } from '../src/components/brand';
import { useAuth } from '../src/auth/AuthProvider';

export default function Splash() {
  const { isConfigured, authed, loading } = useAuth();

  useEffect(() => {
    if (isConfigured && !loading && authed) router.replace('/main');
  }, [isConfigured, loading, authed]);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-[15px] text-accent mb-2">AI 맞춤형 회상 대화 플랫폼</Text>
        <Wordmark size={34} />
      </View>
      <LinearGradientLike />
      <View className="px-6 pb-10 -mt-4">
        <Pressable
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          className="h-[57px] rounded-card bg-accent items-center justify-center active:bg-accent-pressed"
        >
          <Text className="text-white text-[18px] font-semibold">간편 계정 연결</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

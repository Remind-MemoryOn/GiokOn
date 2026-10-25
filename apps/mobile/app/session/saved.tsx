// 대화저장 (Figma `28:79`) — 클립보드 일러스트 + 저장 완료 문구 + 기록 보기/목록으로.
//
// Figma 실측(393×852):
//   일러스트 163.9×179 @ (125, 194) — **가로 중앙이 아니다**(중앙은 114.5)
//     에셋 알파 범위가 노드와 같으므로 노드 좌표·크기를 그대로 쓴다.
//   문구 SemiBold 28/42 검정 중앙 2줄 @ top 411
//   대화 기록 보기 336×57 r10 #e9822b @ top 644 · 라벨 SemiBold 18/30 흰색
//   목록으로       336×57 r10 흰색+border #cccdce @ top 721 · 라벨 SemiBold 18/30 #7b7c7c
// 상태바는 실기기 상태바 사용.
import { ScrollView, View, Text, Pressable, Image, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import savedIllustration from '../../assets/brand/saved-illustration.png';
import { useContentWidth } from '../../src/lib/layout';

const FRAME_H = 852;

export default function SessionSaved() {
  const { logId } = useLocalSearchParams<{ logId?: string }>();
  const { width, height: windowHeight } = useWindowDimensions();
  const landscape = width > windowHeight;
  const height = landscape ? Math.max(FRAME_H, windowHeight) : windowHeight;
  // 버튼 폭 = 콘텐츠 폭(393 폭에서 Figma 336 — 기기 폭 대응).
  const { contentW } = useContentWidth();

  const content = (
    <>
      {/* 일러스트 */}
      <Image
        source={savedIllustration}
        style={{
          position: 'absolute',
          // Figma x 125(393 폭). 화면 가운데에서의 거리로 두어 기기 폭이 달라도 같은 자리에 온다.
          left: '50%',
          marginLeft: 125 - 393 / 2,
          top: (194 / FRAME_H) * height,
          width: 164,
          height: 179,
        }}
        resizeMode="contain"
        accessibilityLabel="저장 완료"
      />

      {/* 문구 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (411 / FRAME_H) * height }}>
        <Text className="text-[28px] font-semibold text-black text-center" style={{ lineHeight: 42 }}>
          오늘의 대화가
        </Text>
        <Text className="text-[28px] font-semibold text-black text-center" style={{ lineHeight: 42 }}>
          저장되었습니다.
        </Text>
      </View>

      {/* 하단 버튼 — Figma top 644 / 721 (프레임 하단에서 151 / 74) */}
      <View className="absolute left-0 right-0 items-center" style={{ bottom: (74 / FRAME_H) * height }}>
        <Pressable
          onPress={() => (logId ? router.replace(`/log/${logId}`) : router.replace('/main'))}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{ width: contentW, height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            대화 기록 보기
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/main')}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-70"
          style={{
            width: contentW,
            height: 57,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#cccdce',
            marginTop: 20,
          }}
        >
          <Text className="text-[18px] font-semibold text-muted" style={{ lineHeight: 30 }}>
            목록으로
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {landscape ? (
        <ScrollView className="flex-1" contentContainerStyle={{ height }}>
          {content}
        </ScrollView>
      ) : content}
    </SafeAreaView>
  );
}

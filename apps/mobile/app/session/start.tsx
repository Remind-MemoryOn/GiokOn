// 대화 시작 전 (Figma `15:165`) — 로봇 마스코트 + 안내 + 시작하기/취소.
//
// Figma 실측(393×852):
//   로봇 195×124 @ (98, 185)
//   타이틀 SemiBold 28/42 검정 중앙 2줄 @ top 347 (이름 아래 주황 밑줄 71×4 @ (109, 378))
//   부제 Medium 20/40 #7b7c7c 중앙 @ top 490
//   시작하기 336×57 r10 #e9822b @ top 629 · 라벨 SemiBold 18/30 흰색
//   취소     336×57 r10 흰색+border #cccdce @ top 706 · 라벨 SemiBold 18/30 #7b7c7c
// 상태바는 실기기 상태바 사용(Figma 상태바 목업 미구현 — 사용자 확정).
// AI 이용 고지는 원본에 없지만 법·정책상 필수 → 배경/아이콘 없는 작은 회색 한 줄로 유지.
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { recommendNextTopics } from '@giokon/core';
import { RobotMascot } from '../../src/components/brand';
import { AiDisclosureBanner } from '../../src/components/banners';
import { useApp } from '../../src/store/appStore';
import { useElder, useChronicles } from '../../src/data/reads';

const FRAME_H = 852;

export default function SessionStart() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const chronicles = useChronicles(id);
  const begin = useApp((s) => s.beginSession);
  const { height } = useWindowDimensions();

  if (!elder || !id) {
    return <SafeAreaView className="flex-1 bg-white" />;
  }

  const onStart = () => {
    const topic = recommendNextTopics(elder, chronicles)[0] ?? '오늘';
    begin(elder, chronicles, { title: `${topic} 이야기`, therapyType: 'reminiscence' });
    router.replace('/session/talk');
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {/* 로봇 마스코트 — Figma (98, 185) 195×124. 중앙(99)이 아니라 실측 x 를 쓴다. */}
      <View className="absolute" style={{ left: 98, top: (185 / FRAME_H) * height }}>
        <RobotMascot size={195} />
      </View>

      {/* 타이틀 — 이름에 주황 밑줄 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (347 / FRAME_H) * height }}>
        {/* 밑줄은 절대 배치 — 줄 높이에 영향을 주지 않아야 이름이 같은 줄에 정렬된다.
            lineHeight 42 안에서 28px 잉크의 아래쪽 여백이 커서, Figma 처럼 글자 바로
            아래(잉크 기준 4px)에 붙도록 bottom 을 잡는다. */}
        <View className="flex-row items-baseline">
          <View>
            {/* 밑줄을 **먼저** 선언한다 — Figma 는 글자가 밑줄 위에 그려진다. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                // Figma: 밑줄 71×4 @ y378 · 타이틀 박스 347..389 → 아래에서 7
                bottom: 7,
                height: 4,
                backgroundColor: '#e9822b',
              }}
            />
            <Text className="text-[28px] font-semibold text-black text-center" style={{ lineHeight: 42 }}>
              {elder.name}
            </Text>
          </View>
          <Text className="text-[28px] font-semibold text-black" style={{ lineHeight: 42 }}>
            {' '}
            어르신과
          </Text>
        </View>
        <Text className="text-[28px] font-semibold text-black text-center" style={{ lineHeight: 42 }}>
          회상 대화를 시작합니다.
        </Text>
      </View>

      {/* 부제 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (490 / FRAME_H) * height }}>
        <Text className="text-[20px] font-medium text-muted text-center" style={{ lineHeight: 40 }}>
          어르신께 기기를 전달해 주세요.
        </Text>
      </View>

      {/* 하단 버튼 — Figma: 시작하기 top629 / 취소 top706 (프레임 하단에서 166 / 89) */}
      <View className="absolute left-0 right-0 items-center" style={{ bottom: (89 / FRAME_H) * height }}>
        <View className="items-center" style={{ marginBottom: 10 }}>
          <AiDisclosureBanner />
        </View>
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{ width: 336, height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            시작하기
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-70"
          style={{
            width: 336,
            height: 57,
            borderRadius: 10,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#cccdce',
            marginTop: 20,
          }}
        >
          <Text className="text-[18px] font-semibold text-muted" style={{ lineHeight: 30 }}>
            취소
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// 대화 — 어르신 음성 회상 대화(접근성 최우선: 큰 글자·큰 마이크·고대비).
// 진행·안전은 전적으로 @giokon/core(openConversation/respondToUserTurn)가 담당한다.
//   - AI 질문 자동 TTS 재생(ExpoSpeechProvider)
//   - 마이크(모의 STT) → 확인 화면 → 다음 질문(core)
//   - 위기 감지 시 요양보호사 배너(escalate/caregiverAlert)
//   - AI 이용 사전 고지 상시 노출(투명성)
import { useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RobotMascot, Waveform, MicButton } from '../../src/components/brand';
import { AiDisclosureBanner, CrisisBanner } from '../../src/components/banners';
import { ExpoSpeechProvider } from '../../src/lib/speech';
import { useApp } from '../../src/store/appStore';
import { useSessionPersistence } from '../../src/data/session-persistence';

export default function Talk() {
  const active = useApp((s) => s.active);
  const capture = useApp((s) => s.captureUtterance);
  const acknowledge = useApp((s) => s.acknowledgeSafety);
  const { finishAndPersist } = useSessionPersistence();
  // 종료 중에는 active가 null이 되어도 /main으로 튕기지 않도록 가드(라이브 저장 await 동안).
  const finishing = useRef(false);

  const question = active?.currentQuestion;

  // AI 질문 자동 재생(노인 대상: 느린 속도). 질문이 바뀔 때마다.
  useEffect(() => {
    if (!question) return;
    void ExpoSpeechProvider.speak(question);
    return () => ExpoSpeechProvider.cancelSpeak();
  }, [question]);

  // 활성 세션이 없으면 메인으로(단, 종료 저장 진행 중에는 제외 — saved로 이동).
  useEffect(() => {
    if (!active && !finishing.current) router.replace('/main');
  }, [active]);

  if (!active) return <SafeAreaView className="flex-1 bg-white" />;

  const endAndSave = async () => {
    finishing.current = true;
    ExpoSpeechProvider.cancelSpeak();
    const logId = await finishAndPersist();
    router.replace(`/session/saved${logId ? `?logId=${logId}` : ''}`);
  };

  const showCrisis = active.safety.caregiverAlert && !active.safety.acknowledged;
  const shouldEnd = active.safety.recommendation === 'end_session';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {/* 상단: AI 고지 + 종료 */}
      <View className="flex-row items-center justify-between px-5 pt-1">
        <AiDisclosureBanner />
        <Pressable onPress={endAndSave} accessibilityRole="button" className="px-3 py-2 active:opacity-60">
          <Text className="text-[15px] text-muted font-normal">종료</Text>
        </Pressable>
      </View>

      <View className="flex-1 px-5">
        {/* 위기·관찰 배너(요양보호사) */}
        {showCrisis && active.safety.level ? (
          <View className="mt-3">
            <CrisisBanner
              message={active.safety.caregiverAlert as string}
              level={active.safety.level}
              onAcknowledge={acknowledge}
            />
          </View>
        ) : null}

        {/* AI 질문 카드 */}
        <View className="bg-aicard border border-accent rounded-card p-5 mt-4">
          <RobotMascot size={44} />
          <Text className="text-[28px] font-semibold text-ink mt-4 leading-[42px]">{question}</Text>
        </View>

        {/* 파형 + 마이크 */}
        <View className="flex-1 items-center justify-center">
          <Waveform active={!shouldEnd} />
          <View className="h-3" />
          {shouldEnd ? (
            <Pressable
              onPress={endAndSave}
              accessibilityRole="button"
              className="h-[64px] px-8 rounded-full bg-accent items-center justify-center active:bg-accent-pressed"
            >
              <Text className="text-white text-[20px] font-semibold">대화 마무리하기</Text>
            </Pressable>
          ) : (
            <>
              <MicButton onPress={() => { ExpoSpeechProvider.cancelSpeak(); capture(); router.push('/session/correct'); }} />
              <Text className="text-[23px] text-ink mt-2 font-normal">듣고 있어요...</Text>
            </>
          )}
        </View>

        {/* 다시 듣기 */}
        {!shouldEnd ? (
          <Pressable
            onPress={() => question && ExpoSpeechProvider.speak(question)}
            accessibilityRole="button"
            className="flex-row items-center justify-center h-[57px] rounded-card border border-line mb-2 active:bg-cream-50"
          >
            <Text className="text-[18px] font-semibold text-muted">🔊  다시 듣기</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

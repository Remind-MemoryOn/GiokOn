// 어르신 표시 모드 (계획 M2·M3) — 요양보호사가 기기를 어르신께 건넨 뒤의 화면.
//
// 이 화면에는 **요양보호사 UI 가 없다**: 위기 배너·전화번호·부분 전사 확인 패널·중계 제어·
// 확인 없이 끝내는 X 가 모두 빠졌다(요양보호사 화면에만 있다 — 위기 안내는 없앤 것이 아니라
// 옮긴 것이다). 어르신이 누를 수 있는 것은 구석의 작은 '선생님' 버튼뿐이고, 그 뒤에는 PIN 이 있다.
//
// 문구는 **어르신용 고정 문구만** 쓴다. 자동 대화 컨트롤러의 사유 문구("기록을 저장해
// 주세요" 같은 요양보호사 안내)나 안전 알림 내용은 여기에 내보내지 않는다.
//
// 시안이 없는 화면이다(계획 §7 결정): 레이아웃·치수·색은 Figma 대화 화면(`17:108`)을 그대로 쓰고
// 마이크는 누를 수 없는 상태 표시로 바꿨다. 고령자 기준: 큰 글씨(질문 28·상태 23), 조작 없음.
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AutomaticPhase } from '../../lib/live/automatic';
import { MicIndicator, Waveform } from '../../components/brand';
import { AiDisclosureBanner } from '../../components/banners';
import { QuestionCard } from './QuestionCard';
import { ELDER_STATUS } from './elderStatus';

const FRAME_H = 852;

export function ElderView({
  question,
  phase,
  onCaregiver,
}: {
  question: string;
  phase: AutomaticPhase;
  /** '선생님' 버튼 — 호출부가 PIN 확인을 연다. */
  onCaregiver: () => void;
}) {
  const { height } = useWindowDimensions();
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {/* 선생님(요양보호사) 복귀 — 요양보호사 화면의 X 자리. 작고 흐리게, 누르면 PIN 확인. */}
      <View className="absolute right-[20px]" style={{ top: (64 / FRAME_H) * height, zIndex: 10 }}>
        <Pressable
          onPress={onCaregiver}
          accessibilityRole="button"
          accessibilityLabel="선생님 화면으로(PIN 필요)"
          hitSlop={12}
          className="items-center justify-center active:opacity-60"
          style={{ minWidth: 64, height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#cccdce' }}
        >
          <Text className="text-[14px] font-semibold" style={{ color: '#7b7c7c', lineHeight: 20 }}>선생님</Text>
        </Pressable>
      </View>

      <View className="absolute left-0 right-0 items-center" style={{ top: (121 / FRAME_H) * height }}>
        <QuestionCard question={question} placeholder="곧 이야기를 시작해요." />
      </View>

      <View className="absolute left-0 right-0 items-center" style={{ top: (419 / FRAME_H) * height }}>
        <Waveform active={phase === 'listening' || phase === 'speaking'} width={226} />
      </View>

      <View className="absolute left-0 right-0 items-center" style={{ top: (536 / FRAME_H) * height }}>
        <MicIndicator yourTurn={phase === 'listening'} size={123} />
        <Text
          className="text-[23px] font-medium text-black text-center"
          accessibilityLiveRegion="polite"
          style={{ lineHeight: 42, marginTop: 3, width: 336 }}
        >
          {ELDER_STATUS[phase]}
        </Text>
      </View>

      <View className="absolute left-0 right-0 items-center" style={{ top: (790 / FRAME_H) * height }}>
        <AiDisclosureBanner />
      </View>
    </SafeAreaView>
  );
}

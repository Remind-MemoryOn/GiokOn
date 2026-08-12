// 컴플라이언스 UI — Figma엔 없지만 필수(런북 §4-5, docs/ai-safety §4·compliance).
//   - AI 이용 사전 고지(대화 화면 상시)
//   - 위기 감지 시 요양보호사 배너(core respondToUserTurn의 escalate/caregiverAlert)
//   - 비의료 면책 문구(상시 노출용)
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AI_DISCLOSURE } from '@giokon/core';
import { C } from '../theme';

/** AI 이용 사전 고지(AI기본법 2026 — 투명성). 대화 화면 상단 상시 노출. */
export function AiDisclosureBanner() {
  return (
    <View
      accessibilityRole="text"
      className="flex-row items-center bg-cream-100 rounded-full px-4 py-2 self-center"
    >
      <Ionicons name="information-circle-outline" size={16} color={C.textSecondary} />
      <Text className="text-[13px] text-muted ml-1.5 font-normal">{AI_DISCLOSURE}</Text>
    </View>
  );
}

/**
 * 위기·관찰 알림 배너 — 요양보호사에게 즉시 노출(role="alert").
 * level=crisis: 강한 강조(즉시 개입). watch: 관찰 권고.
 */
export function CrisisBanner({
  message,
  level,
  onAcknowledge,
}: {
  message: string;
  level: 'watch' | 'crisis';
  onAcknowledge: () => void;
}) {
  const crisis = level === 'crisis';
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      className={`rounded-card p-4 border ${crisis ? 'bg-danger/10 border-danger' : 'bg-accent/10 border-accent'}`}
    >
      <View className="flex-row items-center mb-1.5">
        <Ionicons
          name={crisis ? 'warning' : 'alert-circle-outline'}
          size={20}
          color={crisis ? C.danger : C.accent}
        />
        <Text className={`text-[15px] font-bold ml-2 ${crisis ? 'text-danger' : 'text-accent'}`}>
          {crisis ? '요양보호사 확인 필요' : '관찰 권고'}
        </Text>
      </View>
      <Text className="text-[15px] text-ink leading-[22px] font-normal">{message}</Text>
      <Pressable
        onPress={onAcknowledge}
        accessibilityRole="button"
        className="self-end mt-2 px-4 py-2 rounded-full bg-white border border-line active:opacity-70"
      >
        <Text className="text-[14px] text-ink font-medium">확인했어요</Text>
      </Pressable>
    </View>
  );
}

/** 비의료 포지셔닝 면책 문구(상시 노출). 의료 표현 없이 정보 제공 성격만 명시. */
export function NonMedicalFootnote() {
  return (
    <Text className="text-[12px] text-muted leading-[18px] mt-4 font-normal">
      기억온은 인지활동 보조·회상 대화 서비스로, 의료기기가 아닙니다. 표시되는 요약·지표는 대화에서
      관찰된 기록이며 의학적 판단이 아닙니다.
    </Text>
  );
}

// 환자(어르신) 카드 — 메인 화면 목록. Figma: 원형 사진 + 이름/나이/성별 +
// '최근 대화' + 주황 화살표. (사진은 실데이터 연동 전 색 아바타로 대체.)
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { initial, type ElderProfile } from '@giokon/core';
import { ageOf, ELDER_GENDER, ELDER_LAST_TALK } from '../lib/mockData';

export function PatientCard({ elder, onPress }: { elder: ElderProfile; onPress: () => void }) {
  const gender = ELDER_GENDER[elder.id];
  const lastTalk = ELDER_LAST_TALK[elder.id] ?? '없음';
  const meta = gender ? `${ageOf(elder.birthYear)}세  l  ${gender}` : `${ageOf(elder.birthYear)}세`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${elder.name} 어르신`}
      className="bg-card rounded-card flex-row items-center p-4 mb-4 active:opacity-90"
      style={{ shadowColor: '#6a6a6a', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 1, height: 1 }, elevation: 2 }}
    >
      <View
        className="w-[72px] h-[72px] rounded-full items-center justify-center"
        style={{ backgroundColor: elder.avatarColor }}
      >
        <Text className="text-[22px] font-bold text-white">{initial(elder.name)}</Text>
      </View>
      <View className="flex-1 ml-4">
        <Text className="text-[19px] font-semibold text-ink">{elder.name} 어르신</Text>
        <Text className="text-[16px] text-muted mt-1">{meta}</Text>
        <Text className="text-[16px] text-muted mt-0.5">최근 대화  {lastTalk}</Text>
      </View>
      <View className="w-9 h-9 rounded-full bg-accent items-center justify-center">
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </View>
    </Pressable>
  );
}

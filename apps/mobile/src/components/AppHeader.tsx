// 상단 헤더 — 홈(워드마크+설정) / 상세(뒤로+제목+액션) 두 형태.
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C } from '../theme';
import { Wordmark } from './brand';

export function HomeHeader({ onSettings }: { onSettings?: () => void }) {
  return (
    <View className="flex-row items-center justify-between h-14 px-1">
      <Wordmark />
      <Pressable
        onPress={onSettings}
        accessibilityRole="button"
        accessibilityLabel="설정"
        className="w-10 h-10 items-center justify-center active:opacity-60"
      >
        <Ionicons name="settings-outline" size={24} color={C.textSecondary} />
      </Pressable>
    </View>
  );
}

export function DetailHeader({
  title,
  onBack,
  rightIcon,
  onRight,
}: {
  title: string;
  onBack?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRight?: () => void;
}) {
  return (
    <View className="flex-row items-center h-14 px-1">
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel="뒤로"
        className="w-10 h-10 items-center justify-center active:opacity-60"
      >
        <Ionicons name="chevron-back" size={26} color={C.textPrimary} />
      </Pressable>
      <Text className="flex-1 text-center text-[18px] font-semibold text-ink">{title}</Text>
      {rightIcon ? (
        <Pressable
          onPress={onRight}
          accessibilityRole="button"
          className="w-10 h-10 items-center justify-center active:opacity-60"
        >
          <Ionicons name={rightIcon} size={22} color={C.textPrimary} />
        </Pressable>
      ) : (
        <View className="w-10" />
      )}
    </View>
  );
}

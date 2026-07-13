// 공용 UI 프리미티브 (NativeWind). 어르신 접근성 기본값 내장:
// 본문 ≥ 18pt, 터치 타깃 ≥ 60px(버튼 높이 57~64), 고대비.
import { type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

// ── 화면 컨테이너 ──────────────────────────────────────────────
export function Screen({
  children,
  scroll = false,
  className = '',
  edges = ['top', 'bottom'],
}: {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-white">
      {scroll ? (
        <ScrollView
          className={`flex-1 ${className}`}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 px-5 ${className}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// ── 버튼 ──────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'outline' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  full = true,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  full?: boolean;
  accessibilityLabel?: string;
}) {
  const base = 'h-[57px] rounded-card flex-row items-center justify-center gap-2 px-5';
  const byVariant: Record<ButtonVariant, string> = {
    primary: 'bg-accent active:bg-accent-pressed',
    outline: 'bg-white border border-accent active:bg-cream-100',
    ghost: 'bg-white border border-line active:bg-cream-50',
  };
  const textColor: Record<ButtonVariant, string> = {
    primary: 'text-white',
    outline: 'text-accent',
    ghost: 'text-muted',
  };
  const iconColor = variant === 'primary' ? '#ffffff' : variant === 'outline' ? C.accent : C.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className={`${base} ${byVariant[variant]} ${full ? 'w-full' : ''} ${disabled ? 'opacity-40' : ''}`}
    >
      {icon ? <Ionicons name={icon} size={20} color={iconColor} /> : null}
      <Text className={`text-[18px] font-semibold ${textColor[variant]}`}>{label}</Text>
    </Pressable>
  );
}

// ── 입력 필드 ─────────────────────────────────────────────────
export function Field({
  label,
  required = false,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  keyboardType,
  secureTextEntry,
}: {
  label?: string;
  required?: boolean;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean;
}) {
  return (
    <View className="mb-4">
      {label ? (
        <View className="flex-row items-center mb-2">
          <Text className="text-[16px] font-semibold text-ink">{label}</Text>
          {required ? <Text className="text-accent text-[16px] ml-1">✱</Text> : null}
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textSecondary}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        className={`border border-line rounded-card px-4 text-[18px] text-ink bg-white ${
          multiline ? 'py-3 min-h-[96px]' : 'h-[54px]'
        }`}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {typeof maxLength === 'number' ? (
        <Text className="text-[13px] text-muted mt-1 text-right">
          {value.length}/{maxLength}
        </Text>
      ) : null}
    </View>
  );
}

// ── 섹션 카드 ─────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View className={`bg-card rounded-card p-4 ${className}`} style={{ shadowColor: '#6a6a6a', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 1, height: 1 }, elevation: 2 }}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="text-[18px] font-semibold text-ink mb-3">{children}</Text>;
}

// ── 통계 타일(대화시간·횟수·응답률 등) ───────────────────────────
export function StatTile({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View className="flex-1 items-center">
      <View className="w-14 h-14 rounded-full bg-accent/10 items-center justify-center mb-2">
        <Ionicons name={icon} size={24} color={C.accent} />
      </View>
      <Text className="text-[18px] font-bold text-ink">{value}</Text>
      <Text className="text-[13px] text-muted mt-0.5">{label}</Text>
    </View>
  );
}

// ── 가로 막대(주제별 반응·참여도) ─────────────────────────────
export function TopicBar({ label, percent }: { label: string; percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-[15px] text-ink">{label}</Text>
        <Text className="text-[15px] font-semibold text-accent">{pct}%</Text>
      </View>
      <View className="h-2.5 rounded-full bg-cream-200 overflow-hidden">
        <View className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

// ── 칩/태그 ──────────────────────────────────────────────────
export function Chip({ label }: { label: string }) {
  return (
    <View className="px-3 py-1.5 rounded-full bg-accent/10 mr-2 mb-2">
      <Text className="text-[14px] text-accent font-medium">{label}</Text>
    </View>
  );
}

// ── 라벨 값 행(상세 프로필) ───────────────────────────────────
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row py-3 border-b border-line/60">
      <Text className="w-24 text-[16px] text-muted">{label}</Text>
      <Text className="flex-1 text-[16px] text-ink">{value}</Text>
    </View>
  );
}

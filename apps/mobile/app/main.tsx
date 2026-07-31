// 메인 — 요양보호사 인사 + 환자(어르신) 목록 + 검색 + 하단 액션(등록/전체 분석).
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeHeader } from '../src/components/AppHeader';
import { PatientCard } from '../src/components/PatientCard';
import { Button } from '../src/components/ui';
import { useElders } from '../src/data/reads';
import { useAuth } from '../src/auth/AuthProvider';
import { C } from '../src/theme';

export default function Main() {
  const { caregiverName, signOut } = useAuth();
  const elders = useElders();
  const [q, setQ] = useState('');

  const filtered = useMemo(
    () => elders.filter((e) => e.name.includes(q.trim())),
    [elders, q],
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <HomeHeader
          onSettings={async () => {
            await signOut();
            router.replace('/');
          }}
        />
        <Text className="text-[24px] font-semibold text-ink mt-3 leading-[34px]">
          안녕하세요!{'\n'}
          {caregiverName} 요양 보호사님
        </Text>
        <View className="flex-row items-center border border-line rounded-card px-4 h-[46px] mt-5 mb-4">
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="이름을 검색하세요"
            placeholderTextColor={C.textSecondary}
            className="flex-1 ml-2 text-[18px] text-ink"
          />
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 16 }}>
        {filtered.length === 0 ? (
          <Text className="text-[16px] text-muted text-center mt-16">검색 결과가 없어요.</Text>
        ) : (
          filtered.map((e) => (
            <PatientCard key={e.id} elder={e} onPress={() => router.push(`/elder/${e.id}`)} />
          ))
        )}
      </ScrollView>

      <View className="flex-row gap-3 px-5 pt-3 pb-2 border-t border-line/60">
        <View className="flex-1">
          <Button label="어르신 등록" icon="walk" onPress={() => router.push('/register')} />
        </View>
        <View className="flex-1">
          <Button
            label="전체 분석"
            icon="analytics-outline"
            variant="outline"
            onPress={() => router.push('/analytics')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

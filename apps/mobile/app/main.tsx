// 메인 화면 (Figma `6:50`) — 헤더(워드마크·설정) + 인사 + 검색 + 어르신 카드 목록 + 하단 액션.
//
// Figma 실측(393×1291 프레임):
//   헤더 높이 114, shadow 1px 1px 10px rgba(108,101,101,0.13)
//     워드마크 90×13.7 @ (30, 78) · 설정 18×19 @ (344, 75)
//   인사 SemiBold 24/35 검정 @ (30, 144) — 이름 아래 주황 밑줄(62×3 @ y205)
//   검색 335×46 @ (30, 234) border #cccdce r10 · 아이콘 19 @ (49,247) · 안내 Regular 18 #7b7c7c
//   카드 336×146 gap 26(top 311부터) · 하단바 118 흰색 shadow 0 4 12 rgba(0,0,0,0.25)
//     버튼 158×57 r10 (등록=#e9822b 채움 / 전체분석=흰색+#e9822b 외곽선) 라벨 SemiBold 18
// 상태바는 실기기 상태바 사용(Figma 상태바 목업 미구현 — 사용자 확정).
//
// 기능은 기존과 동일(로그아웃·검색·등록·전체분석 이동). "최근 대화"는 실제 세션에서 파생.
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PatientCard } from '../src/components/PatientCard';
import { useElders, useLastTalkByElder } from '../src/data/reads';
import { useAuth } from '../src/auth/AuthProvider';
import wordmark from '../assets/brand/wordmark.png';
import iconSettings from '../assets/brand/icon-settings.png';
import iconSearch from '../assets/brand/icon-search.png';
import iconRegister from '../assets/brand/icon-register.png';
import iconAnalytics from '../assets/brand/icon-analytics.png';

export default function Main() {
  const { caregiverName, signOut } = useAuth();
  const elders = useElders();
  const lastTalk = useLastTalkByElder();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => elders.filter((e) => e.name.includes(q.trim())), [elders, q]);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View
        className="flex-row items-center justify-between bg-white"
        style={{
          height: 56,
          paddingHorizontal: 30,
          shadowColor: 'rgba(108,101,101,1)',
          shadowOpacity: 0.13,
          shadowRadius: 10,
          shadowOffset: { width: 1, height: 1 },
          elevation: 2,
          zIndex: 10,
        }}
      >
        <Image source={wordmark} style={{ width: 90, height: 14 }} resizeMode="contain" accessibilityLabel="기억온" />
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
          accessibilityRole="button"
          accessibilityLabel="설정"
          hitSlop={12}
          className="active:opacity-60"
        >
          <Image source={iconSettings} style={{ width: 18, height: 19 }} resizeMode="contain" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 28.5, paddingTop: 30, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 인사 — 이름에 주황 밑줄 */}
        <View style={{ paddingLeft: 1.5 }}>
          <Text className="text-[24px] font-semibold text-black" style={{ lineHeight: 35 }}>
            안녕하세요!
          </Text>
          <View className="flex-row items-end">
            <View>
              <Text className="text-[24px] font-semibold text-black" style={{ lineHeight: 35 }}>
                {caregiverName}
              </Text>
              <View style={{ height: 3, backgroundColor: '#e9822b', marginTop: -4 }} />
            </View>
            <Text className="text-[24px] font-semibold text-black" style={{ lineHeight: 35 }}>
              {' '}
              요양 보호사님
            </Text>
          </View>
        </View>

        {/* 검색 */}
        <View
          className="flex-row items-center"
          style={{
            height: 46,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#cccdce',
            paddingHorizontal: 20,
            marginTop: 24,
            marginBottom: 30,
          }}
        >
          <Image source={iconSearch} style={{ width: 19, height: 19 }} resizeMode="contain" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="이름을 검색하세요"
            placeholderTextColor="#7b7c7c"
            className="flex-1 text-[18px] text-ink"
            style={{ marginLeft: 6, paddingVertical: 0 }}
          />
        </View>

        {/* 어르신 목록 */}
        {filtered.length === 0 ? (
          <Text className="text-[16px] text-muted text-center mt-16">
            {elders.length === 0 ? '등록된 어르신이 없어요.' : '검색 결과가 없어요.'}
          </Text>
        ) : (
          filtered.map((e) => (
            <PatientCard
              key={e.id}
              elder={e}
              lastTalkAt={lastTalk[e.id]}
              onPress={() => router.push(`/elder/${e.id}`)}
            />
          ))
        )}
      </ScrollView>

      {/* 하단 액션 바 */}
      <View
        className="flex-row items-center justify-center bg-white"
        style={{
          height: 118,
          paddingBottom: 37,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        }}
      >
        <Pressable
          onPress={() => router.push('/register')}
          accessibilityRole="button"
          className="flex-row items-center justify-center active:opacity-90"
          style={{ width: 158, height: 57, borderRadius: 10, backgroundColor: '#e9822b', marginRight: 20 }}
        >
          <Image source={iconRegister} style={{ width: 14, height: 21.5 }} resizeMode="contain" />
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30, marginLeft: 8 }}>
            어르신 등록
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/analytics')}
          accessibilityRole="button"
          className="flex-row items-center justify-center active:opacity-90"
          style={{
            width: 158,
            height: 57,
            borderRadius: 10,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#e9822b',
          }}
        >
          <Image source={iconAnalytics} style={{ width: 20, height: 10 }} resizeMode="contain" />
          <Text className="text-[18px] font-semibold text-accent" style={{ lineHeight: 30, marginLeft: 8 }}>
            전체 분석
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

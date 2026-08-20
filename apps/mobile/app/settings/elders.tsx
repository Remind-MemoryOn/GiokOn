// 담당 어르신 관리 (Figma `584:559` 환경설정_담당 어르신 관리, 프레임 393×852)
//
// Figma 실측(@4x 픽셀 대조):
//   헤더 0..114 공용 ScreenHeader · 제목 "담당 어르신 관리" (Medium 18/30 @ x138)
//   카드 336×113 @(29,146) pitch 134 — 설정 화면의 카드와 같은 컴포넌트
//
// 삭제는 되돌릴 수 없다(연대기·대화·분석·사진까지 함께 파기) → 확인 후 진행한다.
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useOrganization } from '@giokon/data';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ManagedElderCard, SETTINGS } from '../../src/components/settings';
import { useElders } from '../../src/data/reads';
import { useDeleteElder } from '../../src/data/writes';

export default function ManagedElders() {
  const elders = useElders();
  const org = useOrganization();
  const deleteElder = useDeleteElder();
  const orgName = org.data?.name ?? null;

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      `${name} 어르신을 삭제할까요?`,
      '연대기·대화 기록·분석·사진까지 모두 지워지고 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteElder(id);
            } catch (e) {
              Alert.alert('삭제 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title="담당 어르신 관리" />

      <ScrollView
        className="flex-1"
        // 첫 카드 top 146 = 헤더 114 + 32
        contentContainerStyle={{ paddingLeft: SETTINGS.left, paddingTop: 32, paddingBottom: 40 }}
      >
        {elders.length === 0 ? (
          <Text
            className="text-[14px] font-normal"
            style={{ lineHeight: 25, color: SETTINGS.muted }}
          >
            아직 담당 어르신이 없어요.
          </Text>
        ) : (
          elders.map((e, i) => (
            // pitch 134 = 카드 113 + 21
            <View key={e.id} style={{ marginTop: i === 0 ? 0 : SETTINGS.elderGap }}>
              <ManagedElderCard
                elder={e}
                orgName={orgName}
                onPress={() => router.push(`/elder/${e.id}`)}
                onDelete={() => confirmDelete(e.id, e.name)}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

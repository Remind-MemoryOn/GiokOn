// 담당 어르신 목록 + 기관 이름 + 삭제 확인 — 설정 화면과 담당 어르신 관리 화면이 공유한다.
// 삭제는 되돌릴 수 없다(연대기·대화·분석·사진까지 함께 파기) → 확인 후 진행한다.
import { Alert } from 'react-native';
import { useOrganization } from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import { useElders } from '../../data/reads';
import { useDeleteElder } from '../../data/writes';

export function useManagedElders() {
  const { authed } = useAuth();
  const elders = useElders();
  // 목업 모드·로그인 전에는 조회하지 않는다(초기화 전 호출 방지).
  const org = useOrganization({ enabled: authed });
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

  return { elders, orgName, confirmDelete };
}

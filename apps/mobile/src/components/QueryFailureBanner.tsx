import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { hasActiveQueryFailure } from '../lib/queryFailure';

export function QueryFailureBanner() {
  const client = useQueryClient();
  const { authed } = useAuth();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(() => hasActiveQueryFailure(client));

  useEffect(() => {
    const refresh = () => setFailed(hasActiveQueryFailure(client));
    refresh();
    return client.getQueryCache().subscribe(refresh);
  }, [client]);

  if (!authed || !failed) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{ backgroundColor: '#fff4ee', borderBottomColor: '#e9822b', borderBottomWidth: 1, paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 8 }}
    >
      <Text className="font-normal" style={{ color: '#252525', fontSize: 15, lineHeight: 22 }}>
        기록을 불러오지 못했습니다. 화면이 비어 보여도 기록이 없다는 뜻은 아닙니다.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="실패한 기록 다시 확인"
        onPress={() => void client.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' })}
        style={{ alignSelf: 'flex-start', marginTop: 5, paddingVertical: 4 }}
      >
        <Text className="font-semibold" style={{ color: '#a94e0a', fontSize: 15 }}>다시 확인</Text>
      </Pressable>
    </View>
  );
}

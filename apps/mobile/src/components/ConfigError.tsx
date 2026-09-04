// 설정 오류 화면 — Supabase 연결 정보가 없을 때 앱 대신 이것이 뜬다.
//
// ⚠️ 예전에는 이 경우 앱이 **예시 데이터로 조용히 동작**했다(목업 모드).
// 요양보호사는 화면만 봐서는 라이브인지 알 수 없어 "기록이 저장됐다"고 믿을 수 있었고,
// 어르신 개인 기록을 다루는 서비스에서 그 오해는 감당할 수 없다.
// 이제는 아예 진입시키지 않고 무엇이 잘못됐는지 화면에 적는다.
//
// 사용자(요양보호사)가 고칠 수 있는 문제는 아니므로 개발·배포자를 향한 문구를 쓰되,
// 현장에서 이 화면을 보게 되더라도 무엇을 해야 하는지(관리자 문의)는 알 수 있게 한다.

import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ConfigError({ reason }: { reason: string }) {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ padding: 29, paddingTop: 80 }}>
        <Text className="text-[19px] font-semibold text-ink" style={{ lineHeight: 30 }}>
          앱을 시작할 수 없어요
        </Text>
        <Text className="mt-3 text-[14px] font-normal text-muted" style={{ lineHeight: 25 }}>
          서버 연결 정보가 없어 대화 기록을 안전하게 저장할 수 없습니다. 기록이 사라지는 것을
          막기 위해 앱을 열지 않았어요. 기관 관리자에게 알려 주세요.
        </Text>

        <View
          className="mt-8 rounded-[10px] border border-line"
          style={{ padding: 18, backgroundColor: '#fdf6f0' }}
        >
          <Text className="text-[13px] font-semibold text-ink" style={{ lineHeight: 20 }}>
            설정하는 분께
          </Text>
          <Text className="mt-2 text-[12px] font-normal text-muted" style={{ lineHeight: 20 }}>
            {reason}
          </Text>
          <Text className="mt-3 text-[12px] font-normal text-muted" style={{ lineHeight: 20 }}>
            로컬 개발은 `apps/mobile/.env`, EAS 빌드는 `eas env:create` 로 같은 이름을
            등록합니다. Expo 는 `EXPO_PUBLIC_` 로 시작하는 변수만 앱 번들에 넣습니다 —
            접두사를 빼면 값이 있어도 앱에서는 보이지 않습니다.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

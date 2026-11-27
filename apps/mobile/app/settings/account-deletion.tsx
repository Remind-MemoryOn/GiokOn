// 계정 삭제 요청 — Google Play 계정 삭제 정책(앱 안에서 요청 시작 + 앱 없이도 요청할 수 있는 웹 경로).
//
// 시안이 없는 화면이다(2026-11-27). 설정 화면의 카드·행 스타일로 최소 구현한다(임의 재디자인 금지).
// 삭제는 **셀프서비스 즉시 삭제가 아니라 요청 접수**다 — 기관 귀속 기록의 재귀속·보존 처리를 운영자가 확인한
// 뒤 처리한다(`docs/runbooks/account-deletion-and-ai-reports.md`). 접수는 본인 명의 비공개 문의로 남고
// (`@giokon/data` requestAccountDeletion), 이미 대기 중인 요청이 있으면 새로 만들지 않는다.
// 처리 기준 문구는 웹 `/account-deletion` 과 같은 core `ACCOUNT_DELETION_DATA_RULES` 를 쓴다.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ACCOUNT_DELETION_DATA_RULES } from '@giokon/core';
import { findPendingAccountDeletionRequest, requestAccountDeletion, useOrganization } from '@giokon/data';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ROLE_LABEL, SETTINGS, SectionLabel } from '../../src/components/settings';
import { useAuth } from '../../src/auth/AuthProvider';
import { webUrl, WEB_ROUTES } from '../../src/lib/webUrl';
import { C } from '../../src/theme';

function seoulDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
}

const CARD = {
  borderRadius: SETTINGS.cardR,
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: SETTINGS.cardBorder,
  paddingHorizontal: 25,
  paddingVertical: 18,
} as const;

export default function AccountDeletion() {
  const { user, userRow, authed } = useAuth();
  const org = useOrganization({ enabled: authed });
  /** 대기 중인 요청의 접수 시각 — undefined = 확인 중, null = 없음. */
  const [pendingAt, setPendingAt] = useState<string | null | undefined>(undefined);
  const [checkFailed, setCheckFailed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    findPendingAccountDeletionRequest(user.id)
      .then((row) => { if (alive) setPendingAt(row?.created_at ?? null); })
      .catch(() => { if (alive) { setCheckFailed(true); setPendingAt(null); } });
    return () => { alive = false; };
  }, [user?.id]);

  const send = async () => {
    if (!user?.id || sending) return;
    setSending(true);
    try {
      const r = await requestAccountDeletion(user.id, {
        email: userRow?.email ?? user.email ?? null,
        role: ROLE_LABEL[userRow?.role ?? ''] ?? null,
        orgName: org.data?.name ?? null,
        source: 'app',
        appVersion: Constants.expoConfig?.version ?? null,
      });
      setPendingAt(r.requestedAt);
      Alert.alert(
        r.status === 'created' ? '삭제 요청을 보냈어요' : '이미 접수된 요청이 있어요',
        `${seoulDate(r.requestedAt)}에 접수됐어요.\n본인 확인 후 처리하고, 결과는 가입하신 이메일과 문의 답변으로 알려 드려요.`,
      );
    } catch (e) {
      Alert.alert('요청 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  };

  const confirm = () =>
    Alert.alert(
      '계정 삭제를 요청할까요?',
      '처리가 끝나면 이 계정으로 다시 로그인할 수 없어요. 기관에 귀속된 어르신 기록은 기관에 남아요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제 요청', style: 'destructive', onPress: () => void send() },
      ],
    );

  const web = webUrl(WEB_ROUTES.accountDeletion);
  const pending = typeof pendingAt === 'string';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title="계정 삭제 요청" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: SETTINGS.left, paddingRight: SETTINGS.right, paddingTop: 32, paddingBottom: 49 }}
      >
        <Text className="text-[14px] font-normal text-black" style={{ lineHeight: 24 }}>
          기억온 계정과 관련 데이터의 삭제를 요청할 수 있어요. 요청이 접수되면 기억온 운영자가 본인 확인 후 처리하고,
          결과를 가입하신 이메일과 문의 답변으로 알려 드려요.
        </Text>

        <SectionLabel label="삭제되는 정보와 남는 정보" left={29} style={{ marginTop: 28 }} />
        <View style={{ ...CARD, marginTop: 13 }}>
          {ACCOUNT_DELETION_DATA_RULES.map((rule, i) => (
            <View key={rule.action} style={{ marginTop: i === 0 ? 0 : 16 }}>
              <Text className="text-[14px] font-semibold text-black" style={{ lineHeight: 22 }}>
                {rule.action}
              </Text>
              <Text className="text-[14px] font-normal text-black" style={{ lineHeight: 22 }}>
                {rule.items}
              </Text>
              <Text className="text-[13px] font-normal" style={{ lineHeight: 20, color: SETTINGS.muted }}>
                {rule.note}
              </Text>
            </View>
          ))}
        </View>

        <SectionLabel label="요청 상태" left={29} style={{ marginTop: 28 }} />
        <View style={{ ...CARD, marginTop: 13 }}>
          {pendingAt === undefined ? (
            <ActivityIndicator color={C.accent} accessibilityLabel="접수 상태 확인 중" />
          ) : (
            <Text className="text-[14px] font-normal text-black" style={{ lineHeight: 22 }}>
              {pending
                ? `${seoulDate(pendingAt)}에 접수된 요청을 처리하고 있어요.`
                : checkFailed
                  ? '접수 상태를 확인하지 못했어요. 요청을 보내면 중복 없이 접수돼요.'
                  : '접수된 요청이 없어요.'}
            </Text>
          )}
        </View>

        <Pressable
          onPress={confirm}
          disabled={sending || pending || pendingAt === undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: sending || pending || pendingAt === undefined, busy: sending }}
          className="items-center justify-center active:opacity-90"
          style={{
            marginTop: 28,
            height: 50,
            borderRadius: 5,
            backgroundColor: sending || pending || pendingAt === undefined ? C.accentPressed : C.accent,
          }}
        >
          <Text className="text-[15px] font-semibold text-white">
            {pending ? '요청 접수됨' : sending ? '보내는 중…' : '계정 삭제 요청 보내기'}
          </Text>
        </Pressable>

        {web ? (
          <Pressable onPress={() => void Linking.openURL(web)} accessibilityRole="link" hitSlop={8} style={{ marginTop: 20 }}>
            <Text className="text-[13px] font-normal text-center" style={{ lineHeight: 20, color: SETTINGS.muted, textDecorationLine: 'underline' }}>
              웹에서 안내 보기 · 앱 없이 요청하는 방법
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

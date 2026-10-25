// 대화 시작 전 (Figma `15:165`) — 로봇 마스코트 + 안내 + 시작하기/취소.
//
// Figma 실측(393×852):
//   로봇 195×124 @ (98, 185)
//   타이틀 SemiBold 28/42 검정 중앙 2줄 @ top 347 (이름 아래 주황 밑줄 71×4 @ (109, 378))
//   부제 Medium 20/40 #7b7c7c 중앙 @ top 490
//   시작하기 336×57 r10 #e9822b @ top 629 · 라벨 SemiBold 18/30 흰색
//   취소     336×57 r10 흰색+border #cccdce @ top 706 · 라벨 SemiBold 18/30 #7b7c7c
// 상태바는 실기기 상태바 사용(Figma 상태바 목업 미구현 — 사용자 확정).
// AI 이용 고지는 원본에 없지만 법·정책상 필수 → 배경/아이콘 없는 작은 회색 한 줄로 유지.
import { useRef, useState } from 'react';
import { Alert, ScrollView, View, Text, Pressable, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { recommendNextTopics } from '@giokon/core';
import type { SessionDesign } from '@giokon/core';
import { canProcessProfile } from '@giokon/data';
import { queryScope } from '../../src/lib/supabase';
import { RobotMascot } from '../../src/components/brand';
import { AiDisclosureBanner } from '../../src/components/banners';
import { useApp } from '../../src/store/appStore';
import { useElder, useChronicles, useDuePlannedFetcher } from '../../src/data/reads';
import { PLAN_UNAVAILABLE_ALERT, resolveStartPlan, START_FAILURE_ALERT } from '../../src/features/session/plannedStart';
import { useSessionPersistence } from '../../src/data/session-persistence';
import { VOICE_RELAY_MISSING_MESSAGE, voiceRelayUrl } from '../../src/lib/live/relay-config';
import { useContentWidth } from '../../src/lib/layout';

const FRAME_H = 852;

export default function SessionStart() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const chronicles = useChronicles(id);
  const fetchDuePlanned = useDuePlannedFetcher(id);
  const begin = useApp((s) => s.beginSession);
  const { openRemoteSession, adoptPlannedSession } = useSessionPersistence();
  const { width, height: windowHeight } = useWindowDimensions();
  const landscape = width > windowHeight;
  const height = landscape ? Math.max(FRAME_H, windowHeight) : windowHeight;
  // 버튼 폭 = 콘텐츠 폭(393 폭에서 Figma 336 — 기기 폭 대응).
  const { contentW } = useContentWidth();
  const lease = queryScope.capture();
  const starting = useRef(false);
  const [checkingConsent, setCheckingConsent] = useState(false);

  if (!elder || !id) {
    return <SafeAreaView className="flex-1 bg-white" />;
  }

  const onStart = async () => {
    if (starting.current) return;
    // 음성 경로는 중계 단일이다 — 중계 주소가 없는 빌드는 DB 세션을 만들기 전에 막는다.
    if (!voiceRelayUrl()) {
      Alert.alert('대화를 시작할 수 없어요', VOICE_RELAY_MISSING_MESSAGE);
      return;
    }
    starting.current = true;
    setCheckingConsent(true);
    try {
      // 시작 화면을 열어 둔 동안 철회되거나 Realtime을 놓친 경우도 재검증한다.
      const allowed = await canProcessProfile(id);
      if (!lease.current()) return;
      if (!allowed) {
        router.replace(`/consent/${id}`);
        return;
      }
      // 오늘의 설계는 여기서 새로 조회한 결과로만 정한다(T25.15) — 조회 실패를 '설계 없음'으로 보지 않는다.
      const plan = await resolveStartPlan(fetchDuePlanned);
      if (!lease.current()) return;
      if (plan.kind === 'unavailable') {
        Alert.alert(PLAN_UNAVAILABLE_ALERT.title, PLAN_UNAVAILABLE_ALERT.body);
        return;
      }
      await startSession(plan.kind === 'planned' ? plan.row : null);
    } catch {
      if (lease.current()) Alert.alert('동의 확인 실패', '동의와 이용 권한을 확인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      starting.current = false;
      setCheckingConsent(false);
    }
  };

  const startSession = async (duePlanned: Awaited<ReturnType<typeof fetchDuePlanned>>) => {
    // 웹 설계(planned) 채택 — 설계 값(goal/content/avoid_topics/keywords)이 그대로
    // 이번 대화의 진행 입력이 된다(B1-a·B1-b). 근거가 없는 필드는 넣지 않는다.
    let design: SessionDesign | undefined;
    let title: string;
    if (duePlanned) {
      design = {
        title: duePlanned.title ?? undefined,
        goal: duePlanned.goal ?? undefined,
        content: duePlanned.content ?? undefined,
        avoidTopics: duePlanned.avoid_topics ?? undefined,
        keywords: duePlanned.keywords && duePlanned.keywords.length > 0 ? duePlanned.keywords : undefined,
      };
      title = duePlanned.title ?? `${recommendNextTopics(elder, chronicles)[0] ?? '오늘'} 이야기`;
    } else {
      const topic = recommendNextTopics(elder, chronicles)[0] ?? '오늘';
      title = `${topic} 이야기`;
    }
    begin(elder, chronicles, { title, therapyType: 'reminiscence' }, design);
    const localSessionId = useApp.getState().active?.session.id;
    // 같은 행을 DB 시작 RPC 로 active 로 전환해 이어 쓴다(B1-c — 새 행을 만들지 않아 좀비 없음 · T25.11 — 진행자 = 나).
    // 즉석 시작이면 진행 중인 대화도 DB 에 남긴다 — 중간에 앱이 꺼져도 여기까지의 기록이 남고,
    // DB가 동의·권한·동시 진행 수를 승인해야 대화 화면과 음성을 시작한다.
    const failure = duePlanned
      ? await adoptPlannedSession(duePlanned.id)
      : await openRemoteSession();
    if (!lease.current()) return;
    if (useApp.getState().active?.session.id !== localSessionId) return;
    if (!useApp.getState().active?.remoteId) {
      useApp.getState().cancelSession();
      const alert = START_FAILURE_ALERT[failure ?? 'failed'];
      Alert.alert(alert.title, alert.body);
      // 동의가 없으면 동의 화면으로(시작 전 확인과 같은 흐름).
      if (failure === 'consent_required') router.replace(`/consent/${id}`);
      return;
    }
    router.replace('/session/talk');
  };

  const content = (
    <>
      {/* 로봇 마스코트 — Figma (98, 185) 195×124. 가로 가운데(393 폭에서 1px 차) — 왼쪽 좌표로 두면 기기 폭에 따라 쏠린다. */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (185 / FRAME_H) * height }}>
        <RobotMascot size={195} />
      </View>

      {/* 타이틀 — 이름에 주황 밑줄 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (347 / FRAME_H) * height }}>
        {/* 밑줄은 절대 배치 — 줄 높이에 영향을 주지 않아야 이름이 같은 줄에 정렬된다.
            lineHeight 42 안에서 28px 잉크의 아래쪽 여백이 커서, Figma 처럼 글자 바로
            아래(잉크 기준 4px)에 붙도록 bottom 을 잡는다. */}
        <View className="flex-row items-baseline">
          <View>
            {/* 밑줄을 **먼저** 선언한다 — Figma 는 글자가 밑줄 위에 그려진다. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                // Figma: 밑줄 71×4 @ y378 · 타이틀 박스 347..389 → 아래에서 7
                bottom: 7,
                height: 4,
                backgroundColor: '#e9822b',
              }}
            />
            <Text className="text-[28px] font-semibold text-black text-center" style={{ lineHeight: 42 }}>
              {elder.name}
            </Text>
          </View>
          <Text className="text-[28px] font-semibold text-black" style={{ lineHeight: 42 }}>
            {' '}
            어르신과
          </Text>
        </View>
        <Text className="text-[28px] font-semibold text-black text-center" style={{ lineHeight: 42 }}>
          회상 대화를 시작합니다.
        </Text>
      </View>

      {/* 부제 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (490 / FRAME_H) * height }}>
        <Text className="text-[20px] font-medium text-muted text-center" style={{ lineHeight: 40 }}>
          어르신께 기기를 전달해 주세요.
        </Text>
      </View>

      {/* 하단 버튼 — Figma: 시작하기 top629 / 취소 top706 (프레임 하단에서 166 / 89) */}
      <View className="absolute left-0 right-0 items-center" style={{ bottom: (89 / FRAME_H) * height }}>
        <View className="items-center" style={{ marginBottom: 10 }}>
          <AiDisclosureBanner />
        </View>
        <Pressable
          onPress={onStart}
          disabled={checkingConsent}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{ width: contentW, height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            시작하기
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-70"
          style={{
            width: contentW,
            height: 57,
            borderRadius: 10,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#cccdce',
            marginTop: 20,
          }}
        >
          <Text className="text-[18px] font-semibold text-muted" style={{ lineHeight: 30 }}>
            취소
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {landscape ? (
        <ScrollView className="flex-1" contentContainerStyle={{ height }}>
          {content}
        </ScrollView>
      ) : content}
    </SafeAreaView>
  );
}

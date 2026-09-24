// 대화 (Figma `17:108`) — X닫기 + AI 질문 카드 + 파형 + 자동 대화 제어.
//
// Figma 실측(393×852):
//   X 닫기 17×17 @ (347.7, 76)            ← 기존 구현은 "종료" 텍스트였다(수정)
//   질문 카드 336×258 r10 bg #fdf3ea **border #e9822b** @ (29, 121)
//     카드 내 로봇 46.5×29.5 @ (47,159) · 질문 SemiBold 28/50 검정 @ (104,148) w251
//     → 둘의 top 이 다르므로(로봇 38 / 텍스트 27, 카드 기준) flex-row 가 아니라 절대 배치한다
//   파형 226×78 @ (84, 419)
// 상태바는 실기기 상태바 사용. AI 고지는 배경 없는 작은 회색 한 줄로 유지(법·정책 필수).
//
// 음성 경로는 **중계 단일**이다(계획 M1, 2026-09-23). Figma 의 마이크 버튼·다시 듣기·
// "AI가 이렇게 이해했어요" 패널·질문 로딩 화면(`28:37`)은 매 턴 사람이 누르고 확인하던
// 직접 모드의 UI 라서 함께 지웠다. 지금은 요양보호사가 한 번 시작하면 중계가 청취·응답·
// 재생을 자동으로 이어 가고, 요양보호사는 멈추기·재개·회수만 한다.
// 중단된 청취의 부분 전사만 하단 패널에서 확인·수정·제외한다(자동 채택하지 않는다).
//
// 표시 모드 두 가지(계획 M2·M3·M4, 2026-09-24):
//   caregiver — 이 파일의 화면. 시작·멈추기·회수, 위기 배너(전화번호), 부분 전사 확인.
//   elder     — 요양보호사가 "자동 대화 시작"을 누르면 곧바로 넘어가는 어르신 화면
//               (src/features/session/ElderView). 요양보호사 UI 가 렌더되지 않는다.
//               '선생님' 버튼 → PIN 확인 → caregiver 로 돌아온다. 뒤로가기·스와이프는 막는다.
// 같은 라우트 안의 모드 전환으로 둔 이유: 자동 대화 컨트롤러(연결·마이크·재생)를 한 화면이
// 계속 소유해야 한다. 라우트를 나누면 두 화면이 컨트롤러 수명을 나눠 가져야 한다.
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, View, Text, Pressable, Image, TextInput, useWindowDimensions } from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Waveform } from '../../src/components/brand';
import { AiDisclosureBanner, CrisisBanner } from '../../src/components/banners';
import { closeLiveEngine } from '../../src/lib/live/engine';
import { ensureMicPermission } from '../../src/lib/live/mic';
import { useAutomaticConversation } from '../../src/lib/live/useAutomaticConversation';
import { useApp } from '../../src/store/appStore';
import { queryScope } from '../../src/lib/supabase';
import {
  useSessionPersistence,
  type SessionSaveResult,
} from '../../src/data/session-persistence';
import { useAuth } from '../../src/auth/AuthProvider';
import { hasCaregiverPin } from '../../src/features/session/caregiverPin';
import { CaregiverPinModal } from '../../src/features/session/CaregiverPinModal';
import { ElderView } from '../../src/features/session/ElderView';
import { QuestionCard } from '../../src/features/session/QuestionCard';
import iconClose from '../../assets/brand/icon-close.png';

const FRAME_H = 852;
/** Interrupted relay inputs retain the full storage allowance. */
const UTTERANCE_MAX = 4000;

export default function Talk() {
  const active = useApp((s) => s.active);
  const lease = queryScope.capture();
  const stillCurrent = () => lease.current() &&
    useApp.getState().active?.session.id === active?.session.id;
  const discard = useApp((s) => s.discardUtterance);
  const acknowledge = useApp((s) => s.acknowledgeSafety);
  const { finishAndPersist, retrySave, discardUnsaved, syncProgress } = useSessionPersistence();
  const automatic = useAutomaticConversation(active, syncProgress);
  const { height } = useWindowDimensions();
  const finishing = useRef(false);
  const { user } = useAuth();
  const [mode, setMode] = useState<'caregiver' | 'elder'>('caregiver');
  const [pinModal, setPinModal] = useState<'setup' | 'verify' | null>(null);
  const checkingPin = useRef(false);

  // 어르신 화면에서는 안드로이드 뒤로가기로 요양보호사 화면·이전 화면이 열리지 않게 한다.
  useEffect(() => {
    if (mode !== 'elder') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [mode]);

  const question = active?.currentQuestion;
  const pending = active?.pendingStt ?? null;
  // 부분 전사(pending)를 기준으로 편집 초안을 **파생**한다 — 사용자가 고친 내용은
  // 원본(base)과 함께 보관해, pending 이 바뀌면 자동으로 새 전사로 초기화된다.
  // (effect 로 동기 setState 하지 않기 위한 구조)
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  const draft = pending === null ? '' : edited?.base === pending ? edited.text : pending;
  const setDraft = (t: string) => {
    if (pending !== null) setEdited({ base: pending, text: t });
  };

  // 세션이 끝나 화면을 떠날 때 연결 정리(종료 경로는 endAndSave 에서 먼저 닫는다).
  useEffect(() => {
    if (!active && !finishing.current) void closeLiveEngine();
  }, [active]);

  useEffect(() => {
    if (!active && !finishing.current) router.replace('/main');
  }, [active]);

  if (!active) return <SafeAreaView className="flex-1 bg-white" />;

  // 저장 결과 처리 — 실패를 삼키고 "저장되었습니다" 화면으로 넘어가면 요양보호사가
  // 대화 전량이 사라진 걸 알 수 없다(감사 지적). 실패하면 재시도/포기를 묻는다.
  async function retryAndPresent() {
    presentResult(await retrySave());
  }

  function presentResult(res: SessionSaveResult) {
    if (!lease.current()) return;
    if (res.status !== 'failed') {
      router.replace(`/session/saved${res.logId ? `?logId=${res.logId}` : ''}`);
      return;
    }
    Alert.alert(
      '대화를 저장하지 못했어요',
      `${res.message}\n\n지금 나가면 이번 대화 기록이 사라집니다. 다시 시도해 주세요.`,
      [
        { text: '다시 시도', onPress: () => void retryAndPresent() },
        {
          text: '기록 없이 나가기',
          style: 'destructive',
          onPress: () => {
            if (!lease.current()) return;
            discardUnsaved();
            router.replace('/main');
          },
        },
      ],
      { cancelable: false },
    );
  }

  const endAndSave = async () => {
    if (!stillCurrent()) return;
    finishing.current = true;
    await automatic.stop();
    await closeLiveEngine();
    if (useApp.getState().active?.pendingStt != null) {
      finishing.current = false;
      return; // Resolve interrupted input explicitly before ending the session.
    }
    presentResult(await finishAndPersist());
  };

  const showCrisis = active.safety.caregiverAlert && !active.safety.acknowledged;

  const handOver = () => {
    setMode('elder');
    if (automatic.phase === 'idle') void automatic.start();
  };

  /**
   * 시작과 동시에 어르신 화면으로. 넘기기 전에 요양보호사 화면에서 끝낼 것:
   * ① 마이크 권한(OS 권한 창이 어르신 화면 위에 뜨지 않게) ② PIN(없으면 먼저 정한다 — 복귀 게이트).
   */
  const startAndHandOver = async () => {
    if (checkingPin.current || !user?.id) return;
    checkingPin.current = true;
    try {
      if (!await ensureMicPermission()) {
        Alert.alert('마이크 권한', '어르신 말씀을 듣기 위해 마이크 권한이 필요해요.\n설정에서 허용해 주세요.');
        return;
      }
      if (!stillCurrent()) return;
      if (await hasCaregiverPin(user.id)) handOver();
      else setPinModal('setup');
    } catch {
      Alert.alert('시작 준비를 확인하지 못했어요', '마이크 권한이나 기기 보안 저장소(PIN)를 확인하지 못해 어르신 화면으로 넘길 수 없어요. 앱을 다시 연 뒤 시도해 주세요.');
    } finally {
      checkingPin.current = false;
    }
  };

  const pinGate = user?.id ? (
    <CaregiverPinModal
      visible={pinModal !== null}
      mode={pinModal ?? 'verify'}
      userId={user.id}
      onDone={() => {
        const was = pinModal;
        setPinModal(null);
        if (was === 'setup') handOver();
        else setMode('caregiver');
      }}
      onCancel={() => setPinModal(null)}
    />
  ) : null;

  if (mode === 'elder') {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <ElderView question={question ?? ''} phase={automatic.phase} onCaregiver={() => setPinModal('verify')} />
        {pinGate}
      </>
    );
  }

  const inConversation = !['idle', 'stopped'].includes(automatic.phase);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <Stack.Screen options={{ gestureEnabled: true }} />
      {pinGate}
      {/* 진행 중이면 다시 어르신 화면으로 넘길 수 있다(X 반대편, 같은 높이). */}
      {inConversation ? (
        <View className="absolute left-[20px]" style={{ top: (64 / FRAME_H) * height, zIndex: 10 }}>
          <Pressable
            onPress={handOver}
            accessibilityRole="button"
            className="items-center justify-center active:opacity-60"
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cccdce' }}
          >
            <Text className="text-[14px] font-semibold" style={{ color: '#7b7c7c', lineHeight: 20 }}>어르신 화면으로</Text>
          </Pressable>
        </View>
      ) : null}

      {/* X 닫기 — Figma 17×17 @ (347.7, 76) */}
      <View className="absolute right-[28px]" style={{ top: (76 / FRAME_H) * height, zIndex: 10 }}>
        <Pressable onPress={endAndSave} accessibilityRole="button" accessibilityLabel="대화 종료" hitSlop={16}>
          <Image source={iconClose} style={{ width: 17, height: 17 }} resizeMode="contain" />
        </Pressable>
      </View>

      {/* 위기·관찰 배너(요양보호사) */}
      {showCrisis && active.safety.level ? (
        <View className="absolute left-[28px] right-[28px]" style={{ top: (100 / FRAME_H) * height, zIndex: 20 }}>
          <CrisisBanner
            message={active.safety.caregiverAlert as string}
            level={active.safety.level}
            onAcknowledge={() => {
              acknowledge();
              // 확인 시각을 safety_events 에 반영한다(웹 안전 알림 대시보드와 동기).
              void syncProgress();
            }}
          />
        </View>
      ) : null}

      {/* AI 질문 카드 — Figma 336×min258 (src/features/session/QuestionCard) */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (121 / FRAME_H) * height }}>
        <QuestionCard question={question ?? ''} placeholder="대화를 시작하면 첫 질문이 여기에 나와요." />
      </View>

      {/* 파형 — 청취·재생 중에만 움직인다 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (419 / FRAME_H) * height }}>
        <Waveform active={automatic.phase === 'listening' || automatic.phase === 'speaking'} width={226} />
      </View>

      {/* 자동 대화 제어 + 상태 라벨 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (536 / FRAME_H) * height }}>
        <Pressable
          onPress={automatic.phase === 'idle' ? () => void startAndHandOver() : endAndSave}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{ width: 336, minHeight: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            {automatic.phase === 'idle' ? '자동 대화 시작' : '대화 회수·저장'}
          </Text>
        </Pressable>
        {!['idle','stopped'].includes(automatic.phase) && (
          <Pressable
            onPress={() => void (automatic.phase === 'paused' ? automatic.resume() : automatic.pause())}
            disabled={automatic.phase === 'pausing' || (automatic.phase === 'paused' && pending !== null)}
            accessibilityRole="button"
            accessibilityState={{ disabled: automatic.phase === 'pausing' || (automatic.phase === 'paused' && pending !== null) }}
            className="items-center justify-center active:opacity-70"
            style={{ width: 336, minHeight: 48, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#cccdce' }}
          >
            <Text className="text-[18px] font-semibold text-black" style={{ lineHeight: 28 }}>
              {automatic.phase === 'paused' ? '대화 재개' : automatic.phase === 'pausing' ? '일시정지 중…' : '잠시 멈추기'}
            </Text>
          </Pressable>
        )}
        <Text className="text-[18px] font-medium text-black text-center" accessibilityLiveRegion="polite"
          style={{ lineHeight: 28, marginTop: 8, width: 336 }}>
          {automatic.reason ?? ({idle:'담당자가 시작하면 대화가 자동으로 이어져요.', starting:'대화를 준비하고 있어요.',
            listening:'말씀해 주세요.', processing:'말씀을 기록하고 응답을 준비하고 있어요.', speaking:'듣고 있어요...',
            pausing:'음성을 멈추고 있어요.', paused:'대화를 잠시 멈췄어요.',
            stopped:'대화를 멈췄어요. 기록을 저장해 주세요.'}[automatic.phase])}
        </Text>
      </View>

      <View className="absolute left-0 right-0 items-center" style={{ top: (743 / FRAME_H) * height }}><AiDisclosureBanner /></View>

      {/* 중단된 청취의 부분 전사 — 담당자가 확인·수정하거나 제외한다(자동 채택 금지) */}
      {pending !== null ? (
        <View
          className="absolute left-0 right-0 bottom-0 bg-white"
          style={{ paddingHorizontal: 28.5, paddingTop: 16, paddingBottom: 24, boxShadow: '0px -2px 12px rgba(0,0,0,0.12)' }}
        >
          <Text className="text-[18px] font-semibold text-ink" style={{ lineHeight: 30 }}>
            중단 전 인식된 말씀을 확인해 주세요.
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cccdce',
              borderRadius: 10,
              backgroundColor: '#ffffff',
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 30,
              marginTop: 10,
            }}
          >
            <TextInput
              className="text-[17px] text-ink font-normal"
              value={draft}
              onChangeText={(t) => {
                if (t.length <= UTTERANCE_MAX) setDraft(t);
              }}
              multiline
              placeholder="어르신 말씀을 확인·수정해 주세요"
              placeholderTextColor="#7b7c7c"
              style={{ minHeight: 72, maxHeight: 160, textAlignVertical: 'top' }}
            />
            {/* 카운터는 텍스트 박스 **안** 우측 하단(Figma 동일) */}
            <Text
              className="text-[13px] text-muted font-normal"
              style={{ position: 'absolute', right: 12, bottom: 8 }}
            >
              {draft.length}/{UTTERANCE_MAX}
            </Text>
          </View>

          <View className="flex-row" style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => {
                discard();
                setEdited(null);
              }}
              accessibilityRole="button"
              className="flex-1 items-center justify-center active:opacity-70"
              style={{ height: 57, borderRadius: 10, borderWidth: 1, borderColor: '#cccdce', marginRight: 10 }}
            >
              <Text className="text-[18px] font-semibold text-muted" style={{ lineHeight: 30 }}>
                이 입력 제외
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (useApp.getState().confirmRecoveredInput(draft)) {
                  setEdited(null);
                  if (automatic.phase !== 'paused') void endAndSave();
                }
              }}
              disabled={!draft.trim()}
              accessibilityRole="button"
              className="flex-1 items-center justify-center active:opacity-90"
              style={{ height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
            >
              <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
                {automatic.phase === 'paused' ? '입력 확인' : '확인 후 저장'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

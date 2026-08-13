// 대화 (Figma `17:108`) — X닫기 + AI 질문 카드 + 파형 + 마이크 + 다시 듣기.
//
// Figma 실측(393×852):
//   X 닫기 17×17 @ (347.7, 76)            ← 기존 구현은 "종료" 텍스트였다(수정)
//   질문 카드 336×258 r10 bg #fdf3ea **border #e9822b** @ top 121
//     카드 내 로봇 46.4×29.5 @ (47,159) · 질문 SemiBold 28/50 검정, 좌측정렬 @ (104,148) w251
//   파형 226×78 @ (84, 419)
//   마이크 123×123 정사각 @ (135, 536) · 라벨 "듣고 있어요..." Medium 23/42 검정 @ gap 3
//   다시 듣기 336×57 r10 border #cccdce @ (26, 743) — 스피커 20×20 + SemiBold 18/30 #7b7c7c
//     ← 기존 구현은 🔊 이모지였다(수정)
// 상태바는 실기기 상태바 사용. AI 고지는 배경 없는 작은 회색 한 줄로 유지(법·정책 필수).
//
// 흐름(사용자 지적 반영): 마이크를 눌러도 **다른 페이지로 이동하지 않는다**. 인식이 끝나면
// 화면 하단에 인식된 텍스트가 인라인으로 나타나고, 거기서 확인·수정한다.
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, TextInput, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicButton, RobotInline, Waveform, type MicState } from '../../src/components/brand';
import { AiDisclosureBanner, CrisisBanner } from '../../src/components/banners';
import { ExpoSpeechProvider } from '../../src/lib/speech';
import { useApp } from '../../src/store/appStore';
import { useSessionPersistence } from '../../src/data/session-persistence';
import iconClose from '../../assets/brand/icon-close.png';
import iconSpeaker from '../../assets/brand/icon-speaker.png';

const FRAME_H = 852;
/** 어르신 발화 입력 길이 상한(Figma 대화 수정 화면의 200자 카운터와 동일). */
const UTTERANCE_MAX = 200;

export default function Talk() {
  const active = useApp((s) => s.active);
  const capture = useApp((s) => s.captureUtterance);
  const confirm = useApp((s) => s.confirmUtterance);
  const discard = useApp((s) => s.discardUtterance);
  const acknowledge = useApp((s) => s.acknowledgeSafety);
  const { finishAndPersist } = useSessionPersistence();
  const { height } = useWindowDimensions();
  const finishing = useRef(false);

  const question = active?.currentQuestion;
  const pending = active?.pendingStt ?? null;
  // 인식 결과(pending)를 기준으로 편집 초안을 **파생**한다 — 사용자가 고친 내용은
  // 원본(base)과 함께 보관해, pending 이 바뀌면 자동으로 새 인식문으로 초기화된다.
  // (effect 로 동기 setState 하지 않기 위한 구조)
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  const draft = pending === null ? '' : edited?.base === pending ? edited.text : pending;
  const setDraft = (t: string) => {
    if (pending !== null) setEdited({ base: pending, text: t });
  };

  // 재생 완료한 질문을 기록하고 speaking 은 **파생**한다(effect 내 동기 setState 회피 —
  // 동기 setState 는 연쇄 렌더를 유발한다).
  const [spokenDone, setSpokenDone] = useState<string | null>(null);
  const speaking = Boolean(question) && spokenDone !== question;

  // AI 질문 자동 재생(노인 대상: 느린 속도). 재생 중에는 마이크를 잠근다.
  useEffect(() => {
    if (!question) return;
    let alive = true;
    void ExpoSpeechProvider.speak(question).finally(() => {
      if (alive) setSpokenDone(question);
    });
    return () => {
      alive = false;
      ExpoSpeechProvider.cancelSpeak();
    };
  }, [question]);

  useEffect(() => {
    if (!active && !finishing.current) router.replace('/main');
  }, [active]);

  if (!active) return <SafeAreaView className="flex-1 bg-white" />;

  const endAndSave = async () => {
    finishing.current = true;
    ExpoSpeechProvider.cancelSpeak();
    const logId = await finishAndPersist();
    router.replace(`/session/saved${logId ? `?logId=${logId}` : ''}`);
  };

  const onMic = () => {
    ExpoSpeechProvider.cancelSpeak();
    capture(); // 인식 시작 → pendingStt 채워지면 하단 인라인 패널 표시
  };

  const micState: MicState = speaking
    ? 'speaking'
    : pending !== null
      ? 'processing'
      : active.phase === 'processing'
        ? 'processing'
        : 'ready';

  const showCrisis = active.safety.caregiverAlert && !active.safety.acknowledged;
  const shouldEnd = active.safety.recommendation === 'end_session';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
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
            onAcknowledge={acknowledge}
          />
        </View>
      ) : null}

      {/* AI 질문 카드 — 주황 테두리 + 인라인 로봇 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (121 / FRAME_H) * height }}>
        <View
          style={{
            width: 336,
            height: 258,
            borderRadius: 10,
            backgroundColor: '#fdf3ea',
            borderWidth: 1,
            borderColor: '#e9822b',
            paddingTop: 38,
            paddingLeft: 21,
            paddingRight: 21,
          }}
        >
          <View className="flex-row">
            <RobotInline size={46} />
            <Text
              className="flex-1 text-[28px] font-semibold text-black"
              style={{ lineHeight: 50, marginLeft: 11 }}
            >
              {question}
            </Text>
          </View>
        </View>
      </View>

      {/* 파형 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (419 / FRAME_H) * height }}>
        <Waveform active={!shouldEnd && pending === null} width={226} />
      </View>

      {/* 마이크 + 상태 라벨 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (536 / FRAME_H) * height }}>
        {shouldEnd ? (
          <Pressable
            onPress={endAndSave}
            accessibilityRole="button"
            className="items-center justify-center active:opacity-90"
            style={{ width: 336, height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
          >
            <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
              대화 마무리하기
            </Text>
          </Pressable>
        ) : (
          <>
            <MicButton onPress={onMic} state={micState} size={123} />
            <Text
              className="text-[23px] font-medium text-black text-center"
              style={{ lineHeight: 42, marginTop: 3 }}
            >
              {micState === 'speaking'
                ? '잠시만 기다려 주세요...'
                : micState === 'processing'
                  ? '말씀을 정리하고 있어요...'
                  : '듣고 있어요...'}
            </Text>
          </>
        )}
      </View>

      {/* 다시 듣기 */}
      {!shouldEnd && pending === null ? (
        <View className="absolute left-0 right-0 items-center" style={{ top: (743 / FRAME_H) * height }}>
          <AiDisclosureBanner />
          <Pressable
            onPress={() => question && ExpoSpeechProvider.speak(question)}
            accessibilityRole="button"
            className="flex-row items-center justify-center active:opacity-70"
            style={{
              width: 336,
              height: 57,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cccdce',
              marginTop: 4,
            }}
          >
            <Image source={iconSpeaker} style={{ width: 20, height: 20 }} resizeMode="contain" />
            <Text className="text-[18px] font-semibold text-muted" style={{ lineHeight: 30, marginLeft: 8 }}>
              다시 듣기
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 인식 결과 인라인 확인·수정 — 페이지 이동 없이 하단에 나타난다 */}
      {pending !== null ? (
        <View
          className="absolute left-0 right-0 bottom-0 bg-white"
          style={{ paddingHorizontal: 28.5, paddingTop: 16, paddingBottom: 24, boxShadow: '0px -2px 12px rgba(0,0,0,0.12)' }}
        >
          <Text className="text-[18px] font-semibold text-ink" style={{ lineHeight: 30 }}>
            AI가 이렇게 이해했어요.
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
              value={draft}
              onChangeText={(t) => setDraft(t.slice(0, UTTERANCE_MAX))}
              multiline
              placeholder="어르신 말씀을 확인·수정해 주세요"
              placeholderTextColor="#7b7c7c"
              className="text-[17px] text-ink font-normal"
              style={{ minHeight: 72, textAlignVertical: 'top' }}
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
                다시 말하기
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                confirm(draft.trim() || (pending ?? ''));
                setEdited(null);
                // 다음 질문 생성 대기 화면(Figma `28:37`)을 거쳐 대화로 돌아온다.
                router.push('/session/loading');
              }}
              accessibilityRole="button"
              className="flex-1 items-center justify-center active:opacity-90"
              style={{ height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
            >
              <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
                저장
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// 대화 (Figma `17:108`) — X닫기 + AI 질문 카드 + 파형 + 마이크 + 다시 듣기.
//
// Figma 실측(393×852):
//   X 닫기 17×17 @ (347.7, 76)            ← 기존 구현은 "종료" 텍스트였다(수정)
//   질문 카드 336×258 r10 bg #fdf3ea **border #e9822b** @ (29, 121)
//     카드 내 로봇 46.5×29.5 @ (47,159) · 질문 SemiBold 28/50 검정 @ (104,148) w251
//     → 둘의 top 이 다르므로(로봇 38 / 텍스트 27, 카드 기준) flex-row 가 아니라 절대 배치한다
//   파형 226×78 @ (84, 419)
//   마이크 123×123 정사각 @ (135, 536) · 라벨 "듣고 있어요..." Medium 23/42 검정 @ gap 3
//   다시 듣기 336×57 r10 border #cccdce @ (26, 743) — 스피커 20×20 + SemiBold 18/30 #7b7c7c
//     ← 기존 구현은 🔊 이모지였다(수정)
// 상태바는 실기기 상태바 사용. AI 고지는 배경 없는 작은 회색 한 줄로 유지(법·정책 필수).
//
// 흐름(사용자 지적 반영): 마이크를 눌러도 **다른 페이지로 이동하지 않는다**. 인식이 끝나면
// 화면 하단에 인식된 텍스트가 인라인으로 나타나고, 거기서 확인·수정한다.
import { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, Image, TextInput, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessUtterance } from '@giokon/core';
import { MicButton, RobotInline, Waveform, type MicState } from '../../src/components/brand';
import { AiDisclosureBanner, CrisisBanner } from '../../src/components/banners';
import { ExpoSpeechProvider } from '../../src/lib/speech';
import {
  acquireLiveEngine,
  closeLiveEngine,
  peekLiveEngine,
} from '../../src/lib/live/engine';
import { useApp } from '../../src/store/appStore';
import {
  useSessionPersistence,
  type SessionSaveResult,
} from '../../src/data/session-persistence';
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
  const { finishAndPersist, retrySave, discardUnsaved, syncProgress } = useSessionPersistence();
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
  // "다시 듣기" 3상태(기본 / 누르는 중 / 재생 중)
  const [replaying, setReplaying] = useState(false);
  const [replayPressed, setReplayPressed] = useState(false);
  const speaking = Boolean(question) && spokenDone !== question;

  // ── Gemini Live 모드(A1·A2·A3 통합 해소) ──────────────────────────────────────
  // 질문 텍스트 → 모델 음성 그대로 재생, 어르신 발화 → 실시간 전사(확인·수정 패널),
  // 확정 텍스트만 모델로 전달. 미가용(키 미설정·네트워크·네이티브 모듈 부재)이면
  // 기존 파이프라인(expo-speech + 타자/모의 입력)으로 조용히 폴백한다.
  const liveAudioChunks = useRef<Map<string, string[]>>(new Map());
  const [liveListening, setLiveListening] = useState(false);

  useEffect(() => {
    if (!active) return;
    const key = `${active.elder.id}:${active.startedAt}`;
    let cancelled = false;
    void (async () => {
      const engine = await acquireLiveEngine(key, active.elder, active.chronicles, active.design, {
        onDraftFinal: (t) => {
          setLiveListening(false);
          useApp.getState().setPendingStt(t);
        },
        onError: () => {},
      });
      if (!engine || cancelled) return;
      // 오프너 교체 — 로컬 규칙 질문을 Live 모델의 인사로 바꾼다(세션당 1회).
      if (active.turns.length === 1 && useApp.getState().active?.phase === 'ai_speaking') {
        const res = await engine.requestOpener();
        if (cancelled || !res?.text) return;
        if (res.audioChunksB64.length > 0) liveAudioChunks.current.set(res.text, res.audioChunksB64);
        else liveAudioChunks.current.delete(res.text);
        useApp.getState().overrideQuestion(res.text);
        void (async () => {
          try {
            await engine.playTurn(res.audioChunksB64);
          } finally {
            setSpokenDone(res.text);
          }
        })();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세션 시작 시점 1회 초기화
  }, []);

  // 세션이 끝나 화면을 떠날 때 연결 정리(종료 경로는 endAndSave 에서 먼저 닫는다).
  useEffect(() => {
    if (!active && !finishing.current) void closeLiveEngine();
  }, [active]);

  // AI 질문 자동 재생. Live 오디오가 있는 질문은 **엔진이 재생을 주도**하므로
  // expo-speech 를 건드리지 않는다(이펙트는 speaking 파생만 유지).
  useEffect(() => {
    if (!question) return;
    if (liveAudioChunks.current.has(question)) return;
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

  // 저장 결과 처리 — 실패를 삼키고 "저장되었습니다" 화면으로 넘어가면 요양보호사가
  // 대화 전량이 사라진 걸 알 수 없다(감사 지적). 실패하면 재시도/포기를 묻는다.
  async function retryAndPresent() {
    presentResult(await retrySave());
  }

  function presentResult(res: SessionSaveResult) {
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
            discardUnsaved();
            router.replace('/main');
          },
        },
      ],
      { cancelable: false },
    );
  }

  const endAndSave = async () => {
    finishing.current = true;
    ExpoSpeechProvider.cancelSpeak();
    await closeLiveEngine();
    presentResult(await finishAndPersist());
  };

  const onMic = () => {
    const engine = peekLiveEngine();
    if (engine?.available) {
      // Live 모드: 마이크 토글 — 누르면 청취 시작(실시간 전사), 다시 누르거나
      // 발화가 잠깐 멈추면 청취 종료 → 확인·수정 패널로 넘어간다.
      if (engine.isListening) {
        engine.stopListening(); // onDraftFinal 콜백이 패널을 연다
        setLiveListening(false);
      } else {
        ExpoSpeechProvider.cancelSpeak();
        engine.startListening();
        setLiveListening(true);
      }
      return;
    }
    // 폴백 파이프라인(기존 동작)
    ExpoSpeechProvider.cancelSpeak();
    capture(); // 인식 시작 → pendingStt 채워지면 하단 인라인 패널 표시
  };

  /** 저장 확정 — Live 모드에선 위기가 아닌 한 모델 응답을 이번 AI 발화로 채택한다. */
  async function handleConfirm() {
    const finalText = draft.trim() || (pending ?? '');
    const engine = peekLiveEngine();
    let livePayload: { question: string } | undefined;
    if (engine?.available && finalText) {
      // ⚠️ 위기 발화는 모델에 **보내지 않는다** — 로컬 안전 응답·에스컬레이션이 우선.
      const isCrisis = assessUtterance(finalText).situation === 'crisis';
      if (!isCrisis) {
        const res = await engine.submitUserTurn(finalText);
        if (res?.text) livePayload = { question: res.text };
        if (res && res.chunksB64.length > 0) {
          liveAudioChunks.current.set(res.text, res.chunksB64);
        }
      }
    }
    confirm(finalText, livePayload);
    setEdited(null);
    setLiveListening(false);
    if (livePayload) {
      const q = livePayload.question;
      const chunks = liveAudioChunks.current.get(q) ?? [];
      void (async () => {
        try {
          await engine?.playTurn(chunks);
        } finally {
          setSpokenDone(q);
        }
      })();
    }
    // 확정된 턴을 곧바로 DB 에 남긴다(진행 중 저장). 실패해도 대화는 막지 않고
    // 다음 턴·종료 때 다시 시도한다.
    void syncProgress();
    // 다음 질문 생성 대기 화면(Figma `28:37`)을 거쳐 대화로 돌아온다.
    router.push('/session/loading');
  }

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
            onAcknowledge={() => {
              acknowledge();
              // 확인 시각을 safety_events 에 반영한다(웹 안전 알림 대시보드와 동기).
              void syncProgress();
            }}
          />
        </View>
      ) : null}

      {/*
       * AI 질문 카드 — 주황 테두리 + 인라인 로봇.
       *
       * Figma 는 카드를 336×258 로 고정했지만 그 안의 질문은 자리표시자(짧은 한 문장)다.
       * 실제 AI 질문은 길이가 제각각이라 고정 높이면 글자가 카드를 넘쳐 나갔다
       * (사용자 지적 2026-08-13). Figma 높이는 **최소 높이**로 두고 길면 늘어나게 한다.
       * 질문도 absolute 대신 흐름 배치로 두어야 카드가 함께 커진다 —
       * 좌표(로봇 18/38 · 질문 75.25/27 w251)는 padding·마진으로 같게 유지한다.
       */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (121 / FRAME_H) * height }}>
        <View
          className="flex-row"
          style={{
            width: 336,
            minHeight: 258,
            borderRadius: 10,
            backgroundColor: '#fdf3ea',
            borderWidth: 1,
            borderColor: '#e9822b',
            paddingTop: 26,
            paddingBottom: 26,
          }}
        >
          <View style={{ marginLeft: 17, marginTop: 11 }}>
            <RobotInline size={46.5} />
          </View>
          <Text
            className="text-[28px] font-semibold text-black"
            style={{ marginLeft: 10.75, width: 251, lineHeight: 50 }}
          >
            {question}
          </Text>
        </View>
      </View>

      {/* 파형 — 청취 중(라이브)엔 항상 움직인다 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (419 / FRAME_H) * height }}>
        <Waveform active={!shouldEnd && (pending === null || liveListening)} width={226} />
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
              {/*
               * Figma `Frame 5` 의 짝: 회색 마이크 ↔ "듣고 있어요..."(어르신이 AI 안내
               * 음성을 듣는 중) · 주황 마이크 ↔ "말씀해 주세요."(TTS 가 끝나 말할 차례).
               */}
              {micState === 'speaking'
                ? '듣고 있어요...'
                : micState === 'processing'
                  ? '말씀을 정리하고 있어요...'
                  : '말씀해 주세요.'}
            </Text>
          </>
        )}
      </View>

      {/* 다시 듣기 */}
      {!shouldEnd && pending === null ? (
        <View className="absolute left-0 right-0 items-center" style={{ top: (743 / FRAME_H) * height }}>
          <AiDisclosureBanner />
          {/*
           * 다시 듣기 3상태(Figma `Frame 3` 실측):
           *   기본     흰 바탕 · 테두리 #cccdce · 라벨 #7b7c7c
           *   누르는 중 rgba(233,130,43,0.10) 바탕 · 테두리 #e9822b · 라벨 흰색
           *   재생 중   #e9822b 채움 · 라벨 흰색
           * 라벨은 이미지로 굽지 않고 텍스트로 둔다 — 어르신 대상 글자 확대·스크린리더가
           * 살아 있어야 한다(색·치수는 위 실측 그대로).
           */}
          <Pressable
            onPress={async () => {
              if (!question || replaying) return;
              setReplaying(true);
              try {
                // Live 오디오가 있으면 원음 그대로, 없으면 기기 TTS로 읽는다.
                const chunks = liveAudioChunks.current.get(question);
                if (chunks && chunks.length > 0) {
                  await peekLiveEngine()?.playTurn(chunks);
                  if (!peekLiveEngine()) return;
                } else {
                  await ExpoSpeechProvider.speak(question);
                }
              } finally {
                setReplaying(false);
              }
            }}
            onPressIn={() => setReplayPressed(true)}
            onPressOut={() => setReplayPressed(false)}
            accessibilityRole="button"
            accessibilityLabel="다시 듣기"
            accessibilityState={{ busy: replaying }}
            className="flex-row items-center justify-center"
            style={{
              width: 336,
              height: 57,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: replaying || replayPressed ? '#e9822b' : '#cccdce',
              backgroundColor: replaying
                ? '#e9822b'
                : replayPressed
                  ? 'rgba(233,130,43,0.10)'
                  : '#ffffff',
              marginTop: 4,
            }}
          >
            <Image
              source={iconSpeaker}
              style={{ width: 20, height: 20, tintColor: replaying || replayPressed ? '#ffffff' : undefined }}
              resizeMode="contain"
            />
            <Text
              className="text-[18px] font-semibold"
              style={{
                lineHeight: 30,
                marginLeft: 8,
                color: replaying || replayPressed ? '#ffffff' : '#7b7c7c',
              }}
            >
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
                void handleConfirm();
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

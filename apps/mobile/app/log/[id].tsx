// 대화 기록 (Figma `28:129`, 프레임 393×1035) — 대화 전문 말풍선 + 하단 재생바·분석 결과.
//
// Figma 실측:
//   헤더 0..114 (뒤로 @(29,74) · "대화 기록" Medium 18/30 @top71)
//   날짜 제목 SemiBold 18/30 @(27,133)
//   메시지 목록 첫 버블 top 178, 버블 간격 30
//     AI:     아바타 37 원형 @left29 · 버블 left 79 흰색 r14 + 그림자 1 1 8 rgba(106,106,106,.25)
//             텍스트 Regular 14/24 검정, padding 19/12 · 시간 Regular 11 #7b7c7c (버블 우측 9)
//     어르신: 아바타 37 원형(사진) @right29 · 버블 right 79 #e9822b r14
//             텍스트 Regular 14/24 흰색, padding 17/12 · 시간은 버블 좌측 9
//   하단 패널 393×200 @top835 흰색 + 위쪽 그림자
//     재생바 336×57 r10 border #cccdce @(29,861)
//       재생 36 @(47,872) · 노브 12 @(98,884) · 트랙 158×4 #d9d9d9 @(103,888) ·
//       시간 Regular 12 #7b7c7c @(276,875)
//     분석 결과 336×57 r10 #e9822b @(28,941) · 라벨 SemiBold 18/30 흰색
//
// ⚠️ 세션 음성 녹음·저장은 아직 구현 범위가 아니다(동의·보관정책 필요). Figma 의
//    "00:00 / 12:31" 은 자리표시자이므로 값을 만들지 않고 **녹음 없음 상태**로 표시한다.
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initial, type ConversationTurn } from '@giokon/core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useAnalysis, useElder, useLog } from '../../src/data/reads';
import { useElderPhotoUrl } from '../../src/data/elder-photo';
import { longKoreanDate } from '../../src/lib/format';
import avatarAi from '../../assets/brand/avatar-ai.png';
import btnPlay from '../../assets/brand/btn-play.png';

const CONTENT_LEFT = 29;
/** 버블 최대 폭(Figma 실측: AI 226 / 어르신 206 — 아바타·시간 자리를 뺀 값). */
const MAX_AI = 226;
const MAX_ELDER = 206;

function hhmm(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const hr = h % 12 || 12;
  return `${ampm} ${hr}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function TimeLabel({ text, side }: { text: string; side: 'left' | 'right' }) {
  return (
    <Text
      className="text-[11px] font-normal text-muted"
      style={{ lineHeight: 20, marginBottom: 3, marginLeft: side === 'right' ? 9 : 0, marginRight: side === 'left' ? 9 : 0 }}
    >
      {text}
    </Text>
  );
}

function AiBubble({ turn }: { turn: ConversationTurn }) {
  return (
    <View className="flex-row items-end" style={{ marginBottom: 30 }}>
      <Image
        source={avatarAi}
        style={{ width: 37, height: 37, alignSelf: 'flex-start' }}
        resizeMode="contain"
        accessibilityLabel="AI"
      />
      <View
        style={{
          maxWidth: MAX_AI,
          borderRadius: 14,
          backgroundColor: '#ffffff',
          paddingHorizontal: 19,
          paddingVertical: 12,
          marginLeft: 13,
          // Figma: 1px 1px 8px rgba(106,106,106,0.25) — Android elevation 미사용.
          boxShadow: '1px 1px 8px rgba(106,106,106,0.25)',
        }}
      >
        <Text className="text-[14px] font-normal text-black" style={{ lineHeight: 24 }}>
          {turn.text}
        </Text>
      </View>
      <TimeLabel text={hhmm(turn.timestamp)} side="right" />
    </View>
  );
}

function ElderBubble({
  turn,
  photoUrl,
  name,
  avatarColor,
}: {
  turn: ConversationTurn;
  photoUrl: string | null;
  name: string;
  avatarColor: string;
}) {
  return (
    <View className="flex-row items-end justify-end" style={{ marginBottom: 30 }}>
      <TimeLabel text={hhmm(turn.timestamp)} side="left" />
      <View
        style={{
          maxWidth: MAX_ELDER,
          borderRadius: 14,
          backgroundColor: '#e9822b',
          paddingHorizontal: 17,
          paddingVertical: 12,
        }}
      >
        <Text className="text-[14px] font-normal text-white" style={{ lineHeight: 24 }}>
          {turn.text}
        </Text>
      </View>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: 37, height: 37, borderRadius: 18.5, marginLeft: 13, alignSelf: 'flex-start' }}
          resizeMode="cover"
          accessibilityLabel={`${name} 어르신`}
        />
      ) : (
        <View
          style={{
            width: 37,
            height: 37,
            borderRadius: 18.5,
            marginLeft: 13,
            alignSelf: 'flex-start',
            backgroundColor: avatarColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="text-[15px] font-bold text-white">{initial(name)}</Text>
        </View>
      )}
    </View>
  );
}

export default function LogTranscript() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const log = useLog(id);
  const analysis = useAnalysis(id);
  const elder = useElder(log?.elderId);
  const photoUrl = useElderPhotoUrl(elder?.photoPath);

  if (!log || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <ScreenHeader title="대화 기록" />
        <Text className="text-[18px] font-normal text-muted text-center" style={{ marginTop: 60 }}>
          기록을 찾을 수 없어요.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title="대화 기록" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: CONTENT_LEFT, paddingTop: 19, paddingBottom: 8 }}
      >
        <Text className="text-[18px] font-semibold text-black" style={{ lineHeight: 30, marginLeft: -2 }}>
          {longKoreanDate(log.startedAt)}
        </Text>
        <View style={{ marginTop: 15 }}>
          {log.turns.map((t) =>
            t.speaker === 'AI' ? (
              <AiBubble key={t.id} turn={t} />
            ) : (
              <ElderBubble
                key={t.id}
                turn={t}
                photoUrl={photoUrl}
                name={elder?.name ?? ''}
                avatarColor={elder?.avatarColor ?? '#e9822b'}
              />
            ),
          )}
        </View>
      </ScrollView>

      {/* 하단 패널 — 재생바 + 분석 결과 */}
      <View
        className="bg-white"
        style={{ height: 200, paddingTop: 26, boxShadow: '0px -2px 10px rgba(108,101,101,0.13)' }}
      >
        {/* 재생바: 세션 음성 저장이 아직 없어 '녹음 없음' 상태로 둔다(값을 만들지 않는다) */}
        <View
          className="flex-row items-center"
          style={{
            width: 336,
            height: 57,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#cccdce',
            marginLeft: CONTENT_LEFT,
            paddingLeft: 18,
          }}
        >
          <Image source={btnPlay} style={{ width: 36, height: 36, opacity: 0.4 }} resizeMode="contain" />
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#d9d9d9', marginLeft: 15 }} />
          <View style={{ width: 158, height: 4, borderRadius: 2, backgroundColor: '#d9d9d9', marginLeft: -7 }} />
          <Text className="text-[12px] font-normal text-muted" style={{ lineHeight: 20, marginLeft: 15 }}>
            녹음 없음
          </Text>
        </View>

        <Pressable
          onPress={() => analysis && router.push(`/analysis/${id}`)}
          disabled={!analysis}
          accessibilityRole="button"
          className={`items-center justify-center active:opacity-90 ${analysis ? '' : 'opacity-40'}`}
          style={{
            width: 336,
            height: 57,
            borderRadius: 10,
            backgroundColor: '#e9822b',
            marginLeft: 28,
            marginTop: 23,
          }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            분석 결과
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// 로그인 (Figma `130:161`) — 워드마크 + 아이디/비밀번호 + 로그인 + 링크 3개 + 소셜 3종.
//
// Figma 실측(393×852 프레임, @4x 내보내기 픽셀 대조로 확정):
//   워드마크 145×22.2 @ (120, 204)   — **화면 중앙이 아니다**(중앙은 124)
//   입력 292×44 @ (50, 284) / (50, 355) · bg #f4f4f4 r5 · 안내문구 Regular 13 #7b7c7c(좌 22)
//   버튼 293×42 @ (49, 426) #e9822b r5 · 라벨 SemiBold 13 흰색
//   링크 Regular 12 #7b7c7c · 행 시작 x 80(중앙 88 아님) · 항목 간격 12 · 잉크 top 519
//   소셜 @ (89.75 / 168.35 / 246.95, 642.75) — 에셋이 그림자를 포함해 52×52
// 가로는 **Figma x 를 그대로** 쓴다(중앙 정렬로 두면 워드마크 4px·링크행 8px 이 밀린다).
// 세로 위치는 프레임 비율로 환산해 기기 높이에 맞춘다(고정 프레임 디자인 충실 재현).
// 상태바는 실기기 상태바 사용(Figma 상태바 목업 미구현 — 사용자 확정).
//
// 기능은 기존과 동일: signIn(이메일+비밀번호), 비밀번호 찾기(재설정 메일),
// 소셜/아이디찾기/회원가입은 라이브 미배선 구간 안내.
import { useState } from 'react';
import { View, Text, Pressable, TextInput, Image, Alert, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from '@giokon/data';
import { useAuth } from '../src/auth/AuthProvider';
import { C } from '../src/theme';
import wordmark from '../assets/brand/wordmark.png';
import socialNaver from '../assets/brand/social-naver.png';
import socialKakao from '../assets/brand/social-kakao.png';
import socialGoogle from '../assets/brand/social-google.png';

const FRAME_W = 393;
const FRAME_H = 852;

/** Figma 세로 좌표 → 화면 높이 비율 */
const top = (y: number, h: number) => (y / FRAME_H) * h;

export default function Login() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn, isConfigured } = useAuth();
  const { width, height } = useWindowDimensions();

  // 가로는 Figma 좌표를 화면 폭 비율로 환산(393 기준 디자인 → 좁은 기기에서도 비율 유지).
  const x = (v: number) => (v / FRAME_W) * width;

  const onLogin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signIn(id, pw);
      router.replace('/main');
    } catch (e) {
      Alert.alert('로그인 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const notOnApp = (what: string) => Alert.alert(what, `${what}은(는) 웹에서 진행해 주세요.`);

  const onFindPassword = async () => {
    if (!isConfigured) return onLogin();
    if (!id.trim()) return Alert.alert('비밀번호 찾기', '가입한 이메일(아이디)을 입력해 주세요.');
    try {
      await sendPasswordResetEmail(id.trim(), 'https://giokon.app/reset');
      Alert.alert('비밀번호 찾기', '재설정 메일을 보냈어요. 메일함을 확인해 주세요.');
    } catch (e) {
      Alert.alert('비밀번호 찾기', e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  };

  const onSocial = () => {
    if (!isConfigured) return onLogin();
    Alert.alert('소셜 로그인', '소셜 간편 로그인은 준비 중입니다.');
  };

  return (
    <View className="flex-1 bg-white">
      {/* 워드마크 — Figma (120, 204) */}
      <Image
        source={wordmark}
        style={{ position: 'absolute', left: x(120), top: top(204, height), width: x(145), height: 22.2 }}
        resizeMode="contain"
        accessibilityLabel="기억온"
      />

      {/* 아이디 — Figma (50, 284) 292×44 */}
      <TextInput
        value={id}
        onChangeText={setId}
        placeholder="아이디"
        placeholderTextColor="#7b7c7c"
        autoCapitalize="none"
        keyboardType="email-address"
        className="absolute text-[13px] text-ink font-normal"
        style={{
          left: x(50),
          top: top(284, height),
          width: x(292),
          height: 44,
          backgroundColor: '#f4f4f4',
          borderRadius: 5,
          paddingHorizontal: 22,
        }}
      />

      {/* 비밀번호 — Figma (50, 355) */}
      <TextInput
        value={pw}
        onChangeText={setPw}
        placeholder="비밀번호"
        placeholderTextColor="#7b7c7c"
        secureTextEntry
        className="absolute text-[13px] text-ink font-normal"
        style={{
          left: x(50),
          top: top(355, height),
          width: x(292),
          height: 44,
          backgroundColor: '#f4f4f4',
          borderRadius: 5,
          paddingHorizontal: 22,
        }}
      />

      {/* 로그인 버튼 — Figma (49, 426) 293×42 */}
      <Pressable
        onPress={onLogin}
        disabled={busy}
        accessibilityRole="button"
        className="absolute items-center justify-center active:opacity-90"
        style={{
          left: x(49),
          top: top(426, height),
          width: x(293),
          height: 42,
          backgroundColor: busy ? C.accentPressed : C.accent,
          borderRadius: 5,
        }}
      >
        <Text className="text-[13px] font-semibold text-white">로그인</Text>
      </Pressable>

      {/* 아이디 찾기 | 비밀번호 찾기 | 회원가입 — Figma 행 시작 x 80, 잉크 top 519 */}
      <View className="absolute flex-row items-center" style={{ left: x(80), top: top(515, height) }}>
        <Pressable onPress={() => (isConfigured ? notOnApp('아이디 찾기') : onLogin())} hitSlop={8}>
          <Text className="text-[12px] text-muted font-normal" style={{ lineHeight: 20 }}>
            아이디 찾기
          </Text>
        </Pressable>
        <Text className="text-[12px] text-line mx-3 font-normal" style={{ lineHeight: 20 }}>
          |
        </Text>
        <Pressable onPress={onFindPassword} hitSlop={8}>
          <Text className="text-[12px] text-muted font-normal" style={{ lineHeight: 20 }}>
            비밀번호 찾기
          </Text>
        </Pressable>
        <Text className="text-[12px] text-line mx-3 font-normal" style={{ lineHeight: 20 }}>
          |
        </Text>
        <Pressable onPress={() => (isConfigured ? notOnApp('회원가입') : onLogin())} hitSlop={8}>
          <Text className="text-[12px] text-muted font-normal" style={{ lineHeight: 20 }}>
            회원가입
          </Text>
        </Pressable>
      </View>

      {/*
       * "간편 계정 연결" — Figma 로그인 프레임에는 없는 문구지만, 소셜 3종만 덩그러니
       * 놓이면 무엇인지 알 수 없어 사용자가 복원을 요청했다(2026-08-13).
       * 원본 요소를 건드리지 않도록 링크행(519)과 소셜(642.75) 사이 빈 공간에
       * 작은 회색 한 줄로만 둔다.
       */}
      <Text
        className="absolute left-0 right-0 text-[13px] font-normal text-muted text-center"
        style={{ top: top(597, height), lineHeight: 20 }}
      >
        간편 계정 연결
      </Text>

      {/* 소셜 3종 — Figma x 89.75 / 168.35 / 246.95 (pitch 78.6), 에셋은 그림자 포함 52 */}
      {[
        { key: 'naver', src: socialNaver, label: '네이버', left: 89.75 },
        { key: 'kakao', src: socialKakao, label: '카카오', left: 168.35 },
        { key: 'google', src: socialGoogle, label: '구글', left: 246.95 },
      ].map((s) => (
        <Pressable
          key={s.key}
          onPress={onSocial}
          accessibilityRole="button"
          accessibilityLabel={`${s.label} 로그인`}
          className="absolute active:opacity-70"
          style={{ left: x(s.left), top: top(642.75, height) }}
        >
          <Image source={s.src} style={{ width: x(52), height: 52 }} resizeMode="contain" />
        </Pressable>
      ))}
    </View>
  );
}

// 로그인 (Figma `130:161`) — 워드마크 + 아이디/비밀번호 + 로그인 + 링크 3개 + 소셜 3종.
//
// Figma 스펙(393×852 프레임 기준):
//   워드마크 145×22.2 @ (120, 204)              · 입력 292×44 @ (50, 284) / (50, 355)
//   입력 bg #f4f4f4 r5, placeholder 13px #7b7c7c · 버튼 293×42 @ (49, 426) bg #e9822b r5,
//   버튼 텍스트 13px SemiBold 흰색               · 링크 12px #7b7c7c @ top 518 (구분자 |)
//   소셜 49.8×49.8 @ top 643, left 90/168.6/247
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

  // 가로는 프레임 비율 유지(292/393). 좁은 기기에서도 여백이 깨지지 않는다.
  const fieldW = (292 / FRAME_W) * width;
  const btnW = (293 / FRAME_W) * width;

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
      {/* 워드마크 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: top(204, height) }}>
        <Image
          source={wordmark}
          style={{ width: 145, height: 22 }}
          resizeMode="contain"
          accessibilityLabel="기억온"
        />
      </View>

      {/* 아이디 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: top(284, height) }}>
        <TextInput
          value={id}
          onChangeText={setId}
          placeholder="아이디"
          placeholderTextColor="#7b7c7c"
          autoCapitalize="none"
          keyboardType="email-address"
          className="text-[13px] text-ink"
          style={{
            width: fieldW,
            height: 44,
            backgroundColor: '#f4f4f4',
            borderRadius: 5,
            paddingHorizontal: 22,
          }}
        />
      </View>

      {/* 비밀번호 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: top(355, height) }}>
        <TextInput
          value={pw}
          onChangeText={setPw}
          placeholder="비밀번호"
          placeholderTextColor="#7b7c7c"
          secureTextEntry
          className="text-[13px] text-ink"
          style={{
            width: fieldW,
            height: 44,
            backgroundColor: '#f4f4f4',
            borderRadius: 5,
            paddingHorizontal: 22,
          }}
        />
      </View>

      {/* 로그인 버튼 */}
      <View className="absolute left-0 right-0 items-center" style={{ top: top(426, height) }}>
        <Pressable
          onPress={onLogin}
          disabled={busy}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-90"
          style={{
            width: btnW,
            height: 42,
            backgroundColor: busy ? C.accentPressed : C.accent,
            borderRadius: 5,
          }}
        >
          <Text className="text-[13px] font-semibold text-white">로그인</Text>
        </Pressable>
      </View>

      {/* 아이디 찾기 | 비밀번호 찾기 | 회원가입 */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-center"
        style={{ top: top(518, height) }}
      >
        <Pressable onPress={() => (isConfigured ? notOnApp('아이디 찾기') : onLogin())} hitSlop={8}>
          <Text className="text-[12px] text-muted">아이디 찾기</Text>
        </Pressable>
        <Text className="text-[12px] text-line mx-3">|</Text>
        <Pressable onPress={onFindPassword} hitSlop={8}>
          <Text className="text-[12px] text-muted">비밀번호 찾기</Text>
        </Pressable>
        <Text className="text-[12px] text-line mx-3">|</Text>
        <Pressable onPress={() => (isConfigured ? notOnApp('회원가입') : onLogin())} hitSlop={8}>
          <Text className="text-[12px] text-muted">회원가입</Text>
        </Pressable>
      </View>

      {/* 소셜 3종 — Figma 간격(중심 114 / 193 / 271) 비율 유지 */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-center"
        style={{ top: top(643, height) }}
      >
        {[
          { key: 'naver', src: socialNaver, label: '네이버' },
          { key: 'kakao', src: socialKakao, label: '카카오' },
          { key: 'google', src: socialGoogle, label: '구글' },
        ].map((s) => (
          <Pressable
            key={s.key}
            onPress={onSocial}
            accessibilityRole="button"
            accessibilityLabel={`${s.label} 로그인`}
            className="active:opacity-70"
            style={{ marginHorizontal: (29 / FRAME_W) * width * 0.5 }}
          >
            <Image source={s.src} style={{ width: 50, height: 50 }} resizeMode="contain" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

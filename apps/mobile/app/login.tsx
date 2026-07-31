// 로그인 — 아이디(이메일)/비밀번호 + 소셜 간편 로그인.
// 라이브(Supabase 설정) 시 signInWithEmail로 실제 인증, 미설정 시 목업 로그인(시연).
// 소셜 3종·아이디/비밀번호 찾기·회원가입은 디자인 유지 — 라이브에서 미배선 경로는
// 안내(웹에서 진행)로 게이트한다. 계정 생성·온보딩은 웹 담당(앱 신규 화면 없음).
import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from '@giokon/data';
import { Screen, Field, Button } from '../src/components/ui';
import { Wordmark } from '../src/components/brand';
import { useAuth } from '../src/auth/AuthProvider';

function SocialDot({ label, bg, color = '#fff' }: { label: string; bg: string; color?: string }) {
  return (
    <View
      className="w-14 h-14 rounded-full items-center justify-center mx-2"
      style={{ backgroundColor: bg }}
      accessibilityLabel={`${label} 로그인`}
    >
      <Text style={{ color, fontWeight: '800', fontSize: 20 }}>{label}</Text>
    </View>
  );
}

export default function Login() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn, isConfigured } = useAuth();

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

  // 라이브에서 아직 앱에 배선하지 않은 경로는 웹으로 안내한다.
  const notOnApp = (what: string) =>
    Alert.alert(what, `${what}은(는) 웹에서 진행해 주세요.`);

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
    <Screen scroll>
      <View className="items-center mt-16 mb-10">
        <Wordmark size={30} />
      </View>
      <Field label="" value={id} onChangeText={setId} placeholder="아이디" />
      <Field label="" value={pw} onChangeText={setPw} placeholder="비밀번호" secureTextEntry />
      <View className="mt-2">
        <Button label="로그인" onPress={onLogin} />
      </View>

      <View className="flex-row items-center justify-center mt-5">
        <Pressable
          onPress={() => (isConfigured ? notOnApp('아이디 찾기') : onLogin())}
          className="px-2 active:opacity-60"
        >
          <Text className="text-[14px] text-muted">아이디 찾기</Text>
        </Pressable>
        <Text className="text-muted">|</Text>
        <Pressable onPress={onFindPassword} className="px-2 active:opacity-60">
          <Text className="text-[14px] text-muted">비밀번호 찾기</Text>
        </Pressable>
        <Text className="text-muted">|</Text>
        <Pressable
          onPress={() => (isConfigured ? notOnApp('회원가입') : onLogin())}
          className="px-2 active:opacity-60"
        >
          <Text className="text-[14px] text-muted">회원가입</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-center mt-10">
        <Pressable onPress={onSocial}>
          <SocialDot label="N" bg="#03c75a" />
        </Pressable>
        <Pressable onPress={onSocial}>
          <SocialDot label="K" bg="#fee500" color="#191600" />
        </Pressable>
        <Pressable onPress={onSocial}>
          <SocialDot label="G" bg="#ffffff" color="#4285f4" />
        </Pressable>
      </View>
    </Screen>
  );
}

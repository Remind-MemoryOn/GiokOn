// 로그인 — 아이디/비밀번호 + 소셜 간편 로그인(시연: 실제 인증은 Supabase Auth 배선 후).
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Field, Button } from '../src/components/ui';
import { Wordmark } from '../src/components/brand';
import { useApp } from '../src/store/appStore';

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
  const login = useApp((s) => s.login);

  const onLogin = () => {
    login(id || '홍길동');
    router.replace('/main');
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
        <Pressable onPress={onLogin} className="px-2 active:opacity-60">
          <Text className="text-[14px] text-muted">아이디 찾기</Text>
        </Pressable>
        <Text className="text-muted">|</Text>
        <Pressable onPress={onLogin} className="px-2 active:opacity-60">
          <Text className="text-[14px] text-muted">비밀번호 찾기</Text>
        </Pressable>
        <Text className="text-muted">|</Text>
        <Pressable onPress={onLogin} className="px-2 active:opacity-60">
          <Text className="text-[14px] text-muted">회원가입</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-center mt-10">
        <Pressable onPress={onLogin}>
          <SocialDot label="N" bg="#03c75a" />
        </Pressable>
        <Pressable onPress={onLogin}>
          <SocialDot label="K" bg="#fee500" color="#191600" />
        </Pressable>
        <Pressable onPress={onLogin}>
          <SocialDot label="G" bg="#ffffff" color="#4285f4" />
        </Pressable>
      </View>
    </Screen>
  );
}

// Supabase 데이터 레이어 초기화 (Expo) — 웹과 동일한 패턴.
//
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 미설정 시 등록을
// 건너뛰고 목업 스토어(useApp)로 동작한다. 키를 채우면 코드 변경 없이 실데이터 연결로
// 이어진다(@giokon/data 훅). 모바일 세션 저장소는 AsyncStorage 어댑터를 쓴다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createGiokonClient,
  createGiokonQueryClient,
  initGiokonData,
  type GiokonAuthStorage,
} from '@giokon/data';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

/**
 * 스킴이 빠진 URL(`xxxx.supabase.co`)이면 supabase-js 가 **상대 URL** 로 요청을 만든다.
 * RN 의 XHR 은 그때 status 0 을 돌려주고, fetch 폴리필이 `new Response(body,{status:0})`
 * 에서 RangeError 를 던진다 — 그것도 setTimeout 안이라 **잡히지 않는 크래시**가 된다
 * ("Failed to construct 'Response': The status provided (0) is outside the range").
 * 그래서 스킴이 없으면 설정으로 인정하지 않고 목업으로 떨어뜨린다(원인을 로그로 남긴다).
 */
const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined;
if (rawUrl && !url) {
  console.error(
    `[giokon] EXPO_PUBLIC_SUPABASE_URL 이 "https://" 로 시작하지 않습니다(현재: ${rawUrl}). ` +
      '상대 URL 로 요청이 나가 앱이 죽으므로 연결을 건너뜁니다 — .env 를 고쳐 주세요.',
  );
}

/** .env에 Supabase 설정이 모두 있는지(URL 형식까지 확인). */
export const isSupabaseConfigured = Boolean(url && publishableKey);

/** 앱 전역 QueryClient (서버 상태 SoT). */
export const queryClient = createGiokonQueryClient();

// AsyncStorage를 @giokon/data가 기대하는 저장소 계약으로 감싼다.
const asyncStorageAdapter: GiokonAuthStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** Supabase 클라이언트를 전역 데이터 레이어에 등록(미설정 시 건너뜀). */
export function initSupabase(): void {
  if (!url || !publishableKey) {
    console.info(
      '[giokon] Supabase 미설정 — EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 미설정. 목업 데이터로 동작합니다.',
    );
    return;
  }
  initGiokonData(
    createGiokonClient({
      url,
      publishableKey,
      storage: asyncStorageAdapter,
      detectSessionInUrl: false, // 모바일은 딥링크로 직접 처리
    }),
  );
}

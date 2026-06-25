// apps/web — Supabase 데이터 레이어 초기화 (env 기반)
//
// .env 미설정 시 등록을 건너뛰고 현재 목업 스토어로 동작한다. 키를 채우면
// 코드 변경 없이 실데이터 연결(T2.4 화면↔TanStack Query 배선)로 이어진다.

import { createGiokonClient, createGiokonQueryClient, initGiokonData } from '@giokon/data';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** .env에 Supabase URL·publishable 키가 모두 설정됐는지. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

/** 앱 전역 QueryClient (서버 상태 SoT). Supabase 설정 여부와 무관하게 제공. */
export const queryClient = createGiokonQueryClient();

/** Supabase 클라이언트를 전역 데이터 레이어에 등록한다(미설정 시 안내만 남기고 건너뜀). */
export function initSupabase(): void {
  if (!url || !publishableKey) {
    console.info(
      '[giokon] Supabase 미설정 — apps/web/.env에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 채우세요. (현재는 목업 데이터로 동작)',
    );
    return;
  }
  initGiokonData(createGiokonClient({ url, publishableKey }));
}

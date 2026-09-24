// EXPO_PUBLIC_* 환경변수 접근용 최소 선언(@types/node 없이).
// Expo가 빌드 시 process.env.EXPO_PUBLIC_* 를 정적 치환한다.
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    /** 설정 화면의 처리방침·약관을 열 웹 주소(선택). */
    EXPO_PUBLIC_WEB_URL?: string;
    /** 음성 중계 WSS 주소(필수 — 없으면 세션 시작 차단). src/lib/live/relay-config.ts 가 검증한다. */
    EXPO_PUBLIC_VOICE_RELAY_URL?: string;
    [key: string]: string | undefined;
  };
};

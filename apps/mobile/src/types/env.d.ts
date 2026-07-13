// EXPO_PUBLIC_* 환경변수 접근용 최소 선언(@types/node 없이).
// Expo가 빌드 시 process.env.EXPO_PUBLIC_* 를 정적 치환한다.
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    [key: string]: string | undefined;
  };
};

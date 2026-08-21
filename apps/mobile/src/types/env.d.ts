// EXPO_PUBLIC_* 환경변수 접근용 최소 선언(@types/node 없이).
// Expo가 빌드 시 process.env.EXPO_PUBLIC_* 를 정적 치환한다.
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    /** 설정 화면의 처리방침·약관을 열 웹 주소(선택). */
    EXPO_PUBLIC_WEB_URL?: string;
    [key: string]: string | undefined;
  };
};

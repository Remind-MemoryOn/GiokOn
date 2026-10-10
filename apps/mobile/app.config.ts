import type { ConfigContext, ExpoConfig } from 'expo/config';

// EAS 파일 환경변수 또는 로컬의 추적하지 않는 파일 경로. 앱 공개 변수로 넣지 않는다.
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !googleServicesFile) {
    throw new Error('Android EAS 빌드에는 GOOGLE_SERVICES_JSON 파일 환경변수가 필요합니다. apps/mobile/README.md를 확인하세요.');
  }
  return {
    ...config,
    name: config.name ?? '기억온',
    slug: config.slug ?? 'giok-on',
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};

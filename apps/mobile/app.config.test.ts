import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigContext } from 'expo/config';
import configure from './app.config';
import app from './app.json';

const context: ConfigContext = {
  projectRoot: '/test',
  staticConfigPath: '/test/app.json',
  packageJsonPath: '/test/package.json',
  config: { name: '기억온', slug: 'giok-on', android: { package: 'kr.giokon.app' }, extra: { eas: { projectId: 'test' } } },
};

afterEach(() => vi.unstubAllEnvs());

describe('빌드용 Firebase 파일 설정', () => {
  it('Android EAS 빌드에서 파일 변수가 빠지면 불완전한 푸시 앱을 만들지 않는다', () => {
    vi.stubEnv('EAS_BUILD_PLATFORM', 'android');
    vi.stubEnv('GOOGLE_SERVICES_JSON', '');
    expect(() => configure(context)).toThrow('GOOGLE_SERVICES_JSON');
  });
  it('파일 경로를 연결하면서 패키지와 EAS 프로젝트 설정을 유지한다', () => {
    vi.stubEnv('EAS_BUILD_PLATFORM', 'android');
    vi.stubEnv('GOOGLE_SERVICES_JSON', '/build/config/google-services.json');
    const result = configure(context);
    expect(result.android).toEqual({ package: 'kr.giokon.app', googleServicesFile: '/build/config/google-services.json' });
    expect(result.extra).toEqual(context.config.extra);
  });
  it.each(['ios', ''])('Firebase 파일이 없는 %s 개발 환경은 유지한다', platform => {
    vi.stubEnv('EAS_BUILD_PLATFORM', platform);
    vi.stubEnv('GOOGLE_SERVICES_JSON', '');
    expect(configure(context).android?.googleServicesFile).toBeUndefined();
  });
});

describe('기기별 화면 방향과 키보드 설정', () => {
  it('휴대폰 세로 방향과 iPad 양쪽 가로 방향을 네이티브 설정에 전달한다', () => {
    vi.stubEnv('EAS_BUILD_PLATFORM', '');
    vi.stubEnv('GOOGLE_SERVICES_JSON', '');
    const result = configure({ ...context, config: app.expo as ConfigContext['config'] });
    expect(result.ios?.supportsTablet).toBe(true);
    expect(result.ios?.requireFullScreen).toBe(true);
    expect(result.ios?.infoPlist?.UISupportedInterfaceOrientations).toEqual(['UIInterfaceOrientationPortrait']);
    expect(result.ios?.infoPlist?.['UISupportedInterfaceOrientations~ipad']).toEqual([
      'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight',
    ]);
    expect(result.android?.softwareKeyboardLayoutMode).toBe('resize');
    expect(result.plugins).toContain('./plugins/withTabletOrientation');
  });
});

// Google Play 제출 준비(2026-11-27): 릴리스 권한은 실제로 쓰는 것만 — 마이크(대화)만 요청하고,
// 라이브러리가 병합으로 끌어오는 카메라·저장소·미디어·다른 앱 위 그리기 권한은 지운다.
// 사진은 Android 시스템 사진 선택기(권한 불필요)로 고른다. 로그인 세션(AsyncStorage)이 Google 백업에 실리지 않게 백업을 끈다.
describe('릴리스 권한·백업', () => {
  const android = app.expo.android as { permissions: string[]; blockedPermissions: string[]; allowBackup: boolean };
  it('요청 권한은 마이크 하나다', () => {
    expect(android.permissions).toEqual(['android.permission.RECORD_AUDIO']);
  });
  it.each([
    'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
    'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'SYSTEM_ALERT_WINDOW',
  ])('병합으로 들어오는 %s 를 막는다', (name) => {
    expect(android.blockedPermissions).toContain(`android.permission.${name}`);
  });
  it('자동 백업을 끈다', () => {
    expect(android.allowBackup).toBe(false);
  });
  it('Android 에서는 사진 권한을 요청하지 않는다(사진 선택기 사용 — 막은 권한을 요청하면 거부로 끝난다)', async () => {
    const { readFileSync } = await import('node:fs');
    const form = readFileSync(new URL('./src/components/ProfileForm.tsx', import.meta.url), 'utf8');
    expect(form).toMatch(/if \(Platform\.OS !== 'android'\) \{\s*const perm = await ImagePicker\.requestMediaLibraryPermissionsAsync\(\);/);
  });
});

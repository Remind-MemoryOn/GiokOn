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

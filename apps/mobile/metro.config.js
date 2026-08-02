// Expo Metro 설정 — pnpm 모노레포 + NativeWind.
// 워크스페이스 루트를 watch하고, 심볼릭 링크된 packages/*를 해석한다.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;

// ── React / React Query 단일 인스턴스 강제 (pnpm 모노레포 필수) ─────────────────────────
// 워크스페이스 패키지 @giokon/data 는 소스 디렉터리로 심링크되고, 그 자체 node_modules 의
// react 피어가 웹 트리와 공유되며 react@19.2.x 로 물리화된다. 그 결과 앱 번들에 React 가 두 벌
// (react-native·expo-router = 19.0.0  vs  @giokon/data = 19.2.x) 들어가면 런타임 마운트 시
// 디스패처가 null 이 되어 "Invalid hook call / Cannot read property 'useMemo'·'useContext'
// of null"(ExpoRoot ContextNavigator)로 크래시한다. @tanstack/react-query 도 같은 이유로
// 이중화되어 QueryClient 컨텍스트가 어긋난다(Provider ↔ useQuery 불일치).
//
// → 아래 모듈은 origin 을 앱 루트로 고정해 Metro 가 항상 앱 소유의 단일 복사본을 해석하게 한다.
//   (버전·플랫폼 조건·exports 는 Metro 기본 해석 로직을 그대로 사용 — origin 만 교체.)
//   react-native 는 이미 앱 트리에서 단일 해석되므로 건드리지 않는다.
const FORCE_SINGLETON = ['react', '@tanstack/react-query'];
const isForcedSingleton = (name) =>
  FORCE_SINGLETON.some((pkg) => name === pkg || name.startsWith(pkg + '/'));

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  if (isForcedSingleton(moduleName)) {
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'index.js') },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });

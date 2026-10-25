// Coverage-only configuration. Does not load application Vite configs or .env.
// Invoke the external Vitest CLI with WHITEBOX_SCOPE and WHITEBOX_TOOLS_DIR set.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const normalize = value => value.replaceAll('\\', '/');
const repository = normalize(fileURLToPath(new URL('../', import.meta.url))).replace(/\/$/, '');
const scope = process.env.WHITEBOX_SCOPE;
const scopes = {
  core: { tests: ['packages/core/src/**/*.test.ts'], source: ['packages/core/src/**/*.ts'] },
  data: { tests: ['packages/data/src/**/*.test.ts'], source: ['packages/data/src/**/*.ts', 'supabase/functions/**/*.ts'] },
  mobile: {
    tests: ['apps/mobile/src/**/*.test.ts', 'apps/mobile/plugins/**/*.test.ts', 'apps/mobile/app.config.test.ts'],
    source: ['apps/mobile/src/**/*.{ts,tsx}', 'apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/modules/**/*.{ts,tsx}', 'apps/mobile/plugins/**/*.js', 'apps/mobile/app.config.ts'],
  },
  relay: { tests: ['apps/voice-relay/src/**/*.test.ts'], source: ['apps/voice-relay/src/**/*.ts'] },
  web: { tests: ['apps/web/scripts/whitebox-*.test.mjs'], source: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/public/viewport-mode.js'], exclude: ['apps/web/src/audit/**'] },
};
if (!Object.hasOwn(scopes, scope ?? '')) throw new Error('Set WHITEBOX_SCOPE to core, data, mobile, relay, or web.');
if (!process.env.WHITEBOX_TOOLS_DIR) throw new Error('Set WHITEBOX_TOOLS_DIR to the external tooling directory containing node_modules.');
const modules = normalize(resolve(process.env.WHITEBOX_TOOLS_DIR, 'node_modules'));
const provider = modules + '/@vitest/coverage-istanbul/dist/index.js';
const instrumenter = modules + '/istanbul-lib-instrument/src/index.js';
for (const file of [provider, instrumenter]) {
  if (!existsSync(file)) throw new Error('Required external coverage tooling is missing: ' + file);
}

const dataVmSources = {
  'live-token.test.ts': 'supabase/functions/live-token/index.ts',
  'naver-auth.test.ts': 'supabase/functions/naver-auth/index.ts',
  'session-report-entrypoint.test.ts': 'supabase/functions/session-report/index.ts',
  'program-journal-draft.test.ts': 'supabase/functions/program-journal-draft/index.ts',
  'push-dispatch.test.ts': 'supabase/functions/push-dispatch/index.ts',
};
const mobileVmSources = {
  'engine-token.test.ts': 'apps/mobile/src/lib/live/engine.ts',
  'session-persistence.test.ts': 'apps/mobile/src/data/session-persistence.ts',
  'accessResources.test.ts': 'apps/mobile/src/auth/accessResources.ts',
  'login-routing.test.ts': 'apps/mobile/app/login.tsx',
  'protectedRoutes.test.ts': 'apps/mobile/src/auth/ProtectedNavigator.tsx',
};

// The tests execute Edge/native entrypoints in isolated VM globals. Instrument
// the original TypeScript before their existing transpilation and share only
// the coverage counter object; synthetic environment and transport stubs stay.
function vmCoverageBridge() {
  const cases = scope === 'data' ? dataVmSources : scope === 'mobile' ? mobileVmSources : {};
  return {
    name: 'whitebox-vm-coverage',
    enforce: 'pre',
    transform(code, id) {
      const filename = normalize(id).split('/').at(-1);
      const relative = cases[filename];
      if (!relative) return;
      const prefix = `import __instrumentLibrary from ${JSON.stringify(instrumenter)};\n` +
        `const __vmInstrumenter = __instrumentLibrary.createInstrumenter({parserPlugins:['typescript','jsx'],compact:false,esModules:true,coverageVariable:'__VITEST_COVERAGE__'});\n` +
        `let __vmOutput; const __instrumentVm = source => __vmOutput ??= __vmInstrumenter.instrumentSync(source,${JSON.stringify(repository + '/' + relative)});\n`;
      let transpilers = 0;
      code = code.replace(/ts\.transpileModule\((readFileSync\(new URL\('[^']+', import\.meta\.url\), 'utf8'\)|source),/g, (_, source) => {
        transpilers++;
        return `ts.transpileModule(__instrumentVm(${source}),`;
      });
      if (transpilers !== 1) throw new Error('Unexpected VM transpile count in ' + id + ': ' + transpilers);
      let sandboxes = 0;
      code = code.replace(/(\}\)\.outputText,\s*\{\s*)exports(?=[:,])/g, (_, start) => {
        sandboxes++;
        return start + '__VITEST_COVERAGE__: (globalThis.__VITEST_COVERAGE__ ??= {}), exports';
      });
      if (sandboxes !== 1) throw new Error('Unexpected VM sandbox count in ' + id + ': ' + sandboxes);
      return prefix + code;
    },
  };
}

export default {
  root: repository,
  envDir: false,
  plugins: [vmCoverageBridge()],
  test: {
    globals: scope === 'web',
    maxWorkers: 4,
    include: scopes[scope].tests,
    reporters: ['default', 'json'],
    outputFile: { json: repository + '/.tmp/whitebox/' + scope + '/tests.json' },
    coverage: {
      enabled: true,
      provider: 'custom',
      customProviderModule: provider,
      all: true,
      include: scopes[scope].source,
      exclude: ['**/*.test.*', '**/*.d.ts', ...(scopes[scope].exclude ?? [])],
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: repository + '/.tmp/whitebox/' + scope + '/coverage',
    },
  },
};

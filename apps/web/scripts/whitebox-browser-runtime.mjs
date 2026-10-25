// Execute an existing synthetic browser suite with source-level Istanbul counters.
// Dependencies live in --tools, outside the project; no production code is edited.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const tools = process.env.WHITEBOX_TOOLS_DIR;
if (!tools) throw new Error('Set WHITEBOX_TOOLS_DIR to the external testing tools directory.');
const external = createRequire(join(resolve(tools), 'package.json'));
const { createInstrumenter } = external('istanbul-lib-instrument');
const { createCoverageMap } = external('istanbul-lib-coverage');
const { createContext } = external('istanbul-lib-report');
const reports = external('istanbul-reports');
const suite = process.argv[2];
const allowed = new Set([
  'auth-isolation.mjs', 'login-return-smoke.mjs', 'journal-flow-smoke.mjs', 'share-flow-smoke.mjs',
  'chronicle-flow-smoke.mjs', 'charts-smoke.mjs', 'analysis-period-flow-smoke.mjs',
  'org-admin-flow-smoke.mjs', 'session-plan-flow-smoke.mjs', 'elder-grade-flow-smoke.mjs',
  'elder-delete-flow-smoke.mjs', 'viewport-mode-smoke.mjs', 'supervision-flow-smoke.mjs',
  'design-feedback-smoke.mjs', 'blackbox-flow-smoke.mjs', 'usecase-flow-smoke.mjs',
]);
if (!allowed.has(suite)) throw new Error('Expected the filename of an existing synthetic browser suite.');
const destination = join(repo, '.tmp/whitebox-2026-10-25/web-browser', basename(suite, '.mjs'));
const coverageMap = createCoverageMap({});
const instrumenter = createInstrumenter({ esModules: true, parserPlugins: ['typescript', 'jsx'], compact: false });
const captureErrors = [];
const captureWarnings = [];
let counterSnapshots = 0;
const originals = new WeakSet();
const wrappedPages = new WeakSet();
const hookedContexts = new WeakSet();

function instrumentation() {
  return { name: 'whitebox-source-counters', enforce: 'pre', transform(code, id) {
    const path = id.split('?')[0].replaceAll('\\', '/');
    const product = path.includes('/apps/web/src/') || path.includes('/packages/data/src/');
    if (!product || path.includes('/src/audit/') || !/\.[cm]?[jt]sx?$/.test(path) || path.endsWith('.d.ts') || path.includes('.test.')) return;
    const result = instrumenter.instrumentSync(code, path);
    // Add every compiled module with zero hits; untouched modules remain visible.
    const initial = JSON.parse(JSON.stringify(instrumenter.lastFileCoverage()));
    if (!coverageMap.files().includes(path)) coverageMap.addFileCoverage(initial);
    return { code: result, map: null };
  } };
}
export function wrapBuild(original) {
  return options => original({ ...options, envDir: false, plugins: [...(options?.plugins ?? []), instrumentation()] });
}
async function capture(page) {
  if (page.isClosed()) return;
  try {
    const value = await page.evaluate(() => {
      const snapshot = JSON.parse(JSON.stringify(globalThis.__coverage__ ?? {}));
      // Snapshot and reset atomically; callbacks cannot execute between them.
      for (const file of Object.values(globalThis.__coverage__ ?? {})) {
        for (const key of Object.keys(file.s)) file.s[key] = 0;
        for (const key of Object.keys(file.f)) file.f[key] = 0;
        for (const key of Object.keys(file.b)) file.b[key].fill(0);
      }
      return snapshot;
    });
    if (Object.keys(value).length) counterSnapshots++;
    coverageMap.merge(value);
  } catch (error) {
    if (/Execution context was destroyed|Target page.*closed/.test(error.message)) captureWarnings.push('Snapshot unavailable during navigation/close');
    else captureErrors.push(error.message);
  }
}
function wrapPage(page) {
  if (wrappedPages.has(page)) return page;
  wrappedPages.add(page);
  for (const method of ['goto', 'reload', 'close']) {
    const original = page[method].bind(page);
    page[method] = async (...args) => { await capture(page); return original(...args); };
  }
  return page;
}
function wrapContext(context) {
  if (hookedContexts.has(context)) return context;
  hookedContexts.add(context);
  for (const page of context.pages()) wrapPage(page);
  context.on('page', wrapPage);
  const originalClose = context.close.bind(context);
  context.close = async (...args) => {
    for (const page of context.pages()) await capture(page);
    return originalClose(...args);
  };
  return context;
}
export function wrapChromium(chromium) {
  if (originals.has(chromium)) return;
  originals.add(chromium);
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = async options => {
    const installed = chromium.executablePath();
    const executable = process.env.CHROMIUM_PATH ?? (existsSync(installed) ? installed : undefined);
    const launchOptions = executable
      ? { ...options, channel: undefined, executablePath: executable }
      : options;
    const browser = await originalLaunch(launchOptions);
    const originalContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => wrapContext(await originalContext(...args));
    const originalPage = browser.newPage.bind(browser);
    browser.newPage = async (...args) => { const page = await originalPage(...args); wrapContext(page.context()); return wrapPage(page); };
    const originalClose = browser.close.bind(browser);
    browser.close = async (...args) => {
      for (const context of browser.contexts()) for (const page of context.pages()) await capture(page);
      return originalClose(...args);
    };
    return browser;
  };
}


export async function finish() {
  coverageMap.merge(globalThis.__coverage__ ?? {});
  await mkdir(destination, { recursive: true });
  const reportContext = createContext({ dir: destination, coverageMap });
  for (const format of ['json', 'json-summary']) reports.create(format).execute(reportContext);
  await writeFile(join(destination, 'capture-errors.json'), JSON.stringify(captureErrors, null, 2));
  const executed = coverageMap.getCoverageSummary().statements.covered;
  await writeFile(join(destination, 'collector.json'), JSON.stringify({ counterSnapshots, executedStatements: executed,
    captureWarnings, limitation: 'App-initiated document navigation can discard counters before a snapshot. Browser metrics are a conservative lower bound.' }, null, 2));
  console.log(`WHITEBOX ${suite}: ${coverageMap.files().length} modules, capture errors ${captureErrors.length}`);
  if (captureErrors.length || !executed) process.exitCode = 1;
}

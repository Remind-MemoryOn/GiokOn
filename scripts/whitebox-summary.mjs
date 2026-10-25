// Summarize separate, compatible coverage maps. Never merge Vitest-transformed
// locations with original-TypeScript browser locations (their columns differ).
import { createRequire } from 'node:module';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tools = process.env.WHITEBOX_TOOLS_DIR;
if (!tools) throw new Error('Set WHITEBOX_TOOLS_DIR.');
const require = createRequire(join(resolve(tools), 'package.json'));
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
const output = join(repository, '.tmp/whitebox-2026-10-25/summary');
await mkdir(output, { recursive: true });
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const summary = { date: '2026-10-25', tests: {}, coverage: {}, browserRuns: [], limitations: [
  'No claim of 100% branch/path/MC-DC coverage, formal verification, or real-device execution.',
  'Native Kotlin/Swift and SQL are validated separately, outside JS coverage percentages.',
  'Browser original-TS counters and Vitest-transformed counters are reported separately.',
  'Browser document-navigation snapshots can be lost: counters are conservative lower bounds.',
] };
for (const scope of ['core', 'data', 'mobile', 'relay', 'web']) {
  const tests = await readJson(join(repository, `.tmp/whitebox/${scope}/tests.json`));
  if (!tests.success || tests.numFailedTests || tests.numPassedTests !== tests.numTotalTests) {
    throw new Error('A complete passing test run is required for ' + scope);
  }
  summary.tests[scope] = { total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests,
    files: tests.testResults.length, success: tests.success };
  const raw = await readJson(join(repository, `.tmp/whitebox/${scope}/coverage/coverage-final.json`));
  const map = createCoverageMap(raw);
  summary.coverage[scope] = { ...map.getCoverageSummary().toJSON(), files: map.files().length,
    zeroStatementFiles: map.files().filter(file => map.fileCoverageFor(file).toSummary().statements.covered === 0) };
  if (scope === 'data') for (const [name, part] of [['dataOnly', '/packages/data/'], ['edge', '/supabase/functions/']]) {
    const subset = createCoverageMap({});
    for (const file of map.files().filter(f => f.replaceAll('\\', '/').includes(part))) subset.addFileCoverage(map.fileCoverageFor(file));
    summary.coverage[name] = { ...subset.getCoverageSummary().toJSON(), files: subset.files().length };
  }
  // Cross-scope Vitest maps can also have different module transforms. Keep
  // these independent rather than manufacturing one global coverage percent.
}
const browserMap = createCoverageMap({});
const rawInstrumenter = createInstrumenter({ esModules: true, parserPlugins: ['typescript', 'jsx'], compact: false });
async function zeroSource(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'audit') await zeroSource(path); continue; }
    if (!/\.[jt]sx?$/.test(entry.name) || /\.d\.ts$|\.test\./.test(entry.name)) continue;
    rawInstrumenter.instrumentSync(await readFile(path, 'utf8'), path.replaceAll('\\', '/'));
    browserMap.addFileCoverage(rawInstrumenter.lastFileCoverage());
  }
}
await zeroSource(join(repository, 'apps/web/src'));
await zeroSource(join(repository, 'packages/data/src'));
const viewport = join(repository, 'apps/web/public/viewport-mode.js');
rawInstrumenter.instrumentSync(await readFile(viewport, 'utf8'), viewport.replaceAll('\\', '/'));
browserMap.addFileCoverage(rawInstrumenter.lastFileCoverage());
const runs = await readJson(join(repository, '.tmp/whitebox-2026-10-25/web-browser-final-runs.json'));
if (runs.length !== 16 || runs.some(run => run.exit !== 0)) throw new Error('All sixteen final browser suites must pass before summarizing.');
for (const run of runs) {
  const folder = join(repository, '.tmp/whitebox-2026-10-25/web-browser', run.suite.replace(/\.mjs$/, ''));
  browserMap.merge(await readJson(join(folder, 'coverage-final.json')));
  const collector = await readJson(join(folder, 'collector.json'));
  if (!collector.executedStatements) throw new Error('Missing executed source counters for ' + run.suite);
  summary.browserRuns.push({ ...run, ...collector });
}
for (const [name, part] of [['webBrowser', '/apps/web/'], ['dataBrowser', '/packages/data/']]) {
  const subset = createCoverageMap({});
  for (const file of browserMap.files().filter(f => f.replaceAll('\\', '/').includes(part))) subset.addFileCoverage(browserMap.fileCoverageFor(file));
  summary.coverage[name] = { ...subset.getCoverageSummary().toJSON(), files: subset.files().length,
    zeroStatementFiles: subset.files().filter(file => subset.fileCoverageFor(file).toSummary().statements.total > 0 && subset.fileCoverageFor(file).toSummary().statements.covered === 0) };
  const context = createContext({ dir: join(output, name), coverageMap: subset });
  for (const format of ['json', 'json-summary', 'html']) reports.create(format).execute(context);
}
summary.totalUnitTests = Object.values(summary.tests).reduce((n, scope) => n + scope.total, 0);
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ tests: summary.tests, total: summary.totalUnitTests,
  coverage: Object.fromEntries(Object.entries(summary.coverage).map(([name, v]) => [name,
    { statements: v.statements.pct, branches: v.branches.pct, functions: v.functions.pct, lines: v.lines.pct, files: v.files }])) }, null, 2));

# Core/data/Edge white-box evidence — 2026-10-25

Scope: packages/core/src (17 non-test TypeScript files), packages/data/src (37), every supabase/functions TypeScript file (10). No source-file exclusions were applied beyond **/*.test.ts. Istanbul omits export-only barrels (core/index.ts, data/index.ts), type-only speech.ts and generated database.types.ts because they have no executable statements; all four remain in sourceInventory in summary.json. No product implementation, dependencies, lockfile, environment files, deployments, production data, commits or pushes changed by this work.

Verification-before-completion skill was read. Baseline existing suites passed: core 254/254 in15 test files; data233/233 in28 test files. Final native suites pass core290/290 in17 files and data245/245 in29 files. Added48 tests: public voice error boundary24; generated session parser12; auth9; deployed journal worker wiring3. Core/data TypeScript noEmit passes. Product failures discovered: none in executed tests. Coverage gaps remain; passing does not prove absence of defects.

| Denominator, all executable source | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| core,15 executable files | 780/824=94.66% | 547/632=86.55% | 170/178=95.50% | 620/647=95.82% |
| data,35 executable files | 406/1310=30.99% | 364/916=39.73% | 96/423=22.69% | 338/1050=32.19% |
| Edge,10 executable files | 546/604=90.39% | 356/466=76.39% | 76/81=93.82% | 453/471=96.17% |
| data+Edge,45 executable files | 952/1914=49.73% | 720/1382=52.09% | 172/504=34.12% | 791/1521=52.00% |

Canonical measured reports: core-istanbul/coverage-final.json and data-vm-istanbul/coverage-final.json; coverage-summary.json in each directory. summary.json aggregates groups without double-counting shared core imports in data. Vitest3.2.6, matching Istanbul provider, Babel instrumenter and TypeScript6 loaded from external temp tooling at C:/Users/user/AppData/Local/Temp/memoryon-whitebox-tools-20261025/node_modules. Existing repository pnpm dependency resolution remains unchanged.

The normal coverage engine cannot see code run by node:vm in the Edge tests. data-vm-istanbul.config.mjs is an evidence-only Vite transform: instrument each original Edge index TypeScript source BEFORE existing transpileModule, using its real original filename, and share Istanbul __VITEST_COVERAGE__ counters into the existing isolated synthetic sandbox. The transform does not change tested conditions or return values. Actual calls use synthetic environment/transport/DB stubs and never production. All five indexes are therefore measured as well as their injected handler/worker modules. Prior V8/plain Istanbul reports are retained for audit; they are not canonical. V8 all=true gives misleading placeholder100% branches/functions on some untouched files, so it was not used for final totals.

Evidence and commands (all final exits0):
- pnpm --filter @giokon/core test -- --reporter=json --outputFile=../../.tmp/whitebox-2026-10-25/core-data/core-final-native.json
- pnpm --filter @giokon/data test -- --reporter=json --outputFile=../../.tmp/whitebox-2026-10-25/core-data/data-final-native.json
- pnpm --filter @giokon/core --filter @giokon/data typecheck
- node C:/Users/user/AppData/Local/Temp/memoryon-whitebox-tools-20261025/node_modules/vitest/vitest.mjs run --config .tmp/whitebox-2026-10-25/core-data/core-istanbul.config.mjs
- node C:/Users/user/AppData/Local/Temp/memoryon-whitebox-tools-20261025/node_modules/vitest/vitest.mjs run --config .tmp/whitebox-2026-10-25/core-data/data-vm-istanbul.config.mjs
- node .tmp/whitebox-2026-10-25/core-data/run-mutations.mjs
- node .tmp/whitebox-2026-10-25/core-data/run-worker-mutations.mjs
- node .tmp/whitebox-2026-10-25/core-data/summarize.mjs

Native test stdout/stderr and JSON retained under corresponding names; typecheck.log is final. Earlier test-authoring errors (parameterized array incorrectly unwrapped; incomplete typed journal fixture) were corrected and all final runs passed; they were not product failures. Mutation child commands intentionally exit1 and their runner exits0 when assertions kill them.

Eight mutations killed, always through transient Vite source transforms, with no on-disk product mutation:
1. Delete public-code own-property whitelist:4 assertions fail/24 tests.
2. Delete public-text exact whitelist:7/24 fail.
3. Delete source quote grounding:1/12 fail.
4. Delete generated section maximum:7/12 fail.
5. Delete suppression of signed-in callback during pending logout:1/9 fail.
6. Delete awaited signout barrier:1/9 fail.
7. Change worker literal-true consent gate to truthiness:1/21 fail.
8. Delete deployed worker load-error guard:1/21 fail.
Raw mutant JSON/logs and summaries are mutation-summary.json and mutation-worker-summary.json. Final native green rerun followed these mutations.

Control flow/path checks: existing suites verify crisis OR escalation, refusal/rest closing, denied clinical output, session-phase transitions, authorization errors, request deadlines, pending permission aborts, storage acknowledgement cardinality, stale auth boundaries, immutable playback payloads, duplicate identities, journal worker auth/claim/retry/concurrency and push privacy. New tests exercise malformed/unknown inputs, empty optional collections, exact maximum and maximum+1 for all generation collections, every evidence item including invalid final quote, literal-true consent vs null/false/string/array, async signout wait before handing new credentials to Auth, and late signed-in callbacks while pending logout. Worker adapter tests also verify bounded+ordered evidence, scoped session ID, sentinel overflow limit, generation abort forwarding and isolated finish/failure RPC contracts.

Loop checks: generated collection loops execute0,1,max,max+1; evidence loops execute1,4,5 and invalid last item; source filtering excludes AI speech (existing suite). Existing paging tests cover empty page, multi-page completion and paging cap; existing playback tests cover no observations, association failure and batch acknowledgement. No claim of all-path, MC/DC, basis-path, race-freedom or unbounded-loop proof is made. Source review corroborates safety rules, but regex guards cannot establish semantic factual truth.

Dataflow invariants established locally: model text only reaches the public error UI if on explicit approved whitelist; generated claims only accept Elderly source IDs+literal source quote; parser does not mutate supplied object when trimming; caller consent arrays/social acknowledgement/version reach RPC without synthesized consent; pending logout sessions are suppressed; worker stillAllowed requires literal true and returns failure on RPC error; session evidence is loaded under exact ID and bounded turn index order. Database RLS, live worker network configuration, Auth provider integration and real concurrent client/cache behavior require their separate layers.

Measured gaps: core branch85 remain uncovered, largely observations.ts73.02% branches and utils.ts57.14%; helper isDefaultAppearance is not invoked, several presentation/date helpers are not invoked. Data15 entire executable files have0 line coverage: session-report.ts; hooks assignments,chronicles,consents,guardians,inquiries,messages,notifications,orgJoin,organizations,programJournalPhotos,safety,sessions,shares,supervision. Remaining loaded hook callbacks are also partial. These gaps are included in totals; UI tests in other agents may exercise some separately but are not merged here. Do not describe this as exhaustive execution or100% white-box coverage. Edge branch gaps include provider data-shape/nullish fallbacks, bad statuses, optional runtime defaults and untested retry/error variants. Coverage maps show exact branches. Real Deno runtime/Edge permissions, SQL privilege enforcement, native mic/AEC/playback, real-provider latency/quality, device clock/locale and browser/mobile OAuth cannot be established by these isolated tests.

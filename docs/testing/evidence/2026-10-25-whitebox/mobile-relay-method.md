# Mobile / voice-relay white-box evidence — 2026-10-25

## Result and scope

- Fresh final mobile run: **37 test files / 438 tests passed**, exit 0, 37.08 seconds. `mobile-vm-coverage-final.log`, `mobile-vm-tests.json`.
- Fresh final relay run: **8 test files / 138 tests passed**, exit 0, 63.08 seconds. `relay-final.log`, `relay-tests.json`.
- Mobile and relay `typecheck` both exit 0; `mobile-typecheck.log`, `relay-typecheck.log`. `git diff --check` exit 0 after additions.
- Product source, dependencies, lockfile, deployment, DB, and secrets were not changed or read. Test additions only: 2 mobile cases, 7 relay cases. Temporary coverage configs and evidence are under `.tmp/whitebox-2026-10-25/mobile-relay/`.
- No new product defect was reproduced. Passing these tests does **not** establish full branch/path coverage or real-device readiness.

## Coverage — all eligible source files, including untouched files

| Scope | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Mobile | 1827 / 3555 = **51.39%** | 1255 / 2520 = **49.80%** | 319 / 876 = **36.41%** | 1502 / 2883 = **52.09%** |
| Relay | 752 / 902 = **83.37%** | 632 / 798 = **79.19%** | 88 / 121 = **72.72%** | 579 / 641 = **90.32%** |

Provider: external Vitest / `@vitest/coverage-istanbul` **3.2.6**, `all:true`. No coverage thresholds were lowered, no application guards were changed to pass tests. V8 was rejected for final reporting because its untouched-file placeholders distorted branch/function denominators. The final measurements use AST instrumentation rather than loaded-files-only coverage.

Mobile inclusion: `src/**/*.{ts,tsx}`, `app/**/*.{ts,tsx}`, `modules/**/*.{ts,tsx}`, `plugins/**/*.js`, `app.config.ts`; excludes `*.test.*` and declarations `*.d.ts`. This inventories **92 source files**, of which **91 have executable counters**; `modules/giokon-duplex/index.ts` is an export-only barrel with zero executable counters and is absent from Istanbul's output. **54 of 91** measured source files still have zero covered statements. Those files remain in the denominator; most UI routes/components, auth hosts, query/data adapters and the CMake plugin have substantial missing tests.

Excluded language/runtime scope is explicit: the actual Kotlin/Swift native duplex implementations, generated Android/iOS project code, build-tool configs (`babel`, `metro`, `tailwind`, ESLint), assets and CSS/JSON metadata are not part of these JS/TS coverage percentages. Native bridge TypeScript **is** in the measured scope. Other workspace packages are tested by their own scope owners.

Relay inclusion: all **7** production `src/**/*.ts` files, excluding tests/declarations. `main.ts` has 0 measured coverage because the real startup/health/readiness/shutdown test runs it in a separate Node child without Istanbul instrumentation. It remains in the denominator. Startup/shutdown behavior passed; adapter/service initialization branches in that child are not coverage-proven.

Coverage reports: `mobile-vm-coverage/{coverage-final.json,coverage-summary.json,index.html}`, `relay-coverage/{coverage-final.json,coverage-summary.json,index.html}`. Auditable file manifests: `mobile-source-manifest.json`, `relay-source-manifest.json`.

## Existing VM test coverage was retained and measured

Five existing test suites transpile actual product source and execute it in `runInNewContext`; ordinary coverage otherwise falsely reports these source modules at 0. A temporary pre-transform instruments the original TypeScript before the existing transpilation and shares `__VITEST_COVERAGE__` with the VM sandbox. It does not replace business logic or persist edits to tests/product files. Parser plugins are TypeScript + JSX. Instrumented source is cached per suite and workers bounded at 4 to avoid coverage-only compiler overhead.

| Actual source module | Statement coverage | Branch coverage | Line coverage |
|---|---:|---:|---:|
| `src/lib/live/engine.ts` | 84.43% | 76.33% | 90.63% |
| `src/data/session-persistence.ts` | 80.63% | 73.64% | 89.50% |
| `src/auth/accessResources.ts` | 94.44% | 89.47% | 94.11% |
| `src/auth/ProtectedNavigator.tsx` | 100% | 87.50% | 100% |
| `app/login.tsx` | 41.17% | 25% | 41.86% |

The temporary bridge is `mobile-vm.config.mjs`; native/React hook hosts and external services in these existing suites remain mocked. Rendering on a real device is not proven by VM execution.

## New focused tests and mutation evidence

1. `apps/mobile/src/lib/live/pcm-stream.whitebox.test.ts` (2): a second concurrent reader cannot replace the first pending consumer; fail drops buffered audio; terminal stream rejects further pushes.
2. `apps/voice-relay/src/relay.test.ts` (6 new cases): v2/v4 duplicate completed receipts close and release exactly once; v5 wrong-turn/extra-field/empty receipts fail closed; withdrawal of permission before the first synthesized v5 chunk prevents audio and closes/releases the session.
3. `apps/voice-relay/src/output.whitebox.test.ts` (1): original buffered and streaming output APIs reject forbidden output before any network/audio side effect. In-memory copies remove only the `screenAiUtterance` guard; the same assertion detects both mutants. No real network request occurs.

Additional external mutation proof: `relay-permission-mutant.config.mjs` removes only the first-chunk permission guard in the Vite transform. The new permission assertion **fails as expected**, exit 1, 1 failed / 137 skipped; socket stays open during the required immediate rejection window. Original full suite passes. Raw proof: `relay-permission-mutant.log`, `relay-permission-mutant-tests.json`. No product disk source was mutated.

## Control/data-flow proof and residual gaps

- Existing mobile suites exercise PCM-end-before-delayed-transcript, one-syllable/no-input endpoints, stale generation cancellation, duplicate callback suppression, disposal during permission/preflight/connect, remote pause/end, retrieval while persistence/playback is pending, native capture/playback errors, capture ID isolation and stream underruns. JS native-module mocks provide observations; they cannot prove microphone/AEC or OS timing.
- Existing relay localhost WebSocket suites exercise authentication and server prompt authority, protocol negotiation/restoration, v5 ordered chunks and provider barrier, late crisis cancelling synthesis, no raw Gemini PCM forwarding, pause/revoke/disconnect, input budgets, refusal/farewell vs acute distress, retries/event identity, 600-second server elapsed boundary, 9:59 behavior and bounded grace while output is in flight. Server elapsed time is authoritative; local paused time cannot reset it. A paused connection closes without opening the provider; reconnect after elapsed >=600 is rejected. Full DB proof that elapsed includes pauses belongs to DB regression evidence, not to these relay mocks.
- `relay.ts` remains 83.84% branch / 98.68% line covered. Important uncovered categories include socket/provider backpressure thresholds, malformed multi-key/binary envelopes and byte budgets, provider barrier timeout, post-abort queued callbacks, failed phase advancement and old provider shutdown branches. Tests are not exhaustive interleaving/model checking.
- `output.ts` remains 83.87% branch / 97.01% line covered. Missing paths include some HTTP status/content-type/body combinations, SSE metadata/status events, aggregate wire-size limit and uncommon WAV structures. This is deterministic text screening, not a proof of semantic/factual safety.
- Native Kotlin/Swift were inspected for mono PCM formats, AEC enablement, end-of-stream/playback-head completion, deadlines, capture generations and cleanup. Neither implementation was compiled/executed in this JS test run; device-specific focus/background/microphone/routing behavior is still open.

## Real-device manual scenarios to carry into the central runbook

Use synthetic test people only, record installed app/build, relay revision, platform/device/OS, wall-clock and expected/actual result. Each needs PASS / FAIL / BLOCKED and evidence.

1. **Fresh install microphone grant/deny/permanent deny:** no capture before permission; denial has clear recovery; granting after leaving/returning cannot create a stale capture. Test Android OS permission dialog temporary AppState background and the foreground wait.
2. **Real RN WSS handshake:** native Origin header reaches the deployed relay, JWT stays out of URL/logs; session actually connects on Android and iOS. Node `ws` success does not establish this.
3. **First response and streaming:** measure input end → first audible chunk and whole response; no wait for provider simulated playback, no clipped first/last syllables; induce network underrun and confirm silence does not count as completion.
4. **Quiet voice and barge-in:** quiet first word, one-syllable reply, noise-only, speaker echo-only and elder speech during TTS. Echo must not self-interrupt; real speech stops TTS, records interrupted (never completed), keeps first word and continues once.
5. **Native stop/focus failure:** phone call/alarm/audio-focus change, Bluetooth/headset route changes and app background/lock. No phantom completed receipt or subsequent capture/audio after retrieval. Restart only by the authorized foreground flow.
6. **Network loss mid-stream/receipt:** Wi-Fi off/on while first chunk, underrun, interrupted receipt and completed receipt. No hanging spinner/stream, duplicate adopted input, reused stale output or audio after stop.
7. **Pause/restart boundaries:** local pause vs supervisor pause/end while listening, synthesizing and playing; local resume cannot override remote pause. After resume, no duplicate opener or stale callback from the old connection.
8. **600-second session cap including pause:** pause before limit, let wall-clock cross limit, resume/reconnect. No new elder input reaches the provider; any already running AI output has at most the bounded grace. Compare stored/server timestamps.
9. **Safety while synthesis/playback:** synthetic approved crisis/acute-distress phrase and split transcription stop immediately, never softened to pause/farewell; ordinary rest/refusal receives only fixed farewell. Verify persisted event ID/excerpt and that retry/pending handoff does not duplicate an event.
10. **Permission/account revocation:** revoke consent/role or sign out during connect, listening, first chunk, persistence and recovery; no late audio, stale cache, cross-account transcript or successful reconnect.
11. **Persistence and human review:** cause save failure then retry/restart; interrupted playback and partial input stay honest; session ends only after transcript writes, one session/event per logical ID. AI draft remains human-confirmation pending; test against DB/worker evidence separately.
12. **Push/device chain:** actual Expo token registration, locked-screen generic text + ID only, notification tap to correct authenticated supervisor route and original-path return after login. Simulator/module mocks cannot prove OS push delivery.

## Tooling diagnostics (not product failures)

- Repository Vitest worker could not resolve the external coverage provider; corrected by executing external Vitest CLI.
- `--root` alone did not change child-process cwd; corrected by running the relay suite with workdir `apps/voice-relay`.
- Overlapping diagnostic coverage runs shared a report directory and collided; discarded those reports and reran serially.
- First uncached VM instrumentation with excessive worker concurrency exceeded the existing 5-second test timeout once. Corrected temporary instrumentation caching and worker limit; no timeout gate/product/test assertion was changed. Final clean run passes all 438.

Only final logs named above support the final metrics. Earlier diagnostic logs are retained for audit and must not be mixed into pass/fail totals.

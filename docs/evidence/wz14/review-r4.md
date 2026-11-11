# R4: ordinary pending runtime compatibility

[Re-check 1](https://github.com/openwizdev/wizplugins/pull/31#issuecomment-6782387522) resolved R1–R3 and identified R4. R4 is accepted, in its first correction round.

Claim: a valid SDK `pending` runtime must retain ordinary Settle/Snooze semantics. The raw-runtime authority used specifically for mute must remain strict. Existing fixtures all used ordinary idle runtime and missed the regression introduced by the previous correction.

Before: the registered-app table for ordinary Settled/Snoozed rows with pending runtime fails both cases; 44 other rendered cases pass. `review-r4-red.txt` records that result, committed in `62db335` before the fix. It includes a passing pending-mute control. Red output is synthetic, with ANSI formatting, checkout prefix and trailing whitespace normalised.

Fix: `useLifecycle` selects a separate runtime allowlist for mute. Ordinary shelves again accept the previously supported SDK pending runtime and use the unchanged exported `isWorking` predicate. Mute continues to require the narrower authority accepted by the server; its pending state stays visible. No server, storage, mutation, footer, count, dependency or schema behavior changes in this correction.

Verified source: `286eb133c1207a9e35fd75b5fcfe79afb586ee2c`, tree `533ed268c01862b1b6c8e3963b303e0f06c87c7e`. The handoff adds only receipts and red-log whitespace cleanup. `review-r4-rendered.txt` records 46/46 rendered cases passing. `npm run typecheck` passes (`review-r4-typecheck.txt`); the final `npm test -- --maxWorkers=2` passes 309 tests in eleven files (`review-r4-tests.txt`), run once after the source fix. Installation retains the prior successful `npm ci` and unchanged lockfile. Prior target/screenshots describe the same unchanged controls and layout; this restores existing shelf classification without adding a visual design or new state presentation.

R1–R3 remain resolved by independent review at the preceding head. No independent review is claimed for R4's fix. Public-content/ownership, noreply commit identity, unchanged exported working function and diff-whitespace checks pass. No helper was used. No new host observation was collected: the #26 mapping question remains open, and #9 live/build acceptance limits remain Unverified. Required CI and independent exact-head re-review are still merge gates; the builder never reviews or merges this PR.

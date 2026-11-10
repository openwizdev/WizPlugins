# WZ3 verification receipt

Fixture verification for #4 after WD1 enabled the pinned SDK backend harness. This is not live acceptance.

- `npm ci`: passed with the approved development peer and resulting lockfile.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 162 tests pass in seven files, including all 82 baseline tests and 80 SDK server-boundary cases. Exact receipts are adjacent.
- `git diff --check`: passed.
- Build: Unverified and not run. #3 prohibits the inherited legacy build command; no substitute is used.
- SDK fake integration: passed after WD1 approved `cron-parser` `^5.5.0` as development-only. The existing proof suite now uses SDK CLI/RPC schema validation, SQLite and realtime behavior; the interim bespoke registration capture was removed. See `dependencies.md` for the exact lockfile delta.
- No plugin installation, activation, live command execution, publishing, automatic parking or ownership inference occurred. Live state completeness and shelf refresh remain Unverified for #9.
- No helpers were used. Existing licence notices and attribution are untouched.

## Behavior and proof

`server.test.ts` drives the real plugin factory through `createFakePluginHost`, including the SDK CLI/RPC validation boundary and SQLite. SDK reads supply synthetic input records only; the plugin performs eligibility, SQL mutations, shelf resolution and CLI output itself. Every mutation uses the original table and lifecycle channel.

Red history: `red-guard.txt` records 38 failures because the original parking RPCs succeeded without authoritative checks. `red-command.txt` records 31 failures because no command was registered, with the 38 guard cases already passing. `red-arguments.txt` records a literal-ID regression before the parser correction. Each original red receipt and proof was committed before its corresponding implementation. After migrating those owning proofs to the SDK fake, `red-sdk-replay.txt` records 75 failures and two existing schema passes against the original WZ2 server at `9ee3e84`; the implementation was restored afterward. This replay confirms detection at the SDK boundary and is not presented as an earlier implementation step.

Runtime mapping is traced to SDK 0.4.4's declarations and the already locked bb-app 0.37.0 published sidebar hooks: the five `active*Count` fields correspond to the five sidebar activity counters; runtime display statuses supply runtime activity; `hasPendingInteraction` supplies waiting. SDK array-wide sidebar documentation excludes per-client draft indicators. A working draft combines a draft with existing work rather than introducing an independent server work source. Disconnected, malformed, missing or unreadable data refuses parking without a row change or publication. Client input cannot assert that a thread is idle. Unknown activity fields also refuse parking, so a future work counter is never silently discarded. `red-authority.txt` records the failing-first unknown-counter and out-of-range wake-date cases, followed by their guards.

The command registers the existing SDK CLI namespace `wizbar` with five operations. JSON uses `{ results: [...] }`, in input order; every result has `threadId` and `ok`, with a resolved shelf and applicable wake time on success or a public error code/message on failure. Exit codes are 0 for success, 1 for any per-ID failure, 2 for invalid command structure. Absolute snooze input requires an ISO timestamp with a timezone; presets call the existing sidebar calendar helper. List reports resolved shelves, so elapsed or activity-woken snoozes report Inbox (`active`) with no applicable snooze time.

Shared RPC names and schemas, table, channel, existing lifecycle helpers and frontend files are unchanged. Registered RPC parking methods now use the same guarded operation as the CLI. Unpark validates nonempty IDs before a delete and verifies existence, but does not require idle activity. #8 can use the command/result details recorded here; #9 retains all live approval gates.


Validated source commit: `f164fd32ce7166e2826050648e66facec6a6f319`. The hand-back commit adds only final check receipts.

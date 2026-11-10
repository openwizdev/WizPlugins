# WZ3 interim implementation receipt

This is progress under the ruling on #4, not a ready PR or live acceptance.

- `npm ci`: passed against the unchanged lockfile before implementation.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 159 tests pass in seven files, including all 82 baseline tests and 77 direct-handler cases. Exact receipts are adjacent.
- `git diff --check`: passed.
- Build: Unverified and not run. #3 prohibits the inherited legacy build command; no substitute is used.
- SDK fake integration: blocked on owner approval of its missing `cron-parser` peer. No dependency or lockfile change was made. Direct-handler tests are expressly interim; no SDK transport/schema integration is claimed.
- No plugin installation, activation, live command execution, publishing, automatic parking or ownership inference occurred. Live state completeness and shelf refresh remain Unverified for #9.
- No helpers were used. Existing licence notices and attribution are untouched.

## Behavior and proof

`server.test.ts` invokes handlers registered by the real plugin factory against in-memory SQLite. SDK reads supply synthetic input records only; the plugin performs eligibility, SQL mutations, shelf resolution and CLI output itself. Every mutation uses the original table and lifecycle channel.

Red history: `red-guard.txt` records 38 failures because the original parking RPCs succeeded without authoritative checks. `red-command.txt` records 31 failures because no command was registered, with the 38 guard cases already passing. `red-arguments.txt` records a literal-ID regression before the parser correction. Each red receipt and proof was committed before its corresponding implementation.

Runtime mapping is traced to SDK 0.4.4's declarations and the already locked bb-app 0.37.0 published sidebar hooks: the five `active*Count` fields correspond to the five sidebar activity counters; runtime display statuses supply runtime activity; `hasPendingInteraction` supplies waiting. SDK array-wide sidebar documentation excludes per-client draft indicators. A working draft combines a draft with existing work rather than introducing an independent server work source. Disconnected, malformed, missing or unreadable data refuses parking without a row change or publication. Client input cannot assert that a thread is idle.

The command registers the existing SDK CLI namespace `wizbar` with five operations. JSON uses `{ results: [...] }`, in input order; every result has `threadId` and `ok`, with a resolved shelf and applicable wake time on success or a public error code/message on failure. Exit codes are 0 for success, 1 for any per-ID failure, 2 for invalid command structure. Absolute snooze input requires an ISO timestamp with a timezone; presets call the existing sidebar calendar helper. List reports resolved shelves, so elapsed or activity-woken snoozes report Inbox (`active`) with no applicable snooze time.

Shared RPC names and schemas, table, channel, existing lifecycle helpers and frontend files are unchanged. Registered RPC parking methods now use the same guarded operation as the CLI. Unpark validates nonempty IDs before a delete and verifies existence, but does not require idle activity. #8 can document the command only after the remaining SDK proof and PR gate are cleared; #9 retains all live approval gates.

## Checked source hashes

- `wizbar/src/command.ts`: `902a85618869bd828a076cb46f55455b6d66838fa8f03336ebbc93002fee4cec`
- `wizbar/src/server.ts`: `b7a54aa1cc8f653a530208669e8184f964122171a065f8060c7a84218711ddf9`
- `wizbar/src/server.test.ts`: `f611975d41587830c7730120f8fa4f909696184417858e2a521b407301afcfbc`

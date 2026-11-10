# WZ3 proof plan

Evidence is synthetic fixture testing unless explicitly stated otherwise. The original direct-handler proofs were authorized as interim work on #4. They are now run through the pinned SDK fake for CLI/RPC validation, SQLite and realtime integration; live acceptance remains separate.

| Claim | Observable proof | Plausible regression missed by the baseline |
| --- | --- | --- |
| W5 parking refuses work, waiting and unreadable state | Call each registered parking RPC with every work counter, runtime work, pending interaction, malformed state and failed reads; assert refusal and byte-equivalent SQLite rows, without refresh events | Existing UI-only eligibility leaves raw RPC writes unguarded |
| W5 batches isolate bad IDs and repeat safely | Invoke registered CLI with eligible, unknown and invalid IDs; inspect one result per ID, exit status and final SQLite rows after repeats | No command exists in the baseline |
| W5 JSON and text expose outcomes | Invoke registered CLI in both formats, including mixed success and errors | A parser can lose results or return a successful exit for partial failure |
| W5 times match the sidebar | Invoke snooze with literal absolute timestamps and calendar presets, including unavailable evening and past/invalid times | Raw RPC currently accepts a past time; a new parser could drift from sidebar presets |
| W5 list resolves shelf and wake time | Seed rows through real parking handlers and exercise elapsed wakes, newer attention, work and waiting | Reporting stored rows alone would disagree with visible shelves |
| W6 one store and refresh | Alternate CLI and sidebar RPC mutations; inspect the same SQLite table and lifecycle publications, including deletion cleanup | Separate command persistence would leave the sidebar stale |
| W4 preserved shelf rules | Existing lifecycle and rendered-app suites | Changes to wake ordering or manual controls could regress upstream behavior |
| External orchestrator selection | Review command code for no automatic parking or inferred ownership | Plugin cannot establish which orchestrator started a thread |

Authority boundary: SDK 0.4.4 declares `threads.list` activity counts and `hasPendingInteraction`; `threads.get` alone is insufficient. Published bb-app 0.37.0's sidebar hooks map the same activity counters and runtime display statuses. Array-wide sidebar declarations explicitly exclude per-client draft indicators. No client-supplied eligibility is trusted. Missing, invalid, disconnected or unreadable state must refuse parking. Fixture success proves neither current live host completeness nor installed behavior; those remain Unverified for #9.

WD1 on #4 subsequently approved the development-only cron-parser peer and its lockfile changes, enabling the SDK backend harness. No live plugin execution, installation or build substitution is authorized. No helpers were used.

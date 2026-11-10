# WZ9 proof plan

The decision recorded on #13 on 2026-11-10 selects published SDK 0.6.125, the newest inspected version retaining `PluginSidebarThreadActivity.goals`. The existing working/parking predicate, including its goals check, must stay unchanged. This supersedes the original latest-version target; any behavioral change or rewrite still stops the upgrade.

| Claim | Evidence planned before the upgrade |
| --- | --- |
| Exact published SDK pin, no vendored declarations or additional direct dependencies | Registry/tarball integrity and manifest/lockfile comparison |
| Existing behavior and test meanings preserved | Baseline and candidate `npm ci`, `npm run typecheck`, and all existing tests with two workers; unchanged assertions and runtime implementation review |
| Every source/configuration edit is forced by SDK types/imports | Candidate compiler diagnostics before edits, mapped individually to the smallest edit |
| Sidebar and footer surfaces available for #5/#6 | Field-name inventory from published 0.6.125 declarations; no live claim |
| Parallel changes preserved | Fetch current main before handoff; merge any intervening #4/#7 changes and rerun affected checks |
| Upstream credit/notices intact | Byte comparison to main; no notice or attribution edits |

The baseline has 82 tests in six files: the original 80 plus two identity tests. This ticket adds no behavior, new test expectations, feature implementation, or UI changes. Compiler failures are the proof for forced type edits; no behavior regression test is invented. Keep compiler red evidence before the corresponding source fix.

The legacy build script must not be executed. #7 owns the documented `room-cli` script selection and its build gap; record the applicable boundary honestly. Plugin installation, live execution and publishing remain separately gated.

# WZ9 proof plan

The WD6 decision recorded on #13 on 2026-11-10 selects the newest published SDK retaining the complete required API set. The declaration survey identifies 0.6.33, including `PluginSidebarThreadActivity.goals`, the header component/props, sidebar action and PR hooks, nested environment provider ID, and footer registration. The existing working/parking predicate, including its goals check, must stay unchanged. This supersedes the original latest-version target; any behavioral change or rewrite still stops the upgrade.

| Claim | Evidence planned before the upgrade |
| --- | --- |
| Exact published SDK pin, no vendored declarations or additional direct dependencies | Registry/tarball integrity and manifest/lockfile comparison |
| Existing behavior and test meanings preserved | Baseline and candidate `npm ci`, `npm run typecheck`, and all existing tests with two workers; unchanged assertions and runtime implementation review |
| Every source/configuration edit is forced by SDK types/imports | Candidate compiler diagnostics before edits, mapped individually to the smallest edit |
| Sidebar and footer surfaces available for #5/#6 | Field-name inventory from published 0.6.125 declarations; no live claim |
| Parallel changes preserved | Fetch current main before handoff; merge any intervening #4/#7 changes and rerun affected checks |
| Upstream credit/notices intact | Byte comparison to main; no notice or attribution edits |

The baseline has 82 tests in six files: the original 80 plus two identity tests. This ticket adds no behavior, new test expectations, feature implementation, or UI changes. Compiler failures are the proof for forced type edits; no behavior regression test is invented. An isolated scratch run must pass before applying the fixture type additions to the branch. Keep compiler red evidence before the corresponding source fix.

The legacy build script must not be executed. #7 owns the documented `room-cli` script selection and its build gap; record the applicable boundary honestly. Plugin installation, live execution and publishing remain separately gated.

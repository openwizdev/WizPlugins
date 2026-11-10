# WZ9 check receipts

Verified source commit: `fc4af4721e9afd403cf91f1ecf22676c3c807c44`. Tree: `d2ab90eb601a16ae3eca2f014630b7528f8c4d27`. The handoff commit adds only these receipts.

## Before and after

| Stage | Install | Typecheck | Existing tests |
| --- | --- | --- | --- |
| Baseline 9ee3e84, SDK 0.4.4 | `npm ci`: pass | pass | 82 passed in six files |
| Scratch SDK 0.6.33, pin/lock only | pass | fail: 13 diagnostics in three fixture files | 82 passed in six files |
| Scratch SDK 0.6.33, forced fixture type additions | pass (same lock) | pass | 82 passed in six files |
| Branch source commit above, SDK 0.6.33 | `npm ci`: pass | `npm run typecheck`: pass | `npm test -- --maxWorkers=2`: 82 passed in six files |

The pre-fix diagnostics are in `typecheck-red.txt`, recorded at cb27554 before fixture edits. `forced-edits.md` maps the errors and SDK declarations to every fixture addition. Test assertions and runtime implementation are unchanged.

## Scope and source review

- Exact SDK pin and matching registry tarball integrity: 0.6.33. The published declaration survey and removal boundaries are recorded in `sdk-selection.md`; the field-name handoff is in `sdk-surface.md`.
- All 150 expectation calls/chains in the three edited files compare unchanged against main. All 21 runtime/config TypeScript files compare byte-identical against main. No new test case, expectation, application behavior, cast, import rename, or TypeScript configuration change.
- Only package/lock, three existing test fixture files, the owned changelog line and owned evidence changed. The manifest changes only the SDK pin. No new direct dependency. SDK-required lock changes add `cross-spawn` 7.0.6 and its transitive dependencies, and resolve Zod 4.6.7 to meet the SDK's `^4.6.5`; existing direct dependency ranges are unchanged. `cron-parser` is not added or promoted by this ticket.
- Both MIT notices and both existing README credits compare byte-identical against main. The owned diff passes whitespace and identifying-data checks; synthetic upstream fixtures retain their existing meanings.
- Main fetched before handoff remains 9ee3e84. The branch merges cleanly with it. #12 and #14 were still open at that check; any earlier merge must be incorporated before a later handoff.
- No helpers were used. Independent review and hosted CI at the final head remain separate gates.

## Build and live limits

Build remains **Unverified** under the existing build-boundary rulings: the documented `room-cli plugin build .` attempt exits 2 with `Unknown command plugin`. The inherited legacy `npm run build` script is not executed. #7 owns its supported-script selection and the build receipt remains an owner gate; no fake or substituted successful build is claimed.

No plugin is installed or run against a live app, and nothing is published. Fixture/type evidence does not establish live compatibility, Cloud/Local mapping, complete global inputs, or inline footer-number support. Those existing gates remain unchanged.

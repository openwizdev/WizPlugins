# WZ4 verification receipts

Verified source commit: `328db230447371ff42bb93b08fb5131782ec7408`.
Source tree: `d5c87f1c4559396305c520444ea682fffaec03be`.
The final handoff adds only these check receipts, not runtime or fixture changes.

| Check | Result |
| --- | --- |
| `npm ci` from `wizbar/` after the SDK merge | Pass; 474 packages installed from the unchanged main lockfile |
| `npm test -- src/ThreadCard.test.tsx --maxWorkers=2`, before the fix | 21 failed / 18 passed; expected Cloud/Local markers absent |
| Same targeted proof after the fix | 39 passed |
| `npm run typecheck` | Pass |
| `npm test -- --maxWorkers=2` | 227 passed in eight files |
| `room-cli plugin build .` | Exit 2: unsupported `plugin` command; build remains Unverified |
| `git diff --check` | Pass |
| `git merge-tree --write-tree HEAD origin/main` | Clean merge against main `19c0ceefde9af81f18f57973d476225bdda65b60` |
| Chromium fixture at 390 x 844 and 1440 x 900 | Both inspected; six expected markers and no horizontal overflow |
| Long title, hover, keyboard focus and icon-area navigation | Pass; details in `browser-checks.json` and `visual-review.md` |

The failing proof and its synthetic output were committed at `5dbcf52` before
the implementation commit. `rows-red.txt` retains that result; `rows-green.txt`
retains the same proof passing. Expected row labels are independent literals.
The table exercises all three row forms, null/empty/set providers and missing/
unreadable values. Additional cases preserve filtering, shortcut attributes,
normal/modifier navigation and park/restore callbacks. All existing upstream,
identity and batch lifecycle tests pass without any expectation changes.

## Scope, attribution and privacy review

The production delta is one typed `MachineIcon`, its insertion beside the status
slot in `ThreadCard` and `SlimRow`, and only Cloud/Laptop additions in the shared
icon registry. A product changelog line is included in `changes/5.md`. All other
additions are the owned rendered-app proof and granted synthetic evidence.

Package, lockfile, app registrations, existing tests, both README credit files,
and both MIT notices compare byte-identical to current main. No dependency,
header chip, parking predicate, storage/RPC schema, command or footer change.
The inherited licence notices and credit are preserved exactly.

All added text was checked for identifying thread/machine IDs, personal emails,
private machine paths and credential patterns. Fixture IDs are explicitly
synthetic. PNG text/EXIF metadata is absent; every image was inspected visually.
No private decision words or raw live records were copied. Public evidence
carries only the already-public WD5 decision summary and private-record pointer.
No helpers were used; independent review remains a separate gate.

## Remaining limits

The field rule is the approved observed pattern from WD5, not a documented
Cloud/Local meaning guaranteed by the SDK. SDK 0.6.33's declared nested field
was confirmed before code; no undeclared payload cast or hostname inference is
used. Unknown inputs remain unmarked.

The Cloud/laptop visuals use the existing Hugeicons library as the equivalent
outline artwork. Live host icon fidelity and live sidebar behavior are not
proven by synthetic rendering. Real screenshots here are Chromium fixture
screenshots, not live app captures.

The supported build remains Unverified under the existing #3/#13 rulings and
owner gate; its actual failure is retained in `build-unverified.txt`. The inherited
legacy `npm run build` command is not run. Nothing was installed or run in a live
app, published or released. Hosted CI and independent review at the final head
remain separate. No CI workflow has merged into this source main yet.

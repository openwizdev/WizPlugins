# WZ19 verification: children on hover, header-chip settings and `wizbar children`

Ticket #43, against the merged contract [`wizbar/contracts/sidebar-v3.v1.md`](../../../wizbar/contracts/sidebar-v3.v1.md) sections 1, 3, 7 and 8 and [`settings.v1.md`](../../../wizbar/contracts/settings.v1.md). Everything here is synthetic fixture evidence. Real-host behaviour stays with the live check (#9).

## Red first

`red.log` was committed before any implementation, with `children.ts` only a stub that throws. It shows 68 failures across `children.test.ts`, `ChildrenPopover.test.tsx`, `ParentChip.test.tsx` (the header-chip gates), `SettingsPage.test.tsx` (the switches) and `server.test.ts` (no `children` command).

Two test-only corrections came after that red run and before green:

- The usage table had one case without `--json` that parsed stdout. That case now has its own test, which checks for an empty stdout and the usage line on stderr.
- A test mock's type was fixed for the typecheck.

Neither change weakens an assertion.

## Claims and their proof

| Claim (acceptance criterion) | Proof |
| --- | --- |
| Hover and keyboard focus both open the panel. It closes on pointer leave, focus leave and Escape (focus returns to the count). | `ChildrenPopover.test.tsx`: "hovering the child count…", "keyboard focus opens it, Escape…", "closes when the pointer leaves…", "closes when focus leaves…". Browser: `capture.py` states `hover-*`, `focus-host` and `escape-host` |
| The panel may cover the next card but stays inside the viewport at 320 px and 390 px | `placePopover` puts the panel below the count, or above it when there is more room there, and clamps it to the client box. Rendered tests at 320 and 390 (one count near the bottom flips the panel above it, one near the top opens it below). Browser: `capture.json` sets `inside: true` and `pageOverflow: false` for every open state at both widths |
| Clicking a child opens that child; "Open parent" opens the parent | Rendered "clicking a child opens that child…" asserts exactly two host `open` calls, with no card navigation. Browser `click-host` gives `openCalls: ["thr_v3_child_waiting"]` |
| Each child shows status, title, age and, once the host serves it, model and effort | `children.test.ts` is checked against the hand-worked `v3Children` fixture and a status table (waiting, failed, working, unread, idle). The rendered tests check model chips with a host `cardModels` source and no chip when the source is none or fails. An unrecognised runtime status or a repeated ID shows "Children are unavailable right now." and never a guess |
| With no stored values, the children chip does not render and the parent chip does. Each switch turns only its own chip on and off | `ParentChip.test.tsx` "header-chip settings" has a table covering defaults, an unrelated key, both on, both off, one on, and non-boolean values. `SettingsPage.test.tsx` "header-chip switches" clicks each switch and checks that both chips render as expected and that the host write contains exactly that key |
| `wizbar children <id> --json` prints the contract's shape and equals the panel's list for the same fixture. An unknown ID fails with `unknown_id` | `server.test.ts` "WZ19 children". For every fixture parent, the raw `threads.list` rows (mapped by the contract's table) give JSON equal to `v3Children` and to `childrenList` over the sidebar rows (`childrenList` is the computation the panel draws). The suite also covers: all pages read with no project filter, text lines and `no children`, the title fallback and the server unread rule, a literal ID after `--`, `unknown_id` (missing or deleted), `invalid_id`, `state_unavailable` (failed read, non-array page, unknown runtime status, malformed row, repeated ID, failed lookup) and usage errors with exit 2 |

## Rendered screenshots (synthetic)

`render.html`, `render.tsx` and `serve.mjs` serve the real registered list with the v0.3 fixture rows and a fake WizBar server. `capture.py` (run with `browser-harness`) drives headless Chromium with real pointer, focus and key events and fails on any mismatch. The results are in `screenshots/capture.json`.

| File | Shows |
| --- | --- |
| `screenshots/beside-target-b.png` | Target picture B beside the rendered panel at 390 px (host models) and at 320 px (today: no model source) |
| `screenshots/{320,390}-hover-none.png` | Pointer on "3 children" with what ships today: no model source, so no model chips |
| `screenshots/{320,390}-hover-host.png` | The same with synthetic host models, as picture B shows them |
| `screenshots/{320,390}-focus-host.png` | Keyboard focus on "1 child" |
| `screenshots/{320,390}-escape-host.png` | After Escape: the panel is closed and focus stays on the count |

Deliberate differences from picture B:

- The count chip is hidden at zero (the plan's rule).
- "Open parent" has no arrow glyph.
- Model chips appear only once a host source exists. Today the source is `"none"`.
- The fixture CSS supplies utility classes, so colours approximate the host theme.

## Checks at the hand-back commit

From `wizbar/`: `npm ci`, `npm run typecheck` (`typecheck.log`, clean) and `npm test -- --maxWorkers=2` (`full-suite.log`: 22 files, 730 tests passed, after merging main with WZ20 stats; the `stats` and `children` commands sit side by side in the shared `command.ts` and `server.ts`).

## Helpers

None were used. The builder did all the work.

## Gaps

- No live host was used. Hover timing, the panel's real look, a host ancestor that could break `position: fixed`, and real model/effort availability stay Unverified until #9.
- The UI and the CLI share one computation. The parity shown here is over fixture rows. Whether the server reader matches the sidebar hook on real rows is for #9 and the parity ticket (#44).

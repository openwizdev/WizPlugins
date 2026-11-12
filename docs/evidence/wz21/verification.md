# WZ21 verification: drag to pin, unpin and reorder, and `wizbar pin|unpin|move`

Ticket #42, against the merged contract [`wizbar/contracts/sidebar-v3.v1.md`](../../../wizbar/contracts/sidebar-v3.v1.md) sections 5 and 7. Everything here is synthetic fixture evidence; real-host behaviour stays for the live check (#9).

## Red first

- `red.log`: committed in `381fdff` before any implementation. 38 failures across `drag.test.ts` (module missing), `inbox.test.ts` (`sortPinned` missing), `server.test.ts` (no `pin`/`unpin`/`move` command or RPC) and `ThreadInbox.test.tsx` (creation-order Pinned, no drag handling).
- Two test-only corrections after that red run, before green: two rows of the server `move` table were no-ops on their fixture order (the thread was already last), so the fixture order was changed so every row really moves; and the rendered drag helper now sets `clientY` on the event itself, because jsdom has no `DragEvent` and dropped the coordinate. Neither weakens an assertion.
- `guard-red.log`: committed in `902a321` before the fix. A repeated Alt+Up and a drop while a move was still out made 4 server calls instead of 1. The fix ignores new moves while one is in flight.

## Review round 1 (R1 to R4 on `8c7042f`)

`review1-red.log` (commit `bcc46d6`, before the fixes): 23 failures for the four findings.

- **R1:** after the host calls, the sidebar asks WizBar's server for a fresh pinned order (`pinnedOrder` RPC) and waits, up to 5 s, until the sidebar rows draw that order (`isReconciled`) while the rows are ready and the realtime connection is up. Only then is the outcome reported as placed/failed; otherwise it is unknown and the shelves show the existing unavailable state, retrying the read every 5 s until the rows return. Further moves wait until reconciliation ends. Proof: `drag.test.ts` `isReconciled` and `stepOutcome`; rendered "R1 …" cases (agreeing read, rows that never catch up, lost connection, a held read blocking the next move).
- **R2:** the RPC `move` used by drag reports only the host call (`place`); the CLI `move` still reads the pinned order after it and reports `state_unavailable` when that read fails. Proof: `server.test.ts` "WZ21 R2".
- **R3:** Alt+Up pins a focused row from an expanded Snoozed, Settled or Muted shelf, placing it at the bottom of Pinned. Proof: rendered "R3 …" cases for all three shelves.
- **R4:** a row the host reports pinned is drawn in Pinned even with a stored settle or snooze; the stored row is kept, so after an unpin it returns to its shelf. Proof: rendered "R4 …" cases.

## Review round 2 (R1 and R5 on `4279601`)

`review2-red.log` (commit `ea553ae`, before the fixes): 2 failures.

- **R1:** each realtime connection change starts a new epoch. The post-call read is taken only while connected, and a read from an earlier epoch is dropped (a fresh one is started), so reconnect-time cached rows can never agree with an older read. Proof: rendered "R1 never reconciles against a read taken before a reconnect" (the host order changes during the disconnect; the second move stays blocked).
- **R5:** the whole reconciliation attempt, read included, ends after 5 s; a late answer is ignored, and each retry attempt is bounded, so the next retry can run. Proof: rendered "R5 bounds a never-settling read" (unknown message and unavailable shelves after 5 s).

## Claims and their proof

| Claim (acceptance criterion) | Proof |
| --- | --- |
| Drop into Pinned pins, then places it where dropped (pin, then move with the drop position) | `ThreadInbox.test.tsx` "pins a card dropped into Pinned…", "offers an empty Pinned drop target…"; `drag.test.ts` `dropAction` |
| Drop out of Pinned unpins; drop inside Pinned reorders | `ThreadInbox.test.tsx` "unpins…", "reorders inside Pinned…"; `drag.test.ts` |
| The Inbox order is unchanged by any drop | `ThreadInbox.test.tsx` "never re-orders the Inbox…" and the failure table (order asserted after each failed call) |
| Pinned shows the host's pinned order | `inbox.test.ts` `sortPinned` on `v3PinnedOrder` and a hand-worked key/`pinnedAt`/`createdAt`/id table; rendered "draws Pinned in the host's pinned order" |
| A failed host call restores the card's place and shows the error; nothing half-moved | Nothing is moved optimistically: cards are always drawn from the host rows. Rendered failure table (pin, placement after pin, unpin, move) checks the message and both shelves' order; `drag.test.ts` checks every `v3DragPinCases` outcome and the unknown case |
| Keyboard users get the same moves | `drag.test.ts` `keyboardAction`; rendered Alt+Up/Alt+Down table (reorder, unpin from the last pinned card, pin from the Inbox, no-op Inbox down, no-op without Alt) |
| `wizbar pin|unpin|move --json` print the contract's shapes, per ID, with the contract's exit codes | `server.test.ts` "WZ21 pin, unpin and move": mixed batches, idempotent pin/unpin with no host call, text lines, `operation_failed` with the host's message, the four positions through `reorderPinned`'s neighbours, no call for a move to its own place, `not_pinned`, `invalid_anchor`, `unknown_id`, `invalid_id`, `state_unavailable`, ten usage errors with exit 2 |
| Drag and CLI use the same server operations | RPC `pin`, `unpin`, `move` call the same `createPinOperations` as the CLI (`server.test.ts` "serves the same operations over RPC") |
| Mute, settle and snooze rules for pinned threads are unchanged | `server.test.ts` "leaves mute rules for pinned threads unchanged" (`pinned` refusal); rendered pinned busy card has no park actions; the existing mute/settle suites pass unchanged |

## Checks at the hand-back commit

From `wizbar/`: `npm ci`; `npm run typecheck` (`typecheck.log`, clean); `npm test -- --maxWorkers=2` (`full-suite.log`: 17 files, 544 tests passed).

## Rendered drag (synthetic)

`screenshots/` holds six captures of the real registered list with the v0.3 fixture rows (`src/fixtures/v3.ts`) and a fake WizBar server, made by dispatching real browser drag events (headless Chromium):

| File | Shows |
| --- | --- |
| `before.png` | Pinned in the host's pinned order, Inbox newest first |
| `dragging.png` | An Inbox card dragged over the lower half of the first pinned card: the marker shows where it will land |
| `after.png` | The host rows after pin and move: the card is second in Pinned, the Inbox keeps its order |
| `failed.png` | A refused pin: "Pin failed: Sample host refusal.", every card where the host rows put it |
| `empty.png` | Nothing pinned: an empty Pinned drop target appears while a card is dragged |
| `unpin.png` | A pinned card dropped on the Inbox: one `unpin` call |

Reproduce from the repository root: `node docs/evidence/wz21/serve.mjs`, then open `http://127.0.0.1:4177/docs/evidence/wz21/render.html?state=<before|dragging|after|failed|empty|unpin>` (each page lists the server calls it made). It uses the locked Vite and SDK test harness already in the plugin's dependency tree and the WZ14 fixture CSS; it installs nothing and contacts no host. `after.png` draws rows a host would return after the calls; the fixture cannot change the SDK's rows mid-render.

## Gaps (Unverified until #9)

- The real host's pinned order, `pin`/`unpin`/`reorderPinned` behaviour and errors, and whether an RPC error's message reaches the sidebar unchanged (the test harness passes it through).
- Native drag in the host's sidebar (the card's full-bleed link is the drag source), the drop marker's look with the host's styles, and whether Alt+Up/Alt+Down collide with a host shortcut.
- The slot harness cannot change the sidebar rows mid-test, so the reconciled case uses a post-call read that already agrees with the fixed rows; the "rows catch up later" path is covered only by `isReconciled` and the waiter, not by a rendered row change. If the live host's pinned order differs from `sortPinned`, every drag would end as unknown after 5 s (#9 checks the order).

Helpers: none. No live host access, new dependency, plugin build, installation or publication.

# WZ18 verification (#40)

Built against the [sidebar v3 contract](../../../wizbar/contracts/sidebar-v3.v1.md) section 2 and its synthetic fixtures (`wizbar/src/fixtures/v3.ts`).

## Red first

`red.log`: the new tests run against the unchanged card with a stub `card-meta.ts`, committed before any behaviour. 33 failures: issue parsing, link and child-count text, model label, card metadata over every v3 fixture row, `cardModels` (no such RPC), and the rendered card (no model chip, no `#1042 → PR #1088` link, no child count, no hover-only branch). Guard cases that pass on both sides: zero children, non-parsing branches, RPC input rejection (the RPC did not exist yet).

## Green

- `affected.log`: `card-meta`, `ThreadCard`, `server` and `ThreadInbox` tests. All new tests pass.
- `full-suite.log`: `npm test -- --maxWorkers=2`, 519 tests in 17 files pass.
- Review R1 (PR #48): `r1-red.log` shows the card link had no accessible description of the location (2 failures), committed before the fix. Now the card link's `aria-describedby` names the location overlay, and keyboard focus inside the card reveals it like hovering (`group-focus-within/card:block`).
- Supporting edit, by the [orchestrator ruling on #40](https://github.com/openwizdev/wizplugins/issues/40#issuecomment-6822185632): in `wizbar/src/ThreadInbox.test.tsx`, exactly the three accessible-name strings `#412` → `PR #412`, the contract's PR chip text (acceptance criterion: the issue/PR link; supports `ThreadCard.tsx`). Href, title and attention-colour assertions there are unchanged. Nothing else in that file changed.
- `typecheck.log`: `npm run typecheck` passes.

## Rendered screenshots (picture A)

From the repository root: `node docs/evidence/wz18/serve.mjs`, then `browser-harness < docs/evidence/wz18/capture.py`; stop the server afterwards. The page renders the registered app with the v3 fixture rows and the locked SDK test harness; the fixture CSS is a utility subset (the WZ14 one plus this page's additions). It installs nothing and contacts no host.

| File | Shows |
| --- | --- |
| `screenshots/320-none.png`, `390-none.png` | What ships: `cardModels` returns `source: "none"`, so no model chip; links and child counts only |
| `screenshots/320-host.png`, `390-host.png` | The same rows with made-up model/effort served through `cardModels` (`source: "host"`), as a future host field would; one long synthetic model name tests wrapping |
| `screenshots/320-hover.png`, `390-hover.png` | Hovering the first card shows its branch as an overlay; no other card shows one |
| `screenshots/320-focus.png`, `390-focus.png` | Keyboard focus on the first card's link, pointer away: the same overlay shows (review R1) |

`capture.py` asserts, at each width and state: the first card's chips in order, no chip past its card's edge or with clipped text, no page overflow, the hover branch visible only on the hovered or focused card, and the first card's link described by its branch. `screenshots/capture.json` holds the measurements.

Compared with [picture A](../v0.3/targets/a-richer-cards.png): same order (model · effort, issue → PR, child count), chips wrap to a second row at 320 px instead of clipping. Differences, by the plan: no "0 children" chip; Cloud rows have no link, because the observed projection gives them no branch or pull request; no GitHub glyph in the link chip (no such icon is registered, and the icon file is not an owned path).

**Known capture issue (review R2, follow-up #51):** `390-host.png` and `390-hover.png` come out byte-identical and both show the overlay, while `capture.json`, read from the same page, records it hidden in the host state. The cause is not established; read the 390 px host state from `capture.json` and `320-host.png`.

## Behaviour notes

- The machine name, shown before on the third line when a thread had no branch, now shares the hover overlay with the branch, so the card face holds only the chips. Existing tests for it still pass.
- The PR chip now accepts pointer events, so the link is clickable over the card's full-size anchor.
- Each card asks `cardModels` for its own ID. While the source is `"none"` the answer is all nulls; a failure or missing handler omits the chip.

## Limits

Fixture renders prove no host behaviour. Model and effort stay omitted until a host field is adopted; Cloud links, real layout and the real look stay Unverified until the live check (#9).

Helpers: none.

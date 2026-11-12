# WZ20 verification (#41)

Footer bolt stats panel, the list-bottom line on the one running rule, and `wizbar stats`, built against [sidebar-v3.v1.md](../../../wizbar/contracts/sidebar-v3.v1.md) sections 1, 4, 6 and 7. Every row is the synthetic v0.3 fixture (`wizbar/src/fixtures/v3.ts`); expected numbers are its hand-worked `v3Stats` (4 running: 2 top-level, 2 children; 1 Cloud, 2 Local, 1 unknown; 3 waiting on you; finished today unavailable).

## Reproduce

From `wizbar/`: `npm ci`, `npm run typecheck`, `npm test -- --maxWorkers=2`. The scoped proof is `npm test -- --maxWorkers=2 src/stats.test.ts src/StatsPanel.test.tsx src/FooterCounter.test.tsx src/server.test.ts`.

Screenshots: from the repository root, `node docs/evidence/wz20/serve.mjs`, then `browser-harness < docs/evidence/wz20/capture.py` in a second shell; stop the server afterwards. The script owns one tab, asserts the panel's lines, the list-bottom line and the fixed bolt label for each state, and writes `screenshots/`. It uses the locked Vite and SDK test harness already in the plugin's dependency tree; it installs nothing and contacts no host.

## Results

- `red.log`: the proofs committed before any implementation. 16 failures, each for its claim: no `./stats` module, no stats panel registration, the footer still registered as the no-op action with its count icon, the list line still counting `isWorking` (indicator), and `wizbar stats` an unknown operation.
- `typecheck.log`: passes.
- `full-suite.log`: 479 passed, 3 failed. The three failures are the WZ16 list tests in `wizbar/src/ThreadInbox.test.tsx`, outside this ticket's owned paths: their rows put `indicator: "runtime"` over an idle runtime (not running under the contract's rule) and one renders the removed count icon. The exact fix is asked on #41 ([Builder question](https://github.com/openwizdev/wizplugins/issues/41#issuecomment-6821475943)); nothing outside the owned paths was edited.
- `screenshots/`: `desktop-ready.png` and `phone-ready.png` show the registered panel with the fixture's numbers and the "4" list line below the list; `*-unavailable.png` show "Stats unavailable" with no number. `beside-target-c.png` puts the desktop render beside target picture C. `capture.json` records each asserted state.

## Differences from picture C

- The picture's numbers (7 running, 18 finished) are illustrative; the render shows the fixture's. "Finished today" reads "not available yet": SDK 0.6.33 declares no finish time (contract section 4).
- The panel adds the Cloud/Local "unknown" count (contract section 4) and "some threads may be unseen" (coverage disclosure).
- The list-bottom line keeps #37's look (spinner and number, dim zero); only its counting rule changed.
- The host footer, its bolt and the disclosure frame in the render are placeholders. The host draws the real ones; their look and placement stay Unverified until the live check (#9).

## Limits

Fixture tests prove the computation, the registration shape and the rendered panel, not host behaviour. Whether the server reader's rows equal the sidebar hook's, the host's disclosure placement, and a live `wizbar stats` against the panel at one moment stay for #9. No plugin build, installation or publication was performed. Helpers: none.

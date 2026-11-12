# WZ16 verification

The [approved fallback and evidence grant](https://github.com/openwizdev/wizplugins/issues/37#issuecomment-6815197022) are applied: the existing no-op host footer has the static guidance label; the list-bottom line retains the live number and full hover disclosure. No casts, duplicate registration or host DOM workaround.

## Reproduce

From `wizbar/`, run `npm ci`, `npm run typecheck`, and `npm test -- --maxWorkers=2`. The affected subset is `npm test -- --maxWorkers=2 src/ThreadInbox.test.tsx src/FooterCounter.test.tsx`.

From the repository root, run `node docs/evidence/wz16/serve.mjs`, then in a second shell `browser-harness < docs/evidence/wz16/capture.py`. Stop the fixture server afterward. The script owns and closes one browser tab, checks every state and writes the ten PNG files plus `screenshots/capture.json`. It uses the locked Vite and SDK test harness already present in the plugin dependency tree; it installs nothing and contacts no host. Rendering uses the existing synthetic WZ5 thread fixtures and the WZ14 utility CSS subset, plus count-layout fixture styles.

## Results and limits

- `npm ci` passed: 474 packages installed. Its audit reported 15 vulnerabilities (2 low, 7 moderate, 6 high) in the unchanged lockfile dependency tree; no dependency changes are part of this ticket.
- Static-label red: `ruling-red.log`, one intended failure and 11 passing tests. Test and red log were committed before the label fix.
- Original count integration reds: `original-red-summary.txt` links the original public records. Full original logs and original target were unavailable in this continuation checkout; they have not been reconstructed or represented as recovered files.
- Affected green: `affected-green.log`, 64 tests. Full-suite and typecheck logs are recorded alongside this file after running on the implementation commit.
- `screenshots/capture.json`: ten passing synthetic captures at 1280×800 and 390×844, covering positive, hover, zero, disabled and unavailable. Each available count is exactly one, outside/below the scrolling area and above the placeholder footer, with a 29px line. Hover text remains inside the viewport. Zero uses the muted color; unavailable/disabled have no numeric line.
- The newly generated `target.png` and exact `target-prompt.txt` are continuation references. Generation preceded this continuation's production-label edit, but followed the earlier list implementation. The target illustrates the approved arrangement; the PNG captures show the actual registered component with fixture CSS.
- Source completeness, actual host footer/icon behavior, live updates and host layout remain keeper acceptance in #9. No plugin build, installation, release or publication was performed.

All new evidence paths under `docs/evidence/wz16/` support the approved label and list-number criteria in the owned `wizbar/app.tsx`, `FooterCounter` and `ThreadInbox` paths: proof plans/logs preserve the regression sequence; target/prompt show intended presentation; render/server/capture fixtures and screenshots make the synthetic visual checks reproducible. The grant changes no production behavior or interface authority. Helpers: zero.

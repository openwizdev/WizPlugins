# WZ11 completion evidence

The 2026-11-10 orchestrator ruling on #25 grants the single server import and
settings definition, approves the target with plain source wording, and removes
the host-acceptance sentence from the page. This record supersedes the pending
items in checkpoint.md. The historical target and red receipts are retained.

## Continuation and scope

The saved branch had no PR. Its latest GitHub push activity was 2026-11-10 at
22:04:20 UTC, over two hours before continuation. Main was merged before edits.
There is no AGENTS.md or CLAUDE.md in this repository. Policy blobs read in this
session are fleet.md at `1afc3f29e6ebd4d63b8e2b6cc52cfabe80220199` and helpers.md
at `a367bc2c6ded822bbc82601acd825ecdf8deba8f`. No hooks or formatter are named.
No helpers were used. The builder wrote and checked this change directly.

Shared-file changes are the settings import and registration in app.tsx, the
single import and definition in server.ts, visibility guards in both feature
components, and the new Settings contract section. Source adapters, classifiers,
counting, CLI and lifecycle handlers retain their existing behavior.

## Proof

The saved contract and red tests precede controls. A repeated baseline run found
11 expected failures and 5 passing pure boundary cases. The ruling-adjusted red
run in ruling-red.log adds source-report lifecycle coverage and has 12 expected
failures. It was committed before SettingsPage.tsx was created.

`npm ci --no-audit --no-fund` passed with no dependency or lockfile changes.
`npm run typecheck` passed. The scoped settings/backend/footer run passed all
25 tests. The complete plugin suite, `npm test -- --maxWorkers=2`, passed all
270 tests in 12 files. suite-pass.log retains the sanitised output.

Rendered fixtures establish registration, actual version, acknowledged independent
writes, reopening from saved values, visibility in both directions, type handling,
in-flight and rejected writes, focus retention, unavailable settings and source
report cleanup. The real backend factory establishes declared keys, defaults,
partial writes, durable fake-host reload and refusal of invalid settings.

The consumer functions `useWizBarSettings` and `useFeatureSourceStatus` are exported
from SettingsPage.tsx for #28 and #29. Status reports remain independent of feature
visibility. No report defaults to a live claim. Internal unavailable/unverified
states both render Not connected yet with a short reason, as approved.

## Rendered comparison

The real Chromium fixture uses the SDK rendered-app boundary with synthetic
settings and dark host-token values. It can be reproduced with the existing
Vite binary and vite.config.mjs, then render.html. No new dependency is added.
The screenshot manifest records both viewports and content widths.

- Phone is 390 × 844 CSS pixels. The two descriptions wrap naturally within
  the 24-pixel inset. Controls, source rows and version fit without clipping.
- Desktop is 1440 × 900 CSS pixels. Content stays left aligned in a maximum
  640-pixel section. The same two enabled controls and source states are shown.
- Relative to the target, the implementation follows the brief's actual 18-pixel
  heading and 14-pixel text, compact spacing and native controls. The generated
  target rendered larger typography. Approved wording and bottom-line removal
  are applied. The UI contains no live count or guessed machine classification.
- Primary text is #f4f4f5, secondary text #b6b8bc and ground #1c1e20. Browser
  computed colours match these pairs. WCAG 2 sRGB contrast is recorded below.
  The flat settings section has no overlay. Native dark controls retain a visible
  checked mark, and keyboard Tab focuses Footer count with a visible outline.
  Browser measurement found a 16-pixel checkbox and no horizontal overflow.

| Pair | Contrast ratio |
| --- | --- |
| Primary / ground | 15.21 |
| Secondary / ground | 8.42 |
| Native focus outline #eeeeee / ground | 14.41 |

This is synthetic browser and SDK-fake evidence. PC-host persistence, invalidation,
placement, presentation and plugin build remain Unverified for #9. The existing
keeper observation establishes source limits only. Its private record is linked
from the approved plan and host-observation contract. No live host action occurred.

The earlier builder's original first-successful-push receipt is unavailable in
this continuation. Its timing remains unknown. GitHub activity and commit dates
are used only for the requested concurrent-builder check.

## Final reason regression

The final checklist found that a future disconnected icon adapter could inherit
the initial still-being-checked reason. reason-red.log records one expected
rendered failure, committed at `8a95ecb` before the correction. Reasons now follow
the internal source status independently of feature identity. The same 25 scoped
settings/backend/footer tests and typecheck pass after this correction. The
initial screenshot state is identical. The preceding full local suite is retained
in suite-pass.log, and CI runs the complete suite for the final head.

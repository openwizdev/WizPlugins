# WZ13 builder checks and limits

## Proof chronology

Target/proof plan: `67f1f73`; red tests/logs: `c1875e3`; first implementation:
`4e89cef`. Rows red: 35 failures, 55 passes. Twenty-five failures directly
expose the old missing-Cloud/provider-inversion behavior; ten additionally expose
a fixture error: invalid parking authority returns rows to Inbox instead of a
parked shelf. The final table preserves that existing behavior, marking these
runtime cases Inbox-only rather than changing lifecycle rules. Source red:
three failures and one pass, exposing missing Cloud and loading/error guards.
The same final row/source contracts pass 94 cases; full plugin suite passes
385 tests in 14 files. Typecheck passes. No dependency or lockfile change.

Evidence classes: the private keeper comment is the existing live observation;
all new automated checks and captures are synthetic fixtures. No new host read,
installation, build, activation or write occurred. Build/visual parity and
N5-live remain #9. No independent review has yet occurred.

## Visual comparison

Captures render the actual registered app and its real row/glyph components with
SDK fixture data. Reused evidence CSS supplies the inherited utility subset;
it is not host styling. Source commit is `4e89cef`; viewports, ready selector,
scale 1 and reduced motion are in `screenshots/capture.json`. Both files were
opened and inspected. No horizontal overflow (390/1440 content widths match
viewports). Cloud/Laptop are muted 14px glyphs next to the unchanged status slot;
Starting workspace is unmarked. Existing navigation/actions remain under the
actual component tests, not an inert screenshot substitute.

Target drift, intentionally recorded before implementation: the generated
concept used tall bordered shelves and invented status captions. Real shelves
retain existing one-line 32px geometry; Inbox retains the original three-line
cards. Actual project metadata, elapsed times, glyph position and typography
come from the baseline. The hierarchy and Cloud/Local/unknown distinction agree
at both widths. There is no new layout, icon artwork or product stylesheet.

Dark craft: top/left sidebar ground #18191c, selected card #2c2e34, primary
#f1f3f5, muted icon/text #b9c0ca, subdued shelf text #9298a1. WCAG sRGB contrast
ratios against ground/selected respectively: primary 15.80/12.20, muted
9.59/7.40, subdued 6.05/4.67. Named text pairs exceed 4.5:1; glyphs exceed 3:1.
System sans font, clipped long-text utility and existing status placement remain.
Native open menus, focus/hover capture, other operating systems and host-applied
utility colors are not established by this pair. Rendered regression tests
cover actual navigation/parking, and no new control was introduced.

## Scope and unresolved work

Only owned source lines are changed: MachineIcon classification/source status,
ThreadCard/SlimRow prop plumbing, icon tests and the machine evidence contract
section. Lifecycle, server/CLI, settings wrapper, ordering and both header chips
are untouched. No new backend seam is required.

**Pending:** `MutedRow` in `ThreadInbox.tsx` was introduced by the merged mute
feature but its icon-plumbing line is outside #29's owned paths. The
[Builder question](https://github.com/openwizdev/wizplugins/issues/29#issuecomment-6788144886)
requests that exact line. Until granted and changed, Cloud muted rows remain
unmarked; environment-object Local markers still work. Do not treat all-row
acceptance as complete or merge this PR while that remains open. Continue with
a failing-first muted-row case once authority is recorded.

The source status intentionally stays unverified for ready projection input,
and unavailable during loading/error. This observed rule lacks an explicit
machine discriminant and is not certified live authority. An enabled setting
cannot strengthen that claim.

Builder checklist reviewed: explicit non-starting allowlist; unknown fails
closed; one classifier; red committed first; literal expected labels; original
regressions retained; scoped shared-file diff; no private paths/real identifiers
or exact private text; outgoing author/committer use GitHub noreply. No helpers
were started. No policy or release change, new dependency or live authority.

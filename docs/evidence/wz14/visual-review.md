# WZ14 synthetic visual review

The target was committed and posted before implementation (`f236940`). Real Chromium screenshots render the registered plugin app, not a mock HTML replacement, using the locked SDK testing runtime and a fixture-only subset of the existing CSS utilities. There is no host connection, live data, install or build claim.

Inspected `screenshots/phone.png` (390 × 844) and `screenshots/desktop.png` (1440 × 900). Content width equals viewport width in both captures. System sans loads; the question card, expanded Muted shelf, machine marker, visible Unmute and collapsed Settled (1) render without overlap or clipping. The phone uses full width; desktop sidebar remains 320px. Muted occupies approximately y=177–225 in both captures. The undo action is independently focusable and separate from row navigation.

The generated target expresses the same packet and hierarchy. Actual rendering intentionally keeps existing ghost scope picker, smaller shelf labels, right-aligned chevron and unboxed rows; it does not adopt the target's filled picker, oversized bordered row or blue action text. The existing single unpinned Inbox has no explicit heading, as before. Text, shelf count and attention meaning match. No unrelated visual system was changed.

`browser-checks.json` records long-title checks at both widths: one Muted shelf and one Unmute control, no overflow, full accessible title, direct keyboard focus, and successful pointer undo removing the shelf. The initial pointer test on an inactive browser tab did not dispatch; activating the same owned tab and repeating succeeded. This is recorded as browser-harness setup, not a product failure. Rendered tests independently prove modifier navigation and realtime refresh.

Dark craft: actual fixture neutral text #b9c0ca against #18191c has contrast 9.6:1 (rounded); shelf label #9298a1 has 6.1:1. Boundaries use #34363d as a decorative separator; interactive actions have text and an outline focus ring (#b5c5e7), not colour alone. Layout is quiet and compact; long titles truncate while Unmute retains its space. These measurements cover the fixture stylesheet, not the live host theme.

Reproduction: `npm ci` in `wizbar/`, then from repository root `node docs/evidence/wz14/serve.mjs`; open `/docs/evidence/wz14/preview.html` on the printed loopback origin. `?long` selects the long-title packet; `?collapsed` keeps Muted collapsed. Screenshot manifest records viewport and readiness details. Stop the fixture server after capture.

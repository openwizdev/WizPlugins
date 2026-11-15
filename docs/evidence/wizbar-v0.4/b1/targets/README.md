# B1 (#76) target pictures

Design targets for WizBar 0.4's sidebar, made before any visible B1 code. They are generated pictures, not screenshots, and prove nothing about the real sidebar.

- `desktop-1440.png`: the app window with the WizBar sidebar on the left, a running-count popover opened (latched) above the footer count, an expanded parent card and the WizDeck tab on the right. Generated at 1487 x 1058.
- `phone-390.png`: the same sidebar as a phone sheet, with the running list as a bottom sheet. Generated at 852 x 1846 (a 2.2x picture of a 390 px screen).
- `prompt.txt`: the exact prompts and route (built-in image generation through a helper, no API key).

All content is invented. The design follows the confirmed Ledger style in the ticket's words: dark surface, compact rows, thin separators, lime only as a small accent, no bolt.

Known target defects, to fix in the build rather than copy: the tool chose its own pixel sizes; both pictures fill the highlighted card with a lime tint (the build uses only a thin lime bar); the desktop underlines WizDeck's Home tab in lime; the phone drops the "WizBar" heading, places the footer arrow by the count rather than by "Needs you", and its Open buttons are under 44 px at 390 px (the build uses 44 px touch targets in the popover on narrow screens). WizDeck's own panel is D1's and only drawn for context.

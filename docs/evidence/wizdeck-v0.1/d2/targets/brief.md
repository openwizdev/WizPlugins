# D2 (#74) target brief

Synthetic design targets for WizDeck Home's D2 actions, made before any visible D2 code. Generated pictures are design targets, not screenshots, and prove nothing about the real page.

## Fixed (D1's confirmed Ledger home, unchanged)

Dark host surface (#0b0b0c), light grey text, compact rows, thin 1px separators, section headings with a thin rule extending right, restrained lime (#c6f432) only for answers and progress, Inter-like system sans. Header "Home" with factory picker, Needs you list, the Running / Merges today / Stalls big-number row, Versions with spec rows, refresh footer. No credits or costs. Every control is at least 44 px tall on the phone.

## D2 additions (in the Home's D2 slot, directly under Needs you)

1. **Answer.** One compact row per open decision, keyed by its code. Ordinary decisions show one outlined button per option; the recommended option has a lime outline and "(rec)". After a tap the row shows `Sending… Undo` with the bound question and choice for five seconds; nothing is sent until it ends. Live/release/publish/unknown decisions show "Gated · <risk>: decide in the orchestrator" and an "Open orchestrator" button, with no answer buttons.
2. **Tell the factory.** A multi-line text box, a Send button and a "Feedback" button. Below it, the latest messages with their delivery: "Sent · steered", "Waiting · queued by the host, not steered yet", "Uncertain · may have arrived; not resent". Each has "Reply: Open orchestrator": no reply text is invented, because the host gives no turn to match.
3. **Spec actions.** A spec picker and buttons: Pause, Resume, Prioritise, Ask why, Open spec. They message the orchestrator only; nothing changes on GitHub.

## Synthetic content packet

- Factory: `sample-factory`.
- N-12 · Which changelog headline ships with 1.4? Options: Short headline (rec), Long headline. Risk: ordinary. State: pending, `Sending "Short headline"… 4 s · Undo`.
- N-14 · Publish 1.4 to the marketplace? Options: Publish, Hold. Risk: publish. State: gated.
- Tell log: "Hold new builds for Sync engine until Monday." Sent · steered. "Answer N-11 · Yes" Waiting · queued by the host. "Feedback: the spec menu is hard to find." Uncertain · may have arrived; not resent.
- Spec picker: "Search filters · #41".
- Health: Running unavailable (—), Merges today 3, Stalls unavailable (—).
- Version 1.4 · 2/5 tickets merged; spec Search filters, Now: Building T2–T3, Next: Review T2, then merge, When: Today ~16:00 UTC.

## Selected targets

- `desktop-1440.png`: 1440 x 900, the app window with WizDeck in the right panel.
- `phone-390.png`: 390 x 844, the same panel as the phone's right panel.
- `prompt.txt`: the exact prompts and route (built-in image generation through a Codex helper, no API key).

Known target defects, to fix in the build rather than copy: the desktop panel starts near x = 906 rather than 880; the phone's side padding is about 40 px rather than 16 px, several phone controls look under 44 px tall (the build uses 44 px tap targets everywhere) and resizing narrowed its type; ellipses render as dots; the phone omits the option buttons beside the pending row (the build keeps them, disabled, while an answer is pending).

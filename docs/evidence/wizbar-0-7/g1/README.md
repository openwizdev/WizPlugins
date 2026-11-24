# WizBar 0.7.0 G1 fixture evidence

- [Producer output](producer-agents.v1.json) from a paginated synthetic GitHub
  fixture with a live builder, a lapsed reviewer, and a finished builder. A
  repeat run four minutes later received unchanged responses for both comment
  pages. No run map was used for this artifact.
- [Cloud agents sidebar](sidebar.png) rendered by the SDK fixture with the
  installed host stylesheet and headless Chromium. The section follows Pinned
  and shows Neon, Sol and Opus with their state and age. Only the live working agent counts
  in the header. The lapsed reviewer has the idle mark and a separate PR badge.
- [Running card](running-card.png) from the grouped-card fixture. Sample kernel
  counts its desktop thread and GitHub builder. Other counts its GitHub
  reviewer. A Chromium scene with 100 desktop rows and two GitHub rows checked
  sticky headers, fades, scroll padding, and full visibility of the last row.

The Cloud agents test compares the sidebar with `wizbar agents --json`, including
an archived run-map match and an unmatched entry with no recent note.

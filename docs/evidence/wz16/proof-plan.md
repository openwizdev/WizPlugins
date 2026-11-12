# WZ16 proof and continuation

The [ticket ruling](https://github.com/openwizdev/wizplugins/issues/37#issuecomment-6815197022) approves a static host-footer label and grants this evidence directory. Only the registration label in `wizbar/app.tsx` changes in this continuation.

- L1/L3: the registered list exposes one number outside and below scrolling rows; zero dims; disabled and unavailable inputs hide it. Owned tests: `ThreadInbox.test.tsx` and `FooterCounter.test.tsx`. Original red commits: `06a251b` (3 failures) and `d3749f1` (5 failures); implementation: `8c28b81`.
- L2: live source updates, reconnect invalidation, unfiltered child/project inputs and shared settings visibility remain covered by those rendered tests.
- L4: the registered no-op footer directs readers to the list using the exact approved static label. The old label omits that guidance; the existing registration test previously required that old label. Update its literal expectation and record the intended failure before changing production.
- Visual: registered-list captures use synthetic SDK input at desktop and phone widths for positive, hover, zero, disabled and unavailable states. Host footer is a placeholder; actual host sizing and clipping remain acceptance work in #9.

This directory supports only the owned footer registration and list-bottom number. It contains synthetic fixtures, target, captures and sanitised logs. The earlier builder reported an original target before implementation but its file is not present in the continuation checkout. `target.png` is a newly generated continuation reference before the label fix, not the original pre-implementation target. Original red summaries are preserved from public ticket comments, without inventing unavailable full logs.

Helpers: none. No live host access, new dependencies, plugin installation or publication.

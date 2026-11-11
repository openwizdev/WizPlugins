# WZ15 proof plan

The approved README-only scope follows the 2026-11-11 orchestrator ruling.
The original pin investigation remains recorded separately.
[Scope ruling](https://github.com/openwizdev/wizplugins/issues/27#issuecomment-6782951013).

| Claim | Evidence and limit |
| --- | --- |
| Readers find WizBar installation, activation and existing operations with honest live and pending-feature limits | Documentation review against current command/lifecycle/server source, merged mute contracts and the WZ8 install kit, followed by independent exact-head review. Installation and live dispatch remain unverified. |
| Provenance and MIT credit remain accurate | Compare copied snapshot, source path, tag and both licence notices. Independent attribution review remains required. |
| The README-only split preserves the approved 0.6.33 baseline | Manifest/lockfile readback and protected-file comparison against integrated main. Installation, typecheck and 253 tests were executed at the prior `a40414a` handback. The prose correction uses documentation checks and requires fresh CI at its new head. |
| Public changes stay within owned paths and carry public technical facts | Final diff and public-text scan. Product changes are confined to the plugin README. |

The plausible documentation regression is leaving the copied upstream title,
installation guidance or command inventory in the plugin README. Runtime tests
do not observe these reader-facing contracts. The failing baseline review at
`d5e28f8` predates the README fix and records each missing item in
[readme-red.md](readme-red.md). The original green comparison and the later pre-review correction are recorded
with their separate execution boundaries in [verification.md](verification.md).
The stale mute description is recorded before correction in
[mute-compatibility.md](mute-compatibility.md). That comparison covers seven
commands, persistence, explicit running mute and ordinary parking guards.

#9 consumes the README for desktop acceptance. #28 and #29 must account for the
SDK deferral. No new code seam is required.

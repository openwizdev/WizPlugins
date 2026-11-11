# WZ15 proof plan

The approved README-only scope follows the 2026-11-11 orchestrator ruling.
The original pin investigation remains recorded separately.
[Scope ruling](https://github.com/openwizdev/wizplugins/issues/27#issuecomment-6782951013).

| Claim | Evidence and limit |
| --- | --- |
| Readers find WizBar installation, activation and existing operations with honest live and pending-feature limits | Documentation review against the root README, command/lifecycle source and WZ8 install kit, followed by independent exact-head review. Installation and live dispatch remain unverified. |
| Provenance and MIT credit remain accurate | Compare copied snapshot, source path, tag and both licence notices. Independent attribution review remains required. |
| The README-only split preserves the approved 0.6.33 baseline | Manifest and lockfile readback, diff against main, `npm ci`, `npm run typecheck`, `npm test -- --maxWorkers=2`. Source and tests match main. |
| Public changes stay within owned paths and carry public technical facts | Final diff and public-text scan. Product changes are confined to the plugin README. |

The plausible documentation regression is leaving the copied upstream title,
installation guidance or command inventory in the plugin README. Runtime tests
do not observe these reader-facing contracts. The failing baseline review at
`d5e28f8` predates the README fix and records each missing item in
[readme-red.md](readme-red.md). The current green comparison is in
[verification.md](verification.md).

#9 consumes the README for desktop acceptance. #28 and #29 must account for the
SDK deferral. No new code seam is required.

# WZ14 check receipts

Verified source head: `ba4ea2854c43cd400a47c0db3ed53260c1f7c70e`.
Tree: `7c60420a33098eef926d81b8a52e9a70b7658b7b`.
The handoff commit adds only receipts and evidence wording/whitespace cleanup.

| Check | Result |
| --- | --- |
| `npm ci` in `wizbar/` | Pass, 474 packages from the existing lockfile; no dependency changes |
| Initial lifecycle/registered command/rendered red run | 25 failed, 70 passed; recorded before implementation in `f2af70c` |
| Completion-during-validation red run | 1 failed, 23 passed; recorded in `c721c44` before its fix |
| Unknown UI authority red run | 2 failed, 40 passed; recorded in `f564dd4` before its fix |
| Affected lifecycle/server/CLI/rendered suite | 204 passed in four files (`affected.txt`) |
| Final `npm run typecheck` | Pass (`typecheck.txt`) |
| Final `npm test -- --maxWorkers=2` | 296 passed in eleven files (`tests.txt`); full suite run once after final source changes |
| Browser synthetic app | Inspected both screenshots; no horizontal overflow; long title, focus and pointer undo passed at both widths |
| Ownership/privacy/identity checks | Only #26 owned paths; new text privacy patterns clean; outgoing author/committer emails use GitHub noreply; PNG text/EXIF metadata absent |
| Working/count/dependency/licence source checks | `isWorking` function byte-identical; package/lockfile, all footer/count sources, app registration and both notices unchanged |
| Conflict check | `git merge-tree --write-tree HEAD origin/main` clean against inspected main |

No helper was used. No independent review is claimed. Both existing command and upstream shelf proofs retain their meaning and pass unchanged. The two new safety regressions were caught before handoff: pending completion invalidates a validating mute, and unknown sidebar authority stays visible. Server attention observations cannot clear a newer mute because they share the pending-operation revision guard.

The checklist was applied to authority validation, per-ID failures, transactional exclusivity, append-only migration, persistent baselines, stale read protection, newest frontend refresh, owned shared sections, synthetic evidence and unchanged count semantics. Red logs replace the checkout prefix and trim trailing blank lines; no failure content is removed. Test fixtures use synthetic IDs only. Screenshots are synthetic registered-app evidence with a fixture stylesheet.

Remaining limits: [the keeper observation](https://github.com/jparker2006/ClosedWiz/pull/2375#issuecomment-6779925149) does not yet record the three breakthrough shapes. [Builder question](https://github.com/openwizdev/wizplugins/issues/26#issuecomment-6780291275) remains open and `needs-info` stays beside `ready-for-agent`. The finished-attention combination is a declared synthetic contract, not observed host semantics. Real keeper commands, live event delivery, host persistence, actual Inbox/count behavior and screenshots remain Unverified for #9. The supported desktop plugin build is still Unverified under the existing repository boundary and was not run or substituted. No installation, activation, publishing or release occurred.

Npm reported 13 vulnerabilities in the inherited graph (seven moderate, six high); no audit fix or unrelated dependency update was made. Fixture server and owned browser tabs were stopped after capture.

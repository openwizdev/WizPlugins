# WZ12 verification — in progress, not a hand-back

Branch: `wz12-observable-running-footer`, fresh public main at
`8e878b346916311fec6d2ac11c5450b275d16410`. Production source/counter tested at
`1f9ea5b` plus the later owned mute-visibility fixture adjustment. The final
progress comment records the pushed head and tree. No ready PR or CI receipt
exists yet: WZ12-F2 remains open. Do not treat this evidence commit as green.

## Proof chronology

| Command (from wizbar) | Before | After |
| --- | --- | --- |
| `npm test -- src/running-count.test.ts --maxWorkers=2` | 2 failures: thread-only positive/empty input returned null; `count-red.log`, committed `9adaf04` | 20 pass, `count-green.log` |
| `npm test -- src/running-source.test.ts --maxWorkers=2` | 27 failures/1 pass against unavailable stub; `source-red.log`, committed `a7dd05b` | 28 pass, `source-green.log` |
| `npm test -- src/FooterCounter.test.tsx --maxWorkers=2` | 4 failures/6 pass: unwired source, absent registration, wrong hover/status; `footer-red.log`, committed `17194a8` | intermediate 10 pass/1 registration failure in affected run; registration waits for WZ12-F2 |
| `npm test -- src/FooterCounter.test.tsx --maxWorkers=2 -t 'stale reuse'` | initial ESM-spy failure is not behavioral red; corrected run fails because reconnect restores retained count; committed `829669e` | 1 pass/10 unselected, `reconnect-green.log` |
| `npm test -- src/FooterCounter.test.tsx --maxWorkers=2 -t 'does not narrow'` | Original source connection was red above | 1 pass/10 unselected after adding real Muted shelf input; `muted-visibility.log` |
| `npm test -- src/running-count.test.ts src/running-source.test.ts src/FooterCounter.test.tsx src/SettingsPage.test.tsx identity.test.ts --maxWorkers=2` | scoped integration | 73 pass, 1 expected absent-registration failure; `affected-intermediate.log` |
| `npm run typecheck` | compiler validation | pass, `typecheck.log` |

The ESM fixture error was corrected before treating the reconnect run as red.
The first hover capture also failed fixture readiness and is not passed evidence.
See `capture-notes.md`. Every intended behavioral red is committed before its fix.
No workspace-wide suite, browser suite, Rust check, plugin build/install or live
host/PC/Mac command was run. CI will run the full required plugin suite once the
ready PR can be opened. No CI rerun, merge, publication or release is requested.

## Claims and limits

- Fixture N4: unfiltered observable cross-project/child/hidden/archived inputs,
  stable-ID deduplication and unchanged WZ10 predicate. Source rejects incomplete
  activity/membership, unknown indicators, malformed counters and contradictory
  normalised duplicate rows. Source normalisation never reads lifecycle rows.
- Fixture N4: actual source adapter stays independent of list filters and mute;
  the mounted Inbox has a Muted parent while the footer counts parent and child.
- Fixture N4: loading/error/disconnection clears the number. Recovery needs a new
  ready hook snapshot; the transport alone cannot revive a retained array.
- Fixture N4: explicit uncounted-subagent/unseen coverage on hover/focus, dim zero,
  spinner and inert clicks; WZ11 switch hides artwork independently of source
  `unverified`/`unavailable`. Production never publishes `live`.
- Historical complete-input/subagent fixtures retain their original meanings;
  they establish no real subagent mapping. Production needs no subagent map.
- N4-live: all-project/child/muted completeness, archived unseen work, updates and
  reconciliation, real footer sizing/placement/tooltip/wrapper behavior remain
  Unverified until keeper #9. No synthetic result establishes host completeness.

## UI inspection

Generated `target.png` predates UI edits and was approved with shorter hover copy
by WZ12-F1. The target is illustrative; the real fixture uses the specified 12px
number, 14px spinner and 6px gap. This explains scale differences. The shorter
approved tooltip wraps to two lines at both widths; no disclosure card is used.

Opened and inspected all ten completed PNGs in `positive`, `zero`, `hover-v2`,
`unavailable`, `disabled`. Each pair has its capture manifest: 390×844 and
1440×900 at 1× scale with reduced motion. All content widths equal their viewport
widths; no horizontal overflow, clipped number/hover or asset failure observed.
The blank states show no artwork. The shell does not fake the real host wrapper.
Contrast pairs (same synthetic palette as WZ5): foreground #e4e4e7 on #18181e,
13.93:1; dim #94949f on #18181e, 5.89:1; tooltip #e4e4e7 on #24242a, 12.16:1.
These are fixture color values, not host contrast or sizing acceptance.

## Allocation and workflow

Only allocated count/source/footer files, count contract section, evidence and
changelog are touched. `server.ts`, WZ10 observation contract, WZ11 settings API,
WZ14 lifecycle/mute implementation and WZ13 machine sections remain intact.
No dependencies or declarations changed; see `dependencies.md`.

Helpers: none; no helper windows or no-push checks needed. Independent review:
not started; no finding IDs, correction counters or reviewer lineage exists to
reset. Existing claim remains the sole owner. WZ12-F1 is resolved, WZ12-F2 asks
about static host label and possible empty action wrapper. No interface is
invented and no approval is inferred from elapsed time. The first-push receipt
is retained privately for posting once the ready PR exists. Private inherited
checkout remains clean. No unrelated owner or board stop is modified.

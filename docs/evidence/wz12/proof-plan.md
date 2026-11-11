# WZ12 proof plan — revision 9

2026-11-11; baseline `8e878b346916311fec6d2ac11c5450b275d16410`.
Read the keeper observation and merged WZ10 contract before implementation.
Revision 9 scopes the source to observable sidebar threads on SDK0.6.33.
Decisions are paraphrased; raw evidence remains private.
Private record: https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6786335355

| Claim | Owning evidence / plausible regression |
| --- | --- |
| N4-source: the unfiltered host hook supplies all observable projects/children | Source/count fixture and mounted production adapter: filtering or hiding child/muted rows loses work. |
| N4-count: unchanged `isWorking`, stable-ID deduplication | Existing count table extended for thread-only input: a missing subagent map suppresses valid counts, duplicate working rows inflate them. |
| N4-unknown: invalid/loading/error/disconnected inputs are never zero | Source fixture and mounted adapter transitions: missing work fields silently look idle; an earlier ready value leaks through failure. |
| N4-coverage: observable input never claims global or subagent completeness | Hover/source-status rendered proof: absent subagent mapping is fabricated as zero or connection is incorrectly called live. |
| N4-UI: spinner/number, dim zero, hover/focus, inert clicks | Rendered component and real synthetic page captures at 390×844 and 1440×900; a changed status leaves stale tooltip text. |
| N4-settings: disabling hides presentation but preserves source reporting | Existing WZ11 visibility guard plus mounted production adapter; hidden feature stops reporting errors. |
| N4-footer: supported inline registration | Independent source review plus Builder question WZ12-F1; fixture layout cannot establish host sizing/wrapping. |
| N4-live: actual placement, counts, freshness, children/muted work | Unverified until keeper #9; no live work in this ticket. |

Historical WZ5 tests keep their explicit synthetic complete/subagent inputs and
meaning; new thread-only input does not require that synthetic subagent map.
No WZ10 predicate, WZ11 settings/status API, WZ14 lifecycle/mute or WZ13 handler
change is authorized. No dependency or SDK change. Helpers: none needed.

Before each test edit: the owning row above states the contract, plausible bug
and missing coverage. Existing WZ5 tests only test explicitly asserted complete
input and never connect the production hook; new cases fill that gap.

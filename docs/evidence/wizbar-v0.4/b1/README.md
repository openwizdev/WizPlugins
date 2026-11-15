# B1 (#76) evidence

All values are synthetic. Fixture tests and the throwaway render harness prove no installation, host behaviour or live data. Cloudroom #160's `runningThreads` and `childrenByParentId` are fed to the hook in the shape #160 at `fec35c49` adds; no installed host carrying them was observed.

## Claims and proof

| Acceptance criterion | Claim | Evidence | Ready |
| --- | --- | --- | --- |
| Count equals deduplicated running rows including hidden/muted children and absent-parent groups | One set (`sidebar-v4/running.ts`: #160's inventory through C1's `readHostInventory`, else the sidebar rows by the one running rule) gives both the number and the popover's rows. Each id once; hidden, muted, child and absent-parent rows listed; parent headings and in-process subagents never counted; all projects, independent of search and scope; a host's empty list is a real zero; loading, error, a lost connection or a conflicting repeat show no number | `sidebar-v4/running.test.ts` (rules); `sidebar-v4/sidebar-v4.test.tsx` "B1 P6: the count equals the rows it opens"; `FooterCounter.test.tsx` N4 and V3; `ThreadInbox.test.tsx` WZ16 | Fixtures now; same-scope live comparison needs an installed host with #160 |
| Popover supports hover, keyboard and latched touch/click dismissal; each row opens its thread | Hover and focus open it; a click or tap latches it; Escape (focus returns to the count) and an outside press dismiss it; each row calls the host's `open` and closes it, with no `navigate` call | `sidebar-v4.test.tsx` "B1 P7" | Fixtures now; real host focus and touch need installation |
| Children start collapsed, running first and stable within groups; unknown total never appears complete | A parent card's toggle starts collapsed; rows are running first, then the rest, each in spawn order; the summary always says "total unknown" (#160 delivers only known children, and the app has no complete child read) | `sidebar-v4/children.test.ts`; `sidebar-v4.test.tsx` "B1 P6: a parent's children expand in the sidebar" | Now |
| Needs-you click opens its verified owning thread and makes no panel-open or send call; ordinary linked highlights do not navigate; missing or stale ownership is visibly unavailable (J88, revision 5) | Queue v1 has no per-item thread and only the orchestrator writes it, so the owner is the factory orchestrator, read only from D2's declared action log (`deckActionLog`, its `orchestrator` target, verified afresh by the backend: same thread, the factory's Cloudroom project, not archived or deleted; shape pinned to PR #85 at `c0d01a0f`). The list shows whether the owner is verified; a click re-reads it and, only if still verified for the same factory, opens it once through the host's native `open`. No panel open, send, answer, event or new field. An unverified, other-factory, malformed or failed answer, or no such backend method, stays "Owning thread unavailable" and opens nothing; a factory change during the click's check opens nothing. A spec selection highlights only threads with verified links; a thread selection highlights that thread; selection and deck refreshes never scroll, open or navigate. An opened card publishes a thread selection for its factory | `sidebar-v4/linked.test.tsx` (J88 cases; planted breaks below) | Fixtures now against D2's pinned shape. **Wait:** main has no `deckActionLog` until D2 (#74, PR #85) merges, so on main every click is unavailable; a real-backend proof follows integration. Full spec highlighting waits for F1 (#75, PR #86) membership. Live behaviour needs installation |
| Both upstream PR merge gates are verified before merge | Not a builder action: Cloudroom #160 and #158 were both OPEN at the last read; the fleet and reviewer record their `mergedAt` and merge commit | Recorded by fleet and reviewer | Open |

**Footer bolt removed (revision 4).** `FooterCounter.test.tsx` N4 "registers no footer bolt, disclosure, action or icon" (red against the bolt-registered `app.tsx`: `red-bolt.log`, commit `d8a378c`) and "reaches the counted rows from the registered thread list's count". `StatsPanel.test.tsx` and `cli-parity.test.ts` carry exactly the approved two-file treatment (applied from the posted diff): the stats component and CLI numbers, disclosures and unavailable states are unchanged, the parity case asserts the `stats` registration is absent and claims component parity only. The version-transition paragraphs (contract and both READMEs) and `changes/76.md` are the approved text; no new test, as the amendment states.

**Shared WizDeck lease.** `sidebar-v4/lease.test.tsx` runs the real sidebar and the real WizDeck panel against the real backend on one fake clock: one GitHub board read per 60-second interval with both open, no sidebar refresh calls, the shared rate-limit hold kept while only the sidebar holds a lease, no reads after unmount or once a hidden page's lease lapses, and no token in any answer, realtime signal or the sidebar's text. These guard existing behaviour; `lease-mutations.md` records the planted breaks each one catches.

Pinned order, shelves and lifecycle are unchanged: `sidebar-v4.test.tsx` "keeps the inbox's pinned order and shelves unchanged", plus the existing drag, shelf and lifecycle suites.

## Red first

- `red-rules.log` (commit `4d2721e`): the running-set and child-group rules against stubs. 13 cases fail on their own assertions; 4 refusal cases already pass against a stub that refuses everything, so they are guards there, and the conflicting-duplicate refusal fails because the stub gives the wrong reason.
- `red-render.log` (commit `46208bd`): the rendered popover, keyboard/touch and child-toggle cases before any UI. 7 fail on their claims (no count button, no toggle); the pinned-order guard passes.
- `red-linked.log` (commit `3238b89`): the Needs-you entry and highlight cases before the code. 6 fail on their claims. (Their WizDeck-opening cases are superseded by J88.)
- `red-owning-thread.log` (commit `e7d9b01`): the J88 owning-thread cases against the WizDeck-opening entry. 9 fail on their claims; the queue-unavailable and no-factory cases pass as guards.
- J88 planted breaks against the implementation, each caught: dropping the factory check after the click's await fails "opens nothing when ownership turns stale or the factory changes…"; trusting the answer from when the list opened fails the same case (stale part); opening regardless of the verdict fails all six unavailable cases and that case.

## Owned test changes, and why

- `FooterCounter.test.tsx`, `ThreadInbox.test.tsx` (WZ16): the count is now a button that reads "N running" and opens its rows; the old inert-count and "subagents not counted yet" tooltip assertions change to the popover's rows and its older-host note. The two WZ16 cases still prove one count below the scroll area, independent of search and scope.
- `ThreadInbox.test.tsx` (WZ21 `pinCalls` and WZ16): the effect filters also ignore `deckWatch`/`deckRelease`, the read-only WizDeck lease the sidebar now holds. No pin effect assertion changed.
- `ThreadCard.test.tsx`: the "no model chip" case reads the "Thread details" line, because the new child toggle's summary also uses "·".

## Pictures

`targets/` holds the generated targets made before any visible code (see its README). `screenshots/` holds the real `ThreadInbox` rendered at 1440 x 900 and 390 x 844 in a throwaway Vite harness outside the repository: the SDK's slot harness, a shim adding #160's two fields, synthetic rows, a stubbed `deckWatch` answer built with D1's `buildHomeView`, and a fixture stylesheet approximating the host's dark theme and utility classes. Not the installed host's chrome, fonts or sidebar width. The centre and WizDeck panel are placeholders.

Compared with the targets: same structure (expanded parent with running children first, count without a bolt, latched popover titled "5 running · all projects" with the parent, "Parent not running" and "Unplaced" groups, hidden/muted tags, Open per row, phone bottom sheet with 44 px rows). Deliberate differences: only a thin lime bar marks a highlighted card (no lime fill); the popover is anchored to the count's right edge and stays inside the sidebar; the v0.3 "3 children" hover chip stays beside the new toggle.

## Helpers

One swarm, one helper: image generator (Codex Terra 6.1, high, shared sandbox), slice "target pictures", base commit `109a3bd`. Result: two targets; used both, with the recorded defects not copied. No-push check: clean.

## Gaps

- **Owning-thread source (wait, acceptance open).** The owner comes only from D2's `deckActionLog`, which is not on main until #74 (PR #85) merges. Until then every Needs-you click is "Owning thread unavailable". After it merges, B1 merges main, checks the pinned shape against the merged one, and adds a real-backend proof (sidebar and D2's server on the fake host, as `lease.test.tsx` does). No other source is used.
- **History (J88).** The WizDeck tab-hop, cross-factory focus and repeated-click proposals (Options 1 to 3) are dropped from the product; `home-focus/` keeps their host trace and evidence. The sidebar-opener host finding there is why 0.1 opens the owning thread instead.
- **Full spec highlighting (acceptance open, wait).** Spec highlights use only links the deck has verified (merged PRs and the spec's own thread). An open builder PR is not in the board's verified list, so most fleet threads are not highlighted until F1's membership is integrated. F1's supported seam is its fleet model (`threadsOfSpec` over verified fleet links, PR #86); B1 integrates it after #75 merges. This subset is not claimed as the complete behaviour.
- The sidebar's WizDeck lease keeps D1's shared 60-second refresh alive while the sidebar is visible (#73's surface-in-use rule); renewals pause when the page is hidden.
- Running and idle durations and stall status are not shown: C1 records that no activity clock or same role/state stall policy exists.
- Not tested: an installed host with #160/#158, real focus, touch and side-panel behaviour, the host's fonts and sidebar width.

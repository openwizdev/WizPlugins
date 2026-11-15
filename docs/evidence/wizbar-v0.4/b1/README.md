# B1 (#76) evidence

All values are synthetic. Fixture tests and the throwaway render harness prove no installation, host behaviour or live data. Cloudroom #160's `runningThreads` and `childrenByParentId` are fed to the hook in the shape #160 at `fec35c49` adds; no installed host carrying them was observed.

## Claims and proof

| Acceptance criterion | Claim | Evidence | Ready |
| --- | --- | --- | --- |
| Count equals deduplicated running rows including hidden/muted children and absent-parent groups | One set (`sidebar-v4/running.ts`: #160's inventory through C1's `readHostInventory`, else the sidebar rows by the one running rule) gives both the number and the popover's rows. Each id once; hidden, muted, child and absent-parent rows listed; parent headings and in-process subagents never counted; all projects, independent of search and scope; a host's empty list is a real zero; loading, error, a lost connection or a conflicting repeat show no number | `sidebar-v4/running.test.ts` (rules); `sidebar-v4/sidebar-v4.test.tsx` "B1 P6: the count equals the rows it opens"; `FooterCounter.test.tsx` N4 and V3; `ThreadInbox.test.tsx` WZ16 | Fixtures now; same-scope live comparison needs an installed host with #160 |
| Popover supports hover, keyboard and latched touch/click dismissal; each row opens its thread | Hover and focus open it; a click or tap latches it; Escape (focus returns to the count) and an outside press dismiss it; each row calls the host's `open` and closes it, with no `navigate` call | `sidebar-v4.test.tsx` "B1 P7" | Fixtures now; real host focus and touch need installation |
| Children start collapsed, running first and stable within groups; unknown total never appears complete | A parent card's toggle starts collapsed; rows are running first, then the rest, each in spawn order; the summary always says "total unknown" (#160 delivers only known children, and the app has no complete child read) | `sidebar-v4/children.test.ts`; `sidebar-v4.test.tsx` "B1 P6: a parent's children expand in the sidebar" | Now |
| Needs-you click opens the specific deck item; ordinary linked highlights do not navigate | **Open: cross-factory focus.** With the panel already on another factory, D1's Home ignores the focus; the exact Home fix and its regression are proposed on #76 (not applied, no path grant yet). The entry lists WizDeck's own queue items and calls D1's `openWizDeck` with that exact `FocusRequestV1`; an unreadable queue is "unavailable", never zero. A spec selection highlights only threads with verified links (the thread's PR among the spec's verified merged PRs, or its branch issue in its PR's repository being the spec); a thread selection highlights that thread; no selection scrolls, opens or navigates. An opened card publishes a thread selection for its factory | `sidebar-v4/linked.test.tsx` | Fixtures now for the same factory; cross-factory open pending the Home grant; full spec highlighting open pending F1 membership; live focus needs installation |
| Both upstream PR merge gates are verified before merge | Not a builder action: Cloudroom #160 and #158 were both OPEN at the last read; the fleet and reviewer record their `mergedAt` and merge commit | Recorded by fleet and reviewer | Open |

**Footer bolt removed (revision 4).** `FooterCounter.test.tsx` N4 "registers no footer bolt, disclosure, action or icon" (red against the bolt-registered `app.tsx`: `red-bolt.log`, commit `d8a378c`) and "reaches the counted rows from the registered thread list's count". `StatsPanel.test.tsx` and `cli-parity.test.ts` carry exactly the approved two-file treatment (applied from the posted diff): the stats component and CLI numbers, disclosures and unavailable states are unchanged, the parity case asserts the `stats` registration is absent and claims component parity only. The version-transition paragraphs (contract and both READMEs) and `changes/76.md` are the approved text; no new test, as the amendment states.

**Shared WizDeck lease.** `sidebar-v4/lease.test.tsx` runs the real sidebar and the real WizDeck panel against the real backend on one fake clock: one GitHub board read per 60-second interval with both open, no sidebar refresh calls, the shared rate-limit hold kept while only the sidebar holds a lease, no reads after unmount or once a hidden page's lease lapses, and no token in any answer, realtime signal or the sidebar's text. These guard existing behaviour; `lease-mutations.md` records the planted breaks each one catches.

Pinned order, shelves and lifecycle are unchanged: `sidebar-v4.test.tsx` "keeps the inbox's pinned order and shelves unchanged", plus the existing drag, shelf and lifecycle suites.

## Red first

- `red-rules.log` (commit `4d2721e`): the running-set and child-group rules against stubs. 13 cases fail on their own assertions; 4 refusal cases already pass against a stub that refuses everything, so they are guards there, and the conflicting-duplicate refusal fails because the stub gives the wrong reason.
- `red-render.log` (commit `46208bd`): the rendered popover, keyboard/touch and child-toggle cases before any UI. 7 fail on their claims (no count button, no toggle); the pinned-order guard passes.
- `red-linked.log` (commit `3238b89`): the Needs-you entry and highlight cases before the code. 6 fail on their claims.

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

- **Cross-factory and repeated Needs-you focus (acceptance-blocking, open).** If the open WizDeck panel shows another factory, D1's Home ignores the focus, and a repeated identical open of an active tab reaches no panel. The host trace, both options, the full diff and red/green runs are in `home-focus/`. The complete option needs a new plugin-local event (a user boundary); `Home.tsx` is not B1's and is not edited.
- **Sidebar → WizDeck opener (host, open).** By Cloudroom source at `827a3d03` and #160's `fec35c49`, a sidebar slot has no thread-panel opener handler, so `openThreadPanel` from WizBar's sidebar returns `false`; the Needs-you entry then says "Open a thread to see WizDeck beside it." Opening from the sidebar needs a host change (`home-focus/README.md`, finding 4).
- **Full spec highlighting (acceptance open).** Spec highlights use only links the deck has verified (merged PRs and the spec's own thread). An open builder PR is not in the board's verified list, so most fleet threads are not highlighted until F1's membership is integrated. This subset is not claimed as the complete behaviour.
- The sidebar's WizDeck lease keeps D1's shared 60-second refresh alive while the sidebar is visible (#73's surface-in-use rule); renewals pause when the page is hidden.
- Running and idle durations and stall status are not shown: C1 records that no activity clock or same role/state stall policy exists.
- Not tested: an installed host with #160/#158, real focus, touch and side-panel behaviour, the host's fonts and sidebar width.

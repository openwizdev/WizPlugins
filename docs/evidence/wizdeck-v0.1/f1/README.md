# F1 (#75) evidence

All values are synthetic. Fixture and rendered-harness results prove no installation, host capability, GitHub access or live behaviour. The Cloudroom #160 and #158 merge gates are unchanged: this work must not merge until both are merged and their `mergedAt`/`mergeCommit` are recorded by the fleet and the reviewer.

## Revision 4 supporting edits (approved)

Approved in revision 4 (fingerprint `81acaaa2…`; currentness re-validated by the builder: #75 body sha256 `f8d179e9…`, spec and sibling bodies match, label `ready-for-agent`). Each edit below serves one acceptance criterion and supports one owned path:

| Path | Edit | Criterion | Supports | Why needed |
| --- | --- | --- | --- | --- |
| `wizbar/src/deck/data/server.ts` (shared) | Optional `DeckWatchResultV1.fleetLinks?: CacheView<FleetLinksV1>[]`; one `lease()` per configured repository with key `github\|<account>\|<repo>\|fleet-links` | Searchable fleet with known links and honest unplaced work | `deck/fleet/links.ts`, `Home.tsx` insertion | The only way to read work links inside the one shared cache, budget and 60-second schedule (no second poller, no per-row lookup) |
| `wizbar/src/deck/home/Home.test.tsx` (shared) | Line 165: `["Needs you · 1", "Fleet", "Versions"]` | Phone and desktop hierarchy | `Home.tsx` Fleet slot | D1's exact heading-order assertion must include the approved slot |
| `changes/75.md` | The exact approved line | Changelog contract | All of F1 | No new test: prose only |

Proofs for the lease (`src/deck/fleet/fleet-server.test.ts`, through the real plugin entry and the SDK fake host): two consumers share one link read per 60 s; only the selected factory's repositories are returned; on a rate limit, known links are kept stale, no read happens before the reset deadline and reads resume after it; a bounded read keeps its known links with a gap and is never complete; a token echoed by a failing read never appears in RPC results or realtime signals; disposal stops reads. Red: `red-server.log` (commit `ee8043e`, all 6 fail on assertions against the unchanged server).

D2 (#74) coordination: D2's branch is not merged and does not touch `deck/data/server.ts` yet; its settings-handle return will be kept beside this lease when it lands. `Home.tsx` has one adjacent-line textual overlap with D2's branch (its `DeckActions` line sits directly above the health row F1 replaces). The resolution keeps both: `DeckActions` first, then F1's live/D1 health row. Section order with both features: Needs you, Answer, Tell the factory, Spec actions, Fleet, Versions.

B1 (#76) seam: `threadsOfSpec(model, spec)` gives a spec's full placed membership (manager, builders, helpers), built from the same `fleetLinks` B1 already receives from `deckWatch`, not only threads behind merged PRs. Proof: `fleet.test.ts` "gives a spec's full placed membership…" (red: `red-membership.log`, commit `3507ea3`).

## Review round 1 (R1–R4)

Reviewed head `ee06603`. Red: `red-review-1.log` (commit `21a41e5`). Seven tests fail on their assertions against the reviewed code, nothing planted; a cancellation guard already passes.

- **R1, branch name alone links across repositories.** *Superseded by the final correction below.* Round 1 used the project's anchor remote (`projects.get(...).gitRemoteUrl`) as every thread's repository; the re-check showed that a project's sources can differ from its anchor. That read and its parser are removed.
- **R2, uniqueness and ticket agreement unproved.** `FleetLinksV1` (F1's own type inside the approved `fleetLinks` field) now records `openComplete` and `mergedComplete` per repository. An open match needs every open PR read. A merged-only match needs both lists read. A PR whose closing tickets were truncated (`ticketsComplete: false`) is not proof of one spec. In each case the row keeps its known ticket/PR links with status `unproved` and is not placed. The merged list's bound does not affect an open match. An unread repository proves nothing. Proofs: `fleet.test.ts` "keeps the known links but withholds placement when closing tickets were truncated", "withholds placement when the relevant pull requests were not all read…".
- **R3, a failed continuation discarded read pages.** A failed or rate-limited later open-PR page now keeps the first page and the merged list as partial data (`complete: false`, `openComplete: false`, fixed-wording gap). A rate limit's deadline goes to the shared cache as `retryAt`, and cancellation still propagates. Proofs, through the real plugin entry: `fleet-server.test.ts` "on first load, a 503 continuation…", "a rate-limited continuation keeps the first page and holds reads until GitHub's reset", "a continuation failure that echoes the token…"; `fleet.test.ts` "still propagates cancellation during a continuation".
- **R4, Needs-you focus from a fleet page.** F1's own insertion closes the fleet page and focuses the requested item once Home has mounted it. A read Needs-you list without the item ends the wait, so a later refresh cannot steal focus. D1's focus effect is unchanged. Proof: `FleetViews.test.tsx` "focuses the requested queue item once Home is back…". It checks `document.activeElement` with a fresh synthetic queue, then a selection change and a realtime refresh move nothing. B1's cross-factory and repeated-click focus remain B1's.
- **R5** (polish, #88) is not changed here. The fixture-only timestamp check is not counted as evidence.

## Final correction (orchestrator decision: fix once more R1, R2, R6)

Reviewed head `dc045d8`. Red: `red-final-check.log` (commit `2539150`). Four tests fail on their assertions against `dc045d8`, nothing planted. The coverage-boundary table already passes there and is kept as a guard.

- **R1, project anchor is not checkout provenance.** A Cloudroom project can have sources on several hosts, a clone remote override or an inspected local source, so its anchor remote does not prove any one thread's checkout repository. SDK 0.6.33 gives a plugin no per-checkout repository evidence. `project.inspect` and `host.discover_repos` are host-daemon commands, not plugin APIs, and reading checkout paths would be path inference. The host's per-thread PR hook would prove it, but it is a per-row lookup, which the spec forbids. So every thread's provenance is now `unverified` (`no-supported-source`). No branch places anything, and nothing reaches relatives, `specOfThread` or `threadsOfSpec`. Home says so plainly: "Not placed under specs: no supported source proves which repository each thread's checkout belongs to (a host capability gap)". Each row reads "not placed: no supported source proves this checkout's repository". The panel no longer calls `projects.get`. `CheckoutProvenanceV1` (`fleet/model.ts`, optional `useLiveFleet` argument) is the seam a future supported source would fill. Tests of the tree's rendering pass a fixture lookup there; production passes none. Proof: `FleetViews.test.tsx` "receives the backend's fleetLinks but places nothing by branch without per-checkout provenance". It renders through the real panel with an anchor remote available, and checks that no spec group appears, all 8 threads are unplaced and no `projects` SDK call is made. **Capability gap (open):** real placement needs a supported per-checkout repository source, or an approved use of the host's per-thread PR lookup.
- **R2, unproved work through relatives.** A row whose link leaves its own work unknown (`unproved`, `ambiguous`, `repository-unverified`, `links-unavailable`, or "no pull request" from an incomplete read) now neither takes a spec from its parent or descendants nor lends one. Its known ticket/PR links stay visible. Proofs: `fleet.test.ts` "never gives unproved work a spec through its parent or its descendants" (a proved parent and a truncated child, checked via `specOfThread`/`threadsOfSpec`; a lead whose only child is unproved), and "treats missing or unknown coverage as unread, through the real fleetLinkSource" (missing, null, string and number coverage; the unrelated merged bound / open-match control; a merged-only match with unknown merged coverage). Only the two approved booleans are used.
- **R6, deferred focus scope.** The deferred request now records its factory, is cancelled when the factory changes, and looks only inside its own Home (found from an anchor at F1's slot, by attribute selector). It ends when that Home's read list lacks the item. D1's shell and focus effect are unchanged, and F1's `useRef` import sits in F1's import block. Proofs: `FleetViews.test.tsx` "cancels on a manual switch from loading A to B; focus stays on the picker" (a second Home is mounted) and "focuses its own Home's item when another mounted Home shows the same id". The round-1 R4 test still passes, now opened from the unplaced page.
- R3's preserved pages, actual reset deadline, cancellation and token protections are unchanged and still pass.

## Claims and proof

| Acceptance criterion | Claim | Evidence | Ready |
| --- | --- | --- | --- |
| Searchable/sortable fleet with managers/builders/reviewers/helpers, known issue/PR links, honest unplaced work | Placement comes only from branch → same-repository PR → closing ticket → parent spec. Fork PRs are skipped. Titles are never parsed. A manager is placed when all its linked descendants agree on one spec; a helper inherits from its parent. Ambiguous links, missing branches or PRs, and unread links stay unplaced, each with its reason. Hidden threads, absent-parent threads and running threads missing from the sidebar list each appear exactly once. Search keeps ancestors as context; sorting reorders siblings only and never touches the sidebar's order | `src/deck/fleet/fleet.test.ts` (placement, title, ambiguity, partial-read, search/sort, reader cases); `FleetViews.test.tsx` "shows the spec's managers, builders…", "searches and sorts…" | Placement rules on fixtures through the provenance seam; in production nothing is placed until a supported per-checkout repository source exists (R1 capability gap, open) |
| Phone and desktop match the confirmed hierarchy; Home back and native Open | Spec page: ← Home, wrapping title, Running/Threads/Stalls summary, Now/Next/When, progress, search and sort, nested rows with 44 px Open, a separate Merged tickets section. Open calls `toThread`; Home back restores Home; an explicit Needs-you focus returns to Home | `FleetViews.test.tsx` "opens unplaced work inside WizDeck…", "returns Home for an explicit Needs-you focus"; screenshots below | Fixtures and renders now; installed host not tested |
| Scope, coverage, duration and stall evidence truthful; highlights never navigate | Running is the host inventory (#160 `runningThreads`, via C1's reader), filtered to the selected factory's Cloudroom project. An absent field, error, loading or dropped connection makes Running unavailable, never 0. No running or idle duration is shown: no verified clock exists. Stalls use C1's `stallStatus` with `stallThresholdV1` (`none`), so every stall reads unavailable. A row click or an external selection only highlights: no navigation, scroll or focus change | `src/deck/live/health.test.ts`; `FleetViews.test.tsx` "keeps Running unavailable on an older host…", "counts the host's running threads for this project only", "highlights a selected thread's spec…" | Now (fixtures) |
| Upstream merge gates verified before merge; installed-host capability recorded before live acceptance | Not this builder's action. Both PRs were open at the last fleet read | — | Open |

## Activity verification (C1/F1 ownership)

- **Sources consumed:** C1's `readTimelineActivity`, `stallStatus` and `stallThresholdV1` (`factory-view.v1.md` section 8). SDK 0.6.33 timeline rows are in epoch ms, and their times are stored-event insertion times. #160's `observedAt`/`receivedAt` are observation times. None is used as activity or turn start.
- **Policy origin:** none. No factory policy defines an idle threshold for a running thread (C1).
- **Host version:** not observed. No installed host was available or authorized, so live timeline reads were not made.
- **Proved on C1's synthetic timelines (`health.test.ts`):** a 90-minute pending command is "tool running", never amber. Three-hour-old completed rows give "no verified last-activity time", never idle minutes or amber. Older-page, unread and >60 s-old evidence are unavailable. A verified clock without a threshold is still unavailable.
- **Seam proof only:** given a hypothetical verified clock and a sourced threshold, a later progress time resets idle and clears amber (45 min → stalled; 2 min → active). No such host source exists.
- **Acceptance gap (open):** with today's sources every running thread's stall status is unavailable, and the panel reads no timeline. Complete stall acceptance needs a host agent-progress time with provenance and a factory threshold, or an explicitly approved reduced acceptance. This PR claims neither.

## Red first

- `red-model.log` (commit `d6694c6`): the model, reader and health proofs run against planted bugs. These were: an older host counted as 0, every project's rows counted, a host row time used as the idle clock, a spec guessed from a `#N` in a title, hidden threads dropped, and fork PRs kept. 14 tests failed on their assertions. `086afee` removes the plants.
- `red-home-links.log` (commit `b0ff0e1`): with Home not passing the backend's `fleetLinks`, "places threads from the backend's fleetLinks…" fails on its assertion.
- `red-ui.log` (commit `39346b3`): the rendered proofs run against planted UI bugs. These were: a row click also navigates, unavailable Running shown as 0, a highlight scrolls the deck, and an explicit focus leaves the fleet page in place. 4 tests failed on their assertions; the next commit removes the plants. Two of those assertions were first too weak to catch their plant (the always-present "Home" heading; a scroll asserted before effects flushed), and were tightened before this red run.

## Pictures

`targets/` holds generated design targets, made and committed before any visible code (prompts and known defects in `targets/prompt.txt`). `screenshots/` holds the real components rendered at 1440 px and 390 px. The throwaway harness is not committed: a Vite build with the SDK app hooks stubbed to synthetic state, the #160 inventory from `fleet/fixtures.ts`, and host colours approximated.

- `desktop-1440.png`, `phone-390.png`: the spec fleet page with work links **and a fixture per-checkout provenance through the seam**. This is a layout render of a placed tree, which production cannot show today (R1 gap). The phone capture is taller than 844 px so the merged section shows.
- `home-desktop-1440.png`, `home-phone-390.png`: Home as production renders it now: the scoped Running count, and the Fleet section with every thread unplaced and the capability-gap note.

Differences from the targets: rows show what the sources prove. The target's "builder … PR: none yet" row cannot exist, because a ticket is known only through its PR. A thread with no PR is placed by its parent and labelled helper/reviewer, with "no pull request for its branch". The inventory-only running child appears as "Running thread not in the sidebar list". Unplaced work sits on Home and its own page, not under the spec. Open buttons are 44 px.

## Seams

- `ActivityLookupV1` / `noActivityEvidence` (`live/health.ts`): where a future verified activity source plugs in.
- `specOfThread(model, threadId)` (`fleet/model.ts`): the spec a thread is placed under, for B1 (#76) highlights.
- `threadsOfSpec(model, spec)` with `fleetLinkSource(deck.fleetLinks)` and `buildFleet` (`fleet/model.ts`): full spec membership for B1 (#76).

## Helpers

One swarm, one helper: image generator (Codex Terra 6.1, high, shared sandbox), slice "target pictures", base `109a3bd`. Result: two targets, both used, with the recorded defects not copied. No-push check: clean.

## Not tested

Installed host and SDK capability (#160 fields, #158 child listing), live GitHub reads, real phone panel, host fonts and colours, `toThread`/`openUrl` acceptance, and any live timeline observation.

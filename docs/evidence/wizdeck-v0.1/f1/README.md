# F1 (#75) evidence

All values are synthetic. Fixture and rendered-harness results prove no installation, host capability, GitHub access or live behaviour. The Cloudroom #160 and #158 merge gates are unchanged: this work must not merge until both are merged and their `mergedAt`/`mergeCommit` are recorded by the fleet and the reviewer.

## Status: checkpoint, not a hand-back

Three exact unowned edits wait on the orchestrator (questions on #75):

1. `wizbar/src/deck/data/server.ts`: lease the fleet work-link read in D1's shared cache, adding the optional `DeckWatchResultV1.fleetLinks`. Exact diff and proposed owned test `fleet-server.test.ts` (5 tests, red without the edit and green with it) are posted on the ticket.
2. `changes/75.md`: exact text posted on the ticket.
3. `wizbar/src/deck/home/Home.test.tsx` line 165: D1's exact heading list gains `"Fleet"`. Until this is decided, that one D1 test fails on this branch: 884 tests pass and 1 fails.

Until (1) is decided, Home passes no work links (`useLiveFleet(…, undefined, …)`). Every thread shows as unplaced with an explicit "Work links are not connected" note, and no spec placement is claimed.

## Claims and proof

| Acceptance criterion | Claim | Evidence | Ready |
| --- | --- | --- | --- |
| Searchable/sortable fleet with managers/builders/reviewers/helpers, known issue/PR links, honest unplaced work | Placement comes only from branch → same-repository PR → closing ticket → parent spec. Fork PRs are skipped. Titles are never parsed. A manager is placed when all its linked descendants agree on one spec; a helper inherits from its parent. Ambiguous links, missing branches or PRs, and unread links stay unplaced, each with its reason. Hidden threads, absent-parent threads and running threads missing from the sidebar list each appear exactly once. Search keeps ancestors as context; sorting reorders siblings only and never touches the sidebar's order | `src/deck/fleet/fleet.test.ts` (placement, title, ambiguity, partial-read, search/sort, reader cases); `FleetViews.test.tsx` "shows the spec's managers, builders…", "searches and sorts…" | Fixtures now; links reach the panel only after decision (1) |
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
- `red-ui.log` (commit `39346b3`): the rendered proofs run against planted UI bugs. These were: a row click also navigates, unavailable Running shown as 0, a highlight scrolls the deck, and an explicit focus leaves the fleet page in place. 4 tests failed on their assertions; the next commit removes the plants. Two of those assertions were first too weak to catch their plant (the always-present "Home" heading; a scroll asserted before effects flushed), and were tightened before this red run.

## Pictures

`targets/` holds generated design targets, made and committed before any visible code (prompts and known defects in `targets/prompt.txt`). `screenshots/` holds the real components rendered at 1440 px and 390 px. The throwaway harness is not committed: a Vite build with the SDK app hooks stubbed to synthetic state, the #160 inventory from `fleet/fixtures.ts`, and host colours approximated.

- `desktop-1440.png`, `phone-390.png`: the spec fleet page **with work links supplied**, the state after decision (1). The phone capture is taller than 844 px so the merged section shows.
- `home-desktop-1440.png`, `home-phone-390.png`: Home as this branch renders it now, with the scoped Running count, the Fleet section and work links not connected.

Differences from the targets: rows show what the sources prove. The target's "builder … PR: none yet" row cannot exist, because a ticket is known only through its PR. A thread with no PR is placed by its parent and labelled helper/reviewer, with "no pull request for its branch". The inventory-only running child appears as "Running thread not in the sidebar list". Unplaced work sits on Home and its own page, not under the spec. Open buttons are 44 px.

## Seams

- `ActivityLookupV1` / `noActivityEvidence` (`live/health.ts`): where a future verified activity source plugs in.
- `specOfThread(model, threadId)` (`fleet/model.ts`): the spec a thread is placed under, for B1 (#76) highlights.
- `fleetLinkSource(views)` / `useLiveFleet(projectId, linkViews, now)`: take the backend's `fleetLinks` once decision (1) lands.

## Helpers

One swarm, one helper: image generator (Codex Terra 6.1, high, shared sandbox), slice "target pictures", base `109a3bd`. Result: two targets, both used, with the recorded defects not copied. No-push check: clean.

## Not tested

Installed host and SDK capability (#160 fields, #158 child listing), live GitHub reads, real phone panel, host fonts and colours, `toThread`/`openUrl` acceptance, and any live timeline observation.

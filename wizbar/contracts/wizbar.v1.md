# WizBar v1 preparation contract

Status: baseline contract and future feature requirements, not a claim of live acceptance. Source: the copied T3 Sidebar files and published `@get-bb/plugin-sdk` declarations. The historical WZ2 sections below describe SDK **0.4.4**; #13 established the **0.6.33** baseline. The requested **0.6.49** pin in this WZ15 candidate fails source typecheck; see [WZ15 evidence](../../docs/evidence/wz15/verification.md). Current SDK/build statements below follow #13, #27 and the build ruling on #7; historical feature requirements remain subject to approved plan #1.

## Source, identity and toolchain

- Source repository: `SawyerHood/sawyer-plugins`, path `plugins/t3sidebar`, commit `d3424f24e2cebe91da4e72cb38feb023da808922`.
- Source tag: `t3sidebar/v0.1.0`, annotated tag object `772d93ce9dd474c6c3e2f42cb7ca9617ec9986d6`.
- Package: `bb-plugin-wizbar`, version `0.1.0`. Display name: **WizBar**, OpenWiz sidebar. Canonical branding icon: `Zap`.
- Intended plugin ID and future command namespace: `wizbar`, following the copied `bb-plugin-` package naming convention. App contribution IDs remain `inbox`, `parent` and `children`; those are local registration IDs, not the plugin ID.
- Entrypoints remain `app.tsx` and `src/server.ts`. There is one plugin folder, `wizbar/`; no unrelated upstream plugin is imported.
- Both original MIT notices are retained intact, including their different copyright holders. The root licence adds a separate notice for WizBar changes. Existing attribution remains in both READMEs.
- SDK **0.6.49** is exactly pinned in this #27 candidate, following #13's 0.6.33 baseline, but its published declarations omit API members used by existing source and tests. Typecheck fails despite 253 passing fixture tests; this candidate is blocked, not compatible or ready for merge. No SDK declarations are vendored; unrelated dependency versions, plugin release version and copied engine ranges remain unchanged. No live-host compatibility is established.
- Local verification: `npm ci`, `npm run typecheck`, `npm test -- --maxWorkers=2` from `wizbar/`. Recorded environment: Node 24.22.1, npm 11.19.1. WZ2's upstream behavior baseline was 80 tests in five files, with an additional identity proof; WZ15 runs the existing full plugin suite without changing test meanings.
- **Build execution: Unverified.** The current `build` script is `room-cli plugin build .`, identified from desktop help by the [#7 ruling](https://github.com/openwizdev/wizplugins/issues/7#issuecomment-6762540703). The available non-desktop CLI does not expose `plugin`; published SDK metadata is not build proof. Desktop build, installation and activation remain for #9. No alternate executable or toolchain is introduced by #27.

Identity metadata and registration tests prepare W10. Installation beside T3 Sidebar, runtime ID derivation, database separation and activation remain **Unverified** until the separately approved live acceptance in #9. WZ2 installs, runs and publishes no plugin.

## Existing store, RPC and realtime seam

Owning source: `src/server.ts`, `src/useLifecycle.ts`; declarations: SDK root `PluginStorage`, `PluginRpc`, `PluginRealtime`, and app `useRpc`/`useRealtime`.

`bb.storage.database()` opens the plugin's own database. The published storage declaration scopes it by plugin ID. The only migration creates `thread_lifecycle` if absent, with `thread_id TEXT PRIMARY KEY` and nullable integer columns `settled_at`, `snoozed_until`, `snoozed_at`. A newly created table is empty. There is no seed, T3 database lookup or import. Existing rows are not cleared on reload. Nothing adds lifecycle fields to host threads.

`StoredLifecycleRow` exposes `threadId: string` and `settledAt`, `snoozedUntil`, `snoozedAt` as `number | null`; timestamps are epoch milliseconds. The existing export `t3sidebarRpcContract` is kept as the shared contract symbol so downstream builders can use its actual schemas without renaming or inventing another API.

| Existing RPC method | Input | Result and store effect |
| --- | --- | --- |
| `listLifecycle` | Empty object schema | `{ rows: StoredLifecycleRow[] }`; reads all stored rows; no write |
| `settle` | `threadId`: trimmed nonempty string | `{ ok: true }`; upserts settle time from `Date.now()`, clears snooze values |
| `unsettle` | Same thread ID schema | `{ ok: true }`; deletes the row |
| `snooze` | Trimmed nonempty `threadId`; positive integer `snoozedUntil` | `{ ok: true }`; upserts absolute wake time and current snooze time, clears settle time |
| `unsnooze` | Same thread ID schema | `{ ok: true }`; deletes the row |

These are the copied Zod schemas, not a new exact-key or command format. The SDK validates RPC input/output and scopes routes to the plugin. The declared host transport response wraps successful results as `{ ok: true, result }` and errors as `{ ok: false, error }`; callers of the app RPC client receive the method result. Do not confuse that wrapper with the method's own `{ ok: true }` result.

Every upsert/delete publishes `LIFECYCLE_CHANNEL` (`lifecycle`) with `{ threadId }`. The frontend re-reads `listLifecycle` after that signal; only the latest outstanding refresh response may replace local rows. Signals are ephemeral, not an alternative persistent store. `thread.deleted` deletes that thread's row and publishes the same refresh signal. A mutation relies on the realtime subscription for refresh instead of issuing a second read itself.

**Existing limitation:** server `settle` and `snooze` do not read authoritative thread activity, verify existence, or reject a past wake time. The copied UI enforces parking eligibility. WZ2 does not claim that raw RPC calls are safe command operations. #4 owns closing that gap, sharing this table and channel, and proving it at the server boundary. The same-store/live-refresh observation remains Unverified until #9.

## Existing parking and list rules

Owning source: `src/lifecycle.ts`, `src/useLifecycle.ts`, `src/inbox.ts`, rendered tests.

`isWorking(thread)` returns true if any of these existing inputs holds:

- `activity.workflows > 0`
- `activity.backgroundAgents > 0`
- `activity.backgroundCommands > 0`
- `activity.planMode > 0`
- `activity.goals > 0`
- `indicator === "runtime"` or `indicator === "working-draft"`

These exact fields and indicator literals are declared on SDK 0.4.4's `PluginSidebarThread`. They are the unchanged upstream predicate, not a fresh definition inferred from status names. `canPark` requires both `hasPendingInteraction === false` and `isWorking === false`. Unread state alone does not prevent parking.

`resolveShelf` yields `active`, `snoozed` or `settled` (UI: Inbox, Snoozed, Settled). A missing row, working thread or pending interaction always yields Inbox. Otherwise a future snooze takes precedence over settle. It wakes at or after its timestamp or when `latestAttentionAt > snoozedAt`; a settled row wakes when `latestAttentionAt > settledAt`. A timestamp equal to the recorded park time is not newer activity. Classification does not itself delete a stored row.

`resolveSnoozePresets` supplies `hour`, `evening`, `tomorrow`, `next-week`: one hour from now; 18:00 today only if more than an hour away; 09:00 tomorrow; 09:00 next Monday. Calendar arithmetic uses the local timezone and handles day boundaries, rather than assuming every day is 24 hours. `nextWakeDelayMs` arms one timer for the next future wake, with the existing 50ms margin and signed-32-bit timeout clamp. There is no mute or automatic parking.

Inbox ordering stays creation time descending with pinned threads separated. Snoozed rows sort by wake time. Archived threads are excluded; search/project filtering and child hiding keep their existing behavior. A child whose parent is visible lives in the parent header chip; an orphan remains in the list. The `parent` and `children` header registrations and manual park/wake controls remain unchanged.

## Future command requirements — #4, not implemented here

The five approved operations use the `wizbar` namespace. Exact CLI registration, JSON result schema, time syntax and error vocabulary are **Unverified** until derived and tested in #4; no new interface is specified here.

| Operation | Required outcome |
| --- | --- |
| `settle` | For each eligible named thread, settle in the shared store; refuse working, waiting or unverifiable threads with no park write |
| `unsettle` | Remove the named thread's parked state using the existing store |
| `snooze --until` | Park an eligible named thread until an absolute future time, or one of the existing sidebar presets; refuse past times and ineligible/unverifiable state without a park write |
| `unsnooze` | Remove the named thread's parked state using the existing store |
| `list` | Report each named thread's resolved shelf and snooze wake time where applicable |

Each operation accepts one or many IDs, gives a result for each ID, supports a JSON form, and returns a nonzero exit status when any ID fails. One bad/unknown ID must not suppress other results. Repetition reaches the same end state; it is not a promise of identical stored timestamps or output bytes.

All park writes need authoritative current working/waiting inputs. Types exposing an SDK thread API alone do not prove that those inputs are available and complete on the plugin server. If #4 cannot establish that boundary, parking stays disabled and the gap goes back for an owner decision. The plugin must never guess unknown state or weaken the unchanged predicate.

Orchestrator selection of its own finished work is external policy. The plugin does not infer who started a thread. Manual parking remains available; no automatic rule is introduced.

## Future count inputs and footer boundary — #6

Use the existing `isWorking` predicate as the single working definition. The required total is one for every working thread, including child threads, plus one for each running in-thread subagent. It spans every project and includes working threads hidden or parked in the list. Search, project selection and shelf filters cannot narrow the input. Use one pure counting function, not duplicated calculations in UI and tests.

SDK 0.4.4 declares `PluginSidebarThread.activity` counters and the sidebar thread array. Those declarations do **not** establish global completeness, deduplication, or that `backgroundAgents` exactly matches running in-thread subagents. Those mappings and a complete live input source are **Unverified**. Do not silently equate counters or treat a filtered sidebar list as globally complete.

The footer must show a spinner and number, dim zero, and a hover split between threads and subagents, with no click action. It remains blocked on #2's positive evidence for a live number in the footer row. A merged report, a type or a fixture alone does not satisfy that prerequisite. Icon/card-only or unclear capability requires an owner decision; no substitute location or presentation is authorized. WZ2 registers no footer.

## Future Cloud/Local field evidence — #5

The pinned sidebar type exposes `host: { id, name } | null` and optional environment metadata (`id`, `name`, `branchName`, `workspaceDisplayKind`). It has no declared Cloud/Local discriminator. Null host, branch presence and personal host names are not classification rules.

#5 must establish the authoritative field on a real host under its read-only authorization and keep identifying observations private. Its public conclusion must state the observed mapping and limits. Until then the field mapping is **Unverified**. Every row form, including collapsed shelves, needs the host's Cloud/Local icon or its approved visual equivalent. Navigation, status, parking controls and header behavior stay intact. WZ2 adds no row icon.

## Downstream seams and evidence limits

- #4: existing `t3sidebarRpcContract`, `StoredLifecycleRow`, `LIFECYCLE_CHANNEL`, `isWorking`, `canPark`, `resolveShelf`, `resolveSnoozePresets` and `useLifecycle`; no command stub or handler is added here.
- #5: existing `ThreadCard`, `SlimRow` and the pinned `PluginSidebarThread` type; field observation remains a separate prerequisite.
- #6: unchanged `isWorking` and app registration; footer and count implementation remain empty scope.
- #7: actual `wizbar/package.json` scripts and lockfile, with build explicitly Unverified.
- #8: pinned provenance, existing credits, intact MIT notices and WZ2 evidence.
- #9: installation, activation, identity/storage separation and live behavior require separate owner approvals. Nothing in fixture tests, metadata, this contract or a PR authorizes those actions.

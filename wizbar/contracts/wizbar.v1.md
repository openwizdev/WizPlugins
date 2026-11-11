# WizBar v1 preparation contract

Status: baseline contract and future feature requirements, not a claim of live acceptance. Source: the copied T3 Sidebar files, published `@get-bb/plugin-sdk` **0.4.4** declarations, and the scope recorded in issues #1 and #3–#9. The SDK/build and ownership rulings on #3 take precedence over earlier migration proposals.

## Source, identity and toolchain

- Source repository: `SawyerHood/sawyer-plugins`, path `plugins/t3sidebar`, commit `d3424f24e2cebe91da4e72cb38feb023da808922`.
- Source tag: `t3sidebar/v0.1.0`, annotated tag object `772d93ce9dd474c6c3e2f42cb7ca9617ec9986d6`.
- Package: `bb-plugin-wizbar`, version `0.1.0`. Display name: **WizBar**, OpenWiz sidebar. Canonical branding icon: `Zap`.
- Intended plugin ID and future command namespace: `wizbar`, following the copied `bb-plugin-` package naming convention. App contribution IDs remain `inbox`, `parent` and `children`; those are local registration IDs, not the plugin ID.
- Entrypoints remain `app.tsx` and `src/server.ts`. There is one plugin folder, `wizbar/`; no unrelated upstream plugin is imported.
- Both original MIT notices are retained intact, including their different copyright holders. The root licence adds a separate notice for WizBar changes. Existing attribution remains in both READMEs.
- SDK **0.4.4** stays exactly pinned in package and lockfile, as ruled on #3. No SDK declarations are vendored and no dependency version is changed by WZ2. The copied engine ranges remain unchanged; this does not establish compatibility with a live host.
- Local verification: `npm ci`, `npm run typecheck`, `npm test` from `wizbar/`. Recorded environment: Node 24.22.1, npm 11.19.1. Upstream behavior baseline: 80 tests in five files, with an additional identity proof.
- **Build boundary: Unverified.** SDK 0.4.4's README documents only the legacy executable. The inherited `build` script remains historical metadata and must not be run under this ticket's ruling. No supported replacement command, build output or installability is claimed. #7 must preserve this gap until a supported boundary is established; typecheck and tests are the WZ2 executable proof.

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

## Explicit running-thread mute — WZ14

The approved next iteration supersedes the baseline no-mute rule only for explicit keeper selection. See [mute.v1.md](mute.v1.md) for the contract defined before implementation, syntax, persistent representation and evidence limits.

- `wizbar mute <id>... [--json]` and `wizbar unmute <id>... [--json]` extend the existing command and `t3sidebarRpcContract`. Both RPCs use the existing nonempty ID schema and `{ ok: true }` result. All five ordinary command operations retain per-ID results and nonzero failure status.
- An append-only migration adds `thread_mute` in the same plugin database. `listLifecycle` projects its rows with optional `mutedAt` and `muteAttentionAt`; ordinary rows retain their shape. Mutations transactionally keep mute and ordinary parking exclusive, and publish the existing channel. Manual undo and deletion clear both states under the revision guard.
- Only verified running, unpinned threads without pending input or failure can be muted. Working attention timestamps alone leave mute intact. Pending input, explicit failure and newer unread attention after working stops resolve to Inbox. Confirmed server attention observations, startup reconciliation and authoritative CLI observations retire the captured mute selection so it cannot return on a later working update. All three share the revision and selection guard; unknown authority retains stored state. Unavailable authority cannot authorize mute.
- The sidebar adds a collapsed Muted shelf with navigation and explicit Unmute. The exported `isWorking` predicate and raw host work inputs are unchanged; visibility does not affect counting. Timed snooze and completed-work settle keep their ordinary rules.
- Keeper selection is external policy: explicit fleet mute, with no inferred owner/child rule or automatic parking. The revised keeper policy also permits settling finished threads generally; waiting, failed and pinned work remains available. Fixture semantics do not establish real keeper operation; live mapping and acceptance remain #9 and the linked question in the mute contract.

## Observable count inputs and footer boundary — WZ12 / #28

[Plan revision 9](https://github.com/openwizdev/wizplugins/issues/1#issuecomment-6786317923)
supersedes the historical complete-source/subagent prerequisite for this consumer.
Use the current SDK0.6.33 `experimental_useSidebarThreads()` with its default
active-lifecycle selection, before all shelf, search, project, child hiding and
mute visibility filters. Every project/child/hidden/parked/muted working row
**supplied by that hook** counts once by stable ID. Archived lifecycle pages are
not requested: unseen/archived work and global completeness remain unverified.
This is not a CLI count or a claim that the hook sees every running thread.

`readRunningSource` in `src/running-source.ts` validates the WZ10 work fields and
calls the unchanged `isWorking`. Its version-1 normalisation retains WZ10's
`id`, `projectId`, `parentThreadId`, `isWorking` facts and
`subagents: { status: "unproven", count: null }`, but explicitly scopes ready
input to `"observable-sidebar"`, as revision 9 permits. Ready describes only
valid observable rows, never the older contract's globally complete scope.
Incomplete IDs/membership/work fields, unknown indicators, invalid counters and
contradictory duplicate work/membership facts invalidate the snapshot. Repeated
identical normalised IDs count once. No visibility or lifecycle field narrows it.

`countRunning` is the one pure counting rule. Observable input returns
`{ threads: N, subagents: null, total: N }`; an empty valid observable set can
return zero. No subagent map is required. Background-agent activity makes a
thread working but is never added as a separate subagent total. The older
explicit-complete input/map seam remains for historical synthetic proof; production
does not use or assert it.

The production `FooterCounter` reads the host hook and realtime connection state.
Loading, error, incomplete or disconnected input renders no number and publishes
WZ11 `unavailable`. After an observed gap, the retained hook-array identity cannot
restore the number; a new ready hook snapshot is required. The hook owns its
cache/realtime updates and ordering. No age threshold, reconnect reconciliation
or global freshness proof is invented. Valid observable input publishes
`unverified`, independently of the visibility switch, never `live`.

The presentation keeps the spinner/number, dim stopped zero, hover/focus coverage
and no-click effect. Thread-only hover says `N running · subagents not counted yet
· some threads may be unseen`. Reduced-motion preferences stop animation. The
existing WZ11 visibility guard is preserved; no settings API or persistence change.

[WZ12-F1](https://github.com/openwizdev/wizplugins/issues/28#issuecomment-6786760739)
approves the numeric custom artwork as the icon of one no-op
`experimental_sidebarFooter` action, honoring host sizing, with no disclosure,
panel, card or alternate strip. [WZ12-F2](https://github.com/openwizdev/wizplugins/issues/28#issuecomment-6787335036)
permits a fixed honest host label while artwork owns dynamic hover/focus text.
Disabled/unavailable input returns blank artwork; host wrapper removal is not
established by that result or waived as an acceptance requirement. No mutable
label, conditional-hide or host DOM/CSS override is used. The real host's sizing, wrapping, tooltip
arbitration, placement, count agreement and updates remain Unverified until keeper
#9. Synthetic captures cannot establish those outcomes.

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

## Settings

WZ11 defines two plugin-wide persistent boolean preferences, `footerCountEnabled`
and `machineIconsEnabled`, both defaulting to true. The settings section reads
the actual manifest version and shows visibility independently of source status.
The exact persistence boundary and #28/#29 consumer APIs are in
[settings.v1.md](settings.v1.md). Turning either switch on supplies no data and
creates no live claim. PC-host persistence and presentation remain Unverified
until #9.

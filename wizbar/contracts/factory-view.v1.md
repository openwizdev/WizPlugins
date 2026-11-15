# WizDeck and WizBar factory view contract v1 (C1, #72)

Status: the contract-first record for WizDeck 0.1 and WizBar 0.4 ([plan #71](https://github.com/openwizdev/WizPlugins/issues/71), revision 2). It is a new plugin-owned format. It changes no OpenWiz API, skill contract or allowlist, adds no dependency and enables no effect. Fixtures prove no host behaviour.

Code: `src/factory-contract/` (types, validators, disabled stubs). Synthetic fixtures: `src/factory-contract/fixtures.ts`, checked by `src/factory-contract/factory-contract.test.ts`. Published queue schema: [`factory-view.v1.schema.json`](factory-view.v1.schema.json). Relies on [sidebar-v3.v1.md](sidebar-v3.v1.md) for the row, working and running rules.

Sources, read 2026-11-15:

- Installed SDK 0.6.33 declarations (`@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk.d.ts`, from `wizbar/package-lock.json`): `ThreadsArea.send`, `sendMessageRequestSchema`, `sendMessageResponseSchema`, `FilesArea.read`, `ThreadsArea.timeline`, `threadTimelineResponseSchema`, `timelineRowBaseSchema`, `TimelineTurnRow`, `TimelineWorkRowBase`.
- Cloudroom PR #160 at `fec35c49dfdd454a8e028c0536a5a07190fee26d`: `gui/packages/plugin-sdk/src/app-contract.ts`, `gui/packages/domain/src/thread.ts`, `gui/docs/running-thread-inventory.md`.
- Cloudroom `827a3d03198db81a5eea1942833ecc81ee88fd9a`: `gui/packages/sdk/src/areas/threads.ts`, `gui/packages/server-contract/src/thread-timeline.ts`, `gui/packages/server-contract/src/api/threads.ts`, and, to see where row times come from, `gui/packages/thread-view/src/tool-activity-projection.ts`, `gui/packages/thread-view/src/group-event-projection-turns.ts` and `gui/packages/db/src/data/events.ts`.
- OpenWiz `1189d6666ab2537739b652a554104f1e1d3cfdb0`: `tools/stall-alarm/README.md` and `alarm.py`.

## 1. Factory binding

`FactoryBindingV1` is one configured factory: `projectKey` (the queue's `project`), `cloudroomProjectId`, `repositories` (`owner/name`), `home` (`hostId`, `rootPath`) and `orchestratorThreadId`. D1 stores it privately in plugin settings. The target is never inferred from the selected thread. A spec is always repository-qualified (`owner/name#N`).

## 2. Needs-you queue v1

The file is UTF-8 JSON at `.openwiz/needs-you.v1.json`, relative to the binding's `home.rootPath` (`needsYouRelativePath`). Only the orchestrator writes it, by atomic replacement. The plugin backend reads it with `bb.sdk.files.read({ hostId, rootPath, path })` at most once per shared 60-second refresh, and again just before a delayed answer is sent. C1 does not assume that any sandbox is mounted on the plugin server. D1 owns that binding and the proof that the host is reachable.

Fields, frozen as #71 specifies (`needsYouQueueSchema`; the JSON Schema is generated from it and a test holds the two equal):

| Field | Rule |
| --- | --- |
| `schema` | Exactly `openwiz.needs-you.v1` |
| `project` | The bound `projectKey` |
| `revision` | Non-negative integer, increasing |
| `updatedAt`, `expiresAt` | UTC ISO timestamps ending `Z`; `updatedAt` ≤ `expiresAt` |
| `complete` | Boolean; `false` needs at least one entry in `gaps` |
| `gaps` | Plain reasons |
| `items` | Ordered open decisions |

Each item: stable `id`, short `code` (1–32 characters), `question`, `options` (at least one `{ id, label }`, ids distinct), `recommendedOptionId` (one of the option ids, or null), `sourceUrl` (https), `spec` (`owner/name#N` or null), `risk` (`ordinary`, `live`, `release`, `publish`, `unknown`), `fingerprint`, optional `requestId` and `requestFingerprint` (always together; existing structured decisions keep their own ids), `createdAt` and `updatedAt` (`createdAt` ≤ `updatedAt`). Unknown fields are malformed. The JSON Schema states the shape; the cross-field rules below (project, distinct ids, recommended option, paired request fields, time order, gaps, revision and expiry) are the validator's, and a producer must meet both.

**Reading** (`readNeedsYouQueue(content, { projectKey, now, previousRevision })`). Every failure is unavailable and never zero:

| Input | Result |
| --- | --- |
| Not JSON, a repeated key in any object, wrong shape, unknown field, broken item rule | `malformed` |
| `schema` other than v1 | `unknown-schema` |
| `project` not the bound key | `wrong-project` |
| Two items with one `id` | `duplicate-item` |
| `revision` below the last accepted one | `stale-revision` |
| `expiresAt` at or before now | `expired` |

A missing or unreadable file is `missing` or `unreadable` (D1's reader). A fresh, complete, empty queue is the only "nothing needs you". A queue with `complete: false` shows its known items and gaps, and its count is null. A sent answer stays visible until the orchestrator publishes a file without it.

**Disabled consumer stub.** `needsYouViewStub(read)` gives Home's list with `answer.enabled: false` on every item. D2 replaces it.

## 3. Spec status comment

A fleet manager keeps one comment on the spec issue. Its first non-blank line is exactly `<!-- openwiz:spec-status:v1 -->`, and it has one each of `Now:`, `Next:`, `When:` and `Updated:`. `When` is `Not estimated` or an estimate that names its time zone (`UTC`/`GMT`, `Z`, a numeric offset or an IANA name). `Updated` is a UTC ISO timestamp. `readSpecStatus(comments, writerLogin)` uses only the configured writer's marker comment. None gives `missing`, several give `ambiguous`, and a malformed one gives `malformed`. Every unavailable status shows `When: Not estimated`. Progress never edits the spec body.

## 4. Steer route

Every answer, Tell the factory message, spec action and feedback item uses one route: `bb.sdk.threads.send` with exactly `steerSendArgs(request)`:

```json
{ "threadId": "<bound orchestrator>", "input": [{ "type": "text", "text": "<text>", "mentions": [] }], "mode": "steer" }
```

There is no `sendAt`, no model/effort/permission override, no attachment and no second input. Queue mode is never substituted.

**Operation id is plugin-local.** SDK 0.6.33's send arguments have no request-id field (neither has the newest published SDK checked, 0.6.144). `SteerRequestV1.requestId` names one operation inside the plugin: it disables duplicate submission and keys outcome reconciliation. It is never sent, cast into an unsupported field or treated as host deduplication. The plugin has no supported response-to-turn correlation, so Tell the factory shows delivery state and a link to the orchestrator. It never labels a timeline message as the reply.

**Dispatch check.** Immediately before the SDK call, `checkSteerDispatch(request, binding, freshQueueRead)` cancels on `wrong-project`, `wrong-target`, and for answers also `queue-unavailable`, `revision-changed`, `item-gone`, `proposal-changed` (fingerprint), `unknown-option` and `gated-risk` (any risk but `ordinary` goes to the orchestrator's existing gated flow). A cancelled send makes no SDK call.

**Outcome** (`steerOutcome(requestId, settled)`): `{ ok: true, delivery: "sent" }` → `sent`; `{ ok: true, delivery: "queued", queuedMessage }` → `queued`, which means waiting, not steered; a rejection (timeout, transport, refusal) or an unrecognised result → `uncertain`, which is shown and never retried automatically.

**Disabled stub.** `dispatchSteerDisabled` returns `{ status: "disabled" }` and makes no call. D2 replaces it.

## 5. Read snapshot and freshness

`ReadSnapshotV1<T>` is either `ready` (`data`, `fetchedAt` in epoch ms, `stale`, `complete`, `gaps`) or `unavailable` (`reason`, plus `lastGood` data shown visibly stale, or null). A partial read is `complete: false`, and its totals are never complete. D1 owns the shared cache and the 60-second schedule.

## 6. Selection

`SelectionV1` is `none`, a `spec` (`projectKey`, `spec`) or a `thread` (`projectKey`, `threadId`). It is a highlight only: an update never navigates or scrolls. `FocusRequestV1` (`needs-you`, `projectKey`, `itemId`) comes only from an explicit Needs you click, and is the one thing that opens WizDeck at an item.

## 7. Host inventory (Cloudroom #160 at `fec35c49`)

#160 adds optional `runningThreads` and `childrenByParentId` to `experimental_useSidebarThreads()`. `readHostInventory(state)`:

| Input | Result |
| --- | --- |
| No `runningThreads` (older host) | `absent`. Never an empty list or a zero |
| `runningThreads: []` | `ready` with no running rows: a real zero |
| A repeated id with the same facts | Counted once |
| A repeated id with different project or parent | `incomplete` (`conflicting-duplicate`) |
| A bad row, or a child listed under a key other than its `parentThreadId` | `incomplete` (`malformed`) |
| `childrenByParentId` present | `delivered-only` children keyed by parent, even an absent parent; `total: null` |

#160's children cover only the rows the host delivered, not every historical child. A child total stays null until a reader verifies complete pagination (#158, F1/B1). #160's `execution.observedAt`/`receivedAt` record a status observation, and on a session snapshot both are the time of receipt. Neither is used as activity or turn start. F1/B1 merge only after Cloudroom merges #160 and #158.

## 8. Activity and stall

**What was verified.** `bb.sdk.threads.timeline({ threadId })` is supported in SDK 0.6.33. Its rows carry `startedAt`, `createdAt`, `turnId` and `sourceSeqStart`/`sourceSeqEnd`, plus `completedAt` on turn and operation rows, all in epoch ms. `timelinePage` (`kind`, `hasOlderRows`, `olderCursor`, `segmentLimit`) and the optional `delta` limit what a read covers.

- **Active turn:** a `kind: "turn"` row with `status: "pending"` on the latest page.
- **Pending operation:** a `kind: "work"` row (tool, command, workflow and so on) with `status: "pending"`.
- **Row times are not an activity clock.** Rows are projected from stored thread events. A row's `startedAt` is its first event's `meta.createdAt`, its `createdAt` the latest one's, and a turn's `completedAt` is its completion event's (`tool-activity-projection.ts`, `group-event-projection-turns.ts`). That value is the stored event's `created_at`, which is `Date.now()` at insertion unless the writer supplies a time (`db/src/data/events.ts`). It is a host record or receipt time with no provenance on the row. A long tool also records nothing while it runs. No row time therefore proves the time of the last agent progress.

`readTimelineActivity(response, fetchedAt)` keeps the active turn id and the count of pending operations from one latest page; nested `children` are read when present. It sets `lastActivityAt: null`. An older page, or a missing or malformed page, is unavailable. Freshness is the plugin's own `fetchedAt`: an observation older than the 60-second shared refresh is stale.

**Threshold.** No existing factory policy defines an idle threshold for a running thread. OpenWiz's stall alarm raises "idle agent" 60 minutes after a pull request's fleet record (`findings sent`, `CI failure sent`, `re-check sent`) at the current head, and the reviewer's 30-minute watchdog timeout that #72 names times a review. Both measure a different role and state, so neither is adopted. `stallThresholdV1` is `{ source: "none" }`.

**Stall status** (`stallStatus({ running, activity, threshold, now })`), first match wins:

| Case | Result |
| --- | --- |
| Not in the running set | `not-running` |
| No timeline evidence | `unavailable` (`no-activity-evidence`) |
| Observation older than 60 seconds | `unavailable` (`stale-observation`) |
| A pending operation (long tool) | `operation-pending`: no idle claim either way |
| No sourced threshold | `unavailable` (`no-threshold`) |
| No verified last-activity time | `unavailable` (`no-activity-clock`) |
| Both present | `stalled` when idle ≥ threshold, else `ok` |

**Acceptance gap (open).** With today's sources, every running thread's stall status is unavailable. Amber needs two things that do not exist. One is a host field recording an agent-progress time with its provenance. The other is a factory policy that sets the idle threshold for that role and state. This contract adds neither and expands no host contract. F1 consumes this contract and owns the final timeline and amber-display proof.

## Seams

| Seam | For |
| --- | --- |
| `FactoryBindingV1`, `ReadSnapshotV1`, `readNeedsYouQueue` (on a `files.read` result), `readSpecStatus`, `needsYouViewStub` (to replace), `SelectionV1`, `FocusRequestV1` | #73 D1 |
| `SteerRequestV1`, `checkSteerDispatch`, `steerSendArgs`, `steerOutcome`, `dispatchSteerDisabled` (to replace), `DispatchRefusalV1` | #74 D2 |
| `readHostInventory`, `readTimelineActivity`, `stallStatus`, `stallThresholdV1`, `ActivityEvidenceV1.lastActivityAt` (null until a verified source exists) | #75 F1 |
| `readHostInventory` (running count equals rows, absent is not zero), `FocusRequestV1` | #76 B1 |
| `factory-view.v1.schema.json` and `needs-you.v1` format; the queue writer and status comment writer | OpenWiz #710 S1 (separately held; it owns the byte-identical import) |

## Evidence limits

Fixture tests prove the boundary rules only. Host reachability of the queue file, the real shape of #160 rows in an installed host, delivery behaviour of `threads.send` in steer mode, and every timeline observation remain unverified until the later live checks. No live read, write, installation or publication was made for this contract.

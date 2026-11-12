# WizBar sidebar v3 contract — WZ17 / #39

Status: contract-first record for WizBar v0.3 ([plan revision 11 on #1](https://github.com/openwizdev/wizplugins/issues/1)). It defines shapes, sources and rules before any v0.3 UI work. Nothing here is live acceptance: real-host behaviour stays Unverified until the live check (#9).

Sources, read 2026-11-12 from the locked packages in `wizbar/package-lock.json`:

- **SDK 0.6.33** declarations in `@get-bb/plugin-sdk/bundled-types/`: `bb-plugin-sdk-app.d.ts` (app hooks and types) and `bb-plugin-sdk.d.ts` (server `bb.sdk`). Names below are those declarations' names.
- Existing contracts: [wizbar.v1.md](wizbar.v1.md), [host-observation.v1.md](host-observation.v1.md), [settings.v1.md](settings.v1.md), [mute.v1.md](mute.v1.md).
- The [keeper observation](https://github.com/jparker2006/ClosedWiz/pull/2375#issuecomment-6779925149) already cited by those contracts. No new live read was made for this contract.

Types: `src/v3-types.ts`. Synthetic fixtures with hand-worked expected values: `src/fixtures/v3.ts`, checked by `src/fixtures/v3-fixtures.test.ts`.

## 1. Input rows and the two readers

The input row is the SDK's `PluginSidebarThread`, unchanged (`ThreadV3`). Every v0.3 computation (card metadata, children list, stats, pinned order) is one pure function over an array of these rows, so the UI and the CLI give the same answer for the same rows.

| Reader | Where its rows come from |
| --- | --- |
| UI (app) | `experimental_useSidebarThreads()` with its default active-lifecycle selection: the same rows the WZ12 running count reads, before any shelf, search, project, child-hiding or mute filter. `status !== "ready"` or a realtime connection other than `connected` means unavailable, as `readRunningSource` already rules |
| CLI (server) | `bb.sdk.threads.list({ archived: false, includeHidden: true, limit: 100, offset })`, every page until a page has fewer than 100 rows, no project filter. A failed read, a malformed row or a repeated ID means `state_unavailable`. Each raw row maps to the `ThreadV3` fields a computation reads, by the table below |

Raw-to-row mapping for the CLI reader (`threads.list` row → `PluginSidebarThread` field):

| Row field | From the raw `threads.list` row |
| --- | --- |
| `id`, `projectId`, `parentThreadId`, `createdAt`, `updatedAt`, `latestAttentionAt`, `lastReadAt`, `hasPendingInteraction`, `queuedWork`, `status`, `pinnedAt`, `pinSortKey` | The same-named field |
| `displayTitle` | `title`, else `titleFallback`, else the ID. Mention resolution is a host frontend step the server does not have; a title containing a mention can differ from the UI |
| `runtimeStatus` | `runtime.displayStatus` |
| `activity.workflows` | `activity.activeWorkflowCount` |
| `activity.backgroundAgents` | `activity.activeBackgroundAgentCount` |
| `activity.backgroundCommands` | `activity.activeBackgroundCommandCount` |
| `activity.planMode` | `activity.activePlanModeCount` |
| `activity.goals` | `activity.activeGoalCount` |
| `isPinned` | `pinnedAt !== null` |
| `isUnread` | `(lastReadAt ?? 0) < latestAttentionAt`, the server rule already in `server.ts` |
| `environment` | `null` when `environmentId` is null (the shipped projection rule the keeper observed); otherwise `{ id: environmentId, branchName: environmentBranchName, providerId: environmentProviderId, … }` |
| `host` | `null` when `environmentHostId` is null; otherwise `{ id: environmentHostId }` |

The nested raw `activity` object is the one `server.ts` already validates (`liveThreadSchema`).

**Working: one shared fact.** Every v0.3 computation (children status, stats) calls a row working when `hasRuntimeWork(runtimeStatus, [workflows, backgroundAgents, backgroundCommands, planMode, goals])` is true: the existing shared rule mute already uses on both the server and the sidebar (mute.v1.md). Both readers have exactly these inputs, so the UI and the CLI compute the same answer for the same rows. `indicator` is not an input: the host resolves it "attention before work", so a thread waiting for input while its runtime is active shows `waiting-for-input`, not `runtime`.

- **Unavailable:** a `runtimeStatus` outside SDK 0.6.33's `ThreadRuntimeDisplayStatus` (`idle`, `error`, `active`, `pending`, `starting`, `stopping`, `provisioning`, `waiting-for-host`) cannot mean idle, so that reader's children and stats results are unavailable (section 4), never a guess. The CLI reader rejects such a row as malformed.
- **One running number everywhere** ([orchestrator ruling on #39](https://github.com/openwizdev/wizplugins/issues/39#issuecomment-6818255945)). A row is **running** when it is working by the shared fact and `hasPendingInteraction` is false. A busy thread that waits on you counts under "waiting on you", never under running. The list-bottom "N running" line, the stats panel's `running.total` and `wizbar stats` all use this one rule and so show the same number for the same rows. `thr_v3_active_waiting` is the busy-but-waiting case in the fixtures.
- **The list-bottom line moves to this rule in #41.** Until #41 lands, the shipped line (#37) still counts the exported `isWorking`, which reads `indicator`; #41 changes the line's code and its tests to the running rule above. The `isWorking` export itself, and the settle/snooze rules that use it, are unchanged.

Parity in tests means: for the same rows (as `PluginSidebarThread`), the UI and the CLI computation return equal JSON. The live check (#9) compares `wizbar stats --json` with the panel at one moment and reports any difference.

## 2. Card metadata

The card's third line, left to right: model and effort, the issue/PR link, the child count. The branch moves to a hover title. A part whose source is missing is omitted; nothing is shown in its place.

| Field | Exact source | When the source is missing |
| --- | --- | --- |
| Model | None in SDK 0.6.33's sidebar row. Requested from Cloudroom. Once a host field exists, WizBar's server reads it and serves it through the `cardModels` RPC below | Omitted (the RPC returns `source: "none"` and `null`) |
| Effort | Same as model. Its vocabulary is SDK 0.6.33's `reasoningLevel` enum (`none`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, `ultracode`), shown with a capital first letter | Omitted. Effort without a model is omitted too |
| Pull request | `experimental_useSidebarThreadPullRequest(threadId).pullRequest`: `number` and `url` | `isLoading` or `pullRequest: null` (no branch, no environment, or a failed lookup): no PR part |
| Issue number | No host issue field in SDK 0.6.33. Parsed from `environment.branchName` | No branch, or a branch that does not parse: no issue part |
| Child count | The length of the children list (section 3) | Never missing; hidden at zero |
| Branch | `environment.branchName`, on hover only | No hover branch |

**Issue parse rule.** The branch matches `^room/([1-9][0-9]*)-` and the captured digits are a safe integer: that number is the issue. Anything else (no `room/` prefix at the start, a leading zero, no hyphen right after the digits, an unsafe integer, `null`) gives no issue. `v3BranchCases` lists the cases.

**The link chip** (`CardLinkV3`):

| PR | Issue | Chip text | Click opens |
| --- | --- | --- | --- |
| yes | yes | `#<issue> → PR #<pr>` | The PR's `url` |
| yes | no | `PR #<pr>` | The PR's `url` |
| no | yes | `#<issue>` | Nothing: no source gives the issue's URL, so it is plain text |
| no | no | no chip | — |

**Child-count chip:** absent at zero, `1 child`, `<N> children`.

**Model chip:** `<model> · <Effort>`, or `<model>` alone when effort is null; absent when model is null.

**Known limit (observed projection).** The keeper observed that Cloud rows project `environment: null` (host-observation.v1.md). Cloud rows therefore have no branch, no parsed issue and, per the declaration's own wording ("null when … the thread has no environment"), no pull request, until the host projects them. The target pictures show Cloud cards with links; that is intent, not a source.

**Candidate not adopted.** SDK 0.6.33's server declares `bb.sdk.threads.defaultExecutionOptions({ threadId })`, returning `{ model, reasoningLevel, source, … }` or null. Its declared meaning is the thread's resolved default execution options, not the model a running turn uses. The approved plan keeps model and effort omitted until the host exposes them, so v0.3 does not read it. Adopting it needs a plan change and a keeper observation that it matches what the thread runs.

### `cardModels` RPC (for #40)

Added to `t3sidebarRpcContract` by #40.

- Input: `{ threadIds: string[] }`, 1 to 100 distinct trimmed nonempty IDs.
- Result: `{ source: "none" | "host", items: { threadId, model: string | null, effort: EffortV3 | null }[] }`, one item per input ID, in input order.
- While no host field is adopted, `source` is `"none"` and every `model` and `effort` is null. An unknown ID gives nulls, never an error, so one bad row cannot hide the others' chips.
- An RPC failure omits the chips; it never shows placeholder text.

## 3. Children list

The children of thread `P` are the input rows whose `parentThreadId === P`: the parent-link rule the existing children chip (`childrenOf`) already uses, over the same rows. Hidden rows are included, as today. Archived children are not in the active-lifecycle input, so they are not listed.

**Order:** `createdAt` ascending (spawn order), then `id` ascending by code unit.

**Each child** (`ChildV3`): `id`, `status`, `title` (the row's `displayTitle`), `model`, `effort` (from `cardModels`; null while the source is `"none"`), `updatedAt` (epoch ms; the UI shows it with the existing `relativeTimeLabel`, as cards do).

**Status:** the first that holds:

| Status | Rule |
| --- | --- |
| `waiting` | `hasPendingInteraction` |
| `failed` | `status === "error"`, `runtimeStatus === "error"` or `queuedWork === "failed"` (the mute contract's failure rule) |
| `working` | Working: the shared fact (section 1) |
| `unread` | `isUnread` |
| `idle` | Otherwise |

**Link:** a child has no URL in the JSON. The UI opens a child, and the parent ("Open parent"), with `experimental_useSidebarThreadActions().open(id)`, the host's navigation. The SDK's `href` exists only in the app; the server has no host-provided URL, so the CLI reports the ID and agents open it by ID.

## 4. Stats

One computation over the reader's rows (section 1), at a given `now` and IANA `timeZone`. Each ID counts once; a repeated ID with conflicting facts makes the result unavailable, as WZ12's count does.

| Number | Exact definition |
| --- | --- |
| `running.total` | Running rows (section 1: working and not waiting on you). The same number as the list-bottom line once #41 applies the rule |
| `running.topLevel` | Running rows with `parentThreadId === null` |
| `running.children` | Running rows with `parentThreadId !== null`, whether or not the parent is in the input |
| `running.cloud`, `running.local`, `running.unknown` | Running rows by the shared `classifyMachine` (approved #29 rule): `"Cloud"`, `"Local"`, `null`. The three add up to `total` |
| `waitingOnYou` | Rows with `hasPendingInteraction`, busy or not. A busy row here is not in `running` |
| `finishedToday` | `{ source: "none", count: null }`: unavailable, because SDK 0.6.33 declares no finish time (below). Once a host finish-time field is adopted (a plan change and a keeper observation): `{ source: "host", count }`, the rows that are not working, not waiting and not failed whose finish time is inside today's window |

**"Today"** is the reader's local calendar day: from local midnight today (inclusive) to local midnight tomorrow (exclusive), in the reader's IANA time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), computed with calendar arithmetic like `resolveSnoozePresets`, so a 23- or 25-hour day is handled. The result reports `window: { timeZone, start, end }`. The panel uses the browser's zone and the CLI the server process's zone; when they differ, the window shows it.

**No finish source.** The SDK declares no finish time. `latestAttentionAt` is the host's latest attention time: a waiting, failed or merely updated thread moves it too, so it is not used as one. "Finished today" stays unavailable on its own while the other numbers are ready: the panel shows "Finished today: not available yet", the CLI text `Finished today: not available yet`, and the JSON `source: "none"`. The window is still reported, so the definition of "today" is fixed before the source exists.

**Coverage disclosures,** always present (`coverage`): `scope: "observable-sidebar"`, `subagents: "not-counted"`, `unseen: "possible"`. The panel says "subagents not counted yet" and "some threads may be unseen", the WZ12 wording. Subagents stay uncounted: background-agent activity makes a thread working but is never counted on its own.

**Unavailable.** When the reader's rows are unavailable (including a row with an unrecognised `runtimeStatus`, section 1), the result is `status: "unavailable"` with `running`, `waitingOnYou` and `finishedToday` all null. The panel shows a plain "unavailable" state, never a guessed number.

## 5. Drag rules and pinned order

**Pinned order** follows the SDK 0.6.33 `pinSortKey` declaration: pins with a key first, ascending by key (plain string comparison: "lexicographic, ascending"); then pins without a key, which the declaration sorts "by `pinnedAt`" without a direction. For that direction WizBar uses the comparator in the locked `bb-app` 0.37.0 app bundle: newest `pinnedAt` first, then newest `createdAt`, then ID. That bundle compares two keyed pins by key but a keyed and an unkeyed pin by `pinnedAt`, unlike the newer declaration; WizBar follows the declaration. The live host's order is Unverified until #9. `v3PinnedOrder` is the fixture's expected order; both rules give it.

| Drag | Effect | Host operation |
| --- | --- | --- |
| Into Pinned, from any other shelf | Pin, placed where dropped | `bb.sdk.threads.pin({ threadId })`, then `bb.sdk.threads.reorderPinned({ threadId, previousThreadId, nextThreadId })` with its new neighbours |
| Out of Pinned, onto the Inbox or any other shelf | Unpin | `bb.sdk.threads.unpin({ threadId })` |
| Inside Pinned | Reorder | `bb.sdk.threads.reorderPinned` with its new neighbours (`null` at either end) |
| Anything else (Inbox to Inbox, onto Snoozed, Settled or Muted from an unpinned card) | Nothing | None |

- The Inbox stays newest-first and is never re-ordered by any drop. An unpinned card lands at its own creation-time place.
- Drag and the CLI call the same WizBar server operations (#42), which call the host operations above. The UI always draws the host's sidebar rows, never its own guess, and keeps no optimistic position to restore.
- **Drag into Pinned is two host calls.** The SDK declares no atomic pin-and-place: `pin` can succeed and `reorderPinned` then fail. WizBar never undoes a step (no automatic unpin, no writing back an older order over changes made meanwhile). After the drop it re-reads the rows and reports one outcome (`DragPinCaseV3`, fixtures `v3DragPinCases`):

| Pin | Reorder | Rows after | Outcome | Shown |
| --- | --- | --- | --- | --- |
| ok | ok | ready | `pinned-placed` | The host's rows |
| failed | skipped | ready | `pin-failed` | The host's rows (unchanged) and `Could not pin: <error>` |
| ok | failed | ready | `pinned-not-placed` | The host's rows (pinned, at the host's own place) and `Pinned, but could not place it: <error>` |
| any | any | unavailable | `unknown` | `Pin state unknown: <error>`; the shelves show the existing unavailable state until the rows return |

The CLI has no combined command: `wizbar pin` and `wizbar move` are separate, so each reports its own result.
- Pinning does not change mute, settle or snooze rules: a pinned thread still cannot be muted (mute.v1.md), and pinned rows stay visible.

## 6. Footer

The footer is one WizBar item: `{ id: "stats", kind: "disclosure", label: "WizBar stats", icon: "Zap" }` through `app.experimental_sidebarFooter.register`. `Zap` is the built-in host icon (the bolt) that `BbIconName` names as its example. WizBar registers no icon called `Zap`, so the host's own glyph shows. The disclosure's component is WizBar's stats panel (section 4), which the host shows above the footer row and which may call `dismiss()`.

- The label is fixed at registration and never changes. No label updates, re-registration, casts, host DOM or CSS workarounds, and no custom count artwork in the footer. These are the limits recorded on #28 and #37.
- The live number stays in the list-bottom "N running" line, exactly as #37 left it (dim zero, hidden when off or unavailable).
- This disclosure replaces the earlier no-op `running-count` action and its `wizbar-running-count` icon registration (#41).
- `footerCountEnabled` keeps gating the list-bottom line; the panel shows its own unavailable state.

## 7. CLI

The four new command groups extend the existing `wizbar` registration in `command.ts`: same parser style, `--json` once, `--` before literal IDs, unknown flags and missing arguments are usage errors. `settle`, `unsettle`, `snooze`, `unsnooze`, `mute`, `unmute` and `list` are unchanged, with their output and exit codes. The usage line lists every operation.

**Exit codes**, every operation: `0` everything succeeded; `1` any thread or the whole command failed; `2` usage error.

**Usage error:** with `--json`, stdout `{"error":{"code":"usage","message":"<usage>"}}`; without it, the usage line on stderr. Exit 2.

**Error codes:**

| Code | Meaning | Commands |
| --- | --- | --- |
| `usage` | Bad syntax | All |
| `invalid_id` | An ID that is empty after trimming | All with IDs |
| `unknown_id` | No such thread, or it is deleted | `pin`, `unpin`, `move`, `children` |
| `state_unavailable` | The host read failed or was incomplete | All |
| `not_pinned` | `move` on a thread that is not pinned | `move` |
| `invalid_anchor` | The `--before`/`--after` thread is the moved thread itself, or not pinned | `move` |
| `operation_failed` | The host refused or failed the pin, unpin or reorder | `pin`, `unpin`, `move` |

### `wizbar pin <id>... [--json]` and `wizbar unpin <id>... [--json]`

Per-ID, like the existing commands: one bad ID never hides the others. Pinning a pinned thread, or unpinning an unpinned one, succeeds and changes nothing.

```json
{"results":[{"threadId":"thr_example_a","ok":true,"pinned":true},{"threadId":"thr_example_b","ok":false,"error":{"code":"unknown_id","message":"Unknown thread ID."}}]}
```

Text: one line per ID: `"thr_example_a": pinned`, `"thr_example_a": unpinned`, or `"thr_example_b": ERROR unknown_id: Unknown thread ID.`

### `wizbar move <id> (--before <id> | --after <id> | --first | --last) [--json]`

Exactly one ID and exactly one position, else usage. The thread must be pinned. `--before X` puts it right before pinned `X`; `--after X` right after; `--first` and `--last` at the ends. WizBar turns the position into the host's `previousThreadId`/`nextThreadId` from the current pinned order (section 5). Moving to where it already is succeeds.

```json
{"results":[{"threadId":"thr_example_a","ok":true,"pinned":true,"pinnedOrder":["thr_example_a","thr_example_c"]}]}
```

`pinnedOrder` is the pinned order read after the move. Text: `"thr_example_a": moved (1 of 2)`, or the error line.

### `wizbar children <id> [--json]`

Exactly one ID, else usage. The children list of section 3.

```json
{"parentThreadId":"thr_example_p","children":[{"id":"thr_example_c","status":"working","title":"Example child","model":null,"effort":null,"updatedAt":1794484800000}]}
```

No children: `"children":[]`, exit 0. An unknown ID: `{"error":{"code":"unknown_id","message":"Unknown thread ID."}}`, exit 1. Text: one line per child, `"<id>": <status> <title>`, or `no children`.

### `wizbar stats [--json]`

No IDs, else usage. The stats object of section 4, as `StatsV3`.

```json
{"version":1,"status":"ready","running":{"total":7,"topLevel":4,"children":3,"cloud":6,"local":1,"unknown":0},"waitingOnYou":2,"finishedToday":{"source":"none","count":null},"window":{"timeZone":"UTC","start":1794441600000,"end":1794528000000},"coverage":{"scope":"observable-sidebar","subagents":"not-counted","unseen":"possible"}}
```

Unavailable rows: `{"error":{"code":"state_unavailable","message":"Thread state is unavailable."}}`, exit 1. Text:

```text
7 running · 4 top-level, 3 children · 6 cloud, 1 local, 0 unknown · subagents not counted yet · some threads may be unseen
Waiting on you: 2
Finished today: not available yet
```

Once a host finish source is adopted, the last line becomes `Finished today: <count>`.

## 8. Header-chip settings

Two new boolean keys in [settings.v1.md](settings.v1.md), declared in `wizbarSettingDescriptors`:

| Key | Default | Gates |
| --- | --- | --- |
| `childrenChipEnabled` | false | The parent's children chip (`children` header registration) |
| `parentChipEnabled` | true | The child's chip back to its parent (`parent` header registration) |

Read with the existing rule: a missing key reads its default; exactly `true` is on; any other present value is off. Each switch changes only its own chip (#43). The host's settings store validates and persists them, as for the existing keys.

## Seams

| Seam | For |
| --- | --- |
| `cardModels` RPC shape, `CardMetaV3`, the issue parse rule, `v3PullRequests`, `v3BranchCases`, `v3CardMeta`, `v3CardModelsNone` | #40 |
| `ChildV3`/`ChildrenResultV3`, the `children` CLI, `v3Children`, the two header-chip settings | #43 |
| `StatsV3`, the footer registration, the `stats` CLI, `v3Stats` | #41 |
| `MovePositionV3`, pin/move results, the drag table, `DragPinCaseV3`, `v3PinnedOrder`, `v3DragPinCases` | #42 |
| `wizbarOperationsV3`, exit and error codes, every JSON shape | #44 (parity test) |

## Evidence limits

- Fixtures and these shapes prove no host behaviour. Model/effort availability, the Cloud projection's missing branch and PR, the real pinned order, any host finish time, the server reader's equivalence to the sidebar hook, whether real rows ever differ between `isWorking` and the running rule before #41, footer placement and the disclosure's real look stay Unverified until #9.
- The JSON timestamps in this document are examples; tests use the fixtures.

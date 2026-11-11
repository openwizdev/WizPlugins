# WizBar host-observation v1

Status: sanitised consumer contract for #24, under [plan revision 8](https://github.com/openwizdev/wizplugins/issues/1#issuecomment-6780025774). This document supplements [wizbar.v1.md](wizbar.v1.md) for next-iteration host inputs; it does not modify the baseline implementation or establish live acceptance.

Evidence: [private keeper observation](https://github.com/jparker2006/ClosedWiz/pull/2375#issuecomment-6779925149), 2026-11-10. Raw evidence stays private. Only field semantics, synthetic examples and evidence limits appear here. No new live read was performed for this contract. See the [discovery report](../../docs/discovery/wizbar-next-host.md) for SDK inspection and proof.

## Evidence boundary

The keeper read sidebar bootstrap through the installed SDK's normal caller-proof client and inspected the shipped frontend projection. It also reconciled SDK `threads.list` and `threads.count({ status: "active" })` at one stable snapshot. The list's stable-ID set agreed with bootstrap; active statuses and runtime display statuses agreed with the count immediately before and after. The snapshot contained no hidden rows or starting rows. The background-agent sum was zero.

That establishes endpoint agreement at one instant. It does **not** establish all-project completeness, child coverage, hidden/archived running-work coverage, pagination/filter arguments, live updates, complete subagent input, plugin-server access to the same raw fields, or a rendered footer number. In particular, active-status agreement does not establish equivalence to every signal in WizBar's existing `isWorking` predicate.

SDK **0.6.49** is the target confirmed by #27. The exact keeper comment above does not name the installed SDK version; installed-version readback is **Unverified** pending existing-record clarification. The inspected published 0.6.49 package is separate evidence. The baseline package on which this contract was prepared pins 0.6.33; changing that pin belongs to #27.

## Observed machine semantics

These are field-only summaries of known samples, not a general provider registry rule:

| Known sample | Raw `executionTarget` | Projected environment | Environment provider | Display kind / worktree | Projected host |
| --- | --- | --- | --- | --- | --- |
| Cloud | `"cloud"` | null | unavailable: entire object null | unavailable | null |
| Local checkout | absent | object | `"project-checkout"` | `"other"` / false | object |
| Local worktree | absent | object | `"git-worktree"` | `"managed-worktree"` / true | object |
| Local personal workspace | absent | object | `"personal-workspace"` | `"other"` / false | object |
| Local during startup | absent | null | unavailable | unavailable | null |

For the Cloud samples, raw `environmentId`, `environmentHostId`, `environmentProviderId` and `environmentIsWorktree` were null; raw `environmentWorkspaceDisplayKind` was `"other"`. The shipped projection makes the entire environment null when `environmentId` is null. `PluginSidebarThread` omits raw `executionTarget`.

Rules for #29:

- `executionTarget === "cloud"` is the observed positive Cloud discriminant. Consume it only through a supported SDK read, joined to the sidebar row by the same stable thread ID. Such a plugin read is **not established** by this record or the published 0.6.49 declarations. A cast or extra field on a fixture is insufficient.
- The three named environment providers describe known Local samples. A supported source with the observed absent target and one of these validated environment mappings may identify Local. Do not generalise to every nonempty provider. A conflicting Cloud target and Local environment must remain unknown pending resolution.
- An absent target alone does not establish Local. The starting Local sample must remain unknown when only the projected null environment/host is available.
- Null, absent and empty are distinct raw states. Explicit null/empty/unknown target values, absent/null/empty/unknown provider values and malformed input have no observed mapping. Preserve them as unknown; never coerce them into Cloud or Local.
- Never classify from titles, machine names, branch presence, worktree flags, display kind, null host or null environment. An outer `providerId` identifies the agent provider, not the execution machine.
- No supported raw target access means unavailable/unverified input, with no guessed icon and no live-data claim. Keep #29's affected consumer blocked until that access is established. Per-row unknown data must also remain unmarked even if other rows are classified.

## Running-source semantics for #28

The real observed source family is SDK sidebar bootstrap plus `threads.list`, reconciled with `threads.count({ status: "active" })`. CLI count is corroboration only, not a plugin input. Published server access is `BbPluginApi.sdk` (the loopback-bound SDK); frontend access is `useSdk`. The declaration establishes the access surface, not successful production reads or complete field preservation.

The published `projects.sidebarBootstrap` takes only an optional abort signal. `threads.list` returns rows and exposes `limit`, `offset`, `archived`, `includeHidden`, `projectId`, `hasParent`, `parentThreadId`, `hostId`, `environmentId`, `sectionId`, `unsectioned`, `originKind`, `originPluginId` and `sourceThreadId`. `threads.count` exposes `status`, `projectId`, `parentThreadId`, `hostId`, `providerId` and `groupBy`, plus abort signals. Exact observed arguments/defaults, page termination and snapshot consistency are not recorded. Omitting a project filter in types alone does not establish a complete global source.

Before producing ready input, #28 must establish a supported plugin read and its scope: every project; child threads; hidden, settled, snoozed and muted work; any archived-running boundary; all pages; and stable-ID uniqueness. Do not narrow input through search, route/project selection, shelves or child hiding. A partial list is not a global zero. Agreeing aggregate counts cannot prove membership or work-predicate equivalence.

Normalise the existing working inputs without changing the predicate: sidebar `activity.workflows`, `backgroundAgents`, `backgroundCommands`, `planMode`, `goals` and `indicator` (`runtime` or `working-draft`). Any positive activity or either indicator means working. Raw list activity uses `activeWorkflowCount`, `activeBackgroundAgentCount`, `activeBackgroundCommandCount`, `activePlanModeCount`, `activeGoalCount`; equivalence to the sidebar predicate, including runtime/indicator mapping and non-active states, needs validation. Unknown/missing signals cannot mean idle. Do not replace this rule with `status === "active"` based on the recorded snapshot.

The frontend `experimental_useSidebarThreads` declaration describes the host cache/realtime view, uncapped active lifecycle rows, optional paginated archived lifecycle rows, and `loading | ready | error`. Here “active lifecycle” is not the execution status `"active"`. Those declared update semantics are not a keeper-observed update sequence, nor proof that every required running row reaches the plugin. A one-shot list/count is not a live subscription.

A ready source needs an established freshness/update policy and successful reconciliation after reconnect, error or out-of-order refresh. Until that policy is proven, use unverified/unavailable status. During an incomplete refresh, stale snapshot, disconnected source or error, never report a live zero; retain any last-good value only if explicitly marked stale and never labelled live. No arbitrary freshness interval is established here.

Subagents remain **unproven and not counted**. A zero `activeBackgroundAgentCount` sum does not establish completeness or a one-to-one mapping to running in-thread subagents. Child threads are threads, counted once by stable ID; they are not those subagents. Thread-only ready input does not require a subagent map. Hover text must disclose that subagents are not counted yet.

## Exact sanitised consumer interface

This is a documentation-only normalisation boundary for #28/#29, not an existing SDK type, implemented RPC, or proof that a ready source exists. Implementations may use it after establishing the gates above. It carries only classification/work facts needed by consumers; no titles, machine identities, paths, branch names or raw payloads. Public examples use synthetic IDs; runtime IDs stay inside the plugin.

```typescript
type SourceGapV1 = "unverified" | "unavailable" | "incomplete" | "stale" | "error";
type SubagentsV1 = { status: "unproven"; count: null };
type WorkingThreadV1 = {
  id: string;
  projectId: string;
  parentThreadId: string | null;
  isWorking: boolean;
};
type RunningInputV1 = (
  | {
      status: "ready";
      scope: "all-projects-with-children-and-hidden";
      threads: readonly WorkingThreadV1[];
    }
  | { status: SourceGapV1; scope: "unverified"; threads: null }
) & { version: 1; subagents: SubagentsV1 };
type LocalProviderV1 = "project-checkout" | "git-worktree" | "personal-workspace";
type MachineInputV1 = { version: 1; threadId: string } & (
  | { status: "ready"; kind: "Cloud"; basis: "supported-execution-target-cloud" }
  | { status: "ready"; kind: "Local"; basis: "supported-local-mapping"; provider: LocalProviderV1 }
  | { status: SourceGapV1 | "unknown"; kind: null }
);
```

`ready` is an evidence obligation, not a flag inferred from a fulfilled promise or supplied by the UI. Current observation-only inputs remain `unverified`. IDs must be nonempty stable identifiers; `parentThreadId` is null only for known roots. An unknown parent relationship prevents claiming child completeness. Complete running input validates every working signal. Repeated identical IDs count once; conflicting duplicate rows invalidate the snapshot. Count unique working IDs as nonnegative safe integers. An empty **verified ready** thread set can yield zero; null input cannot. Numeric validation and duplicate handling are runtime consumer obligations, not guaranteed by TypeScript.

Machine readiness is per row: the raw observation must refer to that same ID and current snapshot, pass the mapping rules and arrive through supported access. A missing join or source error yields no classified result. Source status is separate from the user's feature switch: enabling a feature never promotes its data to ready. #25 owns the settings/status API; consumers adapt these states to that merged API and cannot advertise live input merely because this contract exists.

## Synthetic interface examples

All values below are invented. Ready cases describe conditional future inputs **after** source verification, not new host observations. The child belongs to a second synthetic project to exercise the cross-project shape; it is not evidence of observed child coverage.

```typescript
const unverifiedRunning: RunningInputV1 = {
  version: 1, status: "unverified", scope: "unverified", threads: null,
  subagents: { status: "unproven", count: null },
};
const conditionalRunning: RunningInputV1 = {
  version: 1, status: "ready", scope: "all-projects-with-children-and-hidden",
  threads: [
    { id: "sample-parent", projectId: "sample-project-a", parentThreadId: null, isWorking: true },
    { id: "sample-child", projectId: "sample-project-b", parentThreadId: "sample-parent", isWorking: true },
  ],
  subagents: { status: "unproven", count: null },
};
const conditionalCloud: MachineInputV1 = {
  version: 1, threadId: "sample-cloud", status: "ready", kind: "Cloud",
  basis: "supported-execution-target-cloud",
};
const conditionalLocal: MachineInputV1 = {
  version: 1, threadId: "sample-local", status: "ready", kind: "Local",
  basis: "supported-local-mapping", provider: "git-worktree",
};
const startup: MachineInputV1 = {
  version: 1, threadId: "sample-startup", status: "unknown", kind: null,
};
// @ts-expect-error An unavailable source cannot supply a ready empty list.
const fabricatedEmpty: RunningInputV1 = { version: 1, status: "unavailable", scope: "unverified", threads: [], subagents: { status: "unproven", count: null } };
// @ts-expect-error Missing subagent input must not be represented as zero.
const fabricatedAgents: SubagentsV1 = { status: "unproven", count: 0 };
// @ts-expect-error Null/unknown data cannot supply a classified Cloud result.
const guessedCloud: MachineInputV1 = { version: 1, threadId: "sample-unknown", status: "unknown", kind: "Cloud" };
```

Field-only synthetic mapping cases for independent review:

| Raw target | Projected environment provider / outer object | Supported raw lookup | Required outcome |
| --- | --- | --- | --- |
| `"cloud"` | null outer object | established, same ID | Cloud |
| absent | `"project-checkout"`, `"git-worktree"` or `"personal-workspace"` | established, matching validated Local shape | Local |
| absent | null outer object, null host (startup shape) | either | Unknown |
| not exposed | null outer object | unavailable | Unverified/unavailable; no icon |
| null / empty string / unexpected value | any | either | Unknown; no icon |
| absent | provider absent / null / empty string / unexpected value | either | Unknown; no icon |
| `"cloud"` | contradictory Local environment | established | Unknown pending reconciliation |

The first two outcomes are conditional on supported access. Today that access is not established for the raw discriminator, so these examples cannot unlock a live classification claim.

## Consumer release gates

- **#28:** source family identified, global/child/hidden scope, working-predicate mapping and live updates still unproven. Keep corresponding ready/live claims blocked. Footer registration exists in published declarations; inline live-number rendering is still Unverified. Follow WF1: render nothing if the required footer row cannot be supported; no icon-only or disclosure substitute.
- **#29:** observed Cloud discriminant and Local samples documented; supported raw lookup/join still missing. Keep the affected consumer blocked; do not restore the old provider-id guess.
- **#9:** after independently reviewed merges, the keeper proves actual SDK/build, settings, global child/muted counts, updates and rendered footer/row behavior. This contract, fixtures and green CI do not satisfy those live claims.

Only verified merge of this reviewed contract satisfies #24's document prerequisite; it does not erase the remaining source gates. The [builder question](https://github.com/openwizdev/wizplugins/issues/24#issuecomment-6780292038) requests existing-record clarification, not another live read. No installation, release or publication authority is added.

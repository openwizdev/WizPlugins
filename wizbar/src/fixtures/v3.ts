// Synthetic WizBar v0.3 fixtures (WZ17). Every id, title, branch, number and
// URL here is made up. The expected values are worked out by hand from
// contracts/sidebar-v3.v1.md, never by running v0.3 code, so later tickets can
// test their computations against them.
import type { PluginSidebarPullRequest, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type {
  CardMetaV3, CardModelsResultV3, ChildrenResultV3, DragPinCaseV3, PullRequestStateV3, StatsV3,
} from "../v3-types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Fixed clock and zone for every v0.3 fixture: midday, so "today" is unambiguous. */
export const v3Now = Date.parse("2026-11-12T12:00:00Z");
export const v3TimeZone = "UTC";

type Machine = "cloud" | "local" | "starting";
type Row = Partial<PluginSidebarThread> & { id: string; displayTitle: string; machine: Machine; branchName?: string | null };

function thread({ machine, branchName = null, ...row }: Row): PluginSidebarThread {
  const projectId = row.projectId ?? "prj_v3_atlas";
  const local = machine === "local";
  return {
    projectId,
    title: row.displayTitle,
    titleFallback: null,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "synthetic-provider",
    status: machine === "starting" ? "starting" : "idle",
    runtimeStatus: machine === "starting" ? "starting" : "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: `/projects/${projectId}/threads/${row.id}`,
    isHidden: false,
    // Observed projection (#29): Cloud and starting rows have no environment
    // or host, so they also have no branch and no pull request.
    environment: local ? {
      id: `env_${row.id}`, name: "Synthetic environment", branchName, path: null,
      isWorktree: true, providerId: "git-worktree", workspaceDisplayKind: "managed-worktree",
    } : null,
    host: local ? { id: "hst_v3_local", name: "Synthetic host" } : null,
    createdAt: v3Now - 10 * DAY,
    updatedAt: v3Now - 10 * DAY,
    lastReadAt: null,
    latestAttentionAt: v3Now - 10 * DAY,
    ...row,
  };
}

const running = {
  status: "active", runtimeStatus: "active", indicator: "runtime", indicatorLabel: "Thread is working",
} as const;
const waiting = {
  hasPendingInteraction: true, indicator: "waiting-for-input", indicatorLabel: "Thread needs user input",
} as const;

/**
 * Twelve sidebar rows, as `experimental_useSidebarThreads()` would return them.
 * Working (shared runtime rule): parent_many, child_working, child_local,
 * starting, active_waiting. Running (working and not waiting on you): the
 * first four. active_waiting is busy but waiting, so it counts under
 * "waiting on you" only; the footer's `isWorking` also misses it, because its
 * indicator shows the attention, not the runtime work behind it.
 */
export const v3Threads: readonly PluginSidebarThread[] = [
  thread({
    id: "thr_v3_parent_many", displayTitle: "Sample refine command palette", machine: "local",
    branchName: "room/1042-refine-command-palette-a1b2", ...running,
    isPinned: true, pinnedAt: v3Now - 2 * DAY, pinSortKey: "a0",
    createdAt: v3Now - 3 * HOUR, updatedAt: v3Now - 30_000, latestAttentionAt: v3Now - 3 * HOUR,
  }),
  thread({
    id: "thr_v3_child_working", displayTitle: "Sample audit shortcuts", machine: "cloud", ...running,
    parentThreadId: "thr_v3_parent_many",
    createdAt: v3Now - 2 * HOUR, updatedAt: v3Now - 20_000, latestAttentionAt: v3Now - 2 * HOUR,
  }),
  thread({
    id: "thr_v3_child_waiting", displayTitle: "Sample check focus order", machine: "cloud", ...waiting,
    parentThreadId: "thr_v3_parent_many",
    createdAt: v3Now - 90 * MINUTE, updatedAt: v3Now - 2 * MINUTE, latestAttentionAt: v3Now - 2 * MINUTE,
  }),
  thread({
    id: "thr_v3_child_finished", displayTitle: "Sample test search states", machine: "local",
    parentThreadId: "thr_v3_parent_many", isUnread: true, indicator: "unread-success",
    indicatorLabel: "Thread finished", lastReadAt: v3Now - 2 * HOUR,
    createdAt: v3Now - 80 * MINUTE, updatedAt: v3Now - 8 * MINUTE, latestAttentionAt: v3Now - HOUR,
  }),
  thread({
    id: "thr_v3_parent_one", displayTitle: "Sample choose cache strategy", machine: "local",
    branchName: "room/1043-choose-cache-strategy-c3d4", ...waiting,
    isPinned: true, pinnedAt: v3Now - 3 * DAY,
    createdAt: v3Now - 5 * HOUR, updatedAt: v3Now - 4 * MINUTE, latestAttentionAt: v3Now - 4 * MINUTE,
  }),
  thread({
    id: "thr_v3_child_local", displayTitle: "Sample measure cache hits", machine: "local",
    branchName: "agent/helper-e5f6", status: "active", runtimeStatus: "active",
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 1, planMode: 0, goals: 0 },
    indicator: "background-command", indicatorLabel: "Thread is running a command",
    parentThreadId: "thr_v3_parent_one",
    createdAt: v3Now - 4 * HOUR, updatedAt: v3Now - MINUTE, latestAttentionAt: v3Now - 4 * HOUR,
  }),
  thread({
    id: "thr_v3_starting", displayTitle: "Sample update color tokens", machine: "starting",
    indicator: "runtime", indicatorLabel: "Thread is working",
    createdAt: v3Now - 18 * MINUTE, updatedAt: v3Now - 18 * MINUTE, latestAttentionAt: v3Now - 18 * MINUTE,
  }),
  thread({
    id: "thr_v3_finished_today", displayTitle: "Sample polish empty states", machine: "local",
    branchName: "feature/polish-empty-states", projectId: "prj_v3_studio",
    createdAt: v3Now - 6 * HOUR, updatedAt: v3Now - 2 * HOUR, latestAttentionAt: v3Now - 2 * HOUR,
    lastReadAt: v3Now - HOUR,
  }),
  thread({
    id: "thr_v3_finished_yesterday", displayTitle: "Sample review keyboard navigation", machine: "cloud",
    projectId: "prj_v3_forge",
    createdAt: v3Now - DAY, updatedAt: Date.parse("2026-11-11T23:30:00Z"),
    latestAttentionAt: Date.parse("2026-11-11T23:30:00Z"), lastReadAt: v3Now - HOUR,
  }),
  thread({
    id: "thr_v3_failed", displayTitle: "Sample migrate settings store", machine: "cloud",
    projectId: "prj_v3_forge", status: "error", runtimeStatus: "error", isUnread: true,
    indicator: "unread-error", indicatorLabel: "Thread failed",
    createdAt: v3Now - 7 * HOUR, updatedAt: v3Now - 30 * MINUTE, latestAttentionAt: v3Now - 30 * MINUTE,
  }),
  thread({
    id: "thr_v3_active_waiting", displayTitle: "Sample confirm schema change", machine: "cloud",
    projectId: "prj_v3_studio", status: "active", runtimeStatus: "active", ...waiting,
    createdAt: v3Now - 40 * MINUTE, updatedAt: v3Now - 3 * MINUTE, latestAttentionAt: v3Now - 3 * MINUTE,
  }),
  thread({
    id: "thr_v3_pinned_idle", displayTitle: "Sample release checklist", machine: "local",
    branchName: "main", isPinned: true, pinnedAt: v3Now - DAY, pinSortKey: "a1",
    createdAt: v3Now - 9 * DAY, updatedAt: v3Now - 7 * DAY, latestAttentionAt: v3Now - 7 * DAY,
    lastReadAt: v3Now - 7 * DAY,
  }),
];

function pullRequest(number: number, state: PluginSidebarPullRequest["state"]): PluginSidebarPullRequest {
  return {
    experimental_autoMerge: false,
    experimental_inMergeQueue: null,
    experimental_checks: { state: "passing" },
    experimental_review: { state: "none" },
    experimental_mergeability: { state: state === "open" ? "mergeable" : "unknown" },
    number,
    title: `Sample pull request ${number}`,
    url: `https://github.com/example/sample-repo/pull/${number}`,
    state,
    attention: state === "merged" ? "merged" : "none",
  };
}

/** `experimental_useSidebarThreadPullRequest(id)` per thread; absent ids read `{ isLoading: false, pullRequest: null }`. */
export const v3PullRequests: Readonly<Record<string, PullRequestStateV3>> = {
  thr_v3_parent_many: { isLoading: false, pullRequest: pullRequest(1088, "open") },
  thr_v3_parent_one: { isLoading: false, pullRequest: null },
  thr_v3_finished_today: { isLoading: false, pullRequest: pullRequest(1046, "merged") },
};

/** Branch name → issue number by the contract's `room/<N>-…` rule. */
export const v3BranchCases: ReadonlyArray<readonly [string | null, number | null]> = [
  ["room/1042-refine-command-palette-a1b2", 1042],
  ["room/1043-choose-cache-strategy-c3d4", 1043],
  ["room/7-x", 7],
  ["feature/polish-empty-states", null],
  ["agent/helper-e5f6", null],
  ["main", null],
  [null, null],
  ["room/42", null],
  ["room/0-zero", null],
  ["room/012-leading-zero", null],
  ["room/12abc-no-dash-after-digits", null],
  ["room/abc-1", null],
  ["Room/44-wrong-case", null],
  ["origin/room/45-not-at-start", null],
  ["room/9007199254740993-unsafe", null],
];

/** Issue numbers the card shows for each row that has a branch. */
export const v3IssueNumbers: Readonly<Record<string, number | null>> = {
  thr_v3_parent_many: 1042,
  thr_v3_parent_one: 1043,
  thr_v3_child_local: null,
  thr_v3_child_finished: null,
  thr_v3_finished_today: null,
  thr_v3_pinned_idle: null,
};

/** The `cardModels` RPC result while no host model/effort field is adopted. */
export const v3CardModelsNone: CardModelsResultV3 = {
  source: "none",
  items: v3Threads.map((t) => ({ threadId: t.id, model: null, effort: null })),
};

/** The card metadata each row should show, with no host model/effort field. */
export const v3CardMeta: Readonly<Record<string, CardMetaV3>> = Object.fromEntries(([
  ["thr_v3_parent_many", { kind: "pull-request", issueNumber: 1042, pullRequest: { number: 1088, url: "https://github.com/example/sample-repo/pull/1088" } }, 3, "room/1042-refine-command-palette-a1b2"],
  ["thr_v3_child_working", null, 0, null],
  ["thr_v3_child_waiting", null, 0, null],
  ["thr_v3_child_finished", null, 0, null],
  ["thr_v3_parent_one", { kind: "issue", issueNumber: 1043, pullRequest: null }, 1, "room/1043-choose-cache-strategy-c3d4"],
  ["thr_v3_child_local", null, 0, "agent/helper-e5f6"],
  ["thr_v3_starting", null, 0, null],
  ["thr_v3_finished_today", { kind: "pull-request", issueNumber: null, pullRequest: { number: 1046, url: "https://github.com/example/sample-repo/pull/1046" } }, 0, "feature/polish-empty-states"],
  ["thr_v3_finished_yesterday", null, 0, null],
  ["thr_v3_failed", null, 0, null],
  ["thr_v3_active_waiting", null, 0, null],
  ["thr_v3_pinned_idle", null, 0, "main"],
] as const).map(([threadId, link, childCount, branch]) => [
  threadId, { threadId, model: null, effort: null, link, childCount, branch } as CardMetaV3,
]));

const none = { model: null, effort: null } as const;
const noChildren = (parentThreadId: string): ChildrenResultV3 => ({ parentThreadId, children: [] });

/** `wizbar children <id>` for every top-level row: createdAt ascending, then id. */
export const v3Children: Readonly<Record<string, ChildrenResultV3>> = {
  thr_v3_parent_many: {
    parentThreadId: "thr_v3_parent_many",
    children: [
      { id: "thr_v3_child_working", status: "working", title: "Sample audit shortcuts", ...none, updatedAt: v3Now - 20_000 },
      { id: "thr_v3_child_waiting", status: "waiting", title: "Sample check focus order", ...none, updatedAt: v3Now - 2 * MINUTE },
      { id: "thr_v3_child_finished", status: "unread", title: "Sample test search states", ...none, updatedAt: v3Now - 8 * MINUTE },
    ],
  },
  thr_v3_parent_one: {
    parentThreadId: "thr_v3_parent_one",
    children: [
      { id: "thr_v3_child_local", status: "working", title: "Sample measure cache hits", ...none, updatedAt: v3Now - MINUTE },
    ],
  },
  thr_v3_starting: noChildren("thr_v3_starting"),
  thr_v3_finished_today: noChildren("thr_v3_finished_today"),
  thr_v3_finished_yesterday: noChildren("thr_v3_finished_yesterday"),
  thr_v3_failed: noChildren("thr_v3_failed"),
  thr_v3_active_waiting: noChildren("thr_v3_active_waiting"),
  thr_v3_pinned_idle: noChildren("thr_v3_pinned_idle"),
};

/** `wizbar stats` for these rows at `v3Now` in `v3TimeZone`. */
export const v3Stats: StatsV3 = {
  version: 1,
  status: "ready",
  running: { total: 4, topLevel: 2, children: 2, cloud: 1, local: 2, unknown: 1 },
  waitingOnYou: 3,
  // No host finish time yet. Once one exists, finished_today and child_finished count here.
  finishedToday: { source: "none", count: null },
  window: { timeZone: "UTC", start: Date.parse("2026-11-12T00:00:00Z"), end: Date.parse("2026-11-13T00:00:00Z") },
  coverage: { scope: "observable-sidebar", subagents: "not-counted", unseen: "possible" },
};

/** The host's pinned order: keyed pins by key, then unkeyed pins. */
export const v3PinnedOrder: readonly string[] = ["thr_v3_parent_many", "thr_v3_pinned_idle", "thr_v3_parent_one"];

/** Drag into Pinned: `pin`, then `reorderPinned`, two host calls with no atomic pair. */
export const v3DragPinCases: readonly DragPinCaseV3[] = [
  { pin: "ok", reorder: "ok", rowsAfter: "ready", outcome: { kind: "pinned-placed" } },
  {
    pin: "failed", reorder: "skipped", rowsAfter: "ready",
    outcome: { kind: "pin-failed", message: "Could not pin: Sample host refusal." },
  },
  {
    pin: "ok", reorder: "failed", rowsAfter: "ready",
    outcome: { kind: "pinned-not-placed", message: "Pinned, but could not place it: Sample host refusal." },
  },
  {
    pin: "ok", reorder: "failed", rowsAfter: "unavailable",
    outcome: { kind: "unknown", message: "Pin state unknown: Sample host refusal." },
  },
];

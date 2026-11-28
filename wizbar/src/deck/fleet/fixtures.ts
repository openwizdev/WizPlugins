// Synthetic F1 (#75) fixtures. Every id, title, branch, repository and URL is
// invented. Expected placements are worked out by hand from the ticket's
// rules (verified links, then parent relationships), not by running the model.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import type { FleetPullRequestV1 } from "./links";

export const fxNow = Date.parse("2026-11-15T20:30:00Z");
export const REPO = "example-org/sample-app";
export const SPEC = `${REPO}#41` as const;
export const OTHER_SPEC = `${REPO}#60` as const;

export function fxThread(row: {
  id: string; title: string; parent?: string | null; branch?: string | null; project?: string; hidden?: boolean; created: number;
}): PluginSidebarThread {
  const projectId = row.project ?? "prj_a";
  return {
    id: row.id, projectId, title: row.title, titleFallback: null, displayTitle: row.title,
    parentThreadId: row.parent ?? null, lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null,
    originKind: null, originPluginId: null, providerId: "synthetic-provider",
    status: "idle", runtimeStatus: "idle", queuedWork: "none", hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none", indicatorLabel: null, isUnread: false, isPinned: false, pinnedAt: null, pinSortKey: null,
    isArchived: false, archivedAt: null, href: `/projects/${projectId}/threads/${row.id}`, isHidden: row.hidden ?? false,
    environment: row.branch === undefined || row.branch === null ? null : {
      id: `env_${row.id}`, name: "Synthetic environment", branchName: row.branch, path: null,
      isWorktree: true, providerId: null, workspaceDisplayKind: null,
    },
    host: null,
    // Deliberately recent: creation and update times must never become activity or idle time.
    createdAt: fxNow - 3 * 3_600_000 + row.created * 60_000, updatedAt: fxNow - 1_000,
    lastReadAt: null, latestAttentionAt: fxNow - 1_000,
  };
}

/**
 * The sample fleet in project prj_a:
 * - mgr (no PR) → manager of #41, placed by its builder child.
 * - b2 on room/t2 → open PR #52 closing #43, whose parent is #41: builder.
 * - rev (no branch), child of b2 → helper, by its parent.
 * - b3 on room/t3: no same-repository PR (only a fork's), child of mgr → helper of #41.
 * - help (hidden), child of b3 → helper of #41.
 * - orphan: parent thr_gone is not listed → unplaced, absent parent.
 * - titled: title names "#41" but has no branch → unplaced (titles are never parsed).
 * - other: project prj_b → never shown here.
 */
export const fxThreads: PluginSidebarThread[] = [
  fxThread({ id: "thr_mgr", title: "Fleet manager for Search filters", branch: "room/mgr", created: 1 }),
  fxThread({ id: "thr_b2", title: "Build T2 filter chips", parent: "thr_mgr", branch: "room/t2", created: 2 }),
  fxThread({ id: "thr_rev", title: "Review PR #52", parent: "thr_b2", created: 3 }),
  fxThread({ id: "thr_b3", title: "Build T3 saved filters", parent: "thr_mgr", branch: "room/t3", created: 4 }),
  fxThread({ id: "thr_help", title: "Search helper", parent: "thr_b3", hidden: true, created: 5 }),
  fxThread({ id: "thr_orphan", title: "Untitled thread", parent: "thr_gone", created: 6 }),
  fxThread({ id: "thr_titled", title: "#41 Search filters notes", created: 7 }),
  fxThread({ id: "thr_other", title: "Other project work", project: "prj_b", branch: "room/t2", created: 8 }),
];

/** #160 running inventory: one duplicate, one running child missing from the sidebar list, one other project. */
export const fxRunning = [
  { id: "thr_mgr", projectId: "prj_a", parentThreadId: null },
  { id: "thr_b2", projectId: "prj_a", parentThreadId: "thr_mgr" },
  { id: "thr_b2", projectId: "prj_a", parentThreadId: "thr_mgr" },
  { id: "thr_b3", projectId: "prj_a", parentThreadId: "thr_mgr" },
  { id: "thr_ghost", projectId: "prj_a", parentThreadId: "thr_b2" },
  { id: "thr_other", projectId: "prj_b", parentThreadId: null },
];

const ticket = (number: number, title: string, state: "open" | "closed", spec: string | null = SPEC) => ({
  ref: `${REPO}#${number}` as const, url: `https://github.com/${REPO}/issues/${number}`, title, state, spec: spec as never,
});
const pr = (number: number, branch: string, state: "open" | "merged", tickets: ReturnType<typeof ticket>[]): FleetPullRequestV1 => ({
  ref: `${REPO}#${number}`, url: `https://github.com/${REPO}/pull/${number}`, headRefName: branch, state,
  mergedAt: state === "merged" ? "2026-11-15T10:00:00Z" : null, tickets, ticketsComplete: true,
});

export const fxPullRequests: FleetPullRequestV1[] = [
  pr(52, "room/t2", "open", [ticket(43, "Filter chips", "open")]),
  pr(50, "room/t1", "merged", [ticket(42, "Filter model", "closed")]),
  pr(51, "room/t4", "merged", [ticket(45, "Facet counts", "closed")]),
];

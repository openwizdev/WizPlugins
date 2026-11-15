// Synthetic sidebar rows for B1 (#76). Every id, title and project is invented.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

const idle = { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 };

/** One synthetic `PluginSidebarThread`, idle unless overridden. */
export function b1Row(id: string, overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  const name = overrides.displayTitle ?? `Task ${id}`;
  return {
    id, projectId: "prj_b1_a", title: name, titleFallback: null, displayTitle: name,
    parentThreadId: null, lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null,
    originKind: null, originPluginId: null, providerId: "codex",
    status: "idle", runtimeStatus: "idle", queuedWork: "none", hasPendingInteraction: false,
    activity: { ...idle }, indicator: "none", indicatorLabel: null, isUnread: false,
    isPinned: false, pinnedAt: null, pinSortKey: null, isArchived: false, archivedAt: null,
    href: `/projects/prj_b1_a/threads/${id}`, isHidden: false, environment: null, host: null,
    createdAt: 1_000, updatedAt: 1_000, lastReadAt: 1_000, latestAttentionAt: 1_000,
    ...overrides,
  };
}

/** A row that is running by the shared rule (runtime work, not waiting on you). */
export function b1Running(id: string, overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return b1Row(id, { status: "active", runtimeStatus: "active", indicator: "runtime", ...overrides });
}

/**
 * A #160-shaped host snapshot: a running manager with two running children,
 * a hidden running root, a child whose parent is known but idle, an orphan
 * whose parent was never delivered, and a repeat of one row.
 */
export function b1Inventory() {
  const manager = b1Running("thr_b1_manager", { displayTitle: "Spec 41 manager", createdAt: 5_000 });
  const builder = b1Running("thr_b1_builder", { displayTitle: "Builder 42", parentThreadId: manager.id, isHidden: true, createdAt: 6_000 });
  const reviewer = b1Running("thr_b1_reviewer", { displayTitle: "Reviewer 42", parentThreadId: manager.id, isHidden: true, createdAt: 7_000 });
  const helper = b1Running("thr_b1_helper", { displayTitle: "Search helper", parentThreadId: builder.id, isHidden: true, createdAt: 8_000 });
  const hiddenRoot = b1Running("thr_b1_hidden", { displayTitle: "Hidden root", isHidden: true, createdAt: 9_000 });
  const idleParent = b1Row("thr_b1_release", { displayTitle: "Release prep", createdAt: 4_000 });
  const docs = b1Running("thr_b1_docs", { displayTitle: "Docs helper", parentThreadId: idleParent.id, isHidden: true, createdAt: 4_500 });
  const orphan = b1Running("thr_b1_orphan", { displayTitle: "Orphan task", parentThreadId: "thr_b1_absent", isHidden: true, createdAt: 3_000,
    activity: { ...idle, backgroundAgents: 3 } });
  const finished = b1Row("thr_b1_finished", { displayTitle: "Finished child", parentThreadId: manager.id, isHidden: true, createdAt: 6_500 });
  const runningThreads = [manager, builder, reviewer, helper, hiddenRoot, docs, orphan, builder];
  return {
    rows: { manager, builder, reviewer, helper, hiddenRoot, idleParent, docs, orphan, finished },
    threads: [manager, idleParent, hiddenRoot, builder, reviewer, finished],
    runningThreads,
    childrenByParentId: {
      [manager.id]: [builder, reviewer, finished],
      [builder.id]: [helper],
      [idleParent.id]: [docs],
      thr_b1_absent: [orphan],
    },
  };
}

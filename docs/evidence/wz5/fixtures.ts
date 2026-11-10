import type { isWorking } from "../../../wizbar/src/useLifecycle";
type PluginSidebarThread = Parameters<typeof isWorking>[0];

/** Synthetic records only; not an observed host payload or mapping. */
export function syntheticThread(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id: "sample-parent", projectId: "sample-project-a", title: "Sample work",
    titleFallback: null, displayTitle: "Sample work", parentThreadId: null,
    lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null,
    originKind: null, originPluginId: null, providerId: "codex",
    status: "idle", runtimeStatus: "idle", queuedWork: "none", hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none", indicatorLabel: null, isUnread: false, isPinned: false,
    pinnedAt: null, pinSortKey: null, isArchived: false, archivedAt: null,
    href: "/projects/sample-project-a/threads/sample-parent", isHidden: false,
    environment: null, host: null, createdAt: 100, updatedAt: 100,
    lastReadAt: 100, latestAttentionAt: 100, ...overrides,
  };
}

export const positiveThreads = [
  syntheticThread({ indicator: "runtime" }),
  syntheticThread({ id: "sample-child", projectId: "sample-project-b", parentThreadId: "sample-parent", isHidden: true, indicator: "working-draft" }),
  syntheticThread({ id: "sample-idle", title: "Documentation and compatibility verification" }),
];

// Explicit synthetic values, deliberately independent of backgroundAgents.
export const positiveSource = {
  complete: true, threads: positiveThreads,
  subagentsByThread: new Map([["sample-parent", 2], ["sample-child", 1], ["sample-idle", 0]]),
};

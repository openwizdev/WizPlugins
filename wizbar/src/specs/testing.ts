// Test-only helpers for the WB4-1 tests (imported by *.test.ts files only).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

/** `threads.list` rows for the fixture, by sidebar-v3's raw-to-row table plus `providerId`. */
export const rawRow = (t: PluginSidebarThread) => ({
  id: t.id, projectId: t.projectId, parentThreadId: t.parentThreadId, archivedAt: null, deletedAt: null,
  title: t.title, titleFallback: t.titleFallback, providerId: t.providerId, createdAt: t.createdAt, updatedAt: t.updatedAt,
  lastReadAt: t.lastReadAt, latestAttentionAt: t.latestAttentionAt, hasPendingInteraction: t.hasPendingInteraction,
  queuedWork: t.queuedWork, status: t.status, pinnedAt: t.pinnedAt, pinSortKey: t.pinSortKey,
  runtime: { displayStatus: t.runtimeStatus, hostReconnectGraceExpiresAt: null },
  activity: {
    activeWorkflowCount: t.activity.workflows, activeBackgroundAgentCount: t.activity.backgroundAgents,
    activeBackgroundCommandCount: t.activity.backgroundCommands, activePlanModeCount: t.activity.planMode,
    activeGoalCount: t.activity.goals,
  },
  environmentId: t.environment?.id ?? null, environmentBranchName: t.environment?.branchName ?? null,
  environmentProviderId: t.environment?.providerId ?? null, environmentHostId: t.host?.id ?? null,
});


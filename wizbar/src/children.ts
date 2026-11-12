// The children list (WZ19 / #43): contracts/sidebar-v3.v1.md section 3. One
// pure computation over the reader's rows, so the hover panel and
// `wizbar children` give the same answer for the same rows.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { hasRuntimeWork } from "./lifecycle";
import type { CardModelsResultV3, ChildStatusV3, ChildrenResultV3 } from "./v3-types";

/** SDK 0.6.33's `ThreadRuntimeDisplayStatus`; anything else cannot mean idle. */
export const runtimeStatusesV3 = [
  "idle", "error", "active", "pending", "starting", "stopping", "provisioning", "waiting-for-host",
] as const;

/** The row fields the children list reads; both readers supply them. */
export type ChildrenRow = Pick<PluginSidebarThread,
  "id" | "parentThreadId" | "createdAt" | "updatedAt" | "displayTitle" | "status" | "runtimeStatus" |
  "queuedWork" | "hasPendingInteraction" | "activity" | "isUnread">;

/** First that holds: waiting, failed, working, unread, idle. */
function childStatus(row: ChildrenRow): ChildStatusV3 {
  if (row.hasPendingInteraction) return "waiting";
  if (row.status === "error" || row.runtimeStatus === "error" || row.queuedWork === "failed") return "failed";
  const { workflows, backgroundAgents, backgroundCommands, planMode, goals } = row.activity;
  if (hasRuntimeWork(row.runtimeStatus, [workflows, backgroundAgents, backgroundCommands, planMode, goals])) return "working";
  return row.isUnread ? "unread" : "idle";
}

/**
 * The children of `parentThreadId`: rows whose `parentThreadId` names it,
 * hidden ones included, oldest first, then by id. Null means unavailable: a
 * row with an unrecognised runtime status or a repeated id is not a fact.
 * Model and effort come only from a host `cardModels` source.
 */
export function childrenList(
  rows: readonly ChildrenRow[], parentThreadId: string, models?: CardModelsResultV3,
): ChildrenResultV3 | null {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id) || !(runtimeStatusesV3 as readonly string[]).includes(row.runtimeStatus)) return null;
    seen.add(row.id);
  }
  const served = new Map(models?.source === "host" ? models.items.map((item) => [item.threadId, item]) : []);
  const children = rows
    .filter((row) => row.parentThreadId === parentThreadId)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => {
      const item = served.get(row.id);
      const model = item?.model?.trim() || null;
      return {
        id: row.id, status: childStatus(row), title: row.displayTitle,
        model, effort: model === null ? null : item?.effort ?? null, updatedAt: row.updatedAt,
      };
    });
  return { parentThreadId, children };
}

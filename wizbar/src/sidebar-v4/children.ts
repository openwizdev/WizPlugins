// B1 (#76): one parent's children for the sidebar's expandable card. The
// sidebar rows whose `parentThreadId` names the parent (hidden ones included,
// sidebar-v3.v1.md section 3) joined with #160's `childrenByParentId`,
// deduplicated by id. Running first, then the rest; inside each group, spawn
// order (oldest first, then id), so a list never jumps on an update. #160
// delivers only known children and the app has no complete child read, so the
// total is always unknown here (factory-view.v1.md section 7).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { readHostInventory } from "../factory-contract";
import { isRunning } from "../stats";

export interface ChildGroupV4 {
  parentId: string;
  rows: { thread: PluginSidebarThread; running: boolean }[];
  running: number;
  /** `complete` needs a verified complete child read (#158); no app source supplies one yet. */
  total: { status: "unknown" } | { status: "complete"; total: number };
}
export interface ChildInputV4 {
  threads: readonly PluginSidebarThread[];
  runningThreads?: unknown;
  childrenByParentId?: unknown;
}

const byCreation = (a: PluginSidebarThread, b: PluginSidebarThread) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function childGroup(parentId: string, input: ChildInputV4): ChildGroupV4 {
  const inventory = input.runningThreads === undefined ? null
    : readHostInventory({ runningThreads: input.runningThreads, childrenByParentId: input.childrenByParentId });
  const ready = inventory?.status === "ready" ? inventory : null;
  const found = new Map<string, PluginSidebarThread>();
  for (const row of input.threads) if (row.parentThreadId === parentId && !found.has(row.id)) found.set(row.id, row);
  if (ready && ready.children.status === "delivered-only") {
    const delivered = (input.childrenByParentId as Record<string, PluginSidebarThread[]>)[parentId] ?? [];
    for (const row of delivered) if (!found.has(row.id)) found.set(row.id, row);
  }
  // The host's running set when it is delivered; otherwise the one running rule.
  const runningIds = ready ? new Set(ready.running.map(({ id }) => id)) : null;
  const all = [...found.values()].sort(byCreation)
    .map((thread) => ({ thread, running: runningIds ? runningIds.has(thread.id) : isRunning(thread) }));
  const rows = [...all.filter(({ running }) => running), ...all.filter(({ running }) => !running)];
  return { parentId, rows, running: rows.filter(({ running }) => running).length, total: { status: "unknown" } };
}

/** The parent's summary: what is shown and running, never a complete total it cannot prove. */
export function childSummary(group: ChildGroupV4): string {
  if (group.total.status === "complete") {
    return `${group.total.total} ${group.total.total === 1 ? "child" : "children"} · ${group.running} running`;
  }
  if (group.rows.length === 0) return "0 children shown · total unknown";
  return `${group.rows.length} ${group.rows.length === 1 ? "child" : "children"} · ${group.running} running · total unknown`;
}

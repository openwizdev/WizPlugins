// B1 (#76) child groups: stub before the proof. Replaced in the next commit.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export interface ChildGroupV4 {
  parentId: string;
  rows: { thread: PluginSidebarThread; running: boolean }[];
  running: number;
  total: { status: "unknown" } | { status: "complete"; total: number };
}
export interface ChildInputV4 {
  threads: readonly PluginSidebarThread[];
  runningThreads?: unknown;
  childrenByParentId?: unknown;
}
export function childGroup(parentId: string, _input: ChildInputV4): ChildGroupV4 {
  return { parentId, rows: [], running: 0, total: { status: "complete", total: 0 } };
}
export function childSummary(_group: ChildGroupV4): string {
  return "";
}

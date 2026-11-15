// B1 (#76) running rows: stub before the proof. Replaced in the next commit.
import type { PluginRealtimeConnectionState, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export interface RunningEntryV4 { thread: PluginSidebarThread; depth: number }
export interface RunningGroupV4 {
  heading: null | { kind: "parent"; parentId: string; title: string } | { kind: "unplaced"; parentId: string };
  entries: RunningEntryV4[];
}
export type RunningRowsV4 =
  | { status: "ready"; source: "host-inventory" | "observable-sidebar"; count: number; rows: PluginSidebarThread[]; groups: RunningGroupV4[] }
  | { status: "unavailable"; reason: "loading" | "error" | "stale" | "malformed" | "conflicting-duplicate" };
export interface RunningInputV4 {
  status: "error" | "loading" | "ready";
  threads: readonly PluginSidebarThread[];
  runningThreads?: unknown;
  childrenByParentId?: unknown;
}

export function readRunningRows(_state: RunningInputV4, _connection: PluginRealtimeConnectionState): RunningRowsV4 {
  return { status: "unavailable", reason: "malformed" };
}

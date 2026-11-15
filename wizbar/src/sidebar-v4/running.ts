// B1 (#76): the one running set behind the sidebar's count and its popover.
// The host's #160 `runningThreads` is read once through C1's
// `readHostInventory` (factory-view.v1.md section 7), deduplicated by id; an
// older host without it falls back to the sidebar rows by the one running rule
// (sidebar-v3.v1.md section 1). Either way the count is the number of rows, and
// every counted row is placed in exactly one group. Parent headings are context
// and never counted; nothing is added for in-process subagents.
import type { PluginRealtimeConnectionState, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { readHostInventory } from "../factory-contract";
import { isRunning, readSidebarRows } from "../stats";

export interface RunningEntryV4 { thread: PluginSidebarThread; depth: number }
export interface RunningGroupV4 {
  /** null: the group starts at a top-level running row. `parent`: an idle, known parent. `unplaced`: the parent was not delivered. */
  heading: null | { kind: "parent"; parentId: string; title: string } | { kind: "unplaced"; parentId: string };
  entries: RunningEntryV4[];
}
export type RunningRowsV4 =
  | { status: "ready"; source: "host-inventory" | "observable-sidebar"; count: number; rows: PluginSidebarThread[]; groups: RunningGroupV4[] }
  | { status: "unavailable"; reason: "loading" | "error" | "stale" | "malformed" | "conflicting-duplicate" };
/** `experimental_useSidebarThreads()` with #160's optional additive fields, read as unknown. */
export interface RunningInputV4 {
  status: "error" | "loading" | "ready";
  threads: readonly PluginSidebarThread[];
  runningThreads?: unknown;
  childrenByParentId?: unknown;
}

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
/** The fields the popover draws and opens with; anything else is not a usable row. */
const drawable = (row: PluginSidebarThread) => text(row.displayTitle) && text(row.href) && Number.isFinite(row.createdAt);
/** Spawn order: oldest first, then id. */
const byCreation = (a: PluginSidebarThread, b: PluginSidebarThread) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function readRunningRows(state: RunningInputV4, connection: PluginRealtimeConnectionState): RunningRowsV4 {
  if (state.status === "loading") return { status: "unavailable", reason: "loading" };
  if (state.status === "error") return { status: "unavailable", reason: "error" };
  if (connection !== "connected") return { status: "unavailable", reason: "stale" };
  let rows: PluginSidebarThread[];
  let source: "host-inventory" | "observable-sidebar";
  if (state.runningThreads !== undefined) {
    const inventory = readHostInventory({ runningThreads: state.runningThreads });
    if (inventory.status === "incomplete") return { status: "unavailable", reason: inventory.reason };
    if (inventory.status !== "ready") return { status: "unavailable", reason: "malformed" };
    // The inventory proved each id's facts agree; keep the first full row of each.
    const first = new Map<string, PluginSidebarThread>();
    for (const row of state.runningThreads as PluginSidebarThread[]) if (!first.has(row.id)) first.set(row.id, row);
    rows = inventory.running.map(({ id }) => first.get(id)!);
    source = "host-inventory";
  } else {
    const read = readSidebarRows(state, connection);
    if (read.status !== "ready" || !read.rows) return { status: "unavailable", reason: "malformed" };
    const seen = new Map<string, PluginSidebarThread>();
    for (const row of read.rows) if (isRunning(row) && !seen.has(row.id)) seen.set(row.id, row as PluginSidebarThread);
    rows = [...seen.values()];
    source = "observable-sidebar";
  }
  if (!rows.every(drawable)) return { status: "unavailable", reason: "malformed" };
  return { status: "ready", source, count: rows.length, rows, groups: groupRunning(rows, state.threads) };
}

/** Every row once: running parents carry their running descendants; others group under their parent's heading. */
function groupRunning(rows: PluginSidebarThread[], known: readonly PluginSidebarThread[]): RunningGroupV4[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, PluginSidebarThread[]>();
  for (const row of rows) {
    if (row.parentThreadId !== null && byId.has(row.parentThreadId)) {
      children.set(row.parentThreadId, [...(children.get(row.parentThreadId) ?? []), row]);
    }
  }
  for (const list of children.values()) list.sort(byCreation);
  const placed = new Set<string>();
  const walk = (row: PluginSidebarThread, depth: number, out: RunningEntryV4[]) => {
    if (placed.has(row.id)) return;
    placed.add(row.id);
    out.push({ thread: row, depth });
    for (const child of children.get(row.id) ?? []) walk(child, depth + 1, out);
  };
  const roots = rows.filter((row) => row.parentThreadId === null || !byId.has(row.parentThreadId)).sort(byCreation);
  const knownById = new Map(known.map((row) => [row.id, row]));
  const top: { at: number; id: string; group: RunningGroupV4 }[] = [];
  const unplaced = new Map<string, RunningGroupV4>();
  const contextGroups = new Map<string, RunningGroupV4>();
  for (const root of roots) {
    const entries: RunningEntryV4[] = [];
    walk(root, 0, entries);
    const parentId = root.parentThreadId;
    if (parentId === null) {
      top.push({ at: root.createdAt, id: root.id, group: { heading: null, entries } });
      continue;
    }
    const parent = knownById.get(parentId);
    if (parent && text(parent.displayTitle)) {
      let group = contextGroups.get(parentId);
      if (!group) {
        group = { heading: { kind: "parent", parentId, title: parent.displayTitle }, entries: [] };
        contextGroups.set(parentId, group);
        top.push({ at: parent.createdAt, id: parentId, group });
      }
      group.entries.push(...entries);
    } else {
      const group = unplaced.get(parentId) ?? { heading: { kind: "unplaced", parentId }, entries: [] };
      group.entries.push(...entries);
      unplaced.set(parentId, group);
    }
  }
  // Rows only reachable through a parent cycle: start at the oldest, never drop them.
  for (const row of [...rows].sort(byCreation)) {
    if (placed.has(row.id)) continue;
    const entries: RunningEntryV4[] = [];
    walk(row, 0, entries);
    top.push({ at: row.createdAt, id: row.id, group: { heading: null, entries } });
  }
  top.sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rest = [...unplaced.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, group]) => group);
  return [...top.map(({ group }) => group), ...rest];
}

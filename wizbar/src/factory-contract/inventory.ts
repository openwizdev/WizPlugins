// Optional host inventory, pinned to Cloudroom PR #160 at
// fec35c49dfdd454a8e028c0536a5a07190fee26d (factory-view.v1.md, section 6).
import type { HostInventoryV1, InventoryThreadV1 } from "./types";

/** The additive #160 fields on `experimental_useSidebarThreads()`; older hosts omit both. */
export interface HostInventoryInputV1 {
  runningThreads?: unknown;
  childrenByParentId?: unknown;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function row(value: unknown): InventoryThreadV1 | null {
  if (!value || typeof value !== "object") return null;
  const { id, projectId, parentThreadId } = value as Record<string, unknown>;
  if (!nonEmpty(id) || !nonEmpty(projectId) || !(parentThreadId === null || nonEmpty(parentThreadId))) return null;
  return { id, projectId, parentThreadId };
}

/** Deduplicate by id; a repeated id with different facts makes the set incomplete. */
function dedupe(values: unknown[]): InventoryThreadV1[] | "malformed" | "conflicting-duplicate" {
  const seen = new Map<string, InventoryThreadV1>();
  for (const value of values) {
    const next = row(value);
    if (!next) return "malformed";
    const prior = seen.get(next.id);
    if (prior && (prior.projectId !== next.projectId || prior.parentThreadId !== next.parentThreadId)) {
      return "conflicting-duplicate";
    }
    seen.set(next.id, next);
  }
  return [...seen.values()];
}

/**
 * Absent stays absent (never an empty list). Children cover only delivered
 * rows, so their total is null until a verified complete child read (#158).
 */
export function readHostInventory(state: HostInventoryInputV1): HostInventoryV1 {
  if (state.runningThreads === undefined) state = { ...state, runningThreads: [] };
  if (!Array.isArray(state.runningThreads)) return { status: "incomplete", reason: "malformed" };
  const running = dedupe(state.runningThreads);
  if (typeof running === "string") return { status: "incomplete", reason: running };
  if (state.childrenByParentId === undefined) return { status: "ready", running, children: { status: "absent" } };
  const map = state.childrenByParentId;
  if (!map || typeof map !== "object" || Array.isArray(map)) return { status: "incomplete", reason: "malformed" };
  const byParentId: Record<string, InventoryThreadV1[]> = {};
  for (const [parentId, list] of Object.entries(map)) {
    if (!nonEmpty(parentId) || !Array.isArray(list)) return { status: "incomplete", reason: "malformed" };
    const children = dedupe(list);
    if (typeof children === "string") return { status: "incomplete", reason: children };
    if (children.some((child) => child.parentThreadId !== parentId)) return { status: "incomplete", reason: "malformed" };
    byParentId[parentId] = children;
  }
  return { status: "ready", running, children: { status: "delivered-only", byParentId, total: null } };
}

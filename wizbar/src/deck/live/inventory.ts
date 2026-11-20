// Read the host's running inventory from the sidebar state (F1, #75), once.
// Cloudroom #160 adds optional `runningThreads` and `childrenByParentId` to
// `experimental_useSidebarThreads()`; SDK 0.6.33's declarations do not carry
// them, so they are read as unknown values and validated by C1's reader.
// A missing field is an older host: unavailable, never an empty list.
import type { PluginRealtimeConnectionState, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import { readHostInventory } from "../../factory-contract";
import type { InventoryReadingV1 } from "./health";

export function inventoryReading(state: PluginSidebarThreadsState, connection: PluginRealtimeConnectionState): InventoryReadingV1 {
  if (state.status === "loading") return { status: "not-ready", reason: "loading" };
  if (state.status !== "ready") return { status: "not-ready", reason: "error" };
  if (connection !== "connected") return { status: "not-ready", reason: "stale" };
  const extra = state as unknown as Record<string, unknown>;
  return readHostInventory({ runningThreads: extra.runningThreads, childrenByParentId: extra.childrenByParentId });
}

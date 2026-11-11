import type { PluginRealtimeConnectionState, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import type { ObservableRunningSource } from "./running-count";

/** WZ12 source seam: input is never asserted globally complete. */
export function readRunningSource(
  _state: Pick<PluginSidebarThreadsState, "status" | "threads">,
  _connection: PluginRealtimeConnectionState,
): ObservableRunningSource {
  return { version: 1, scope: "observable-sidebar", status: "unavailable", threads: null,
    subagents: { status: "unproven", count: null } };
}

import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

/** Explicit counting inputs, not an assertion about any SDK activity counter. */
export interface RunningCountSource {
  complete: boolean;
  threads: readonly PluginSidebarThread[];
  /** Null until the in-thread mapping is established; every thread needs an entry. */
  subagentsByThread: ReadonlyMap<string, number> | null;
}

export interface RunningCount {
  threads: number;
  subagents: number;
  total: number;
}

export function countRunning(_source: RunningCountSource | null): RunningCount | null {
  return null;
}

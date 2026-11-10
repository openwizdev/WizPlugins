import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { isWorking } from "./useLifecycle";

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

/** Count stable thread IDs once; reject incomplete or contradictory snapshots. */
export function countRunning(source: RunningCountSource | null): RunningCount | null {
  if (!source?.complete || source.subagentsByThread === null) return null;
  const seen = new Map<string, boolean>();
  let threads = 0;
  let subagents = 0;
  for (const thread of source.threads) {
    const working = isWorking(thread);
    if (seen.has(thread.id)) {
      if (seen.get(thread.id) !== working) return null;
      continue;
    }
    const agents = source.subagentsByThread.get(thread.id);
    if (agents === undefined || !Number.isSafeInteger(agents) || agents < 0) return null;
    seen.set(thread.id, working);
    threads += Number(working);
    subagents += agents;
    if (!Number.isSafeInteger(threads + subagents)) return null;
  }
  return { threads, subagents, total: threads + subagents };
}

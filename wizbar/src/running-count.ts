import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { isWorking } from "./useLifecycle";

/** Historical explicit complete-input seam; production never asserts this. */
interface CompleteRunningSource {
  complete: boolean;
  threads: readonly PluginSidebarThread[];
  subagentsByThread: ReadonlyMap<string, number> | null;
}

/** WZ10 work facts, scoped by revision 9 to the observable sidebar only. */
export interface ObservableWorkingThread {
  id: string;
  projectId: string;
  parentThreadId: string | null;
  isWorking: boolean;
}
export type ObservableRunningSource = {
  version: 1;
  scope: "observable-sidebar";
  subagents: { status: "unproven"; count: null };
} & (
  | { status: "ready"; threads: readonly ObservableWorkingThread[] }
  | { status: "unavailable" | "incomplete" | "stale" | "error"; threads: null }
);
export type RunningCountSource = CompleteRunningSource | ObservableRunningSource;

export interface RunningCount {
  threads: number;
  subagents: number | null;
  total: number;
}

/** One counting rule: stable IDs once, contradictory snapshots never counted. */
export function countRunning(source: RunningCountSource | null): RunningCount | null {
  if (!source) return null;
  const observable = "scope" in source;
  if (observable ? source.status !== "ready" : !source.complete || source.subagentsByThread === null) return null;
  if (!source.threads) return null;
  const seen = new Map<string, boolean>();
  let threads = 0;
  let subagents = 0;
  for (const thread of source.threads) {
    const working = "isWorking" in thread ? thread.isWorking : isWorking(thread);
    if (seen.has(thread.id)) {
      if (seen.get(thread.id) !== working) return null;
      continue;
    }
    const agents = observable ? 0 : source.subagentsByThread?.get(thread.id);
    if (agents === undefined || !Number.isSafeInteger(agents) || agents < 0) return null;
    seen.set(thread.id, working);
    threads += Number(working);
    subagents += agents;
    if (!Number.isSafeInteger(threads + subagents)) return null;
  }
  return { threads, subagents: observable ? null : subagents, total: threads + subagents };
}

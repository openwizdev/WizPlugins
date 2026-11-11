import type { PluginRealtimeConnectionState, PluginSidebarThread, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import type { ObservableRunningSource, ObservableWorkingThread } from "./running-count";
import { isWorking } from "./useLifecycle";

const indicators: readonly PluginSidebarThread["indicator"][] = [
  "background-agent", "background-command", "draft", "goal", "none", "plan-mode",
  "queued-failed", "queued-waiting", "runtime", "unread-error", "unread-success",
  "waiting-for-input", "workflow", "working-draft",
];
const stableId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** WZ10 work facts; unrelated presentation fields never narrow the source. */
export function readRunningSource(
  state: Pick<PluginSidebarThreadsState, "status" | "threads">,
  connection: PluginRealtimeConnectionState,
): ObservableRunningSource {
  const base = { version: 1, scope: "observable-sidebar",
    subagents: { status: "unproven", count: null } } as const;
  const gap = (status: "unavailable" | "incomplete" | "stale" | "error"): ObservableRunningSource =>
    ({ ...base, status, threads: null });
  if (!state || typeof state !== "object" || Array.isArray(state)) return gap("incomplete");
  if (state.status === "error") return gap("error");
  if (state.status === "loading") return gap("unavailable");
  if (state.status !== "ready" || !Array.isArray(state.threads)) return gap("incomplete");
  if (connection !== "connected") return gap("stale");
  const seen = new Map<string, ObservableWorkingThread>();
  for (const thread of state.threads) {
    if (!thread || typeof thread !== "object" || Array.isArray(thread) ||
      !stableId(thread.id) || !stableId(thread.projectId) ||
      !(thread.parentThreadId === null || stableId(thread.parentThreadId)) ||
      !thread.activity || typeof thread.activity !== "object" || Array.isArray(thread.activity) ||
      Object.keys(thread.activity).length !== 5 ||
      ![thread.activity.workflows, thread.activity.backgroundAgents, thread.activity.backgroundCommands,
        thread.activity.planMode, thread.activity.goals].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      !indicators.includes(thread.indicator)) return gap("incomplete");
    const row: ObservableWorkingThread = {
      id: thread.id, projectId: thread.projectId, parentThreadId: thread.parentThreadId,
      isWorking: isWorking(thread),
    };
    const prior = seen.get(row.id);
    if (prior && (prior.isWorking !== row.isWorking || prior.projectId !== row.projectId ||
      prior.parentThreadId !== row.parentThreadId)) return gap("incomplete");
    seen.set(row.id, row);
  }
  return { ...base, status: "ready", threads: [...seen.values()] };
}

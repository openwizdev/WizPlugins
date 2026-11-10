import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import type { t3sidebarRpcContract } from "./server";
import {
  canPark,
  hasRuntimeWork,
  nextWakeDelayMs,
  resolveShelf,
  type ThreadLifecycleRow,
  type ThreadShelf,
} from "./lifecycle";

/** Any live work at all, independent of shelf visibility and explicit mute. */
export function isWorking(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0 ||
    thread.indicator === "runtime" ||
    thread.indicator === "working-draft"
  );
}

export interface LifecycleApi {
  shelfFor(thread: PluginSidebarThread): ThreadShelf;
  canPark(thread: PluginSidebarThread): boolean;
  wakeAtFor(thread: PluginSidebarThread): number | null;
  settle(threadId: string): void;
  unsettle(threadId: string): void;
  snooze(threadId: string, snoozedUntil: number): void;
  unsnooze(threadId: string): void;
  mute(threadId: string): Promise<void>;
  unmute(threadId: string): Promise<void>;
}

/**
 * Reads the plugin's own lifecycle store and classifies threads onto shelves.
 *
 * `now` is state, not a render-time clock read: a snooze that elapses must
 * move its row without waiting for an unrelated re-render, and re-reading the
 * clock during render would make the classification unstable.
 */
export function useLifecycle(
  threads: readonly PluginSidebarThread[],
): LifecycleApi {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [rows, setRows] = useState<ReadonlyMap<string, ThreadLifecycleRow>>(
    () => new Map(),
  );
  const [now, setNow] = useState(() => Date.now());

  // Responses can land out of order (a mutation's refresh racing a realtime
  // one), and an older list would silently restore state the user just
  // changed. Only the newest request may write.
  const requestSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    const result = await rpc.call("listLifecycle", {});
    if (seq !== requestSeq.current) return;
    setRows(new Map(result.rows.map((row) => [row.threadId, row])));
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime("lifecycle", () => {
    void refresh();
  });

  // Arm one timer for the soonest wake instead of polling: the shelf empties
  // the moment a snooze expires, and nothing ticks while nothing is snoozed.
  useEffect(() => {
    // Read a fresh clock here rather than trusting `now`: `now` is only
    // updated when a timer fires, so arming from it after a long idle period
    // would schedule a new snooze far too late.
    const armedAt = Date.now();
    const delay = nextWakeDelayMs(
      [...rows.values()].flatMap((row) =>
        row.snoozedUntil === null ? [] : [row.snoozedUntil],
      ),
      armedAt,
    );
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [now, rows]);

  return useMemo<LifecycleApi>(() => {
    const signalsFor = (thread: PluginSidebarThread, muted = false) => {
      const known = ["idle", "error", "active", "pending", "starting", "stopping"];
      const counts = [thread.activity?.workflows, thread.activity?.backgroundAgents,
        thread.activity?.backgroundCommands, thread.activity?.planMode, thread.activity?.goals];
      const authority = known.includes(thread.status) &&
        ["idle", "error", "active", "starting", "stopping", "provisioning"].includes(thread.runtimeStatus) &&
        ["none", "waiting", "failed"].includes(thread.queuedWork) &&
        typeof thread.hasPendingInteraction === "boolean" &&
        typeof thread.isUnread === "boolean" && Number.isFinite(thread.latestAttentionAt) &&
        thread.activity && Object.keys(thread.activity).length === 5 &&
        counts.every((n) => Number.isInteger(n) && n >= 0);
      return {
        hasPendingInteraction: thread.hasPendingInteraction || thread.indicator === "waiting-for-input",
        isWorking: !authority ? true : muted
          ? hasRuntimeWork(thread.runtimeStatus, counts)
          : isWorking(thread),
        isUnread: thread.isUnread,
        latestAttentionAt: thread.latestAttentionAt,
        isPinned: thread.isPinned,
        hasFailed: !authority ? undefined :
          thread.status === "error" || thread.runtimeStatus === "error" ||
          thread.queuedWork === "failed" || thread.indicator === "unread-error",
      };
    };
    // One read per mutation: the write publishes on the realtime channel, and
    // that subscription already triggers a refresh for every client.
    const mutate = async (
      method: "settle" | "unsettle" | "unsnooze" | "mute" | "unmute",
      threadId: string,
    ) => {
      await rpc.call(method, { threadId });
    };
    return {
      shelfFor: (thread) => {
        const row = rows.get(thread.id);
        return resolveShelf(row, signalsFor(thread, row?.mutedAt !== undefined), now);
      },
      canPark: (thread) => canPark(signalsFor(thread)),
      wakeAtFor: (thread) => rows.get(thread.id)?.snoozedUntil ?? null,
      settle: (threadId) => void mutate("settle", threadId),
      unsettle: (threadId) => void mutate("unsettle", threadId),
      unsnooze: (threadId) => void mutate("unsnooze", threadId),
      mute: (threadId) => mutate("mute", threadId),
      unmute: (threadId) => mutate("unmute", threadId),
      snooze: (threadId, snoozedUntil) => {
        void rpc.call("snooze", { threadId, snoozedUntil });
      },
    };
  }, [now, refresh, rows, rpc]);
}

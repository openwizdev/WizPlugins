// bb-plugin-t3sidebar backend — the settled / snoozed store.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes its state with it.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { canPark, resolveShelf, type ThreadActivitySignals } from "./lifecycle";
import { createLifecycleCommand, LifecycleError, type LifecycleOperation, type LifecycleSuccess } from "./command";

const migrations = [
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
];

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });

export const t3sidebarRpcContract = defineRpcContract({
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
          snoozedUntil: z.number().nullable(),
          snoozedAt: z.number().nullable(),
        }),
      ),
    }),
  },
  settle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z.object({
      threadId: z.string().trim().min(1),
      // Absolute wake time, so a snooze means the same thing on every device.
      snoozedUntil: z.number().int().positive(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
});

/** Channel the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";

const threadRouteSchema = z.object({
  id: z.string(), projectId: z.string().min(1),
  archivedAt: z.number().nullable(), deletedAt: z.number().nullable(),
});
const liveThreadSchema = threadRouteSchema.extend({
  hasPendingInteraction: z.boolean(),
  latestAttentionAt: z.number().finite(),
  lastReadAt: z.number().finite().nullable(),
  runtime: z.object({ displayStatus: z.enum([
    "idle", "error", "active", "starting", "stopping", "provisioning",
    "host-reconnecting", "waiting-for-host",
  ]) }),
  activity: z.object({
    activeWorkflowCount: z.number().int().nonnegative(),
    activeBackgroundAgentCount: z.number().int().nonnegative(),
    activeBackgroundCommandCount: z.number().int().nonnegative(),
    activePlanModeCount: z.number().int().nonnegative(),
    activeGoalCount: z.number().int().nonnegative(),
  }),
});
const unavailable = () => new LifecycleError("state_unavailable", "Working or waiting state is unavailable.");

// Read current server data, never a client-supplied eligibility assertion.
// `get` locates the thread; only `list` carries ALL work and waiting inputs.
async function readRoute(bb: BbPluginApi, threadId: string, signal?: AbortSignal) {
  try {
    const route = threadRouteSchema.safeParse(await bb.sdk.threads.get({ threadId, signal }));
    if (!route.success || route.data.id !== threadId) throw unavailable();
    if (route.data.deletedAt !== null) throw new LifecycleError("unknown_id", "Unknown thread ID.");
    return route.data;
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      throw new LifecycleError("unknown_id", "Unknown thread ID.");
    }
    throw unavailable();
  }
}

async function readSignals(bb: BbPluginApi, threadId: string, signal?: AbortSignal): Promise<ThreadActivitySignals> {
  const route = await readRoute(bb, threadId, signal);
  try {
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      const page = await bb.sdk.threads.list({
        projectId: route.projectId, archived: route.archivedAt !== null,
        includeHidden: true, limit: 100, offset, signal,
      });
      if (!Array.isArray(page)) throw unavailable();
      const matches = page.filter((row) => row?.id === threadId);
      if (matches.length > 1) throw unavailable();
      if (matches.length === 1) {
        const parsed = liveThreadSchema.safeParse(matches[0]);
        if (!parsed.success) throw unavailable();
        const row = parsed.data;
        if (row.projectId !== route.projectId || row.deletedAt !== null) throw unavailable();
        // A disconnected host cannot provide a verified idle state.
        if (row.runtime.displayStatus === "waiting-for-host" || row.runtime.displayStatus === "host-reconnecting") throw unavailable();
        return {
          hasPendingInteraction: row.hasPendingInteraction,
          isWorking: row.runtime.displayStatus !== "idle" && row.runtime.displayStatus !== "error" ||
            Object.values(row.activity).some((count) => count > 0),
          isUnread: (row.lastReadAt ?? 0) < row.latestAttentionAt,
          latestAttentionAt: row.latestAttentionAt,
        };
      }
      if (page.length < 100) throw unavailable();
      for (const row of page) {
        if (!row || typeof row.id !== "string" || seen.has(row.id)) throw unavailable();
        seen.add(row.id);
      }
    }
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      throw new LifecycleError("unknown_id", "Unknown thread ID.");
    }
    throw unavailable();
  }
}

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

  const readAll = (): StoredLifecycleRow[] =>
    (
      db
        .prepare(
          `SELECT thread_id, settled_at, snoozed_until, snoozed_at
             FROM thread_lifecycle`,
        )
        .all() as LifecycleDbRow[]
    ).map((row) => ({
      threadId: row.thread_id,
      settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until,
      snoozedAt: row.snoozed_at,
    }));

  const write = (row: StoredLifecycleRow): void => {
    db.prepare(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, snoozed_until, snoozed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at`,
    ).run(row.threadId, row.settledAt, row.snoozedUntil, row.snoozedAt);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: row.threadId });
  };

  const clear = (threadId: string): void => {
    db.prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`).run(
      threadId,
    );
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  const perform = async (
    operation: LifecycleOperation, rawId: string, snoozedUntil?: number, signal?: AbortSignal,
  ): Promise<LifecycleSuccess> => {
    const parsed = threadIdSchema.safeParse({ threadId: rawId });
    if (!parsed.success) throw new LifecycleError("invalid_id", "Thread ID must be nonempty.");
    const threadId = parsed.data.threadId;
    if (operation === "unsettle" || operation === "unsnooze") {
      await readRoute(bb, threadId, signal);
      if (signal?.aborted) throw unavailable();
      clear(threadId);
      return { threadId, ok: true, shelf: "active", snoozedUntil: null };
    }
    const signals = await readSignals(bb, threadId, signal);
    if (signal?.aborted) throw unavailable();
    const now = Date.now();
    if (operation !== "list") {
      if (!canPark(signals)) throw new LifecycleError(signals.hasPendingInteraction ? "waiting" : "working",
        signals.hasPendingInteraction ? "Thread is waiting for input." : "Thread is working.");
      if (operation === "snooze" && (!Number.isSafeInteger(snoozedUntil) || snoozedUntil! <= now)) {
        throw new LifecycleError("invalid_until", "Snooze time must be in the future.");
      }
      // No asynchronous boundary between eligibility and the plugin-only write.
      write({ threadId, settledAt: operation === "settle" ? now : null,
        snoozedUntil: operation === "snooze" ? snoozedUntil! : null,
        snoozedAt: operation === "snooze" ? now : null });
    }
    const row = readAll().find((row) => row.threadId === threadId);
    const shelf = resolveShelf(row, signals, now);
    return { threadId, ok: true, shelf, snoozedUntil: shelf === "snoozed" ? row!.snoozedUntil : null };
  };

  bb.rpc.register(t3sidebarRpcContract, {
    async listLifecycle() { return { rows: readAll() }; },
    async settle({ threadId }) { await perform("settle", threadId); return { ok: true }; },
    async unsettle({ threadId }) { await perform("unsettle", threadId); return { ok: true }; },
    async snooze({ threadId, snoozedUntil }) { await perform("snooze", threadId, snoozedUntil); return { ok: true }; },
    async unsnooze({ threadId }) { await perform("unsnooze", threadId); return { ok: true }; },
  });
  bb.cli.register(createLifecycleCommand(perform));

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clear(thread.id);
  });
}

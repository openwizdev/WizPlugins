import Database from "better-sqlite3";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const NOW = Date.parse("2030-05-06T10:00:00Z");
function thread(id = "example-a") {
  return {
    id, projectId: "example-project", archivedAt: null, deletedAt: null,
    lastReadAt: 100, latestAttentionAt: 100,
    runtime: { displayStatus: "idle", hostReconnectGraceExpiresAt: null },
    activity: {
      activeWorkflowCount: 0, activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0, activePlanModeCount: 0, activeGoalCount: 0,
    },
    hasPendingInteraction: false,
  };
}
// Interim direct-handler proof under #4's ruling. Real SQLite and the actual
// plugin factory; SDK transport/schema integration remains pending.
function setup(threads: unknown[] = [thread()]) {
  const db = new Database(":memory:"); databases.push(db);
  let rpc: Record<string, (input: any) => Promise<any>> = {};
  let cli: { run: (argv: string[], ctx: object) => any } | undefined;
  let deleted: ((event: { thread: { id: string } }) => void) | undefined;
  const publications: { channel: string; payload: unknown }[] = [];
  const get = vi.fn(async ({ threadId }: { threadId: string }) => {
    const found = threads.find((t: any) => t.id === threadId);
    if (!found) throw Object.assign(new Error("not found"), { status: 404 });
    return found;
  });
  const list = vi.fn(async () => threads);
  const bb = {
    storage: {
      database: () => db,
      migrate: (_db: unknown, migrations: string[]) => migrations.forEach((m) => db.exec(m)),
    },
    realtime: { publish: (channel: string, payload: unknown) => publications.push({ channel, payload }) },
    rpc: { register: (_contract: unknown, handlers: typeof rpc) => { rpc = handlers; } },
    cli: { register: (registration: NonNullable<typeof cli>) => { cli = registration; } },
    events: { on: (_name: string, handler: NonNullable<typeof deleted>) => { deleted = handler; } },
    sdk: { threads: { get, list } },
  };
  plugin(bb as unknown as BbPluginApi);
  const rows = () => db.prepare("SELECT * FROM thread_lifecycle ORDER BY thread_id").all();
  const seed = () => db.prepare("INSERT INTO thread_lifecycle VALUES (?, ?, ?, ?)").run("example-a", 200, null, null);
  return { rpc, run: (argv: string[]) => cli!.run(argv, {}), db, rows, seed, publications, get, list, deleted: () => deleted!({ thread: { id: "example-a" } }) };
}
const databases: Database.Database[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { databases.splice(0).forEach((db) => db.close()); vi.useRealTimers(); });

describe.each(["settle", "snooze"])("%s server guard", (method) => {
  const input = { threadId: "example-a", snoozedUntil: NOW + 3_600_000 };
  it.each([
    "activeWorkflowCount", "activeBackgroundAgentCount", "activeBackgroundCommandCount",
    "activePlanModeCount", "activeGoalCount",
  ] as const)("refuses %s without changing an existing row", async (signal) => {
    const live = thread(); live.activity[signal] = 1;
    const host = setup([live]); host.seed(); const before = host.rows();
    await expect(host.rpc[method]!(input)).rejects.toThrow(/working/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it.each(["active", "starting", "stopping", "provisioning", "host-reconnecting"])("refuses runtime %s", async (status) => {
    const live = thread(); live.runtime.displayStatus = status;
    const host = setup([live]);
    await expect(host.rpc[method]!(input)).rejects.toThrow(/working|unavailable/i);
    expect(host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
  it("refuses a pending interaction", async () => {
    const live = thread(); live.hasPendingInteraction = true;
    const host = setup([live]); host.seed(); const before = host.rows();
    await expect(host.rpc[method]!(input)).rejects.toThrow(/waiting/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it.each([
    { activity: undefined }, { hasPendingInteraction: undefined },
    { hasPendingInteraction: "false" }, { runtime: { displayStatus: "future-status" } },
    { runtime: { displayStatus: "waiting-for-host" } },
    { activity: { ...thread().activity, activeGoalCount: -1 } },
    { activity: { ...thread().activity, activeWorkflowCount: Number.NaN } },
  ])("refuses incomplete or invalid authority: %j", async (override) => {
    const host = setup([{ ...thread(), ...override }]); host.seed(); const before = host.rows();
    await expect(host.rpc[method]!(input)).rejects.toThrow(/unavailable/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it("refuses failed authoritative reads", async () => {
    const host = setup(); host.list.mockRejectedValue(new Error("synthetic read failure"));
    await expect(host.rpc[method]!(input)).rejects.toThrow(/unavailable/i);
    expect(host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
});

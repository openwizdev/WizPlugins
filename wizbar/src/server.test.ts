import { createFakePluginHost, makeThreadResponse, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
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
// The owning W5/W6 proof uses the pinned SDK's real registration, RPC/CLI
// validation, SQLite and realtime boundary. SDK reads are synthetic inputs.
function setup(threads: unknown[] = [thread()]) {
  const get = vi.fn(async ({ threadId }: { threadId: string }) => {
    const found = threads.find((t: any) => t.id === threadId);
    if (!found) throw Object.assign(new Error("not found"), { status: 404 });
    return found;
  });
  const list = vi.fn(async () => threads);
  const host = createFakePluginHost({ pluginId: "wizbar", sdk: { threads: { get, list } } });
  hosts.push(host);
  plugin(host.bb);
  const db = host.bb.storage.database();
  const rows = () => db.prepare("SELECT * FROM thread_lifecycle ORDER BY thread_id").all();
  const seed = () => db.prepare("INSERT INTO thread_lifecycle VALUES (?, ?, ?, ?)").run("example-a", 200, null, null);
  return {
    harness: host.harness,
    run: (argv: string[]) => host.harness.behavior.runCli(argv),
    rows, seed, get, list,
    publications: host.harness.inspection.realtimeSignals,
    deleted: () => host.harness.behavior.emitThreadEvent("thread.deleted", { thread: makeThreadResponse({ id: "example-a" }) }),
  };
}
const hosts: FakePluginHost[] = [];
beforeEach(() => { vi.stubEnv("TZ", "UTC"); vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.useRealTimers(); vi.unstubAllEnvs();
});

describe.each(["settle", "snooze"])("%s server guard", (method) => {
  const input = { threadId: "example-a", snoozedUntil: NOW + 3_600_000 };
  it.each([
    "activeWorkflowCount", "activeBackgroundAgentCount", "activeBackgroundCommandCount",
    "activePlanModeCount", "activeGoalCount",
  ] as const)("refuses %s without changing an existing row", async (signal) => {
    const live = thread(); live.activity[signal] = 1;
    const host = setup([live]); host.seed(); const before = host.rows();
    await expect(host.harness.behavior.callRpc(method, input)).rejects.toThrow(/working/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it.each(["active", "starting", "stopping", "provisioning", "host-reconnecting"])("refuses runtime %s", async (status) => {
    const live = thread(); live.runtime.displayStatus = status;
    const host = setup([live]);
    await expect(host.harness.behavior.callRpc(method, input)).rejects.toThrow(/working|unavailable/i);
    expect(host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
  it("refuses a pending interaction", async () => {
    const live = thread(); live.hasPendingInteraction = true;
    const host = setup([live]); host.seed(); const before = host.rows();
    await expect(host.harness.behavior.callRpc(method, input)).rejects.toThrow(/waiting/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it.each([
    { activity: undefined }, { hasPendingInteraction: undefined },
    { hasPendingInteraction: "false" }, { runtime: { displayStatus: "future-status" } },
    { runtime: { displayStatus: "waiting-for-host" } },
    { activity: { ...thread().activity, activeGoalCount: -1 } },
    { activity: { ...thread().activity, activeWorkflowCount: Number.NaN } },
    { activity: { ...thread().activity, futureWorkCount: 1 } },
  ])("refuses incomplete or invalid authority: %j", async (override) => {
    const host = setup([{ ...thread(), ...override }]); host.seed(); const before = host.rows();
    await expect(host.harness.behavior.callRpc(method, input)).rejects.toThrow(/unavailable/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it("refuses failed authoritative reads", async () => {
    const host = setup(); host.list.mockRejectedValue(new Error("synthetic read failure"));
    await expect(host.harness.behavior.callRpc(method, input)).rejects.toThrow(/unavailable/i);
    expect(host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
});

// W5/W6: baseline tests exercise UI shelves only; they cannot detect absent CLI
// registration, batch-wide aborts, wrong exit status or a separate command store.
describe("registered WizBar command", () => {
  it("processes every ID in order, isolates failures and exits nonzero", async () => {
    const host = setup([thread(), thread("example-b")]);
    const result = await host.run(["settle", "example-a", "unknown", "", "example-b", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).results).toEqual([
      { threadId: "example-a", ok: true, shelf: "settled", snoozedUntil: null },
      { threadId: "unknown", ok: false, error: { code: "unknown_id", message: "Unknown thread ID." } },
      { threadId: "", ok: false, error: { code: "invalid_id", message: "Thread ID must be nonempty." } },
      { threadId: "example-b", ok: true, shelf: "settled", snoozedUntil: null },
    ]);
    expect(host.rows()).toEqual([
      { thread_id: "example-a", settled_at: NOW, snoozed_until: null, snoozed_at: null },
      { thread_id: "example-b", settled_at: NOW, snoozed_until: null, snoozed_at: null },
    ]);
  });
  it("keeps successful results around working and waiting refusals", async () => {
    const busy = thread("busy"); busy.activity.activeGoalCount = 1;
    const waiting = thread("waiting"); waiting.hasPendingInteraction = true;
    const host = setup([busy, thread(), waiting]);
    const result = await host.run(["settle", "busy", "example-a", "waiting", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).results.map((r: any) => r.error?.code ?? r.shelf)).toEqual(["working", "settled", "waiting"]);
    expect(host.rows()).toEqual([{ thread_id: "example-a", settled_at: NOW, snoozed_until: null, snoozed_at: null }]);
  });
  it("reports one text line per ID and escapes control characters", async () => {
    const host = setup();
    const result = await host.run(["settle", "example-a", "bad\nvalue"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim().split("\n")).toEqual([
      '"example-a": settled',
      '"bad\\nvalue": ERROR unknown_id: Unknown thread ID.',
    ]);
  });
  it.each(["settle", "snooze", "unsettle", "unsnooze"])("repeating %s reaches the same end state", async (operation) => {
    const host = setup();
    const argv = operation === "snooze" ? [operation, "example-a", "--until", "2030-05-07T09:00:00Z", "--json"] : [operation, "example-a", "--json"];
    await host.run(argv); vi.setSystemTime(NOW + 500);
    const result = await host.run(argv);
    expect(result.exitCode).toBe(0);
    const shelf = operation === "settle" ? "settled" : operation === "snooze" ? "snoozed" : "active";
    expect(JSON.parse(result.stdout).results[0].shelf).toBe(shelf);
    expect(host.rows()).toHaveLength(shelf === "active" ? 0 : 1);
  });
  it("shares SQLite and lifecycle refresh across RPC, CLI, undo and deletion", async () => {
    const host = setup();
    await host.harness.behavior.callRpc("snooze", { threadId: "example-a", snoozedUntil: NOW + 3_600_000 });
    const listed = await host.run(["list", "example-a", "--json"]);
    expect(JSON.parse(listed.stdout).results).toEqual([
      { threadId: "example-a", ok: true, shelf: "snoozed", snoozedUntil: NOW + 3_600_000 },
    ]);
    await host.run(["settle", "example-a"]);
    expect(await host.harness.behavior.callRpc("listLifecycle", {})).toEqual({ rows: [{ threadId: "example-a", settledAt: NOW, snoozedUntil: null, snoozedAt: null }] });
    await host.harness.behavior.callRpc("unsettle", { threadId: "example-a" });
    expect(host.rows()).toEqual([]);
    await host.run(["snooze", "example-a", "--until", "hour"]);
    await host.run(["unsnooze", "example-a"]);
    expect(host.rows()).toEqual([]);
    await host.run(["settle", "example-a"]); await host.deleted();
    expect(host.rows()).toEqual([]);
    expect(host.publications).toEqual(Array.from({ length: 7 }, () => ({ channel: "lifecycle", payload: { threadId: "example-a" } })));
  });
  it.each([
    ["hour", "2030-05-06T11:00:00Z"],
    ["evening", "2030-05-06T18:00:00Z"],
    ["tomorrow", "2030-05-07T09:00:00Z"],
    ["next-week", "2030-05-13T09:00:00Z"],
    ["2030-05-07T11:00:00+02:00", "2030-05-07T09:00:00Z"],
  ])("resolves --until %s to the sidebar time", async (until, expected) => {
    const host = setup();
    const result = await host.run(["snooze", "--until", until!, "example-a", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).results[0].snoozedUntil).toBe(Date.parse(expected!));
    expect(host.rows()).toEqual([{ thread_id: "example-a", settled_at: null, snoozed_until: Date.parse(expected!), snoozed_at: NOW }]);
  });
  it.each(["2020-01-01T00:00:00Z", "2030-05-06T10:00:00Z", "2030-02-30T12:00:00Z", "2030-05-07", "soon"])("rejects invalid or past --until %s without writing", async (until) => {
    const host = setup(); host.seed(); const before = host.rows();
    const result = await host.run(["snooze", "example-a", "--until", until, "--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).results[0].error.code).toBe("invalid_until");
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
  it("refuses the evening preset once the sidebar omits it", async () => {
    vi.setSystemTime(Date.parse("2030-05-06T17:00:00Z"));
    const host = setup(); const result = await host.run(["snooze", "example-a", "--until", "evening", "--json"]);
    expect(result.exitCode).toBe(1); expect(host.rows()).toEqual([]);
  });
  it.each([[], ["settle"], ["no-such-operation", "example-a"], ["snooze", "example-a"], ["snooze", "--until"], ["settle", "example-a", "--until", "hour"], ["settle", "--other", "example-a"]])("rejects malformed command %j before any write", async (...argv) => {
    const host = setup(); const result = await host.run(argv);
    expect(result.exitCode).toBe(2); expect(host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
});

// W5 list must report resolved shelves, not merely echo parked rows.
describe("list reflects upstream wake rules", () => {
  it.each(["timer", "attention", "work", "waiting"])("wakes a snooze on %s", async (wake) => {
    const live = thread(); const host = setup([live]);
    await host.run(["snooze", "example-a", "--until", "hour"]);
    if (wake === "timer") vi.setSystemTime(NOW + 3_600_000);
    if (wake === "attention") live.latestAttentionAt = NOW + 1;
    if (wake === "work") live.activity.activeBackgroundCommandCount = 1;
    if (wake === "waiting") live.hasPendingInteraction = true;
    const result = await host.run(["list", "example-a", "--json"]);
    expect(JSON.parse(result.stdout).results).toEqual([{ threadId: "example-a", ok: true, shelf: "active", snoozedUntil: null }]);
    expect(host.rows()).toHaveLength(1); // Resolution does not delete upstream rows.
  });
  it("does not wake on equal attention, then wakes settled work on newer attention", async () => {
    const live = thread(); const host = setup([live]);
    await host.run(["settle", "example-a"]); live.latestAttentionAt = NOW;
    let result = await host.run(["list", "example-a", "--json"]);
    expect(JSON.parse(result.stdout).results[0].shelf).toBe("settled");
    live.latestAttentionAt = NOW + 1;
    result = await host.run(["list", "example-a", "--json"]);
    expect(JSON.parse(result.stdout).results[0].shelf).toBe("active");
  });
});

// These edge cases protect the real argument and authority boundaries. In
// particular, searching argv globally for --json misinterprets literal IDs.
describe("argument and authority edge cases", () => {
  it("treats --json after -- as a literal ID, not an output flag", async () => {
    const host = setup([thread("--json")]);
    const result = await host.run(["settle", "--", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('"--json": settled\n');
  });
  it("uses calendar time across a daylight saving transition", async () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.setSystemTime(Date.parse("2030-03-09T12:00:00-05:00"));
    const host = setup();
    const result = await host.run(["snooze", "example-a", "--until", "tomorrow", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).results[0].snoozedUntil).toBe(Date.parse("2030-03-10T09:00:00-04:00"));
  });
  it("reads later pages for a named thread", async () => {
    const host = setup();
    host.list.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => thread(`other-${i}`)));
    const result = await host.run(["settle", "example-a"]);
    expect(result.exitCode).toBe(0);
    expect(host.rows()).toHaveLength(1);
  });
  it("refuses a repeated page rather than treating incomplete data as idle", async () => {
    const host = setup();
    host.list.mockResolvedValue(Array.from({ length: 100 }, (_, i) => thread(`other-${i}`)));
    const result = await host.run(["settle", "example-a", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).results[0].error.code).toBe("state_unavailable");
    expect(host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
  it("refuses a snooze that expires during the authoritative read", async () => {
    const host = setup();
    host.list.mockImplementation(async () => { vi.setSystemTime(NOW + 3_600_000); return [thread()]; });
    const result = await host.run(["snooze", "example-a", "--until", "hour", "--json"]);
    expect(result.exitCode).toBe(1); expect(host.rows()).toEqual([]);
  });
  it.each(["unsettle", "unsnooze"])("rejects empty IDs before %s can delete", async (operation) => {
    const host = setup(); host.seed(); const before = host.rows();
    await expect(host.harness.behavior.callRpc(operation, { threadId: " " })).rejects.toMatchObject({ code: "invalid_input" });
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
    expect(host.get).not.toHaveBeenCalled();
  });
  // The SDK schema admits safe integers beyond JavaScript's date range;
  // accepting one would make subsequent text listing fail after persistence.
  it.each([NOW - 1, 8_640_000_000_000_001])("rejects invalid raw snooze time %s", async (until) => {
    const host = setup(); host.seed(); const before = host.rows();
    await expect(host.harness.behavior.callRpc("snooze", { threadId: "example-a", snoozedUntil: until })).rejects.toThrow(/future/i);
    expect(host.rows()).toEqual(before); expect(host.publications).toEqual([]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// R1: sequential cleanup did not cover a previously started park whose
// authoritative read completes after deletion or a successful manual wake.
describe.each([
  ["CLI", "settle"], ["CLI", "snooze"],
  ["RPC", "settle"], ["RPC", "snooze"],
])("%s %s pending parking", (transport, operation) => {
  it.each([
    ["get", "deleted"], ["list", "deleted"],
    ["get", "unsettle"], ["list", "unsettle"],
    ["get", "unsnooze"], ["list", "unsnooze"],
  ])("refuses a stale %s response after %s", async (read, barrier) => {
    const host = setup(); host.seed();
    const entered = deferred<void>();
    const getReply = deferred<ReturnType<typeof thread>>();
    const listReply = deferred<unknown[]>();
    if (read === "get") {
      host.get.mockImplementationOnce(() => { entered.resolve(); return getReply.promise; });
    } else {
      host.list.mockImplementationOnce(() => { entered.resolve(); return listReply.promise; });
    }
    // Attach the RPC rejection handler before releasing either read.
    const pending = transport === "CLI"
      ? host.run([operation!, "example-a", ...(operation === "snooze" ? ["--until", "hour"] : []), "--json"])
          .then((cli) => ({ cli, error: undefined }))
      : host.harness.behavior.callRpc(operation!, { threadId: "example-a", snoozedUntil: NOW + 3_600_000 })
          .then(() => ({ cli: undefined, error: undefined }), (error) => ({ cli: undefined, error }));
    await entered.promise;
    if (barrier === "deleted") await host.deleted();
    else await host.harness.behavior.callRpc(barrier!, { threadId: "example-a" });
    expect(await host.harness.behavior.callRpc("listLifecycle", {})).toEqual({ rows: [] });
    const afterClear = [...host.publications];
    if (read === "get") getReply.resolve(thread());
    else listReply.resolve([thread()]);
    const outcome = await pending;
    if (transport === "CLI") {
      expect(outcome.cli!.exitCode).toBe(1);
      expect(JSON.parse(outcome.cli!.stdout).results[0]).toMatchObject({
        threadId: "example-a", ok: false, error: { code: "stale_operation" },
      });
    } else {
      expect(outcome.error).toMatchObject({ code: "handler_error", message: expect.stringMatching(/lifecycle changed/i) });
    }
    expect(host.rows()).toEqual([]);
    expect(host.publications).toEqual(afterClear);
  });
});

describe("pending parking invalidation lifetime", () => {
  it("retains deletion until all older validations have drained", async () => {
    const host = setup();
    const firstEntered = deferred<void>(), secondEntered = deferred<void>();
    const firstReply = deferred<unknown[]>(), secondReply = deferred<unknown[]>();
    host.list
      .mockImplementationOnce(() => { firstEntered.resolve(); return firstReply.promise; })
      .mockImplementationOnce(() => { secondEntered.resolve(); return secondReply.promise; });
    const first = host.run(["settle", "example-a", "--json"]);
    await firstEntered.promise;
    const second = host.run(["snooze", "example-a", "--until", "hour", "--json"]);
    await secondEntered.promise;
    await host.deleted();
    firstReply.resolve([thread()]);
    expect((await first).exitCode).toBe(1);
    // A new request while the second old read remains pending must still
    // respect deletion, even if the fixture SDK keeps serving an old row.
    const duringDrain = await host.run(["settle", "example-a", "--json"]);
    expect(duringDrain.exitCode).toBe(1);
    expect(JSON.parse(duringDrain.stdout).results[0].error.code).toBe("unknown_id");
    secondReply.resolve([thread()]);
    expect((await second).exitCode).toBe(1);
    expect(host.rows()).toEqual([]);
    expect(host.publications).toEqual([{ channel: "lifecycle", payload: { threadId: "example-a" } }]);
  });
  it("does not invalidate a different thread's pending park", async () => {
    const host = setup([thread(), thread("example-b")]);
    const entered = deferred<void>(), reply = deferred<unknown[]>();
    host.list.mockImplementationOnce(() => { entered.resolve(); return reply.promise; });
    const pending = host.run(["settle", "example-a", "--json"]);
    await entered.promise;
    await host.harness.behavior.callRpc("unsettle", { threadId: "example-b" });
    reply.resolve([thread()]);
    expect((await pending).exitCode).toBe(0);
    expect(host.rows()).toEqual([{ thread_id: "example-a", settled_at: NOW, snoozed_until: null, snoozed_at: null }]);
  });
});

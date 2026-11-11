import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost, makeThreadResponse, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./server";

const NOW = Date.parse("2030-05-06T10:00:00Z");
function running(id = "sample-a") {
  return {
    id, projectId: "sample-project", archivedAt: null, deletedAt: null,
    pinnedAt: null, status: "active", queuedWork: "none",
    lastReadAt: 50, latestAttentionAt: 100,
    runtime: { displayStatus: "active" },
    activity: { activeWorkflowCount: 0, activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0, activePlanModeCount: 0, activeGoalCount: 0 },
    hasPendingInteraction: false,
  };
}
const hosts: FakePluginHost[] = [];
const databases: Database.Database[] = [];
const directories: string[] = [];
function setup(threads: any[] = [running()], database?: Database.Database) {
  const get = vi.fn(async ({ threadId }: { threadId: string }) => {
    const found = threads.find((t) => t.id === threadId);
    if (!found) throw Object.assign(new Error("unknown"), { status: 404 });
    return found;
  });
  const list = vi.fn(async () => threads);
  const host = createFakePluginHost({ pluginId: "wizbar", sdk: { threads: { get, list } } });
  hosts.push(host);
  if (database) host.bb.storage.database = () => database;
  plugin(host.bb);
  return {
    host, get, list,
    run: async (argv: string[]) => {
      const result = await host.harness.behavior.runCli([...argv, "--json"]);
      return { ...result, output: JSON.parse(result.stdout) };
    },
    rpc: (method: string, input: any = { threadId: "sample-a" }) => host.harness.behavior.callRpc(method, input),
    rows: async () => (await host.harness.behavior.callRpc("listLifecycle", {}) as any).rows,
    publications: host.harness.inspection.realtimeSignals,
    event: (name: any, id = "sample-a") => host.harness.behavior.emitThreadEvent(name, {
      thread: makeThreadResponse({ id }), error: null, lastAssistantText: null,
    } as any),
  };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  for (const db of databases.splice(0)) if (db.open) db.close();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

// N2: existing server proofs contain no mute operation; a parser-only change
// could appear successful without persisting a row the sidebar can consume.
describe("explicit mute through registered command and RPC", () => {
  it("isolates mixed IDs and shares the persistent RPC row", async () => {
    const pinned = { ...running("pinned"), pinnedAt: 1 };
    const waiting = { ...running("waiting"), hasPendingInteraction: true };
    const failed = { ...running("failed"), status: "error" };
    const idle = { ...running("idle"), runtime: { displayStatus: "idle" }, status: "idle" };
    const host = setup([running(), pinned, waiting, failed, idle, running("sample-b")]);
    const result = await host.run(["mute", "sample-a", "pinned", "waiting", "failed", "idle", "unknown", "sample-b"]);
    expect(result.exitCode).toBe(1);
    expect(result.output.results.map((r: any) => r.ok ? r.shelf : r.error.code)).toEqual([
      "muted", "pinned", "waiting", "attention", "not_working", "unknown_id", "muted",
    ]);
    expect(await host.rows()).toEqual(["sample-a", "sample-b"].map((threadId) => ({
      threadId, settledAt: null, snoozedUntil: null, snoozedAt: null,
      mutedAt: NOW, muteAttentionAt: 100,
    })));
    await host.rpc("unmute");
    expect(await host.rows()).toHaveLength(1);
    expect((await host.run(["list", "sample-a", "sample-b"])).output.results.map((r: any) => r.shelf)).toEqual(["active", "muted"]);
  });
  it("survives a fresh database handle and plugin load, ordinary attention and restarted work", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wizbar-mute-")); directories.push(dir);
    const path = join(dir, "state.sqlite");
    const first = new Database(path); databases.push(first);
    const live = running();
    const original = setup([live], first);
    expect((await original.run(["mute", live.id])).exitCode).toBe(0);
    first.close();
    const second = new Database(path); databases.push(second);
    const loaded = setup([live], second);
    live.latestAttentionAt = 500; // Working attention is not a completion.
    expect((await loaded.run(["list", live.id])).output.results[0].shelf).toBe("muted");
    live.runtime.displayStatus = "idle"; live.lastReadAt = 500;
    expect((await loaded.run(["list", live.id])).output.results[0].shelf).toBe("muted");
    live.runtime.displayStatus = "starting";
    expect((await loaded.run(["list", live.id])).output.results[0].shelf).toBe("muted");
    const rows = await loaded.rows();
    expect(rows[0]).toMatchObject({ mutedAt: NOW, muteAttentionAt: 100 });
  });
  it.each([
    { pinnedAt: undefined }, { status: undefined }, { queuedWork: undefined },
    { queuedWork: "future" }, { pinnedAt: "no" },
    { activity: undefined }, { hasPendingInteraction: undefined },
    { runtime: { displayStatus: "waiting-for-host" } },
  ])("refuses unavailable authority without writes: %j", async (override) => {
    const host = setup([{ ...running(), ...override }]);
    const result = await host.run(["mute", "sample-a"]);
    expect(result.exitCode).toBe(1);
    expect(result.output.results[0].error.code).toBe("state_unavailable");
    expect(await host.rows()).toEqual([]);
    expect(host.publications).toEqual([]);
  });
  it("rejects an RPC mute of queued failure even while runtime is active", async () => {
    const host = setup([{ ...running(), queuedWork: "failed" }]);
    await expect(host.rpc("mute")).rejects.toThrow(/attention/i);
    expect(await host.rows()).toEqual([]); expect(host.publications).toEqual([]);
  });
  it("keeps ordinary parking guards and undo usable", async () => {
    const live = running(); const host = setup([live]);
    expect((await host.run(["settle", live.id])).exitCode).toBe(1);
    expect((await host.run(["mute", live.id])).exitCode).toBe(0);
    expect((await host.run(["unsettle", live.id])).exitCode).toBe(0);
    expect(await host.rows()).toEqual([]);
    live.runtime.displayStatus = "idle"; live.status = "idle"; live.lastReadAt = 100;
    expect((await host.run(["snooze", live.id, "--until", "hour"])).output.results[0].shelf).toBe("snoozed");
    expect((await host.run(["unsnooze", live.id])).exitCode).toBe(0);
    expect((await host.run(["settle", live.id])).output.results[0].shelf).toBe("settled");
    expect((await host.run(["unmute", live.id])).exitCode).toBe(0);
    expect(await host.rows()).toEqual([]);
  });
  it("unmutes with failed work reads and rejects empty undo IDs", async () => {
    const host = setup(); await host.run(["mute", "sample-a"]);
    host.list.mockRejectedValue(new Error("synthetic offline"));
    await expect(host.rpc("unmute", { threadId: " " })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await host.rows()).toHaveLength(1);
    expect((await host.run(["unmute", "sample-a"])).exitCode).toBe(0);
    expect(await host.rows()).toEqual([]);
  });
});

// N2: a breakthrough must remain visible after later work/read updates; a pure
// shelf test cannot catch a stale persistent mute returning on refresh.
describe("mute breakthroughs", () => {
  it.each(["question", "failure", "finished"])("removes mute on %s and keeps it removed", async (kind) => {
    const live = running(); const host = setup([live]);
    await host.run(["mute", live.id]);
    if (kind === "question") live.hasPendingInteraction = true;
    if (kind === "failure") live.runtime.displayStatus = "error";
    if (kind === "finished") { live.runtime.displayStatus = "idle"; live.status = "idle"; live.latestAttentionAt = 200; }
    expect((await host.run(["list", live.id])).output.results[0].shelf).toBe("active");
    await host.event(kind === "question" ? "interaction.pending" : kind === "failure" ? "thread.failed" : "thread.idle");
    expect(await host.rows()).toEqual([]);
    live.hasPendingInteraction = false; live.runtime.displayStatus = "active"; live.status = "active";
    live.lastReadAt = 200;
    expect((await host.run(["list", live.id])).output.results[0].shelf).toBe("active");
  });
  it("preserves ordinary settled state on a mute breakthrough event", async () => {
    const live = running(); live.runtime.displayStatus = "idle";
    const host = setup([live]); await host.run(["settle", live.id]);
    await host.event("thread.failed");
    expect(await host.rows()).toEqual([{ threadId: live.id, settledAt: NOW, snoozedUntil: null, snoozedAt: null }]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
describe("pending mute safety", () => {
  it.each(["unmute", "unsettle", "unsnooze", "thread.deleted", "interaction.pending", "thread.failed", "thread.idle"])("a stale validation cannot override %s", async (barrier) => {
    const host = setup();
    const entered = deferred<void>(), response = deferred<any[]>();
    host.list.mockImplementationOnce(() => { entered.resolve(); return response.promise; });
    const pending = host.run(["mute", "sample-a"]);
    // Baseline has no mute parser; fail here before awaiting a read it never makes.
    const first = await Promise.race([pending.then(() => "returned"), entered.promise.then(() => "reading")]);
    expect(first).toBe("reading");
    if (barrier.includes(".")) await host.event(barrier);
    else await host.rpc(barrier);
    response.resolve([running()]);
    const result = await pending;
    expect(result.exitCode).toBe(1);
    expect(result.output.results[0].error.code).toBe("stale_operation");
    expect(await host.rows()).toEqual([]);
  });
});

// Review R1/R3: these drive real registered events/CLI with held host snapshots.
// Earlier tests covered idle transitions but missed background-only completion,
// missed events during reload, and a CLI observation racing a new selection.
describe("review regressions R1/R3", () => {
  it("R1 refuses stale background completion observed before mute is stored", async () => {
    const initial = { ...running(), status: "idle", runtime: { displayStatus: "idle" },
      activity: { ...running().activity, activeBackgroundCommandCount: 1 } };
    const live = structuredClone(initial);
    const host = setup([live]);
    const entered = deferred<void>(), reply = deferred<any[]>();
    host.list.mockImplementationOnce(() => { entered.resolve(); return reply.promise; });
    const pending = host.run(["mute", live.id]);
    await entered.promise;
    live.activity.activeBackgroundCommandCount = 0;
    live.latestAttentionAt = 200;
    await host.event("experimental_thread.events");
    reply.resolve([initial]);
    const result = await pending;
    expect(result.exitCode).toBe(1);
    expect(result.output.results[0].error.code).toBe("stale_operation");
    expect(await host.rows()).toEqual([]);
    expect(host.publications).toEqual([]);
  });
  it("R1 preserves a stored mute through ordinary running activity events", async () => {
    const live = running(); const host = setup([live]);
    await host.run(["mute", live.id]);
    const selected = await host.rows(); const publications = [...host.publications];
    live.latestAttentionAt = 200;
    await host.event("experimental_thread.events");
    expect(await host.rows()).toEqual(selected);
    expect(host.publications).toEqual(publications);
    expect((await host.run(["list", live.id])).output.results[0].shelf).toBe("muted");
  });
  it.each(["question", "failure", "finished"])("R3 retires %s found by CLI without an event", async (kind) => {
    const live = running(); const host = setup([live]);
    await host.run(["mute", live.id]);
    if (kind === "question") live.hasPendingInteraction = true;
    if (kind === "failure") live.queuedWork = "failed";
    if (kind === "finished") { live.status = "idle"; live.runtime.displayStatus = "idle"; live.latestAttentionAt = 200; }
    const observed = await host.run(["list", live.id]);
    expect(observed.output.results[0].shelf).toBe("active");
    expect(await host.rows()).toEqual([]);
    live.hasPendingInteraction = false; live.queuedWork = "none";
    live.lastReadAt = 200; live.status = "active"; live.runtime.displayStatus = "active";
    expect((await host.run(["list", live.id])).output.results[0].shelf).toBe("active");
    expect(host.publications).toEqual([
      { channel: "lifecycle", payload: { threadId: live.id } },
      { channel: "lifecycle", payload: { threadId: live.id } },
    ]);
  });
  it("R3 reconciles finished attention after reopening the database before serving sidebar rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wizbar-mute-reload-")); directories.push(dir);
    const path = join(dir, "state.sqlite");
    const first = new Database(path); databases.push(first);
    const live = running(); const original = setup([live], first);
    await original.run(["mute", live.id]);
    await original.host.harness.lifecycle.dispose(); first.close();
    live.status = "idle"; live.runtime.displayStatus = "idle"; live.latestAttentionAt = 200;
    const second = new Database(path); databases.push(second);
    const loaded = setup([live], second);
    // The first CLI request may arrive before the startup task has drained.
    expect((await loaded.run(["list", live.id])).output.results[0].shelf).toBe("active");
    expect(await loaded.rows()).toEqual([]);
    live.lastReadAt = 200;
    expect((await loaded.run(["list", live.id])).output.results[0].shelf).toBe("active");
    expect(loaded.publications).toEqual([{ channel: "lifecycle", payload: { threadId: live.id } }]);
  });
  it("R3 retains selection and publishes nothing when authority fails after reload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wizbar-mute-offline-")); directories.push(dir);
    const path = join(dir, "state.sqlite");
    const first = new Database(path); databases.push(first);
    const original = setup([running()], first); await original.run(["mute", "sample-a"]);
    const selected = await original.rows();
    await original.host.harness.lifecycle.dispose(); first.close();
    const second = new Database(path); databases.push(second);
    const loaded = setup([{ ...running(), activity: undefined }], second);
    expect(await loaded.rows()).toEqual(selected);
    expect((await loaded.run(["list", "sample-a"])).exitCode).toBe(1);
    expect(await loaded.rows()).toEqual(selected);
    expect(loaded.publications).toEqual([]);
  });
  it.each(["CLI", "event"])("R3 a stale %s observation cannot retire an identical re-mute selection", async (transport) => {
    const live = running(); const host = setup([live]); await host.run(["mute", live.id]);
    const selected = await host.rows();
    const entered = deferred<void>(), reply = deferred<any[]>();
    host.list.mockImplementationOnce(() => { entered.resolve(); return reply.promise; });
    const pending = transport === "CLI" ? host.run(["list", live.id]) : host.event("experimental_thread.events");
    await entered.promise;
    await host.rpc("unmute");
    await host.run(["mute", live.id]); // Same clock and attention baseline: identity fields alone are insufficient.
    expect(await host.rows()).toEqual(selected);
    const publications = [...host.publications];
    reply.resolve([{ ...running(), status: "idle", runtime: { displayStatus: "idle" }, latestAttentionAt: 200 }]);
    const result = await pending;
    if ("exitCode" in result) {
      expect(result.exitCode).toBe(1);
      expect(result.output.results[0].error.code).toBe("stale_operation");
    }
    expect(await host.rows()).toEqual(selected);
    expect(host.publications).toEqual(publications);
  });
});

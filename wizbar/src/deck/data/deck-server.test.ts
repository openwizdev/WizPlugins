// D1 (#73) backend proofs through the real plugin entry, the SDK's fake host
// and an in-memory GitHub at the fetch boundary, on one fake clock.
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../../server";
import type { DeckWatchResultV1 } from "./server";
import { dxFactory, dxNow, dxOtherFactory, dxQueue, dxSettings, fakeGitHub } from "./fixtures";
import { LEASE_MS, REFRESH_MS } from "./cache";

const hosts: FakePluginHost[] = [];
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

type ReadImpl = (args: { hostId?: string; rootPath?: string; path: string }) => Promise<unknown>;
function setup(options: { settings?: Record<string, string>; read?: ReadImpl } = {}) {
  const github = fakeGitHub();
  vi.stubGlobal("fetch", github.fetch);
  let queueText = dxQueue();
  const read = vi.fn(options.read ?? (async ({ path }) => ({ content: queueText, contentEncoding: "utf8", path, sha256: sha(queueText), sizeBytes: queueText.length })));
  const write = vi.fn(async () => { throw new Error("no writes"); });
  const host = createFakePluginHost({
    pluginId: "wizbar", settings: options.settings ?? dxSettings(),
    sdk: { files: { read, write }, threads: { list: vi.fn(async () => []), get: vi.fn() } } as never,
  });
  hosts.push(host);
  plugin(host.bb);
  const watch = async (clientId: string, extra: Record<string, unknown> = {}) => {
    const result = await host.harness.behavior.callRpc("deckWatch", { clientId, projectKey: null, currentProjectId: null, timeZone: "UTC", ...extra });
    return result as DeckWatchResultV1;
  };
  const refresh = async (clientId: string, extra: Record<string, unknown> = {}) =>
    await host.harness.behavior.callRpc("deckRefresh", { clientId, projectKey: null, currentProjectId: null, timeZone: "UTC", ...extra }) as DeckWatchResultV1 & { started: boolean };
  const settle = () => vi.advanceTimersByTimeAsync(0);
  /** Advance the clock while both panels renew their leases every 30 s, as mounted panels do. */
  const heartbeat = async (ms: number, clients = ["desk-tab"]) => {
    for (let at = 0; at < ms; at += 30_000) {
      for (const client of clients) await watch(client);
      await vi.advanceTimersByTimeAsync(Math.min(30_000, ms - at));
    }
  };
  const count = (kind: string) => github.calls.filter((call) => call.kind === kind).length;
  return { host, github, read, write, watch, refresh, settle, count, heartbeat, setQueue: (text: string) => { queueText = text; } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(dxNow); });
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("one shared 60-second GitHub refresh", () => {
  // Bug caught: each panel, tab or phone polls GitHub itself, multiplying reads.
  it("two consumers advance one fake clock with one GitHub read per interval", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.watch("phone"); await t.settle();
    expect(t.count("board")).toBe(1);
    expect(t.read).toHaveBeenCalledTimes(1);

    for (let minute = 1; minute <= 3; minute += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
      await t.watch("desk-tab"); await t.watch("phone"); // lease renewals, never reads
      await vi.advanceTimersByTimeAsync(30_000);
      expect(t.count("board")).toBe(1 + minute);
      expect(t.read).toHaveBeenCalledTimes(1 + minute);
    }
    const view = (await t.watch("phone")).view!;
    expect(view.board.versions[0].specs[0].title).toBe("Search filters");
  });

  // Bug caught: the refresh button bypasses the shared minimum interval.
  it("a refresh inside the interval reads nothing; after it, one read", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.settle();
    expect((await t.refresh("desk-tab")).started).toBe(false);
    expect((await t.refresh("phone")).started).toBe(false);
    await t.settle();
    expect(t.count("board")).toBe(1);
    vi.setSystemTime(dxNow + REFRESH_MS);
    expect((await t.refresh("desk-tab")).started).toBe(true);
    await t.settle();
    expect(t.count("board")).toBe(2);
  });

  // Bug caught: timers keep reading GitHub after every panel has gone.
  it("stops reading once every lease has lapsed or been released", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.settle();
    await t.host.harness.behavior.callRpc("deckRelease", { clientId: "desk-tab" });
    await vi.advanceTimersByTimeAsync(5 * REFRESH_MS);
    expect(t.count("board")).toBe(1);
    await t.watch("phone"); await t.settle();
    await vi.advanceTimersByTimeAsync(LEASE_MS + 3 * REFRESH_MS);
    const reads = t.count("board");
    await vi.advanceTimersByTimeAsync(10 * REFRESH_MS);
    expect(t.count("board")).toBe(reads);
  });

  // Bug caught: status comments are re-downloaded in full every minute.
  it("re-reads status comments conditionally and keeps the 304 body", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.settle();
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    const comments = t.github.calls.filter((call) => call.kind === "comments");
    expect(comments.map((call) => call.conditional)).toEqual([false, true]);
    const spec = (await t.watch("desk-tab")).view!.board.versions[0].specs[0];
    expect(spec.status).toEqual({ status: "ready", now: "Building T2", next: "Review T2", when: "Today ~16:00 UTC", updated: "2026-11-15T20:00:00Z" });
  });
});

describe("failure keeps last-good data stale, never zero", () => {
  // Bug caught: a rate-limited refresh shows an empty board, and retries every tick.
  it("honours a rate-limit reset and keeps the last good rows visibly stale", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.settle();
    const resetAt = Math.floor((dxNow + 10 * REFRESH_MS) / 1000);
    t.github.state.override = (call) => call.kind === "board"
      ? { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) } } : null;
    await t.heartbeat(REFRESH_MS);
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.freshness).toBe("stale");
    expect(view.board.versions[0].specs[0]).toMatchObject({ title: "Search filters", merged: 1, total: 4 });
    expect(view.board.detail).toMatch(/rate limit/i);
    const afterLimit = t.github.calls.length;
    await t.heartbeat(8 * REFRESH_MS);
    expect(t.github.calls.length).toBe(afterLimit); // No aggressive retrying before the reset.
    t.github.state.override = null;
    await t.heartbeat(2 * REFRESH_MS);
    expect((await t.watch("desk-tab")).view!.board.freshness).toBe("fresh");
  });

  it("honours Retry-After on a secondary limit", async () => {
    const t = setup();
    t.github.state.override = (call) => call.kind === "board" ? { status: 429, headers: { "retry-after": "300" } } : null;
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.freshness).toBe("unavailable");
    expect(view.board.versions).toEqual([]);
    expect(view.health.mergesToday).toBeNull();
    await t.heartbeat(4 * REFRESH_MS);
    expect(t.count("board")).toBe(1);
    t.github.state.override = null;
    await t.heartbeat(90_000); // Past Retry-After (5 min), before the next interval.
    expect(t.count("board")).toBe(2);
  });

  // Bug caught: a partial page is shown as a complete count.
  it("a partial sub-issue page keeps known rows with a gap, and an incomplete merge read is unavailable", async () => {
    const t = setup();
    const board = t.github.state.boards.get("example-org/sample-app") as ReturnType<typeof import("./fixtures").dxBoard>;
    board.repository.milestones.nodes[0].issues.nodes[0].subIssues.pageInfo.hasNextPage = true;
    t.github.state.mergesIssueCount = 250;
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.versions[0].specs[0]).toMatchObject({ merged: 1, total: 4, complete: false });
    expect(view.board.gaps.join(" ")).toMatch(/not read/);
    expect(view.health.mergesToday).toBeNull();
  });
});

describe("verified progress and merges today", () => {
  // Bug caught: closed issues, unmerged PRs or foreign-repository merges advance progress.
  it("counts only closed tickets with a merged PR in a configured repository", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.settle();
    const spec = (await t.watch("desk-tab")).view!.board.versions[0].specs[0];
    expect(spec).toMatchObject({ ref: "example-org/sample-app#41", merged: 1, total: 4, complete: true });
    expect(spec.pullRequests).toEqual([{ ref: "example-org/sample-app#52", url: "https://github.com/example-org/sample-app/pull/52", mergedAt: "2026-11-15T09:00:00Z" }]);
  });

  // Bug caught: merges today uses the server's UTC day, or re-fetches per time zone.
  it("derives each viewer's local day from the same cached merge times", async () => {
    const t = setup();
    await t.watch("utc", { timeZone: "UTC" }); await t.settle();
    expect((await t.watch("utc", { timeZone: "UTC" })).view!.health.mergesToday).toBe(3);
    // 20:30Z is 2026-11-16 05:30 in Tokyo (+9), whose day began at 15:00Z: only 19:00Z counts.
    expect((await t.watch("tokyo", { timeZone: "Asia/Tokyo" })).view!.health.mergesToday).toBe(1);
    // 20:30Z is 2026-11-15 10:30 in Honolulu (-10), whose day began at 10:00Z: 10:30Z and 19:00Z count, 09:00Z (the 14th) does not.
    expect((await t.watch("honolulu", { timeZone: "Pacific/Honolulu" })).view!.health.mergesToday).toBe(2);
    expect(t.count("merges")).toBe(1);
  });

  it("shows Running and Stalls as unavailable, never zero", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.settle();
    const health = (await t.watch("desk-tab")).view!.health;
    expect(health.running).toBeNull();
    expect(health.stalls).toBeNull();
  });
});

describe("Needs-you queue host read", () => {
  const view = async (t: ReturnType<typeof setup>) => { await t.watch("desk-tab"); await t.settle(); return (await t.watch("desk-tab")).view!.needsYou; };

  it("reads with the explicit configured host and root, only the fixed relative file", async () => {
    const t = setup();
    const needsYou = await view(t);
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.read.mock.calls[0][0]).toMatchObject({ hostId: "host_d1_sample", rootPath: "/synthetic/home", path: ".openwiz/needs-you.v1.json" });
    expect(needsYou.freshness).toBe("fresh");
    expect(needsYou.view).toMatchObject({ state: "ready", count: 1 });
    expect(needsYou.view!.state === "ready" && needsYou.view!.items[0].answer.enabled).toBe(false);
    expect(t.write).not.toHaveBeenCalled();
  });

  it("a fresh, complete, empty queue is the only zero", async () => {
    const t = setup();
    t.setQueue(dxQueue({ items: [] }));
    expect((await view(t)).view).toMatchObject({ state: "ready", count: 0, complete: true });
  });

  // Bug caught: an unreachable, missing or bad queue reads as "nothing needs you".
  it.each([
    ["offline host", { read: async () => { throw Object.assign(new Error("host offline"), { status: 503 }); } }, "unreadable"],
    ["missing file", { read: async () => { throw Object.assign(new Error("not found"), { status: 404 }); } }, "missing"],
    ["malformed JSON", { queue: "{\"schema\": " }, "malformed"],
    ["stale producer", { queue: dxQueue({ expiresAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T19:00:00Z" }) }, "expired"],
    ["project mismatch", { queue: dxQueue({ project: "other-factory" }) }, "wrong-project"],
    ["hash mismatch", { read: async ({ path }: { path: string }) => ({ content: dxQueue(), contentEncoding: "utf8", path, sha256: "0".repeat(64), sizeBytes: 1 }) }, "unreadable"],
    ["a different file returned", { read: async () => ({ content: dxQueue(), contentEncoding: "utf8", path: "/elsewhere/x.json", sha256: sha(dxQueue()), sizeBytes: 1 }) }, "unreadable"],
  ] as const)("%s is unavailable with answers disabled", async (_name, input, reason) => {
    const t = setup("read" in input ? { read: input.read as ReadImpl } : {});
    if ("queue" in input) t.setQueue(input.queue);
    const needsYou = await view(t);
    expect(needsYou.freshness).toBe("unavailable");
    expect(needsYou.view).toEqual({ state: "unavailable", reason, count: null, items: [] });
    expect(needsYou.detail).toBeTruthy();
  });

  it.each(["relative/home", "/", "/synthetic/../etc", "/synthetic/./home", "~/home", "/synthetic//home", "/synthetic/home/"])(
    "forbidden root %s is refused before any SDK call", async (rootPath) => {
      const t = setup({ settings: dxSettings([{ ...dxFactory, home: { ...dxFactory.home, rootPath } }]) });
      const needsYou = await view(t);
      expect(t.read).not.toHaveBeenCalled();
      expect(needsYou.view).toEqual({ state: "unavailable", reason: "not-configured", count: null, items: [] });
      expect(needsYou.detail).toMatch(/forbidden home root/i);
    });

  it("a queue that expires between refreshes becomes unavailable without a read", async () => {
    const t = setup();
    t.setQueue(dxQueue({ expiresAt: "2026-11-15T20:30:30Z" }));
    expect((await view(t)).view).toMatchObject({ state: "ready" });
    vi.setSystemTime(dxNow + 45_000);
    const needsYou = (await t.watch("desk-tab")).view!.needsYou;
    expect(needsYou.view).toMatchObject({ state: "unavailable", reason: "expired", count: null });
    expect(t.read).toHaveBeenCalledTimes(1);
  });
});

describe("factory selection and setup", () => {
  // Bug caught: switching projects shows the previous factory's rows.
  it("switching projects returns only the selected factory's rows and queue", async () => {
    const t = setup({ settings: dxSettings([dxFactory, dxOtherFactory]) });
    await t.watch("desk-tab"); await t.settle();
    const first = await t.watch("desk-tab");
    expect(first.projectKey).toBe("sample-factory");
    await t.watch("desk-tab", { projectKey: "other-factory" }); await t.settle();
    const other = await t.watch("desk-tab", { projectKey: "other-factory" });
    expect(other.projectKey).toBe("other-factory");
    expect(other.view!.projectKey).toBe("other-factory");
    expect(other.view!.board.versions.flatMap((version) => version.specs.map((spec) => spec.ref))).toEqual(["example-org/other-app#41"]);
    expect(t.read.mock.calls.at(-1)![0]).toMatchObject({ hostId: "host_d1_other", rootPath: "/synthetic/other" });
  });

  it("defaults to the factory bound to the current Cloudroom project", async () => {
    const t = setup({ settings: dxSettings([dxFactory, dxOtherFactory]) });
    expect((await t.watch("desk-tab", { currentProjectId: "prj_d1_other" })).projectKey).toBe("other-factory");
  });

  it("an unconfigured plugin reads nothing and says so", async () => {
    const t = setup({ settings: {} });
    const result = await t.watch("desk-tab"); await t.settle();
    expect(result).toMatchObject({ projects: [], view: null });
    expect(result.setup).toMatch(/no factory/i);
    expect(t.github.calls).toEqual([]);
    expect(t.read).not.toHaveBeenCalled();
  });

  // Bug caught: the panel can trigger a GitHub write, or the token leaves the backend.
  it("makes only GitHub reads and never returns the token", async () => {
    const t = setup();
    const result = await t.watch("desk-tab"); await t.settle();
    await vi.advanceTimersByTimeAsync(3 * REFRESH_MS);
    const final = await t.watch("desk-tab");
    for (const call of t.github.calls) {
      expect(call.method === "GET" || (call.method === "POST" && call.url.endsWith("/graphql"))).toBe(true);
      if (call.body) expect(call.body).not.toMatch(/\bmutation\b/);
    }
    expect(JSON.stringify([result, final])).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
  });
});

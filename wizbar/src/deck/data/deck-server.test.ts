// D1 (#73) backend proofs through the real plugin entry, the SDK's fake host
// and an in-memory GitHub at the fetch boundary, on one fake clock.
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../../server";
import type { DeckWatchResultV1 } from "./server";
import { dxCutoffResponse, dxFactory, dxFillerIssues, dxNow, dxOtherFactory, dxQueue, dxSettings, dxStatusComment, fakeGitHub } from "./fixtures";
import { loadBoard, mergesToday } from "./board";
import { GitHubReader } from "./github";
import { LEASE_MS, REFRESH_MS } from "./cache";
import { strictRead } from "../../testing/strict-files";
import { createRequire } from "node:module";
import { createElement, type ReactElement } from "react";
import { Versions } from "../home/sections";

const hosts: FakePluginHost[] = [];
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup: (element: ReactElement) => string };
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

type ReadImpl = (args: { hostId?: string; rootPath?: string; path: string }) => Promise<unknown>;
function setup(options: { settings?: Record<string, string>; read?: ReadImpl } = {}) {
  const github = fakeGitHub();
  vi.stubGlobal("fetch", github.fetch);
  let queueText = dxQueue();
  // The real host's rule (#153): a relative path is refused with 400 "Path must be absolute".
  const read = vi.fn(strictRead(options.read ?? (async ({ path }) => ({ content: queueText, contentEncoding: "utf8", path, sha256: sha(queueText), sizeBytes: queueText.length }))));
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
  // Bug caught: an interrupted continuation discards the rows already read, or
  // presents a lower bound as a complete count.
  it("an interrupted sub-issue continuation keeps known tickets with a gap, and a short merge read is unavailable", async () => {
    const t = setup();
    const spec = t.github.state.repos.get("example-org/sample-app")![0].issues[0];
    spec.tickets.push(...Array.from({ length: 60 }, (_, i) => ({ number: 2000 + i, repo: "example-org/sample-app", state: "OPEN" as const, prs: [] })));
    t.github.state.override = (call) => call.kind === "subIssues" ? { status: 503 } : null;
    t.github.state.mergesIssueCount = 250;
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.versions[0].specs[0]).toMatchObject({ merged: 1, total: 64, complete: false });
    expect(view.board.gaps.join(" ")).toMatch(/some tickets or links were not read/);
    expect(view.health.mergesToday).toBeNull();
  });
});

describe("R1: board connections continue past their first page", () => {
  // Bug caught: later pages are invisible forever. The board read only the
  // first page of each connection and never followed endCursor, so a spec,
  // ticket or closing PR past page one never appeared, however often it refreshed.
  it("shows a spec that sits after the first page of a version's issues", async () => {
    const t = setup();
    const milestone = t.github.state.repos.get("example-org/sample-app")![0];
    milestone.issues.unshift(...dxFillerIssues(50));
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.versions[0].specs.map((spec) => spec.ref)).toEqual(["example-org/sample-app#41"]);
    expect(view.board.versions[0]).toMatchObject({ complete: true });
    expect(t.github.calls.filter((call) => call.kind === "issues").map((call) => call.variables?.after)).toEqual(["c49"]);
  });

  it("counts a verified ticket after the first sub-issue page, and a merged closing PR after the first link page", async () => {
    const t = setup();
    const repo = "example-org/sample-app";
    const spec = t.github.state.repos.get(repo)![0].issues[0];
    // 50 open tickets push one verified ticket onto the second sub-issue page.
    spec.tickets.splice(1, 0, ...Array.from({ length: 50 }, (_, i) => ({ number: 3000 + i, repo, state: "OPEN" as const, prs: [] })));
    spec.tickets.push({ number: 46, repo, state: "CLOSED", prs: [] });
    // Ten unmerged PRs push its merged closing PR onto the second link page.
    spec.tickets.at(-1)!.prs = [
      ...Array.from({ length: 10 }, (_, i) => ({ number: 600 + i, repo, mergedAt: null, merged: false })),
      { number: 70, repo, mergedAt: "2026-11-15T12:00:00Z", merged: true },
    ];
    await t.watch("desk-tab"); await t.settle();
    const row = (await t.watch("desk-tab")).view!.board.versions[0].specs[0];
    expect(row).toMatchObject({ total: 55, merged: 2, complete: true });
    expect(row.pullRequests.map((link) => link.ref)).toEqual(["example-org/sample-app#70", "example-org/sample-app#52"]);
  });

  it("an interrupted issue continuation keeps known specs and marks the version partial", async () => {
    const t = setup();
    const milestone = t.github.state.repos.get("example-org/sample-app")![0];
    milestone.issues.push(...dxFillerIssues(60));
    t.github.state.override = (call) => call.kind === "issues" ? { status: 502 } : null;
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.freshness).toBe("fresh");
    expect(view.board.versions[0]).toMatchObject({ complete: false });
    expect(view.board.versions[0].specs.map((spec) => spec.title)).toEqual(["Search filters"]);
    expect(view.board.gaps.join(" ")).toMatch(/not every issue was read/);
  });

  it("stops at its page bound and says so", async () => {
    const t = setup();
    const spec = t.github.state.repos.get("example-org/sample-app")![0].issues[0];
    spec.tickets.push(...Array.from({ length: 4 * 50 }, (_, i) => ({ number: 4000 + i, repo: "example-org/sample-app", state: "OPEN" as const, prs: [] })));
    await t.watch("desk-tab"); await t.settle();
    const row = (await t.watch("desk-tab")).view!.board.versions[0].specs[0];
    expect(row).toMatchObject({ total: 204, merged: 1, complete: false });
    expect(t.github.calls.filter((call) => call.kind === "subIssues")).toHaveLength(3);
  });
});

describe("R2: supplementary reads never discard the board", () => {
  const manyComments = () => [dxStatusComment, ...Array.from({ length: 149 }, (_, i) => ({ user: { login: "someone" }, body: `note ${i}` }))];

  // Bug caught: a failed later status-comment page threw away the whole
  // successfully read board, so its specs, progress and links vanished.
  it("a failed second comment page keeps the spec row, progress and links, with its status unavailable", async () => {
    const t = setup();
    t.github.state.comments = manyComments();
    t.github.state.override = (call) => call.kind === "comments" && call.url.includes("page=2") ? { status: 503 } : null;
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.freshness).toBe("fresh");
    const row = view.board.versions[0].specs[0];
    expect(row).toMatchObject({ title: "Search filters", merged: 1, total: 4 });
    expect(row.pullRequests.map((link) => link.ref)).toEqual(["example-org/sample-app#52"]);
    expect(row.status).toEqual({ status: "unavailable", reason: "missing", when: "Not estimated" });
    expect(view.board.gaps.join(" ")).toMatch(/status could not be read/);
    expect(view.health.mergesToday).toBe(3);
  });

  // Bug caught: a failed later merge-search page discarded the board, and a
  // partial merge read could have looked like a complete count.
  it("a failed second merge page keeps the board, keeps known merge times and gives no count", async () => {
    const github = fakeGitHub();
    github.state.merges.set("example-org/sample-app", Array.from({ length: 130 }, (_, i) => ({ number: 5000 + i, mergedAt: "2026-11-15T19:00:00Z" })));
    github.state.override = (call) => call.kind === "merges" && call.variables?.after ? { status: 503 } : null;
    const result = await loadBoard({
      reader: new GitHubReader(github.fetch, "synthetic-token", () => dxNow), repository: "example-org/sample-app",
      repositories: ["example-org/sample-app"], statusWriterLogin: "sample-manager", now: () => dxNow,
    }, new AbortController().signal);
    expect(result.data.versions[0].specs[0]).toMatchObject({ title: "Search filters", merged: 1 });
    expect(result.data.merges).toMatchObject({ complete: false });
    expect(result.data.merges.pullRequests).toHaveLength(100);
    expect(result.complete).toBe(false);
    expect(mergesToday([result.data], "UTC", dxNow)).toBeNull();
  });

  // Bug caught: a rate limit met during a supplementary read was swallowed, so
  // the shared cache kept reading GitHub before the reset.
  it("a rate limit on a later page keeps the rows and holds the shared schedule until the reset", async () => {
    const t = setup();
    t.github.state.comments = manyComments();
    const resetAt = Math.floor((dxNow + 10 * REFRESH_MS) / 1000);
    t.github.state.override = (call) => call.kind === "comments" && call.url.includes("page=2") && Date.now() < resetAt * 1000
      ? { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) } } : null;
    await t.watch("desk-tab"); await t.settle();
    const view = (await t.watch("desk-tab")).view!;
    expect(view.board.versions[0].specs[0]).toMatchObject({ title: "Search filters", merged: 1 });
    expect(view.board.gaps.join(" ")).toMatch(/asked us to wait/);
    expect(view.health.mergesToday).toBeNull();
    const calls = t.github.calls.length;
    await t.heartbeat(9 * REFRESH_MS);
    expect(t.github.calls.length).toBe(calls);
    await t.heartbeat(2 * REFRESH_MS);
    expect(t.github.calls.length).toBeGreaterThan(calls);
    const later = (await t.watch("desk-tab")).view!;
    expect(later.board.versions[0].specs[0].status.status).toBe("ready");
    expect(later.health.mergesToday).toBe(3);
  });

  // Bug caught: a later response cut off mid-body discards the board. After the
  // board and the first comment page succeeded, a second comment page answered
  // HTTP 200 and its body stream then failed; that raw error escaped the
  // supplementary boundary and the specs, progress and links vanished.
  it("a later comment page cut off mid-body keeps the board, with that status unavailable and no token", async () => {
    const t = setup();
    t.github.state.comments = manyComments();
    t.github.state.override = (call) => call.kind === "comments" && call.url.includes("page=2") ? { response: dxCutoffResponse() } : null;
    await t.watch("desk-tab"); await t.settle();
    const watched = await t.watch("desk-tab");
    const view = watched.view!;
    expect(t.github.calls.filter((call) => call.kind === "comments").map((call) => call.url.includes("page=2"))).toEqual([false, true]);
    expect(view.board.freshness).toBe("fresh");
    const row = view.board.versions[0].specs[0];
    expect(row).toMatchObject({ title: "Search filters", merged: 1, total: 4 });
    expect(row.pullRequests.map((link) => link.ref)).toEqual(["example-org/sample-app#52"]);
    expect(row.status).toEqual({ status: "unavailable", reason: "missing", when: "Not estimated" });
    expect(view.board.gaps.join(" ")).toMatch(/status could not be read/);
    expect(view.health.mergesToday).toBe(3);
    vi.setSystemTime(dxNow + REFRESH_MS);
    const refreshed = await t.refresh("desk-tab"); await t.settle();
    const after = await t.watch("desk-tab");
    expect(after.view!.board.versions[0].specs[0].title).toBe("Search filters");
    for (const answer of [watched, refreshed, after]) expect(JSON.stringify(answer)).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
  });

  // Bug caught: a later merge-search page cut off mid-body discards the board
  // and the merge times already read.
  it("a later merge-search page cut off mid-body keeps the board and known merge times, with no count", async () => {
    const github = fakeGitHub();
    github.state.merges.set("example-org/sample-app", Array.from({ length: 130 }, (_, i) => ({ number: 5000 + i, mergedAt: "2026-11-15T19:00:00Z" })));
    github.state.override = (call) => call.kind === "merges" && call.variables?.after ? { response: dxCutoffResponse("{\"data\": ") } : null;
    const result = await loadBoard({
      reader: new GitHubReader(github.fetch, "synthetic-token", () => dxNow), repository: "example-org/sample-app",
      repositories: ["example-org/sample-app"], statusWriterLogin: "sample-manager", now: () => dxNow,
    }, new AbortController().signal);
    expect(github.calls.filter((call) => call.kind === "merges").map((call) => call.variables?.after ?? null)).toEqual([null, "c99"]);
    expect(result.data.versions[0].specs[0]).toMatchObject({ title: "Search filters", merged: 1 });
    expect(result.data.merges).toMatchObject({ complete: false });
    expect(result.data.merges.pullRequests).toHaveLength(100);
    expect(result.complete).toBe(false);
    expect(result.gaps.join(" ")).toMatch(/not every recent merge was read/);
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
    expect(mergesToday([result.data], "UTC", dxNow)).toBeNull();
  });

  it("the same merge cutoff through the server keeps the specs and shows merges today unavailable, with no token", async () => {
    const t = setup();
    t.github.state.merges.set("example-org/sample-app", Array.from({ length: 130 }, (_, i) => ({ number: 5000 + i, mergedAt: "2026-11-15T19:00:00Z" })));
    t.github.state.override = (call) => call.kind === "merges" && call.variables?.after ? { response: dxCutoffResponse("{\"data\": ") } : null;
    await t.watch("desk-tab"); await t.settle();
    const watched = await t.watch("desk-tab");
    expect(watched.view!.board.freshness).toBe("fresh");
    expect(watched.view!.board.versions[0].specs[0]).toMatchObject({ title: "Search filters", merged: 1 });
    expect(watched.view!.health.mergesToday).toBeNull();
    expect(JSON.stringify(watched)).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
  });

  // Bug caught: normalizing a body cutoff must not turn real cancellation into a partial board.
  it("a body cutoff caused by cancellation is still cancellation", async () => {
    const github = fakeGitHub();
    const controller = new AbortController();
    github.state.comments = manyComments();
    github.state.override = (call) => {
      if (!(call.kind === "comments" && call.url.includes("page=2"))) return null;
      controller.abort();
      return { response: dxCutoffResponse() };
    };
    await expect(loadBoard({
      reader: new GitHubReader(github.fetch, "synthetic-token", () => dxNow), repository: "example-org/sample-app",
      repositories: ["example-org/sample-app"], statusWriterLogin: "sample-manager", now: () => dxNow,
    }, controller.signal)).rejects.toThrow();
    expect(github.calls.filter((call) => call.kind === "merges")).toHaveLength(0);
  });

  it("cancellation during a supplementary read is not swallowed", async () => {
    const github = fakeGitHub();
    const controller = new AbortController();
    github.state.override = (call) => {
      if (call.kind !== "comments") return null;
      controller.abort();
      throw new Error("aborted");
    };
    await expect(loadBoard({
      reader: new GitHubReader(github.fetch, "synthetic-token", () => dxNow), repository: "example-org/sample-app",
      repositories: ["example-org/sample-app"], statusWriterLogin: "sample-manager", now: () => dxNow,
    }, controller.signal)).rejects.toThrow();
    expect(github.calls.filter((call) => call.kind === "merges")).toHaveLength(0);
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

  // catches (#153): the fixed file passed relative to rootPath, which the real host refuses with 400 "Path must be absolute".
  it("reads with the explicit configured host and root, only the fixed file by its absolute path", async () => {
    const t = setup();
    const needsYou = await view(t);
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.read.mock.calls[0][0]).toMatchObject({ hostId: "host_d1_sample", rootPath: "/synthetic/home", path: "/synthetic/home/.openwiz/needs-you.v1.json" });
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

  // catches (#153): a Windows root joined with `/`, or the host's reported absolute path refused.
  it("a Windows root reads its file by the backslash-joined absolute path", async () => {
    const rootPath = "C:\\synthetic\\home";
    const t = setup({ settings: dxSettings([{ ...dxFactory, home: { ...dxFactory.home, rootPath } }]) });
    expect((await view(t)).view).toMatchObject({ state: "ready", count: 1 });
    expect(t.read.mock.calls[0][0]).toMatchObject({ rootPath, path: "C:\\synthetic\\home\\.openwiz\\needs-you.v1.json" });
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

  // Bug caught: credential disclosure through failure details. A transport or
  // GitHub error that echoes the request's Authorization header was copied
  // verbatim into the board's detail, which the RPC returns to every panel.
  it.each([
    ["a transport error echoing the request", () => { throw new Error("connect failed: authorization: Bearer synthetic-token"); }],
    ["an unexpected loader error", () => ({ status: 200, body: { data: { repository: { milestones: "synthetic-token" } } } })],
  ] as const)("never returns the token in failure details: %s", async (_name, failure) => {
    const t = setup();
    t.github.state.override = (call) => {
      if (call.kind !== "board") return null;
      const outcome = failure();
      return outcome as { status: number; body: unknown };
    };
    await t.watch("desk-tab"); await t.settle();
    const watched = await t.watch("desk-tab");
    vi.setSystemTime(dxNow + REFRESH_MS);
    const refreshed = await t.refresh("desk-tab"); await t.settle();
    const after = await t.watch("desk-tab");
    // The failure is still reported, in words, as unavailable.
    expect(after.view!.board.freshness).toBe("unavailable");
    expect(after.view!.board.detail).toBeTruthy();
    for (const answer of [watched, refreshed, after]) expect(JSON.stringify(answer)).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
  });

  // Bug caught: credential disclosure through a partial read's gaps. A later
  // page's transport error, echoing the request, must not reach a panel either.
  it("never returns the token when a later page fails and the board stays partial", async () => {
    const t = setup();
    t.github.state.comments = [dxStatusComment, ...Array.from({ length: 120 }, (_, i) => ({ user: { login: "someone" }, body: `note ${i}` }))];
    t.github.state.override = (call) => {
      if ((call.kind === "comments" && call.url.includes("page=2")) || (call.kind === "merges")) {
        throw new Error("socket hang up: authorization: Bearer synthetic-token");
      }
      return null;
    };
    await t.watch("desk-tab"); await t.settle();
    const watched = await t.watch("desk-tab");
    vi.setSystemTime(dxNow + REFRESH_MS);
    const refreshed = await t.refresh("desk-tab"); await t.settle();
    const after = await t.watch("desk-tab");
    expect(after.view!.board.versions[0].specs[0].title).toBe("Search filters");
    expect(after.view!.board.gaps.length).toBeGreaterThan(0);
    for (const answer of [watched, refreshed, after]) expect(JSON.stringify(answer)).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
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

describe("B07 polish: coverage and status age survive what the board shows", () => {
  // Bug caught (WizPlugins#81): a failed refresh erases known coverage gaps.
  it("keeps the last good read's coverage gaps during stale fallback, including repeated failures", async () => {
    const t = setup();
    t.github.state.repos.get("example-org/sample-app")![0].issues.push(...dxFillerIssues(60));
    t.github.state.override = (call) => call.kind === "issues" ? { status: 502 } : null;
    await t.watch("desk-tab"); await t.settle();
    const first = (await t.watch("desk-tab")).view!.board;
    expect(first.freshness).toBe("fresh");
    expect(first.gaps.join(" ")).toMatch(/not every issue was read/);
    t.github.state.override = (call) => call.kind === "board" ? { status: 503 } : null;
    for (let failure = 1; failure <= 2; failure += 1) {
      await t.heartbeat(REFRESH_MS);
      const board = (await t.watch("desk-tab")).view!.board;
      expect(t.count("board")).toBe(1 + failure);
      expect(board.freshness).toBe("stale");
      expect(board.versions[0].complete).toBe(false);
      expect(board.gaps).toEqual(first.gaps);
    }
  });

  // Bug caught (WizPlugins#84): a failed later PR page hides link incompleteness after the ticket's merge is already verified.
  it("records a PR-link gap when a later closing-PR page fails after a verified merge, keeping the exact count", async () => {
    const github = fakeGitHub();
    const repo = "example-org/sample-app";
    const ticket = github.state.repos.get(repo)![0].issues[0].tickets[0];
    ticket.prs = Array.from({ length: 11 }, (_, i) => ({ number: 700 + i, repo, mergedAt: "2026-11-15T12:00:00Z", merged: true }));
    github.state.override = (call) => call.kind === "closing" ? { status: 503 } : null;
    const result = await loadBoard({
      reader: new GitHubReader(github.fetch, "synthetic-token", () => dxNow), repository: repo,
      repositories: [repo], statusWriterLogin: "sample-manager", now: () => dxNow,
    }, new AbortController().signal);
    const spec = result.data.versions[0].specs[0];
    expect(spec).toMatchObject({ merged: 1, total: 4, complete: true });
    expect(spec.pullRequests).toHaveLength(10);
    expect(result.gaps.join(" ")).toMatch(/#41: some pull request links were not read/);
    expect(result.complete).toBe(false);
  });

  // Bug caught (WizPlugins#83): an old status appears to have the age of a new GitHub fetch.
  it("renders the status comment's own update time apart from the board fetch age", async () => {
    const t = setup();
    t.github.state.comments = [{ ...dxStatusComment, body: dxStatusComment.body.replace("2026-11-15T20:00:00Z", "2026-10-01T00:00:00Z") }];
    await t.watch("desk-tab"); await t.settle();
    const board = (await t.watch("desk-tab")).view!.board;
    expect(board.fetchedAt).toBe(dxNow);
    const html = renderToStaticMarkup(createElement(Versions, { board, open: () => {} }));
    expect(html).toContain("Status updated:");
    expect(html).toContain("2026-10-01 00:00 UTC");
  });
});

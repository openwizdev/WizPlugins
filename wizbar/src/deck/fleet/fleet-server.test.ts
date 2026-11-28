// F1 (#75) backend proofs for the fleet work-link lease, through the real
// plugin entry, the SDK's fake host and D1's in-memory GitHub at the fetch
// boundary (fleet-link queries answered through its `override` hook).
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../../server";
import type { DeckWatchResultV1 } from "../data/server";
import { REFRESH_MS } from "../data/cache";
import { dxFactory, dxNow, dxOtherFactory, dxQueue, dxSettings, fakeGitHub, type FakeGitHubCall } from "../data/fixtures";

const hosts: FakePluginHost[] = [];
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const isLinks = (call: FakeGitHubCall) => call.body !== undefined && /query WizDeckFleet/.test(call.body);

const pr = (repo: string, number: number, branch: string) => ({
  number, url: `https://github.com/${repo}/pull/${number}`, headRefName: branch, isCrossRepository: false, mergedAt: null,
  repository: { nameWithOwner: repo },
  closingIssuesReferences: { pageInfo: { hasNextPage: false }, nodes: [{
    number: 43, title: "Synthetic ticket", url: `https://github.com/${repo}/issues/43`, state: "OPEN",
    repository: { nameWithOwner: repo }, parent: { number: 41, repository: { nameWithOwner: repo } },
  }] },
});
const links = (repo: string) => ({
  data: { repository: {
    open: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(repo, 52, `room/${repo.split("/")[1]}`)] },
    merged: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
  } },
});

function setup(settings = dxSettings()) {
  const github = fakeGitHub();
  let linkAnswer: (call: FakeGitHubCall) => { status: number; headers?: Record<string, string>; body?: unknown } =
    (call) => ({ status: 200, body: links(`${call.variables?.owner}/${call.variables?.name}`) });
  github.state.override = (call) => isLinks(call) ? linkAnswer(call) : null;
  vi.stubGlobal("fetch", github.fetch);
  const queue = dxQueue();
  const read = vi.fn(async ({ path }: { path: string }) => ({ content: queue, contentEncoding: "utf8", path, sha256: sha(queue), sizeBytes: queue.length }));
  const host = createFakePluginHost({
    pluginId: "wizbar", settings,
    sdk: { files: { read, write: vi.fn(async () => { throw new Error("no writes"); }) }, threads: { list: vi.fn(async () => []), get: vi.fn() } } as never,
  });
  hosts.push(host);
  plugin(host.bb);
  const watch = async (clientId: string, extra: Record<string, unknown> = {}) =>
    await host.harness.behavior.callRpc("deckWatch", { clientId, projectKey: null, currentProjectId: null, timeZone: "UTC", ...extra }) as DeckWatchResultV1;
  const linkCalls = () => github.calls.filter(isLinks);
  return { host, github, watch, linkCalls, setLinks: (answer: typeof linkAnswer) => { linkAnswer = answer; } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(dxNow); });
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

/** The one configured repository's link view; its absence is itself the failure. */
function firstLinks(result: DeckWatchResultV1) {
  expect(result.fleetLinks).toHaveLength(1);
  return result.fleetLinks![0];
}
const heads = (result: DeckWatchResultV1) =>
  (result.fleetLinks ?? []).flatMap((view) => view.snapshot?.status === "ready" ? view.snapshot.data.pullRequests.map((p) => p.ref) : []);

describe("fleet work links in the shared cache", () => {
  // Bug caught: each panel or phone reads work links itself, or links poll on their own timer.
  it("two consumers share one work-link read per 60-second interval", async () => {
    const t = setup();
    await t.watch("desk-tab"); await t.watch("phone"); await vi.advanceTimersByTimeAsync(0);
    expect(t.linkCalls()).toHaveLength(1);
    for (let minute = 1; minute <= 2; minute += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
      await t.watch("desk-tab"); await t.watch("phone");
      await vi.advanceTimersByTimeAsync(30_000);
      expect(t.linkCalls()).toHaveLength(1 + minute);
    }
    expect(heads(await t.watch("phone"))).toEqual(["example-org/sample-app#52"]);
  });

  // Bug caught: one factory's work links shown under another after a switch.
  it("returns only the selected factory's repositories", async () => {
    const t = setup(dxSettings([dxFactory, dxOtherFactory]));
    await t.watch("desk-tab", { projectKey: "other-factory" }); await vi.advanceTimersByTimeAsync(0);
    expect(heads(await t.watch("desk-tab", { projectKey: "other-factory" }))).toEqual(["example-org/other-app#52"]);
    expect(heads(await t.watch("desk-tab", { projectKey: "sample-factory" }))).toEqual([]); // Not read yet: never the other's rows.
    await vi.advanceTimersByTimeAsync(0);
    expect(heads(await t.watch("desk-tab", { projectKey: "sample-factory" }))).toEqual(["example-org/sample-app#52"]);
  });

  // Bug caught: a rate-limited link read drops known links or retries every tick.
  it("keeps last-good links stale through a rate limit and waits for its reset", async () => {
    const t = setup();
    await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
    const resetAt = Math.floor((dxNow + 10 * REFRESH_MS) / 1000);
    t.setLinks(() => ({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) } }));
    for (let at = 0; at < 4 * REFRESH_MS; at += 30_000) { await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(30_000); }
    const view = firstLinks(await t.watch("desk-tab"));
    expect(view.snapshot).toMatchObject({ status: "unavailable", reason: "rate-limited", lastGood: { data: { pullRequests: [{ ref: "example-org/sample-app#52" }] } } });
    expect(t.linkCalls()).toHaveLength(2); // No retry before the reset.
    // The deadline is the real one: GitHub's reset, 10 minutes in. Held up to 30 s before it…
    t.setLinks((call) => ({ status: 200, body: links(`${call.variables?.owner}/${call.variables?.name}`) }));
    for (let at = 4 * REFRESH_MS; at < 10 * REFRESH_MS - 30_000; at += 30_000) { await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(30_000); }
    expect(t.linkCalls()).toHaveLength(2);
    // …then exactly one read once it passes.
    await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(30_000);
    expect(t.linkCalls()).toHaveLength(3);
    expect(firstLinks(await t.watch("desk-tab")).snapshot).toMatchObject({ status: "ready", stale: false });
  });

  // Bug caught: a partial link read (bounds hit) shown as complete coverage, or its known links dropped.
  it("keeps a bounded read's known links with its gap, never complete", async () => {
    const t = setup();
    t.setLinks((call) => ({ status: 200, body: { data: { repository: {
      open: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(`${call.variables?.owner}/${call.variables?.name}`, 52, "room/sample-app")] },
      merged: { pageInfo: { hasNextPage: true, endCursor: "m1" }, nodes: [] },
    } } } }));
    await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
    const view = firstLinks(await t.watch("desk-tab"));
    expect(view.snapshot).toMatchObject({ status: "ready", complete: false, gaps: [expect.stringMatching(/most recently updated merged/)] });
    expect(heads(await t.watch("desk-tab"))).toEqual(["example-org/sample-app#52"]);
  });

  // R3. Bug caught: a failed second open-PR page throws away the first page and the merged list, even on first load.
  describe("a failed continuation keeps what was read", () => {
    const firstPage = (repo: string) => ({ data: { repository: {
      open: { pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [pr(repo, 52, "room/sample-app")] },
      merged: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ ...pr(repo, 50, "room/shipped"), mergedAt: "2026-11-15T10:00:00Z" }] },
    } } });
    const isPage2 = (call: FakeGitHubCall) => /query WizDeckFleetOpen/.test(call.body ?? "");
    const refs = (result: DeckWatchResultV1) => {
      const snapshot = firstLinks(result).snapshot;
      return snapshot?.status === "ready" ? snapshot.data.pullRequests.map((p) => `${p.ref} ${p.state}`) : snapshot;
    };

    it("on first load, a 503 continuation leaves the first page and merged list as partial links", async () => {
      const t = setup();
      t.setLinks((call) => isPage2(call) ? { status: 503 } : { status: 200, body: firstPage(`${call.variables?.owner}/${call.variables?.name}`) });
      await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
      const result = await t.watch("desk-tab");
      expect(refs(result)).toEqual(["example-org/sample-app#52 open", "example-org/sample-app#50 merged"]);
      expect(firstLinks(result).snapshot).toMatchObject({ status: "ready", complete: false, data: { openComplete: false, mergedComplete: true } });
      expect(t.linkCalls()).toHaveLength(2);
    });

    it("a rate-limited continuation keeps the first page and holds reads until GitHub's reset", async () => {
      const t = setup();
      const resetAt = Math.floor((dxNow + 5 * REFRESH_MS) / 1000);
      t.setLinks((call) => isPage2(call)
        ? { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) } }
        : { status: 200, body: firstPage(`${call.variables?.owner}/${call.variables?.name}`) });
      await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
      expect(refs(await t.watch("desk-tab"))).toEqual(["example-org/sample-app#52 open", "example-org/sample-app#50 merged"]);
      for (let at = 0; at < 5 * REFRESH_MS - 30_000; at += 30_000) { await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(30_000); }
      expect(t.linkCalls()).toHaveLength(2); // Nothing before the reset…
      await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(30_000);
      expect(t.linkCalls()).toHaveLength(4); // …then one fresh read (first page and its continuation).
    });

    it("a continuation failure that echoes the token keeps the rows and discloses nothing", async () => {
      const t = setup();
      t.github.state.override = (call) => {
        if (isPage2(call)) throw new Error("Authorization: Bearer synthetic-token");
        return isLinks(call) ? { status: 200, body: firstPage(`${call.variables?.owner}/${call.variables?.name}`) } : null;
      };
      await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
      const result = await t.watch("desk-tab");
      expect(refs(result)).toEqual(["example-org/sample-app#52 open", "example-org/sample-app#50 merged"]);
      expect(JSON.stringify(result)).not.toContain("synthetic-token");
      expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
    });
  });

  // Bug caught: the GitHub token reaches a panel through a link-read failure.
  it("never returns the token in a work-link failure", async () => {
    const t = setup();
    t.github.state.override = (call) => { if (isLinks(call)) throw new Error("Authorization: Bearer synthetic-token"); return null; };
    await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
    const result = await t.watch("desk-tab");
    expect(firstLinks(result).snapshot).toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
  });

  // Bug caught: work-link timers keep running after the plugin is disposed.
  it("stops reading when the backend is disposed", async () => {
    const t = setup();
    await t.watch("desk-tab"); await vi.advanceTimersByTimeAsync(0);
    await t.host.harness.lifecycle.dispose();
    hosts.splice(hosts.indexOf(t.host), 1);
    await vi.advanceTimersByTimeAsync(5 * REFRESH_MS);
    expect(t.linkCalls()).toHaveLength(1);
  });
});

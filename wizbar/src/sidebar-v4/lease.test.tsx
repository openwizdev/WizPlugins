// @vitest-environment jsdom
// B1 (#76): the sidebar's WizDeck lease against the real plugin backend. The
// real sidebar (registered thread list) and the real WizDeck panel call the
// backend's `deckWatch`/`deckRelease` through the SDK's fake host, on one fake
// clock, with D1's in-memory GitHub at the fetch boundary. Synthetic only.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import plugin from "../server";
import { dxFactory, dxNow, dxQueue, dxSettings, fakeGitHub } from "../deck/data/fixtures";
import { LEASE_MS, REFRESH_MS } from "../deck/data/cache";
import { WizDeckPanel } from "../deck/home/Panel";

const app = await loadPluginApp(() => import("../../app"));
const hosts: FakePluginHost[] = [];

function backend() {
  const github = fakeGitHub();
  vi.stubGlobal("fetch", github.fetch);
  const text = dxQueue();
  const read = vi.fn(async ({ path }: { path: string }) => ({
    content: text, contentEncoding: "utf8", path, sha256: createHash("sha256").update(text).digest("hex"), sizeBytes: text.length,
  }));
  const host = createFakePluginHost({
    pluginId: "wizbar", settings: dxSettings(),
    sdk: { files: { read, write: vi.fn() }, threads: { list: vi.fn(async () => []), get: vi.fn() } } as never,
  });
  hosts.push(host);
  plugin(host.bb);
  const answers: unknown[] = [];
  const forward = (method: string) => async (input: unknown) => {
    const answer = await host.harness.behavior.callRpc(method, input);
    answers.push(answer);
    return answer;
  };
  const rpc = { deckWatch: forward("deckWatch"), deckRefresh: forward("deckRefresh"), deckRelease: forward("deckRelease"),
    listLifecycle: () => ({ rows: [] }) };
  const boards = () => github.calls.filter((call) => call.kind === "board").length;
  return { host, github, rpc, boards, answers };
}

const context = { projectId: dxFactory.cloudroomProjectId, threadId: "thr_b1_any" };
const sidebar = (rpc: Record<string, unknown>) => renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery: "", onNavigate() {},
}, { context, rpc: rpc as never });
const panel = (rpc: Record<string, unknown>) =>
  renderSlot({ component: WizDeckPanel }, { threadId: "thr_b1_any", params: null as never }, { context, rpc: rpc as never });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(dxNow); hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
});
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("B1: the sidebar shares WizDeck's one cache and budget", () => {
  it("with the panel open too, makes one GitHub board read per 60-second interval", async () => {
    // Bug caught: the sidebar polling GitHub (or forcing refreshes) on its own.
    const t = backend();
    const bar = sidebar(t.rpc);
    const deck = panel(t.rpc);
    await advance(0);
    expect(t.boards()).toBe(1);
    await advance(REFRESH_MS);
    expect(t.boards()).toBe(2);
    await advance(REFRESH_MS);
    expect(t.boards()).toBe(3);
    // Two leases (sidebar and panel), never a refresh call from the sidebar.
    const clients = new Set([...bar.rpcCalls, ...deck.rpcCalls].filter(({ method }) => method === "deckWatch")
      .map(({ input }) => (input as { clientId: string }).clientId));
    expect(clients.size).toBe(2);
    expect(bar.rpcCalls.some(({ method }) => method === "deckRefresh")).toBe(false);
  });

  it("holds the shared schedule through a rate limit while the sidebar alone keeps it in use", async () => {
    // Bug caught: the sidebar's renewals turning into retries during a limit.
    const t = backend();
    sidebar(t.rpc);
    await advance(0);
    const resetAt = Math.floor((dxNow + 10 * REFRESH_MS) / 1000);
    t.github.state.override = (call) => call.kind === "board"
      ? { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) } } : null;
    await advance(REFRESH_MS);
    const afterLimit = t.github.calls.length;
    await advance(8 * REFRESH_MS);
    expect(t.github.calls.length).toBe(afterLimit);
  });

  it("stops reading once the sidebar unmounts, and lets its lease lapse while the page is hidden", async () => {
    // Bug caught: an unused sidebar keeping GitHub reads alive.
    const t = backend();
    const bar = sidebar(t.rpc);
    await advance(0);
    expect(t.boards()).toBe(1);
    bar.unmount();
    await advance(0);
    expect(bar.rpcCalls.some(({ method }) => method === "deckRelease")).toBe(true);
    await advance(5 * REFRESH_MS);
    expect(t.boards()).toBe(1);
    sidebar(t.rpc);
    await advance(0);
    expect(t.boards()).toBe(2);
    hidden = true;
    await advance(LEASE_MS + REFRESH_MS);
    const lapsed = t.boards();
    await advance(5 * REFRESH_MS);
    expect(t.boards()).toBe(lapsed);
  });

  it("never shows or receives the GitHub token when a read fails", async () => {
    // Bug caught: credential disclosure through the sidebar's deck answers.
    const t = backend();
    t.github.state.override = (call) => {
      if (call.kind === "board") throw new Error("socket hang up: authorization: Bearer synthetic-token");
      return null;
    };
    const bar = sidebar(t.rpc);
    await advance(0);
    await advance(REFRESH_MS);
    expect(t.answers.length).toBeGreaterThan(0);
    expect(JSON.stringify(t.answers)).not.toContain("synthetic-token");
    expect(bar.container.textContent).not.toContain("synthetic-token");
    expect(JSON.stringify(t.host.harness.inspection.realtimeSignals)).not.toContain("synthetic-token");
  });
});


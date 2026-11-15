// @vitest-environment jsdom
// B1 (#76, J88): the sidebar's owning-thread open against the real merged
// backend. The registered thread list calls the real plugin server (D1's
// readers and D2's `deckActionLog`, merged at c6b3db6c) through the SDK's fake
// host, with a synthetic binding, queue and threads. Synthetic only; not live.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import plugin from "../server";
import { dxFactory, dxNow, dxOtherFactory, dxQueue, dxSettings, fakeGitHub } from "../deck/data/fixtures";
import { HEARTBEAT_MS } from "../deck/home/useDeckHome";

const app = await loadPluginApp(() => import("../../app"));
const hosts: FakePluginHost[] = [];
const ORCHESTRATOR = dxFactory.orchestratorThreadId;
const thread = (overrides: Record<string, unknown> = {}) => ({
  id: ORCHESTRATOR, projectId: dxFactory.cloudroomProjectId, title: "Synthetic orchestrator", titleFallback: null,
  archivedAt: null, deletedAt: null, ...overrides,
});

function backend(get: (args: { threadId: string }) => Promise<unknown>, factories: unknown[] = [dxFactory]) {
  vi.stubGlobal("fetch", fakeGitHub().fetch);
  const text = dxQueue();
  const read = vi.fn(async ({ path }: { path: string }) => ({
    content: text, contentEncoding: "utf8", path, sha256: createHash("sha256").update(text).digest("hex"), sizeBytes: text.length,
  }));
  const send = vi.fn(async () => { throw new Error("no sends"); });
  const threadsGet = vi.fn(get);
  const host = createFakePluginHost({
    pluginId: "wizbar", settings: dxSettings(factories),
    sdk: { files: { read, write: vi.fn() }, threads: { list: vi.fn(async () => []), get: threadsGet, send } } as never,
  });
  hosts.push(host);
  plugin(host.bb);
  const forward = (method: string) => (input: unknown) => host.harness.behavior.callRpc(method, input);
  const rpc = { deckWatch: forward("deckWatch"), deckRelease: forward("deckRelease"), deckActionLog: forward("deckActionLog"),
    listLifecycle: () => ({ rows: [] }) };
  return { rpc, send, threadsGet };
}

const sidebar = (rpc: Record<string, unknown>) => renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery: "", onNavigate() {},
}, { context: { projectId: dxFactory.cloudroomProjectId, threadId: "thr_b1_elsewhere" }, rpc: rpc as never });
const openItem = () => screen.getByRole("button", { name: "Open N-12 in its owning thread: Which changelog headline ships?" }) as HTMLButtonElement;
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
/** The backend's first answer is still loading; the sidebar's next lease renewal reads the loaded queue. */
const loaded = async () => { await settle(); await act(async () => { await vi.advanceTimersByTimeAsync(HEARTBEAT_MS); }); };

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(dxNow); });
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("B1 (J88): owning thread through the merged D2 backend", () => {
  // Bug caught: the sidebar opening an unverified or guessed thread, or sending to it.
  it("opens the backend-verified orchestrator once, with no panel open and no send", async () => {
    const t = backend(async () => thread());
    const rendered = sidebar(t.rpc);
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Needs you · 1" }));
    await waitFor(() => expect(openItem().disabled).toBe(false));
    fireEvent.click(openItem());
    await waitFor(() => expect(rendered.sidebarActionCalls).toHaveLength(1));
    expect(rendered.sidebarActionCalls).toEqual([{ method: "open", threadId: ORCHESTRATOR, options: { split: false } }]);
    expect(rendered.navigateCalls).toEqual([]);
    expect(t.send).not.toHaveBeenCalled();
    // Verified when the list opened and again at the click, by the backend.
    expect(t.threadsGet.mock.calls.filter(([args]) => (args as { threadId: string }).threadId === ORCHESTRATOR).length).toBeGreaterThanOrEqual(2);
  });

  // Bug caught: a thread in another project, archived, deleted, a different
  // thread or an unreadable one treated as the owner.
  it.each([
    ["in another project", async () => thread({ projectId: dxOtherFactory.cloudroomProjectId })],
    ["archived", async () => thread({ archivedAt: dxNow - 1 })],
    ["deleted", async () => thread({ deletedAt: dxNow - 1 })],
    ["a different thread", async () => thread({ id: "thr_b1_someone_else" })],
    ["unreadable", async () => { throw new Error("Host unreachable."); }],
  ] as const)("keeps an orchestrator that is %s unavailable and never navigates", async (_, get) => {
    const t = backend(get);
    const rendered = sidebar(t.rpc);
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Needs you · 1" }));
    expect(await screen.findByText("Owning thread unavailable: nothing opens until it is verified.")).toBeDefined();
    expect(openItem().disabled).toBe(true);
    fireEvent.click(openItem());
    await settle();
    expect(rendered.sidebarActionCalls).toEqual([]);
    expect(rendered.navigateCalls).toEqual([]);
    expect(t.send).not.toHaveBeenCalled();
  });

  // Bug caught: a verdict from when the list opened opening a thread archived since.
  it("re-verifies at the click: an orchestrator archived after the list opened opens nothing", async () => {
    let archivedAt: number | null = null;
    const t = backend(async () => thread({ archivedAt }));
    const rendered = sidebar(t.rpc);
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Needs you · 1" }));
    await waitFor(() => expect(openItem().disabled).toBe(false));
    archivedAt = dxNow;
    fireEvent.click(openItem());
    expect(await screen.findByText("Owning thread unavailable: nothing opens until it is verified.")).toBeDefined();
    expect(rendered.sidebarActionCalls).toEqual([]);
  });
});

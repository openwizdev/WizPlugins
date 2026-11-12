// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { getSourceStatuses } from "./settings";
import { readRunningSource } from "./running-source";
import { positiveSource, positiveThreads as indicatorThreads } from "../../docs/evidence/wz5/fixtures";
import { v3Threads } from "./fixtures/v3";

// WZ20 (#41): the line counts the one running rule (runtime work, not waiting
// on you), so the shared WZ5 rows get runtime work behind their indicators.
const positiveThreads = indicatorThreads.map((thread) => thread.indicator === "none" ? thread
  : { ...thread, status: "active" as const, runtimeStatus: "active" as const });

const fixtureFeed = vi.hoisted(() => ({ current: null as Pick<PluginSidebarThreadsState, "status" | "threads"> | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) =>
    fixtureFeed.current ? { ...fixtureFeed.current, projects: [], sections: [], experimental_archived: null }
      : actual.experimental_useSidebarThreads(...args) };
});

const app = await loadPluginApp(() => import("../app"));
const { FooterCounter, FooterCounterArtwork } = await import("./FooterCounter");
const line = { component: FooterCounter };
const candidate = { component: FooterCounterArtwork };
const empty = { complete: true, threads: [], subagentsByThread: new Map<string, number>() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); fixtureFeed.current = null; });

describe("W3: synthetic footer artwork through the SDK rendering harness", () => {
  it("shows a dim zero with a stopped spinner", () => {
    const rendered = renderSlot(candidate, { source: empty });
    const counter = screen.getByRole("status", { name: "0 running" });
    expect(counter.textContent).toBe("0");
    expect(counter.style.color).toBe("var(--muted-foreground)");
    expect(rendered.container.querySelector("svg")?.style.animation).toBe("");
    fireEvent.mouseEnter(counter);
    expect(screen.getByRole("tooltip").textContent).toBe("0 threads, 0 subagents");
  });
  it("shows a total, spinning icon and split on hover, with inert clicks", () => {
    const rendered = renderSlot(candidate, { source: positiveSource });
    const counter = screen.getByRole("status", { name: "5 running" });
    expect(counter.textContent).toBe("5");
    expect(rendered.container.querySelector("svg")?.style.animation).toContain("wizbar-running-spin");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(counter);
    expect(screen.getByRole("tooltip").textContent).toBe("2 threads, 3 subagents");
    fireEvent.click(counter);
    expect(screen.getByRole("status", { name: "5 running" })).toBe(counter);
    expect(rendered.sidebarActionCalls).toEqual([]);
    expect(rendered.navigateCalls).toEqual([]);
    expect(rendered.rpcCalls).toEqual([]);
    expect(rendered.sdkCalls).toEqual([]);
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.mouseLeave(counter);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(counter);
    expect(screen.getByRole("tooltip").textContent).toBe("2 threads, 3 subagents");
    fireEvent.blur(counter);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("updates from five to zero and clears old numbers/splits when inputs become unknown", () => {
    const rendered = renderSlot(candidate, { source: positiveSource });
    fireEvent.mouseEnter(screen.getByRole("status"));
    rendered.rerender(<FooterCounterArtwork source={empty} />);
    expect(screen.getByRole("status", { name: "0 running" })).toBeDefined();
    expect(screen.getByRole("tooltip").textContent).toBe("0 threads, 0 subagents");
    for (const source of [null, { ...positiveSource, complete: false }, { ...positiveSource, subagentsByThread: null }]) {
      rendered.rerender(<FooterCounterArtwork source={source} />);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("tooltip")).toBeNull();
    }
    rendered.rerender(<FooterCounterArtwork source={positiveSource} />);
    expect(screen.getByRole("status", { name: "5 running" })).toBeDefined();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("does not narrow synthetic input when inbox search, project and shelves change", async () => {
    const rawThreads = positiveThreads;
    const footer = renderSlot(line, {}, {
      sidebarThreads: { status: "ready", threads: rawThreads },
    });
    const inbox = renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: false,
      searchQuery: "", onNavigate() {},
    }, {
      sidebarThreads: { status: "ready", threads: rawThreads, projects: [
        { id: "sample-project-a", name: "Sample A", isPersonal: false, href: "/projects/sample-project-a", settingsHref: "/projects/sample-project-a/settings" },
        { id: "sample-project-b", name: "Sample B", isPersonal: false, href: "/projects/sample-project-b", settingsHref: "/projects/sample-project-b/settings" },
      ] },
      rpc: { listLifecycle: () => ({ rows: [
        { threadId: "sample-parent", settledAt: null, snoozedUntil: null, snoozedAt: null, mutedAt: 200, muteAttentionAt: 100 },
        { threadId: "sample-child", settledAt: null, snoozedUntil: Date.now() + 60000, snoozedAt: 200 },
        { threadId: "sample-idle", settledAt: 200, snoozedUntil: null, snoozedAt: null },
      ] }) },
    });
    await screen.findByRole("region", { name: "Muted" });
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(shelf.querySelector("button")!);
    expect(footer.container.querySelector('[role="status"]')?.textContent).toBe("2");
    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Sample B" }));
    inbox.rerender(createElement(app.threadLists[0]!.component, {
      activeThreadId: null, activeProjectId: "sample-project-b", isCompactViewport: false,
      searchQuery: "no matching row", onNavigate() {},
    }));
    expect(inbox.container.querySelectorAll('[role="listitem"]')).toHaveLength(0);
    expect(footer.container.querySelector('[role="status"]')?.textContent).toBe("2");
  });
});

// N4: the historical artwork tests never mounted a connected production source.
// These proofs fail if the app remains unwired or promotes observable coverage to live.
describe("N4: approved observable footer route", () => {
  const icon = line;
  // WZ20 (#41): one disclosure with a named host icon and a fixed label
  // replaces the no-op action and its count artwork icon.
  it("registers one fixed-label disclosure on the host's bolt icon and no count artwork", () => {
    expect(app.sidebarFooterActions).toEqual([]);
    expect(app.icons).toEqual([]);
    expect(app.experimentalSidebarFooterItems).toHaveLength(1);
    // The harness adds its own `runtime` and `source`; the rest is the registration.
    const { runtime: _runtime, source: _source, ...item } = app.experimentalSidebarFooterItems[0]! as typeof app.experimentalSidebarFooterItems[0] & { source?: string };
    expect(item).toEqual({ id: "stats", kind: "disclosure", label: "WizBar stats", icon: "Zap", component: expect.any(Function) });
    renderSlot({ component: item.kind === "disclosure" ? item.component : () => null }, { dismiss() {} }, {
      sidebarThreads: { status: "ready", threads: v3Threads },
    });
    expect(app.experimentalSidebarFooterItems).toHaveLength(1);
    expect(app.experimentalSidebarFooterItems[0]!.label).toBe("WizBar stats");
  });

  it("reads raw observable projects/children and publishes unverified coverage", () => {
    const rendered = renderSlot({ component: icon.component }, {}, {
      pluginId: "synthetic-running-source", sidebarThreads: { status: "ready", threads: [...positiveThreads, positiveThreads[0]!] },
    });
    const counter = screen.getByRole("status", { name: "2 running" });
    expect(counter.textContent).toBe("2");
    expect(getSourceStatuses("synthetic-running-source").footer).toBe("unverified");
    fireEvent.mouseEnter(counter);
    expect(screen.getByRole("tooltip").textContent).toBe("2 running · subagents not counted yet · some threads may be unseen");
    fireEvent.click(counter);
    expect(rendered.sdkCalls).toEqual([]);
    expect(rendered.rpcCalls).toEqual([]);
    expect(rendered.navigateCalls).toEqual([]);
    rendered.unmount();
    expect(getSourceStatuses("synthetic-running-source").footer).toBe("unavailable");
  });

  it.each(["loading", "error"] as const)("renders no number and reports unavailable for %s with retained rows", (status) => {
    const pluginId = `synthetic-running-${status}`;
    const rendered = renderSlot({ component: icon.component }, {}, {
      pluginId, sidebarThreads: { status, threads: positiveThreads },
    });
    expect(rendered.container.innerHTML).toBe("");
    expect(getSourceStatuses(pluginId).footer).toBe("unavailable");
  });

  it("keeps source status independent of WZ11's disabled visibility and reconnects", async () => {
    const pluginId = "synthetic-hidden-running";
    const rendered = renderSlot({ component: icon.component }, {}, {
      pluginId, settings: { footerCountEnabled: false },
      sidebarThreads: { status: "ready", threads: positiveThreads },
    });
    expect(rendered.container.innerHTML).toBe("");
    expect(getSourceStatuses(pluginId).footer).toBe("unverified");
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(getSourceStatuses(pluginId).footer).toBe("unavailable");
    expect(rendered.container.innerHTML).toBe("");
  });

  it.each(["artwork", "list"])("updates %s from host snapshots and rejects stale reuse after reconnect/error", async (view) => {
    const View = () => view === "list"
      ? createElement(app.threadLists[0]!.component, {
        activeThreadId: null, activeProjectId: null, isCompactViewport: false,
        searchQuery: "", onNavigate() {},
      }) : createElement(icon.component);
    fixtureFeed.current = { status: "ready", threads: positiveThreads };
    const pluginId = `synthetic-updating-footer-${view}`;
    const rendered = renderSlot({ component: View }, {}, { pluginId, rpc: { listLifecycle: () => ({ rows: [] }) } });
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(screen.queryByRole("status", { name: /^\d+ running$/ })).toBeNull();
    await rendered.setRealtimeConnectionState("connected");
    expect(screen.queryByRole("status", { name: /^\d+ running$/ }), "reconnect alone cannot certify the old cache").toBeNull();
    expect(getSourceStatuses(pluginId).footer).toBe("unavailable");
    fixtureFeed.current = { status: "ready", threads: [] };
    rendered.rerender(createElement(View));
    expect(screen.getByRole("status", { name: "0 running" })).toBeDefined();
    expect(getSourceStatuses(pluginId).footer).toBe("unverified");
    fixtureFeed.current = { ...fixtureFeed.current, status: "error" };
    rendered.rerender(createElement(View));
    expect(screen.queryByRole("status", { name: /^\d+ running$/ })).toBeNull();
    fixtureFeed.current = { ...fixtureFeed.current, status: "ready" };
    rendered.rerender(createElement(View));
    expect(screen.queryByRole("status", { name: /^\d+ running$/ }), "error recovery needs a new host snapshot").toBeNull();
    fixtureFeed.current = { status: "ready", threads: [...positiveThreads] };
    rendered.rerender(createElement(View));
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
    expect(getSourceStatuses(pluginId).footer).toBe("unverified");
  });

  it("updates observable artwork to dim zero, clears stale hover on failure and discloses thread-only input", () => {
    const valid = readRunningSource({ status: "ready", threads: positiveThreads }, "connected");
    const rendered = renderSlot(candidate, { source: valid });
    fireEvent.mouseEnter(screen.getByRole("status", { name: "2 running" }));
    const empty = readRunningSource({ status: "ready", threads: [] }, "connected");
    rendered.rerender(<FooterCounterArtwork source={empty} />);
    const zero = screen.getByRole("status", { name: "0 running" });
    expect(zero.style.color).toBe("var(--muted-foreground)");
    expect(rendered.container.querySelector("svg")?.style.animation).toBe("");
    expect(screen.getByRole("tooltip").textContent).toBe("0 running · subagents not counted yet · some threads may be unseen");
    rendered.rerender(<FooterCounterArtwork source={readRunningSource({ status: "error", threads: positiveThreads }, "connected")} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    rendered.rerender(<FooterCounterArtwork source={valid} />);
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByRole("status"));
    expect(screen.getByRole("tooltip").textContent).toContain("subagents not counted yet");
  });
});

// WZ20 (#41): the list-bottom line moves to the contract's one running rule:
// runtime work by the shared fact, and not waiting on you.
describe("V3: the list-bottom line counts the one running rule", () => {
  const base = v3Threads.find(({ id }) => id === "thr_v3_pinned_idle")!;
  it("shows the stats panel's running total for the fixture rows", () => {
    renderSlot(line, {}, { sidebarThreads: { status: "ready", threads: v3Threads } });
    expect(screen.getByRole("status", { name: "4 running" }).textContent).toBe("4");
  });
  it.each([
    ["busy but waiting on you", { hasPendingInteraction: true, indicator: "waiting-for-input" as const,
      activity: { ...base.activity, backgroundCommands: 1 } }, "0"],
    ["an attention indicator over an idle runtime", { indicator: "runtime" as const }, "0"],
    ["runtime work behind no indicator", { status: "active" as const, runtimeStatus: "active" as const }, "1"],
  ])("counts %s by runtime work, not the indicator", (_, overrides, expected) => {
    renderSlot(line, {}, { sidebarThreads: { status: "ready", threads: [{ ...base, ...overrides }] } });
    expect(screen.getByRole("status", { name: `${expected} running` }).textContent).toBe(expected);
  });
  it("hides the number when a row's runtime status is unrecognised", () => {
    const rendered = renderSlot(line, {}, { sidebarThreads: { status: "ready",
      threads: [...v3Threads, { ...base, id: "thr_v3_future", runtimeStatus: "host-reconnecting" as never }] } });
    expect(rendered.container.innerHTML).toBe("");
  });
});

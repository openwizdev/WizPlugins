// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { getSourceStatuses } from "./settings";
import { readRunningSource } from "./running-source";
import { positiveSource, positiveThreads } from "../../docs/evidence/wz5/fixtures";

const fixtureFeed = vi.hoisted(() => ({ current: null as Pick<PluginSidebarThreadsState, "status" | "threads"> | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) =>
    fixtureFeed.current ? { ...fixtureFeed.current, projects: [], sections: [], experimental_archived: null }
      : actual.experimental_useSidebarThreads(...args) };
});

const app = await loadPluginApp(() => import("../app"));
const { FooterCounterArtwork } = await import("./FooterCounter");
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
    const footer = renderSlot({ component: app.icons.find(({ name }) => name === "wizbar-running-count")!.component }, {}, {
      sidebarThreads: { status: "ready", threads: positiveThreads },
    });
    const inbox = renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: false,
      searchQuery: "", onNavigate() {},
    }, {
      sidebarThreads: { status: "ready", threads: positiveThreads, projects: [
        { id: "sample-project-a", name: "Sample A", isPersonal: false, href: "/projects/sample-project-a", settingsHref: "/projects/sample-project-a/settings" },
        { id: "sample-project-b", name: "Sample B", isPersonal: false, href: "/projects/sample-project-b", settingsHref: "/projects/sample-project-b/settings" },
      ] },
      rpc: { listLifecycle: () => ({ rows: [
        { threadId: "sample-parent", settledAt: 200, snoozedUntil: null, snoozedAt: null },
        { threadId: "sample-child", settledAt: null, snoozedUntil: Date.now() + 60000, snoozedAt: 200 },
        { threadId: "sample-idle", settledAt: 200, snoozedUntil: null, snoozedAt: null },
      ] }) },
    });
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
  const icon = app.icons.find(({ name }) => name === "wizbar-running-count")!;
  it("registers numeric artwork in one no-op action, with no disclosure", () => {
    expect(app.sidebarFooterActions).toEqual([]);
    expect(app.experimentalSidebarFooterItems).toHaveLength(1);
    const action = app.experimentalSidebarFooterItems[0]!;
    expect(action.kind).toBe("action");
    expect(action.icon).toBe("wizbar-running-count");
    expect(action.label).toBe("Running · subagents not counted yet · some threads may be unseen");
    const openPluginDetails = vi.fn();
    if (action.kind !== "action") throw new Error("Expected approved no-op action");
    action.onActivate({ openPluginDetails });
    expect(openPluginDetails).not.toHaveBeenCalled();
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

  it("updates from host snapshots and rejects stale reuse after reconnect/error", async () => {
    fixtureFeed.current = { status: "ready", threads: positiveThreads };
    const pluginId = "synthetic-updating-footer";
    const rendered = renderSlot({ component: icon.component }, {}, { pluginId });
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(screen.queryByRole("status")).toBeNull();
    await rendered.setRealtimeConnectionState("connected");
    expect(screen.queryByRole("status"), "reconnect alone cannot certify the old cache").toBeNull();
    expect(getSourceStatuses(pluginId).footer).toBe("unavailable");
    fixtureFeed.current = { status: "ready", threads: [] };
    rendered.rerender(createElement(icon.component));
    expect(screen.getByRole("status", { name: "0 running" })).toBeDefined();
    expect(getSourceStatuses(pluginId).footer).toBe("unverified");
    fixtureFeed.current = { ...fixtureFeed.current, status: "error" };
    rendered.rerender(createElement(icon.component));
    expect(screen.queryByRole("status")).toBeNull();
    fixtureFeed.current = { ...fixtureFeed.current, status: "ready" };
    rendered.rerender(createElement(icon.component));
    expect(screen.queryByRole("status"), "error recovery needs a new host snapshot").toBeNull();
    fixtureFeed.current = { status: "ready", threads: [...positiveThreads] };
    rendered.rerender(createElement(icon.component));
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

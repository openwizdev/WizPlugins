// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
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
const { FOOTER_HOLD_MS, FooterCounter, FooterCounterArtwork } = await import("./FooterCounter");
const line = { component: FooterCounter };
const candidate = { component: FooterCounterArtwork };
const empty = { complete: true, threads: [], subagentsByThread: new Map<string, number>() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); fixtureFeed.current = null; });
/** R1 (#172): a source gap holds the last count; past the hold, with the card closed, it is dropped. */
const outlastHold = () => act(() => { vi.advanceTimersByTime(FOOTER_HOLD_MS); });
const fakeTimers = () => vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });

describe("W3: synthetic footer artwork through the SDK rendering harness", () => {
  // WB4-3 (#1437): the spinner is now a matrix mark, idle at zero.
  it("shows a dim zero with an idle mark", () => {
    renderSlot(candidate, { source: empty });
    const counter = screen.getByRole("status", { name: "0 running" });
    expect(counter.textContent).toBe("0 running");
    expect(counter.style.color).toBe("var(--muted-foreground, #b7b7b7)");
    expect(counter.querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("idle");
  });
  it("updates from five to zero and clears old numbers once unknown inputs outlast the hold", () => {
    fakeTimers();
    const rendered = renderSlot(candidate, { source: positiveSource });
    rendered.rerender(<FooterCounterArtwork source={empty} />);
    expect(screen.getByRole("status", { name: "0 running" })).toBeDefined();
    for (const source of [null, { ...positiveSource, complete: false }, { ...positiveSource, subagentsByThread: null }]) {
      rendered.rerender(<FooterCounterArtwork source={source} />);
      expect(screen.getByRole("status", { name: "0 running" }), "held through a brief gap").toBeDefined();
    }
    outlastHold();
    expect(screen.queryByRole("status")).toBeNull();
    rendered.rerender(<FooterCounterArtwork source={positiveSource} />);
    expect(screen.getByRole("status", { name: "5 running" })).toBeDefined();
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
    expect(footer.container.querySelector('[role="status"]')?.textContent).toBe("2 running");
    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Sample B" }));
    inbox.rerender(createElement(app.threadLists[0]!.component, {
      activeThreadId: null, activeProjectId: "sample-project-b", isCompactViewport: false,
      searchQuery: "no matching row", onNavigate() {},
    }));
    expect(inbox.container.querySelectorAll('[role="listitem"]')).toHaveLength(0);
    expect(footer.container.querySelector('[role="status"]')?.textContent).toBe("2 running");
  });
});

// N4: the historical artwork tests never mounted a connected production source.
// These proofs fail if the app remains unwired or promotes observable coverage to live.
// Snapshot validity is plugin-wide (review R1): a test that puts rows through a
// gap passes its own copy, as a host would hand over a new snapshot.
describe("N4: approved observable footer route", () => {
  const icon = line;
  it("reads raw observable projects/children and publishes unverified coverage", () => {
    const rendered = renderSlot({ component: icon.component }, {}, {
      pluginId: "synthetic-running-source", sidebarThreads: { status: "ready", threads: [...positiveThreads, positiveThreads[0]!] },
    });
    const counter = screen.getByRole("status", { name: "2 running" });
    expect(counter.textContent).toBe("2 running");
    expect(getSourceStatuses("synthetic-running-source").footer).toBe("unverified");
    expect(rendered.sdkCalls).toEqual([]);
    expect(rendered.navigateCalls).toEqual([]);
    rendered.unmount();
    expect(getSourceStatuses("synthetic-running-source").footer).toBe("unavailable");
  });

  it.each(["loading", "error"] as const)("renders no number and reports unavailable for %s with retained rows", (status) => {
    const pluginId = `synthetic-running-${status}`;
    const rendered = renderSlot({ component: icon.component }, {}, {
      pluginId, sidebarThreads: { status, threads: [...positiveThreads] },
    });
    expect(rendered.container.innerHTML).toBe("");
    expect(getSourceStatuses(pluginId).footer).toBe("unavailable");
  });

  it("keeps source status independent of WZ11's disabled visibility and reconnects", async () => {
    const pluginId = "synthetic-hidden-running";
    const rendered = renderSlot({ component: icon.component }, {}, {
      pluginId, settings: { footerCountEnabled: false },
      sidebarThreads: { status: "ready", threads: [...positiveThreads] },
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
    fixtureFeed.current = { status: "ready", threads: [...positiveThreads] };
    const pluginId = `synthetic-updating-footer-${view}`;
    fakeTimers();
    const rendered = renderSlot({ component: View }, {}, { pluginId, rpc: { listLifecycle: () => ({ rows: [] }) } });
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(screen.getByRole("status", { name: "2 running" }), "held through a brief gap").toBeDefined();
    expect(getSourceStatuses(pluginId).footer).toBe("unavailable");
    outlastHold();
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
    outlastHold();
    expect(screen.queryByRole("status", { name: /^\d+ running$/ })).toBeNull();
    fixtureFeed.current = { ...fixtureFeed.current, status: "ready" };
    rendered.rerender(createElement(View));
    expect(screen.queryByRole("status", { name: /^\d+ running$/ }), "error recovery needs a new host snapshot").toBeNull();
    fixtureFeed.current = { status: "ready", threads: [...positiveThreads] };
    rendered.rerender(createElement(View));
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
    expect(getSourceStatuses(pluginId).footer).toBe("unverified");
  });

  // WB4-3 (#1437): the thread-only tooltip is now the hover card (footer-card.test.tsx).
  it("updates observable artwork to dim zero and hides it on failure", () => {
    fakeTimers();
    const valid = readRunningSource({ status: "ready", threads: positiveThreads }, "connected");
    const rendered = renderSlot(candidate, { source: valid });
    const empty = readRunningSource({ status: "ready", threads: [] }, "connected");
    rendered.rerender(<FooterCounterArtwork source={empty} />);
    const zero = screen.getByRole("status", { name: "0 running" });
    expect(zero.style.color).toBe("var(--muted-foreground, #b7b7b7)");
    expect(zero.querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("idle");
    rendered.rerender(<FooterCounterArtwork source={readRunningSource({ status: "error", threads: positiveThreads }, "connected")} />);
    outlastHold();
    expect(screen.queryByRole("status")).toBeNull();
    rendered.rerender(<FooterCounterArtwork source={valid} />);
    expect(screen.getByRole("status", { name: "2 running" })).toBeDefined();
  });
});

// WZ20 (#41): the list-bottom line moves to the contract's one running rule:
// runtime work by the shared fact, and not waiting on you.
describe("V3: the list-bottom line counts the one running rule", () => {
  const base = v3Threads.find(({ id }) => id === "thr_v3_pinned_idle")!;
  it("shows the stats panel's running total for the fixture rows", () => {
    renderSlot(line, {}, { sidebarThreads: { status: "ready", threads: v3Threads } });
    expect(screen.getByRole("status", { name: "4 running, 3 waiting on you" }).textContent).toBe("4 running · 3 waiting on you");
  });
  it.each([
    ["busy but waiting on you", { hasPendingInteraction: true, indicator: "waiting-for-input" as const,
      activity: { ...base.activity, backgroundCommands: 1 } }, "0 running, 1 waiting on you", "0 running · 1 waiting on you"],
    ["an attention indicator over an idle runtime", { indicator: "runtime" as const }, "0 running", "0 running"],
    ["runtime work behind no indicator", { status: "active" as const, runtimeStatus: "active" as const }, "1 running", "1 running"],
  ])("counts %s by runtime work, not the indicator", (_, overrides, expectedLabel, expectedText) => {
    renderSlot(line, {}, { sidebarThreads: { status: "ready", threads: [{ ...base, ...overrides }] } });
    expect(screen.getByRole("status", { name: expectedLabel }).textContent).toBe(expectedText);
  });
  it("hides the number when a row's runtime status is unrecognised", () => {
    const rendered = renderSlot(line, {}, { sidebarThreads: { status: "ready",
      threads: [...v3Threads, { ...base, id: "thr_v3_future", runtimeStatus: "host-reconnecting" as never }] } });
    expect(rendered.container.innerHTML).toBe("");
  });
});

describe("footer summary: waiting on you and live GitHub agents", () => {
  it("shows waiting on you in warning colour and live GitHub agents in muted text when non-zero", async () => {
    const now = Date.now();
    const stamp = new Date(now - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const repo = "example/sample-factory";
    const binding = JSON.stringify([{
      projectKey: "sample-factory", cloudroomProjectId: "prj_sample", repositories: [repo],
      home: { hostId: "hst_sample", rootPath: "/synthetic/sample" },
      orchestratorThreadId: "thr_orch", statusWriterLogin: "sample-writer",
    }]);
    const agents = [
      { repository: repo, ticket: `${repo}#101`, commentId: 1, agent: "builder", harness: "Synthetic",
        model: "Sample", state: "working", live: true, step: "Building", updatedAt: stamp, time: stamp },
      { repository: repo, ticket: `${repo}#102`, commentId: 2, agent: "reviewer", harness: "Synthetic",
        model: "Sample", state: "working", live: true, step: "Reviewing", updatedAt: stamp, time: stamp },
      { repository: repo, ticket: `${repo}#103`, commentId: 3, agent: "builder", harness: "Synthetic",
        model: "Sample", state: "done", live: false, step: "Done", updatedAt: stamp, time: stamp },
    ];
    renderSlot(line, {}, {
      pluginId: "synthetic-footer-github",
      settings: { wizdeckFactories: binding },
      sidebarThreads: { status: "ready", threads: v3Threads },
      rpc: {
        agentsFile: () => ({ kind: "content", text: JSON.stringify({ version: 1, generatedAt: stamp, agents }) }),
      } as never,
    });
    const status = await screen.findByRole("status", { name: "4 running, 3 waiting on you, 2 on GitHub" });
    expect(status.textContent).toBe("4 running · 3 waiting on you · 2 on GitHub");
    const waiting = status.querySelector("[data-waiting-on-you]") as HTMLElement;
    const github = status.querySelector("[data-on-github]") as HTMLElement;
    expect(waiting.style.color).toContain("--warning");
    expect(github.style.color).toContain("--muted-foreground");
  });

  it("drops the GitHub part first, then shortens waiting on you to waiting when narrow", () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      const text = this.textContent ?? "";
      return text.includes("on GitHub") ? 290 : text.includes("waiting on you") ? 240 : 180;
    });
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(250);
    try {
      const rendered = renderSlot(candidate, { source: positiveSource, waitingOnYou: 1, onGitHub: 3 });
      const status = screen.getByRole("status", { name: "5 running, 1 waiting on you, 3 on GitHub" });
      expect(status.textContent).toBe("5 running · 1 waiting on you");
      expect(status.querySelector("[data-on-github]")).toBeNull();
      expect(status.querySelector("[data-waiting-on-you]")?.textContent).toBe("1 waiting on you");

      clientWidth.mockReturnValue(200);
      rendered.rerender(<FooterCounterArtwork source={positiveSource} waitingOnYou={2} onGitHub={3} />);
      const narrowed = screen.getByRole("status", { name: "5 running, 2 waiting on you, 3 on GitHub" });
      expect(narrowed.textContent).toBe("5 running · 2 waiting");
      expect(narrowed.querySelector("[data-on-github]")).toBeNull();
      expect(narrowed.querySelector("[data-waiting-on-you]")?.textContent).toBe("2 waiting");
    } finally {
      scrollWidth.mockRestore();
      clientWidth.mockRestore();
    }
  });
});

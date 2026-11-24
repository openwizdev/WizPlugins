// @vitest-environment jsdom
// WZ20 (#41), WB4-3 (#1437): the stats card, now the hover card on "N running"
// (specs-section.v1.md section 7), over the plugin-wide rows reader. Expected
// text is the card's summary over the hand-worked fixture numbers (`v3Stats`:
// 4 running, 1/2/1, 3 waiting).
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import { v3Threads } from "./fixtures/v3";
import { v4Now, v4SpecsFileText, v4Threads } from "./fixtures/v4";

// Lets a test hand the hook the same or a new host snapshot across rerenders.
// Like the host's per-hook projection, each hook instance builds its own array
// and its own row objects (kept per instance while a source row is unchanged),
// so no two consumers ever share an array or a row object.
const fixtureFeed = vi.hoisted(() => ({ current: null as Pick<PluginSidebarThreadsState, "status" | "threads"> | null }));
// WB4-10: lets a test switch the bound factory under a mounted card (the harness's settings are fixed per render).
const settingsFeed = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  const { useRef } = await import("react");
  return { ...actual, useSettings: () => settingsFeed.current ? { values: settingsFeed.current, isLoading: false } : actual.useSettings(),
    experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) => {
    const projections = useRef(new WeakMap<PluginSidebarThread, PluginSidebarThread>());
    const real = actual.experimental_useSidebarThreads(...args);
    if (!fixtureFeed.current) return real;
    const threads = fixtureFeed.current.threads.map((row) => {
      let projected = projections.current.get(row);
      if (!projected) projections.current.set(row, projected = { ...row });
      return projected;
    });
    return { ...fixtureFeed.current, threads, projects: [], sections: [], experimental_archived: null };
  } };
});
/** New row objects with the fixture's values (the same data, re-projected). */
const fresh = () => v3Threads.map((thread) => ({ ...thread }));
/** A new host snapshot: one row's revision moved on. */
const changed = () => v3Threads.map((thread, i) => ({ ...thread, updatedAt: thread.updatedAt + (i === 0 ? 1 : 0) }));

const { FOOTER_HOLD_MS, FooterCounter, useObservableRows } = await import("./FooterCounter");
const { StatsPanel } = await import("./StatsPanel");
// The card as the running line mounts it: over the plugin-wide rows reader.
function Panel(_: { dismiss(): void }) {
  return createElement(StatsPanel, { rows: useObservableRows().rows });
}
const panel = { component: Panel };
const props = { dismiss() {} };
afterEach(() => { cleanup(); fixtureFeed.current = null; settingsFeed.current = null; vi.useRealTimers(); });

const lines = () => [...(screen.queryByRole("region", { name: "Running threads" })?.querySelectorAll("p") ?? [])].map((p) => p.textContent);
const fixtureLine = "4 running · 3 waiting on you · 1 cloud, 2 local, 1 unknown";

describe("V3: footer stats panel", () => {
  it("shows the contract's numbers and coverage disclosures for the fixture", () => {
    const rendered = renderSlot(panel, props, { sidebarThreads: { status: "ready", threads: v3Threads } });
    expect(lines()).toEqual([fixtureLine, "4 awake · 0 starting · 8 asleep"]);
    expect(rendered.sdkCalls).toEqual([]);
    expect(rendered.rpcCalls.map(({ method }) => method)).toEqual(["cardModels"]);
    expect(rendered.navigateCalls).toEqual([]);
  });

  const unknownRuntime = [...v3Threads, { ...v3Threads[0]!, id: "thr_v3_future", runtimeStatus: "host-reconnecting" as never }];
  it.each([
    ["loading", { status: "loading" as const, threads: fresh() }],
    ["error", { status: "error" as const, threads: fresh() }],
    ["an unrecognised runtime status", { status: "ready" as const, threads: unknownRuntime as PluginSidebarThread[] }],
  ])("shows a plain unavailable state, never a number, for %s", (_, sidebarThreads) => {
    renderSlot(panel, props, { sidebarThreads });
    expect(lines()).toEqual(["Stats unavailable"]);
  });

  it("drops its numbers when the realtime connection is lost", async () => {
    const rendered = renderSlot(panel, props, { sidebarThreads: { status: "ready", threads: fresh() } });
    expect(lines()[0]).toBe(fixtureLine);
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(lines()[0]).toBe("Stats unavailable");
    await rendered.setRealtimeConnectionState("connected");
    expect(lines()[0], "a reconnect alone cannot certify the retained rows").toBe("Stats unavailable");
  });

  // R1: snapshot validity is the plugin's, not one component's. The card
  // mounts only when it opens, after a gap the line observed.
  it("opens unavailable after a gap the list line saw, until a new snapshot arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    fixtureFeed.current = { status: "ready", threads: fresh() };
    const View = ({ open }: { open: boolean }) => createElement("div", null,
      createElement(FooterCounter), open ? createElement(Panel, props) : null);
    const rendered = renderSlot({ component: View }, { open: false }, { pluginId: "synthetic-wz20-gap" });
    expect(screen.getByRole("status", { name: "4 running" })).toBeDefined();
    await rendered.setRealtimeConnectionState("reconnecting");
    await rendered.setRealtimeConnectionState("connected");
    // R1 (#172): the line holds its last count through a brief gap, then drops it.
    expect(screen.getByRole("status", { name: "4 running" })).toBeDefined();
    act(() => { vi.advanceTimersByTime(FOOTER_HOLD_MS); });
    rendered.rerender(createElement(View, { open: true }));
    expect(screen.queryByRole("status", { name: /running$/ })).toBeNull();
    expect(lines()[0]).toBe("Stats unavailable");
    // The same retained data in new arrays and new row objects (any consumer's
    // own projection) still does not clear the gap.
    fixtureFeed.current = { status: "ready", threads: fresh() };
    rendered.rerender(createElement(View, { open: true }));
    expect(lines()[0]).toBe("Stats unavailable");
    expect(screen.queryByRole("status", { name: /running$/ })).toBeNull();
    // Closed and reopened: a newly mounted panel's projection cannot clear it.
    rendered.rerender(createElement(View, { open: false }));
    rendered.rerender(createElement(View, { open: true }));
    expect(lines()[0]).toBe("Stats unavailable");
    fixtureFeed.current = { status: "ready", threads: changed() };
    rendered.rerender(createElement(View, { open: true }));
    expect(lines()[0]).toBe(fixtureLine);
    expect(screen.getByRole("status", { name: "4 running" })).toBeDefined();
  });

  // R2: the waiting flag decides running versus waiting, so a malformed one
  // makes both surfaces unavailable instead of guessing the split.
  it.each([
    ["missing", undefined],
    ["the string \"false\"", "false"],
  ])("is unavailable on both surfaces when the waiting flag is %s", (_, flag) => {
    const active = { ...v3Threads.find(({ id }) => id === "thr_v3_pinned_idle")!, status: "active", runtimeStatus: "active", hasPendingInteraction: flag };
    renderSlot({ component: () => createElement("div", null, createElement(FooterCounter), createElement(Panel, props)) }, {}, {
      sidebarThreads: { status: "ready", threads: [active as unknown as PluginSidebarThread] },
    });
    expect(lines()[0]).toBe("Stats unavailable");
    expect(screen.queryByRole("status", { name: /running$/ })).toBeNull();
  });

  // R3: duplicates are compared on the running rule's facts, never the indicator.
  it.each([
    ["agree on runtime work but differ only in indicator", "none", "active", "1 running · 0 waiting on you · 0 cloud, 1 local", "1 running"],
    ["genuinely conflict on runtime work", "runtime", "idle", "Stats unavailable", null],
  ])("counts duplicate rows that %s by the running rule", (_, indicator, runtimeStatus, panelLine, lineName) => {
    const row = { ...v3Threads.find(({ id }) => id === "thr_v3_pinned_idle")!, status: "active" as const, runtimeStatus: "active" as const, indicator: "runtime" as const };
    const copy = { ...row, indicator, runtimeStatus } as PluginSidebarThread;
    renderSlot({ component: () => createElement("div", null, createElement(FooterCounter), createElement(Panel, props)) }, {}, {
      sidebarThreads: { status: "ready", threads: [row, copy] },
    });
    expect(lines()[0]).toBe(panelLine);
    if (lineName) expect(screen.getByRole("status", { name: lineName })).toBeDefined();
    else expect(screen.queryByRole("status", { name: /running$/ })).toBeNull();
  });
});

// WB4-10 (openwizdev/OpenWiz#1585), #1534: the card's specs read follows the bound factory.
const factory = (rootPath: string) => ({ wizdeckFactories: JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas",
  repositories: ["example/sample-plans"], home: { hostId: "hst_v4_home", rootPath }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]) });

describe("WB4-10: the card's spec names follow the bound factory", () => {
  // catches: a switch between two valid bindings that keeps the old factory's spec names, never reads the
  // new one, or lets the old binding's late answer overwrite the new one.
  it("clears the old names at once, reads the new factory and drops the old binding's late answer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    fixtureFeed.current = { status: "ready", threads: [...v4Threads] };
    settingsFeed.current = factory("/synthetic/home-a");
    const answers: Array<(text: string) => void> = [];
    const rendered = renderSlot(panel, props, { rpc: {
      specsFile: () => new Promise((resolve) => answers.push((text) => resolve({ kind: "content", text }))),
      cardModels: ({ threadIds }: { threadIds: string[] }) => ({ source: "none", items: threadIds.map((threadId) => ({ threadId, model: null, effort: null })) }),
    } as never });
    const names = () => [...document.querySelectorAll("[data-spec-name]")].map((el) => el.textContent);
    const fileB = v4SpecsFileText.replaceAll("\"Sample palette\"", "\"Sample palette B\"");
    await waitFor(() => expect(answers).toHaveLength(1));
    answers[0]!(v4SpecsFileText);
    await waitFor(() => expect(names()).toContain("Sample palette"));
    settingsFeed.current = factory("/synthetic/home-b");
    rendered.rerender(createElement(Panel, props));
    expect(names()).toEqual([]);
    await waitFor(() => expect(answers).toHaveLength(2));
    settingsFeed.current = factory("/synthetic/home-c");
    rendered.rerender(createElement(Panel, props));
    await waitFor(() => expect(answers).toHaveLength(3));
    // The old binding's answer settles first, on its own; then the current one.
    await act(async () => { answers[1]!(v4SpecsFileText); });
    expect(names()).toEqual([]);
    answers[2]!(fileB);
    await waitFor(() => expect(names()).toContain("Sample palette B"));
    expect(names()).not.toContain("Sample palette");
  });
});

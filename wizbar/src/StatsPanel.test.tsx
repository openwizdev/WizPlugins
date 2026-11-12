// @vitest-environment jsdom
// WZ20 (#41): the footer disclosure's panel, rendered through the registered
// app and the SDK harness. Expected text is the contract's wording over the
// hand-worked fixture numbers (`v3Stats`: 4 running, 2+2, 1/2/1, 3 waiting).
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import { v3Threads } from "./fixtures/v3";

// Lets a test hand the hook the same or a new host snapshot across rerenders.
// Like the host's per-hook projection, every call returns its own array over
// the same row objects, so no two consumers ever share an array.
const fixtureFeed = vi.hoisted(() => ({ current: null as Pick<PluginSidebarThreadsState, "status" | "threads"> | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) =>
    fixtureFeed.current ? { ...fixtureFeed.current, threads: [...fixtureFeed.current.threads],
      projects: [], sections: [], experimental_archived: null }
      : actual.experimental_useSidebarThreads(...args) };
});
/** A new host snapshot: new row objects with the fixture's values. */
const fresh = () => v3Threads.map((thread) => ({ ...thread }));

const app = await loadPluginApp(() => import("../app"));
const { FooterCounter } = await import("./FooterCounter");
// Looked up per render, so a missing registration fails each test at its own
// assertions (registration itself is proved in FooterCounter.test.tsx N4).
function Panel(props: { dismiss(): void }) {
  const item = app.experimentalSidebarFooterItems.find(({ id }) => id === "stats");
  if (!item || item.kind !== "disclosure") return null;
  return createElement(item.component, props);
}
const panel = { component: Panel };
const props = { dismiss() {} };
afterEach(() => { cleanup(); fixtureFeed.current = null; });

const lines = () => [...(screen.queryByRole("region", { name: "WizBar stats" })?.querySelectorAll("p") ?? [])].map((p) => p.textContent);

describe("V3: footer stats panel", () => {
  it("shows the contract's numbers and coverage disclosures for the fixture", () => {
    const rendered = renderSlot(panel, props, { sidebarThreads: { status: "ready", threads: v3Threads } });
    expect(lines()).toEqual([
      "4 running · 2 top-level, 2 children",
      "1 cloud, 2 local, 1 unknown",
      "subagents not counted yet · some threads may be unseen",
      "Waiting on you: 3",
      "Finished today: not available yet",
    ]);
    expect(rendered.sdkCalls).toEqual([]);
    expect(rendered.rpcCalls).toEqual([]);
    expect(rendered.navigateCalls).toEqual([]);
  });

  it("keeps showing its numbers when the list-bottom line is switched off", () => {
    renderSlot(panel, props, { settings: { footerCountEnabled: false }, sidebarThreads: { status: "ready", threads: v3Threads } });
    expect(lines()[0]).toBe("4 running · 2 top-level, 2 children");
  });

  const unknownRuntime = [...v3Threads, { ...v3Threads[0]!, id: "thr_v3_future", runtimeStatus: "host-reconnecting" as never }];
  it.each([
    ["loading", { status: "loading" as const, threads: fresh() }],
    ["error", { status: "error" as const, threads: fresh() }],
    ["an unrecognised runtime status", { status: "ready" as const, threads: unknownRuntime as PluginSidebarThread[] }],
  ])("shows a plain unavailable state, never a number, for %s", (_, sidebarThreads) => {
    renderSlot(panel, props, { sidebarThreads });
    expect(lines()).toEqual(["Stats unavailable", "subagents not counted yet · some threads may be unseen"]);
  });

  it("drops its numbers when the realtime connection is lost", async () => {
    const rendered = renderSlot(panel, props, { sidebarThreads: { status: "ready", threads: fresh() } });
    expect(lines()[0]).toBe("4 running · 2 top-level, 2 children");
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(lines()[0]).toBe("Stats unavailable");
    await rendered.setRealtimeConnectionState("connected");
    expect(lines()[0], "a reconnect alone cannot certify the retained rows").toBe("Stats unavailable");
  });

  // R1: snapshot validity is the plugin's, not one component's. The host may
  // mount the disclosure only when it opens, after a gap the line observed.
  it("opens unavailable after a gap the list line saw, until a new snapshot arrives", async () => {
    fixtureFeed.current = { status: "ready", threads: fresh() };
    const View = ({ open }: { open: boolean }) => createElement("div", null,
      createElement(FooterCounter), open ? createElement(Panel, props) : null);
    const rendered = renderSlot({ component: View }, { open: false }, { pluginId: "synthetic-wz20-gap" });
    expect(screen.getByRole("status", { name: "4 running" })).toBeDefined();
    await rendered.setRealtimeConnectionState("reconnecting");
    await rendered.setRealtimeConnectionState("connected");
    rendered.rerender(createElement(View, { open: true }));
    expect(screen.queryByRole("status", { name: /running$/ })).toBeNull();
    expect(lines()[0]).toBe("Stats unavailable");
    // The same retained rows in another array still do not clear the gap.
    fixtureFeed.current = { status: "ready", threads: [...fixtureFeed.current.threads] };
    rendered.rerender(createElement(View, { open: true }));
    expect(lines()[0]).toBe("Stats unavailable");
    fixtureFeed.current = { status: "ready", threads: fresh() };
    rendered.rerender(createElement(View, { open: true }));
    expect(lines()[0]).toBe("4 running · 2 top-level, 2 children");
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
    ["agree on runtime work but differ only in indicator", "none", "active", "1 running · 1 top-level, 0 children", "1 running"],
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

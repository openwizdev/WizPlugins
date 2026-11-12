// @vitest-environment jsdom
// WZ20 (#41): the footer disclosure's panel, rendered through the registered
// app and the SDK harness. Expected text is the contract's wording over the
// hand-worked fixture numbers (`v3Stats`: 4 running, 2+2, 1/2/1, 3 waiting).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { v3Threads } from "./fixtures/v3";

const app = await loadPluginApp(() => import("../app"));
const item = app.experimentalSidebarFooterItems.find(({ id }) => id === "stats")!;
const panel = { component: item.kind === "disclosure" ? item.component : () => null };
const props = { dismiss() {} };
afterEach(cleanup);

const lines = () => [...screen.getByRole("region", { name: "WizBar stats" }).querySelectorAll("p")].map((p) => p.textContent);

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
    ["loading", { status: "loading" as const, threads: v3Threads }],
    ["error", { status: "error" as const, threads: v3Threads }],
    ["an unrecognised runtime status", { status: "ready" as const, threads: unknownRuntime as PluginSidebarThread[] }],
  ])("shows a plain unavailable state, never a number, for %s", (_, sidebarThreads) => {
    renderSlot(panel, props, { sidebarThreads });
    expect(lines()).toEqual(["Stats unavailable", "subagents not counted yet · some threads may be unseen"]);
  });

  it("drops its numbers when the realtime connection is lost", async () => {
    const rendered = renderSlot(panel, props, { sidebarThreads: { status: "ready", threads: v3Threads } });
    expect(lines()[0]).toBe("4 running · 2 top-level, 2 children");
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(lines()[0]).toBe("Stats unavailable");
    await rendered.setRealtimeConnectionState("connected");
    expect(lines()[0], "a reconnect alone cannot certify the retained rows").toBe("Stats unavailable");
  });
});

// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { positiveSource, positiveThreads } from "../../docs/evidence/wz5/fixtures";

const app = await loadPluginApp(() => import("../app"));
const { FooterCounterArtwork } = await import("./FooterCounter");
const candidate = { component: FooterCounterArtwork };
const empty = { complete: true, threads: [], subagentsByThread: new Map<string, number>() };
afterEach(cleanup);

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
    const footer = renderSlot(candidate, { source: positiveSource });
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
    expect(footer.container.querySelector('[role="status"]')?.textContent).toBe("5");
    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Sample B" }));
    inbox.rerender(createElement(app.threadLists[0]!.component, {
      activeThreadId: null, activeProjectId: "sample-project-b", isCompactViewport: false,
      searchQuery: "no matching row", onNavigate() {},
    }));
    expect(inbox.container.querySelectorAll('[role="listitem"]')).toHaveLength(0);
    expect(footer.container.querySelector('[role="status"]')?.textContent).toBe("5");
  });
});

describe("WF1: registered production app fails closed", () => {
  it("registers namespaced candidate artwork without an empty footer button or disclosure", () => {
    expect(app.icons.map(({ name }) => name)).toContain("wizbar-running-count");
    expect(app.sidebarFooterActions).toEqual([]);
    expect(app.experimentalSidebarFooterItems).toEqual([]);
  });
  it.each(["ready", "loading", "error"] as const)("renders nothing for an unverified %s host feed", (status) => {
    const icon = app.icons.find(({ name }) => name === "wizbar-running-count");
    expect(icon).toBeDefined();
    const rendered = renderSlot({ component: icon!.component }, {}, {
      sidebarThreads: { status, threads: positiveThreads },
    });
    expect(rendered.container.innerHTML).toBe("");
  });
});

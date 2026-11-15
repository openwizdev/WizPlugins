// @vitest-environment jsdom
// B1 (#76) rendered proofs through the SDK slot harness: the running count and
// its popover (P6), keyboard/hover/touch use (P7) and the parent's expandable
// children. Every row is synthetic (./fixtures). Fixture renders prove no host
// behaviour: #160's fields are fed through the hook exactly as #160 adds them.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { b1Inventory, b1Row, b1Running } from "./fixtures";

type Feed = { status: "ready" | "loading" | "error"; threads: PluginSidebarThread[]; runningThreads?: unknown; childrenByParentId?: unknown };
const feed = vi.hoisted(() => ({ current: null as null | Feed }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) => {
    const real = actual.experimental_useSidebarThreads(...args);
    return feed.current ? { ...real, ...feed.current } : real;
  } };
});

const app = await loadPluginApp(() => import("../../app"));
const { FooterCounter } = await import("../FooterCounter");
afterEach(() => { cleanup(); feed.current = null; });

const inventoryFeed = (): Feed => {
  const { threads, runningThreads, childrenByParentId } = b1Inventory();
  return { status: "ready", threads, runningThreads, childrenByParentId };
};
const counter = (name = "7 running") => screen.getByRole("button", { name });
const dialog = () => screen.queryByRole("dialog");
const rowLinks = () => within(dialog()!).getAllByRole("link");
const lifecycle = (muted: string[] = []) => ({ listLifecycle: () => ({ rows: muted.map((threadId) => ({
  threadId, settledAt: null, snoozedUntil: null, snoozedAt: null, mutedAt: 200, muteAttentionAt: 100 })) }) });
const inbox = (searchQuery = "", props: Record<string, unknown> = {}) => createElement(app.threadLists[0]!.component, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery, onNavigate() {}, ...props,
});

describe("B1 P6: the count equals the rows it opens", () => {
  it("lists every counted row once, hidden, muted, child and absent-parent rows included", async () => {
    // Bug caught: a counted thread nobody can find (the sidebar's original problem).
    feed.current = inventoryFeed();
    renderSlot({ component: () => inbox() }, {}, { rpc: lifecycle(["thr_b1_docs"]) });
    fireEvent.mouseEnter(counter());
    // WizBar's mute comes from its own lifecycle read, which answers asynchronously.
    await waitFor(() => expect(within(dialog()!).getByRole("link", { name: "Open Docs helper, hidden, muted" })).toBeDefined());
    const links = rowLinks();
    expect(links).toHaveLength(7);
    expect(new Set(links.map((link) => link.getAttribute("data-thread-id"))).size).toBe(7);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Open Hidden root, hidden",
      "Open Spec 41 manager",
      "Open Builder 42, hidden",
      "Open Search helper, hidden",
      "Open Reviewer 42, hidden",
      "Open Docs helper, hidden, muted",
      "Open Orphan task, hidden",
    ]);
    // Headings are context: present as text, never a link or a counted row.
    expect(within(dialog()!).getByText("Parent not running · Release prep")).toBeDefined();
    expect(within(dialog()!).getByText("Unplaced · parent not loaded")).toBeDefined();
    expect(dialog()!.textContent).not.toMatch(/subagent/i);
  });

  it("keeps its all-project count and rows when the sidebar's search and project scope narrow the list", () => {
    feed.current = { ...inventoryFeed(), threads: [...inventoryFeed().threads] };
    const rendered = renderSlot({ component: () => inbox("no matching row", { activeProjectId: "prj_b1_other" }) }, {}, { rpc: lifecycle() });
    expect(rendered.container.querySelectorAll("[data-sidebar-thread-id]")).toHaveLength(0);
    fireEvent.mouseEnter(counter());
    expect(rowLinks()).toHaveLength(7);
    expect(within(dialog()!).getByText("7 running · all projects")).toBeDefined();
  });

  it("shows a host's empty running list as zero with no rows, and no number while the host rows are loading", () => {
    feed.current = { status: "ready", threads: [b1Running("thr_b1_x")], runningThreads: [] };
    const rendered = renderSlot({ component: FooterCounter }, {});
    fireEvent.click(counter("0 running"));
    expect(within(dialog()!).queryAllByRole("link")).toHaveLength(0);
    expect(within(dialog()!).getByText("Nothing is running.")).toBeDefined();
    feed.current = { ...inventoryFeed(), status: "loading" };
    rendered.rerender(createElement(FooterCounter));
    expect(screen.queryByRole("button", { name: /running/ })).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("says when an older host gives no running inventory, and still lists what it counts", () => {
    feed.current = { status: "ready", threads: [b1Running("thr_b1_x", { displayTitle: "Older host task" }), b1Row("thr_b1_idle")] };
    renderSlot({ component: FooterCounter }, {});
    fireEvent.focus(counter("1 running"));
    expect(rowLinks().map((link) => link.getAttribute("aria-label"))).toEqual(["Open Older host task"]);
    expect(within(dialog()!).getByText(/some running threads may be unseen/)).toBeDefined();
  });
});

describe("B1 P7: hover, keyboard and latched touch use", () => {
  it("opens on hover and focus, latches on click, and dismisses on Escape and an outside click", () => {
    // Bug caught: a popover only a mouse can open, or one a tap cannot keep open.
    feed.current = inventoryFeed();
    renderSlot({ component: () => createElement("div", null, createElement("p", null, "outside"), createElement(FooterCounter)) }, {});
    const button = counter();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.mouseEnter(button);
    expect(dialog()).not.toBeNull();
    fireEvent.mouseLeave(button);
    expect(dialog()).toBeNull();
    fireEvent.focus(button);
    expect(dialog()).not.toBeNull();
    fireEvent.blur(button);
    expect(dialog()).toBeNull();
    // A tap or click latches: leaving no longer closes it.
    fireEvent.click(button);
    fireEvent.mouseLeave(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(rowLinks()[0]!, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(dialog()).not.toBeNull();
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(dialog()).toBeNull();
    // A second click on an open, latched popover closes it.
    fireEvent.click(button);
    fireEvent.click(button);
    expect(dialog()).toBeNull();
  });

  it("opens a row natively, closes, and never navigates or changes the conversation by itself", () => {
    feed.current = inventoryFeed();
    const onNavigate = vi.fn();
    const rendered = renderSlot({ component: () => createElement(FooterCounter, { onNavigate }) }, {});
    fireEvent.click(counter());
    expect(rendered.sidebarActionCalls).toEqual([]);
    fireEvent.click(within(dialog()!).getByRole("link", { name: "Open Orphan task, hidden" }));
    expect(rendered.sidebarActionCalls).toEqual([{ method: "open", threadId: "thr_b1_orphan", options: { split: false } }]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(rendered.navigateCalls).toEqual([]);
    expect(dialog()).toBeNull();
  });
});

describe("B1 P6: a parent's children expand in the sidebar", () => {
  it("starts collapsed, then lists running children first with an unknown total, each opening natively", async () => {
    // Bug caught: children open by default, sorted by status churn, or a delivered count shown as complete.
    feed.current = inventoryFeed();
    const rendered = renderSlot({ component: () => inbox() }, {}, { rpc: lifecycle() });
    const toggle = await screen.findByRole("button", { name: "Show children of Spec 41 manager" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("3 children · 2 running · total unknown");
    expect(screen.queryByRole("list", { name: "Children of Spec 41 manager" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("list", { name: "Children of Spec 41 manager" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Open Builder 42, running", "Open Reviewer 42, running", "Open Finished child",
    ]);
    fireEvent.click(links[2]!);
    expect(rendered.sidebarActionCalls).toContainEqual({ method: "open", threadId: "thr_b1_finished", options: { split: false } });
    expect(rendered.navigateCalls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Hide children of Spec 41 manager" }));
    expect(screen.queryByRole("list", { name: "Children of Spec 41 manager" })).toBeNull();
    // Rows still draw when the host has no #160 fields: the sidebar's own children.
    feed.current = { status: "ready", threads: inventoryFeed().threads };
    rendered.rerender(inbox());
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Show children of Spec 41 manager" }).textContent).toBe("3 children · 2 running · total unknown");
  });

  it("keeps the inbox's pinned order and shelves unchanged", async () => {
    const pinnedA = b1Row("thr_b1_pa", { displayTitle: "Pinned A", isPinned: true, pinnedAt: 10, pinSortKey: "b", createdAt: 1 });
    const pinnedB = b1Row("thr_b1_pb", { displayTitle: "Pinned B", isPinned: true, pinnedAt: 20, pinSortKey: "a", createdAt: 2 });
    const newer = b1Running("thr_b1_new", { displayTitle: "Newer", createdAt: 9 });
    const older = b1Row("thr_b1_old", { displayTitle: "Older", createdAt: 3 });
    feed.current = { status: "ready", threads: [older, pinnedA, newer, pinnedB], runningThreads: [newer] };
    renderSlot({ component: () => inbox() }, {}, { rpc: lifecycle() });
    const pinned = await screen.findByRole("region", { name: "Pinned" });
    expect(within(pinned).getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual(["Pinned B", "Pinned A"]);
    const cards = [...document.querySelectorAll("[data-sidebar-thread-id]")].map((node) => node.getAttribute("data-sidebar-thread-id"));
    expect(cards).toEqual(["thr_b1_pb", "thr_b1_pa", "thr_b1_new", "thr_b1_old"]);
  });
});

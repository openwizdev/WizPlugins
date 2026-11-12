// @vitest-environment jsdom
// WZ19 (#43), V2: hovering or focusing a card's child count lists its children
// (target picture B). Synthetic rows only: src/fixtures/v3.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread, PluginSidebarThreadsState } from "@get-bb/plugin-sdk/app";
import { v3Now, v3Threads } from "./fixtures/v3";
import type { CardModelsResultV3 } from "./v3-types";

// R4 (PR #55): a feed the test can swap, so retained rows and fresh rows can be
// told apart after a connection gap. Null uses the harness rows unchanged.
const fixtureFeed = vi.hoisted(() => ({ current: null as Pick<PluginSidebarThreadsState, "status" | "threads"> | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) => {
    const real = actual.experimental_useSidebarThreads(...args);
    return fixtureFeed.current ? { ...real, ...fixtureFeed.current, threads: fixtureFeed.current.threads.map((t) => ({ ...t })) } : real;
  } };
});

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;
const projects = ["prj_v3_atlas", "prj_v3_studio", "prj_v3_forge"].map((id) => ({
  id, name: `Sample ${id.slice(7)}`, isPersonal: false, href: `/projects/${id}`, settingsHref: `/projects/${id}/settings`,
}));

let fixtureNumber = 0;
function render(
  threads: readonly PluginSidebarThread[] = v3Threads,
  cardModels: (input: { threadIds: string[] }) => CardModelsResultV3 | Promise<CardModelsResultV3> =
    ({ threadIds }) => ({ source: "none", items: threadIds.map((threadId) => ({ threadId, model: null, effort: null })) }),
) {
  const models = vi.fn((input: unknown) => cardModels(input as { threadIds: string[] }));
  const onNavigate = vi.fn();
  const rendered = renderSlot(inbox, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate, searchQuery: "",
  }, {
    pluginId: `synthetic-wz19-popover-${++fixtureNumber}`,
    sidebarThreads: { status: "ready", threads: [...threads], projects },
    rpc: { listLifecycle: () => ({ rows: [] }), cardModels: models },
  });
  return { ...rendered, models, onNavigate };
}

const chip = (name: string) => screen.getByRole("button", { name });
const panel = () => screen.queryByRole("dialog");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(v3Now);
  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
});
afterEach(() => { cleanup(); vi.useRealTimers(); fixtureFeed.current = null; });

describe("children on hover (picture B)", () => {
  it("hovering the child count lists each child with status, title and age, in spawn order", async () => {
    render();
    expect(panel()).toBeNull();
    fireEvent.mouseEnter(chip("3 children"));
    const list = await screen.findByRole("dialog", { name: "3 children" });
    const rows = within(list).getAllByRole("button", { name: /^Open child/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Open child: Sample audit shortcuts, working, now",
      "Open child: Sample check focus order, waiting, 2m",
      "Open child: Sample test search states, unread, 8m",
    ]);
    expect(within(rows[0]!).getByText("Sample audit shortcuts")).toBeDefined();
    expect(within(rows[1]!).getByText("2m")).toBeDefined();
    expect(within(rows[2]!).getByRole("img", { name: "unread" })).toBeDefined();
    expect(within(list).getByRole("button", { name: "Open parent" })).toBeDefined();
  });

  it("keyboard focus opens it, Escape closes it and keeps focus on the count", async () => {
    render();
    const count = chip("1 child");
    fireEvent.focus(count);
    expect(await screen.findByRole("dialog", { name: "1 child" })).toBeDefined();
    expect(count.getAttribute("aria-expanded")).toBe("true");
    const child = screen.getByRole("button", { name: /^Open child: Sample measure cache hits/ });
    child.focus();
    fireEvent.keyDown(child, { key: "Escape" });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(count);
    expect(count.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when the pointer leaves, but not on the way from the count into the list", async () => {
    render();
    const count = chip("3 children");
    fireEvent.mouseEnter(count);
    const list = await screen.findByRole("dialog");
    fireEvent.mouseLeave(count);
    fireEvent.mouseEnter(list);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(panel()).not.toBeNull();
    fireEvent.mouseLeave(list);
    await waitFor(() => expect(panel()).toBeNull());
  });

  it("closes when focus leaves the count and the list", async () => {
    render();
    const count = chip("3 children");
    fireEvent.focus(count);
    await screen.findByRole("dialog");
    fireEvent.blur(count, { relatedTarget: document.body });
    await waitFor(() => expect(panel()).toBeNull());
  });

  it("clicking a child opens that child; Open parent opens the parent", async () => {
    const rendered = render();
    fireEvent.mouseEnter(chip("3 children"));
    fireEvent.click(await screen.findByRole("button", { name: /^Open child: Sample check focus order/ }));
    expect(rendered.sidebarActionCalls).toContainEqual({ method: "open", threadId: "thr_v3_child_waiting", options: undefined });
    expect(panel()).toBeNull();
    fireEvent.mouseEnter(chip("3 children"));
    fireEvent.click(await screen.findByRole("button", { name: "Open parent" }));
    expect(rendered.sidebarActionCalls).toContainEqual({ method: "open", threadId: "thr_v3_parent_many", options: undefined });
    // Neither click also opens the card itself through its full-bleed link.
    expect(rendered.sidebarActionCalls.filter((call) => call.method === "open")).toHaveLength(2);
  });

  // R3: a host open is followed by onNavigate, so a compact drawer closes over
  // the destination, as ordinary card navigation already does.
  it.each([
    [/^Open child: Sample check focus order/, "thr_v3_child_waiting"],
    ["Open parent", "thr_v3_parent_many"],
  ] as const)("calls onNavigate after opening %s", async (name, threadId) => {
    const rendered = render();
    fireEvent.mouseEnter(chip("3 children"));
    fireEvent.click(await screen.findByRole("button", { name }));
    expect(rendered.sidebarActionCalls.filter((call) => call.method === "open")).toEqual([{ method: "open", threadId, options: undefined }]);
    expect(rendered.onNavigate).toHaveBeenCalledTimes(1);
  });

  // R1: a phone tap fires compatibility hover and focus, then click. The click
  // must not undo the opening the same gesture caused; a second tap keeps it open.
  it("stays open through a complete tap, and a second tap", async () => {
    render();
    const count = chip("3 children");
    for (let tap = 0; tap < 2; tap++) {
      fireEvent.pointerDown(count, { pointerType: "touch" });
      fireEvent.mouseEnter(count);
      fireEvent.focus(count);
      fireEvent.pointerUp(count, { pointerType: "touch" });
      fireEvent.click(count);
      // Chromium then reports the touch pointer, and its compatibility mouse,
      // leaving the page (seen in a real-browser tap).
      fireEvent.pointerLeave(count, { pointerType: "touch" });
      fireEvent.mouseLeave(count);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(panel(), `tap ${tap + 1}`).not.toBeNull();
      expect(count.getAttribute("aria-expanded")).toBe("true");
    }
  });

  // R4: sidebar-v3 section 1. A connection gap makes retained rows unavailable;
  // only a fresh snapshot restores the list.
  it("shows unavailable during and after a connection gap until fresh rows arrive", async () => {
    fixtureFeed.current = { status: "ready", threads: [...v3Threads] };
    const rendered = render();
    fireEvent.focus(chip("3 children"));
    const list = await screen.findByRole("dialog");
    expect(within(list).getAllByRole("button", { name: /^Open child/ })).toHaveLength(3);
    await rendered.setRealtimeConnectionState("reconnecting");
    expect(within(list).getByText("Children are unavailable right now.")).toBeDefined();
    expect(within(list).queryAllByRole("button", { name: /^Open child/ })).toHaveLength(0);
    await rendered.setRealtimeConnectionState("connected");
    expect(within(list).getByText("Children are unavailable right now."), "a reconnect alone cannot certify retained rows").toBeDefined();
    fixtureFeed.current = { status: "ready", threads: v3Threads.map((t) =>
      t.id === "thr_v3_child_waiting" ? { ...t, updatedAt: t.updatedAt + 1, hasPendingInteraction: false } : t) };
    // Close and reopen, so the panel renders again with the fresh snapshot.
    fireEvent.keyDown(chip("3 children"), { key: "Escape" });
    fireEvent.mouseEnter(chip("3 children"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Open child: Sample check focus order, idle/ })).toBeDefined());
  });

  it("shows each child's model and effort once the host serves them", async () => {
    render(v3Threads, ({ threadIds }) => ({
      source: "host",
      items: threadIds.map((threadId) => ({
        threadId, model: threadId === "thr_v3_child_waiting" ? "Sample model" : null,
        effort: threadId === "thr_v3_child_waiting" ? "medium" : null,
      })),
    }));
    fireEvent.mouseEnter(chip("3 children"));
    const list = await screen.findByRole("dialog");
    expect(await within(list).findByText("Sample model · Medium")).toBeDefined();
    expect(within(list).queryAllByText(/·/)).toHaveLength(1);
  });

  it("omits models while the source is none or the call fails", async () => {
    render(v3Threads, () => Promise.reject(new Error("offline")));
    fireEvent.mouseEnter(chip("3 children"));
    const list = await screen.findByRole("dialog");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(list).queryByText(/·/)).toBeNull();
    expect(within(list).getAllByRole("button", { name: /^Open child/ })).toHaveLength(3);
  });

  it("says the list is unavailable rather than guessing a status", async () => {
    render(v3Threads.map((t) => t.id === "thr_v3_child_waiting" ? { ...t, runtimeStatus: "future-state" as never } : t));
    fireEvent.mouseEnter(chip("3 children"));
    const list = await screen.findByRole("dialog");
    expect(within(list).getByText("Children are unavailable right now.")).toBeDefined();
    expect(within(list).queryAllByRole("button", { name: /^Open child/ })).toHaveLength(0);
    expect(within(list).getByRole("button", { name: "Open parent" })).toBeDefined();
  });

  // It may cover the next card, but never leaves the viewport.
  it.each([320, 390])("stays inside a %i px viewport, flipping above a count near the bottom", async (width) => {
    Object.assign(window, { innerWidth: width, innerHeight: 640 });
    render();
    const count = chip("3 children");
    count.getBoundingClientRect = () => DOMRect.fromRect({ x: width - 70, y: 600, width: 64, height: 18 });
    fireEvent.mouseEnter(count);
    const list = await screen.findByRole("dialog");
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 220 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(list.style.bottom).not.toBe(""));
    const left = parseFloat(list.style.left), right = left + parseFloat(list.style.width);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(width);
    const bottom = 640 - parseFloat(list.style.bottom);
    const top = bottom - Math.min(220, parseFloat(list.style.maxHeight));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(600);
  });

  it("opens below a count near the top", async () => {
    Object.assign(window, { innerWidth: 390, innerHeight: 640 });
    render();
    const count = chip("3 children");
    count.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 80, width: 64, height: 18 });
    fireEvent.mouseEnter(count);
    const list = await screen.findByRole("dialog");
    expect(parseFloat(list.style.top)).toBeGreaterThanOrEqual(98);
    expect(list.style.bottom).toBe("");
    expect(parseFloat(list.style.left)).toBe(20);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { StoredLifecycleRow } from "./server";

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;
const NOW = Date.UTC(2030, 0, 15, 9);
const DAY = 24 * 60 * 60 * 1000;
const projects = ["Orchard", "Harbor"].map((name) => ({
  id: `proj_syn${name}`,
  name,
  isPersonal: false,
  href: `/projects/proj_syn${name}`,
  settingsHref: `/projects/proj_syn${name}/settings`,
}));

function environment(providerId: string | null, branchName: string | null = null) {
  return {
    id: "env_synsample",
    name: "Synthetic workspace",
    branchName,
    path: null,
    isWorktree: false,
    providerId,
    workspaceDisplayKind: "other" as const,
  };
}

function thread(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id: "thr_synsample",
    projectId: projects[0]!.id,
    title: "Review parser",
    titleFallback: null,
    displayTitle: "Review parser",
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "synthetic-agent",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: "/projects/proj_synOrchard/threads/thr_synsample",
    isHidden: false,
    environment: null,
    // Deliberately constant: changing the host cannot classify execution.
    host: { id: "mch_synsample", name: "Synthetic workspace" },
    createdAt: NOW - DAY,
    updatedAt: NOW - 7 * 60 * 1000,
    lastReadAt: NOW,
    latestAttentionAt: NOW - DAY,
    ...overrides,
  };
}

function parkedRow(id: string, shelf: "Snoozed" | "Settled"): StoredLifecycleRow {
  return {
    threadId: id,
    settledAt: shelf === "Settled" ? NOW : null,
    snoozedAt: shelf === "Snoozed" ? NOW : null,
    snoozedUntil: shelf === "Snoozed" ? NOW + DAY : null,
  };
}

function render(
  threads: PluginSidebarThread[],
  rows: StoredLifecycleRow[] = [],
  searchQuery = "",
  onNavigate = vi.fn(),
) {
  const settle = vi.fn(() => ({ ok: true }));
  const snooze = vi.fn(() => ({ ok: true }));
  const unsnooze = vi.fn(() => ({ ok: true }));
  const unsettle = vi.fn(() => ({ ok: true }));
  const rendered = renderSlot(inbox, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: false,
    onNavigate, searchQuery,
  }, {
    sidebarThreads: { status: "ready", threads, projects },
    rpc: { listLifecycle: () => ({ rows }), settle, snooze, unsnooze, unsettle },
  });
  return { ...rendered, settle, snooze, unsnooze, unsettle, onNavigate };
}

beforeEach(() => {
  // Freeze Date only: async harness/React scheduling continues normally.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const cases = [
  { name: "null provider", environment: environment(null), marker: "Cloud" },
  { name: "empty provider with branch", environment: environment("", "feature/parser"), marker: "Cloud" },
  { name: "project checkout with branch", environment: environment("project-checkout", "feature/parser"), marker: "Local" },
  { name: "personal workspace without branch", environment: environment("personal-workspace"), marker: "Local" },
  { name: "other set provider", environment: environment("synthetic-provider"), marker: "Local" },
  { name: "null environment", environment: null, marker: null },
  { name: "missing environment", environment: undefined, marker: null },
  // Malformed runtime payloads, not extra SDK fields or a proposed schema.
  { name: "missing provider", environment: JSON.parse('{"branchName":"feature/parser"}'), marker: null },
  { name: "numeric provider", environment: JSON.parse('{"providerId":0}'), marker: null },
  { name: "boolean provider", environment: JSON.parse('{"providerId":false}'), marker: null },
  { name: "object provider", environment: JSON.parse('{"providerId":{}}'), marker: null },
];

for (const shelf of ["Inbox", "Snoozed", "Settled"] as const) {
  describe(`${shelf} machine markers at the registered app boundary`, () => {
    it.each(cases)("$name", async ({ environment, marker }) => {
      const sample = thread({ environment });
      render([sample], shelf === "Inbox" ? [] : [parkedRow(sample.id, shelf)]);
      if (shelf !== "Inbox") {
        const region = await screen.findByRole("region", { name: shelf });
        expect(within(region).queryByRole("listitem")).toBeNull();
        fireEvent.click(within(region).getByRole("button"));
      }
      const row = screen.getByRole("listitem");
      const markers = within(row).queryAllByRole("img", { name: /^(Cloud|Local)$/ });
      expect(markers.map((icon) => icon.getAttribute("aria-label"))).toEqual(marker ? [marker] : []);
      if (shelf !== "Inbox") {
        const region = screen.getByRole("region", { name: shelf });
        fireEvent.click(within(region).getByRole("button", { name: shelf }));
        expect(within(region).queryByRole("listitem")).toBeNull();
        fireEvent.click(within(region).getByRole("button"));
        expect(within(region).queryAllByRole("img", { name: /^(Cloud|Local)$/ })).toHaveLength(marker ? 1 : 0);
      }
    });
  });
}

describe("machine row regressions", () => {
  it("keeps the correct marker after search and project filtering", () => {
    render([
      thread({ environment: environment(null) }),
      thread({ id: "thr_synguide", projectId: projects[1]!.id, title: "Write guide", environment: environment("personal-workspace") }),
    ], [], "guide");
    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Harbor" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Write guide" })).toBeDefined();
    expect(screen.getAllByRole("img", { name: "Local" })).toHaveLength(1);
    expect(screen.queryByRole("img", { name: "Cloud" })).toBeNull();
  });

  it.each([false, true])("retains card navigation and shortcuts with modifier %s", (modifier) => {
    const rendered = render([thread({ environment: environment(null) })]);
    const link = screen.getByRole("link", { name: "Review parser" });
    expect(link.getAttribute("data-sidebar-thread-id")).toBe("thr_synsample");
    expect(link.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    expect(screen.getByText("7m")).toBeDefined();
    expect(screen.getByRole("img", { name: "Cloud" })).toBeDefined();
    fireEvent.click(link, { metaKey: modifier });
    expect(rendered.sidebarActionCalls).toEqual([{ method: "open", threadId: "thr_synsample", options: { split: modifier } }]);
    expect(rendered.onNavigate).toHaveBeenCalledTimes(1);
  });

  it("retains park controls on a marked card", async () => {
    const rendered = render([thread({ environment: environment("project-checkout") })]);
    fireEvent.click(screen.getByRole("button", { name: "Settle thread" }));
    await waitFor(() => expect(rendered.settle).toHaveBeenCalledWith({ threadId: "thr_synsample" }));
    fireEvent.click(screen.getByRole("button", { name: "Snooze until tomorrow" }));
    await waitFor(() => expect(rendered.snooze).toHaveBeenCalledWith({ threadId: "thr_synsample", snoozedUntil: NOW + DAY }));
    expect(rendered.sidebarActionCalls).toEqual([]);
    expect(screen.getAllByRole("img", { name: "Local" })).toHaveLength(1);
  });

  it.each(["Snoozed", "Settled"] as const)("retains %s wake/status, navigation and restore controls", async (shelf) => {
    const sample = thread({ environment: environment(null) });
    const rendered = render([sample], [parkedRow(sample.id, shelf)]);
    const region = await screen.findByRole("region", { name: shelf });
    fireEvent.click(within(region).getByRole("button"));
    const link = within(region).getByRole("link", { name: "Review parser" });
    expect(link.getAttribute("data-sidebar-thread-id")).toBe(sample.id);
    expect(link.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    expect(within(region).getByText(shelf === "Snoozed" ? "1d" : "7m")).toBeDefined();
    fireEvent.click(link, { ctrlKey: true });
    expect(rendered.sidebarActionCalls).toEqual([{ method: "open", threadId: sample.id, options: { split: true } }]);
    fireEvent.click(within(region).getByRole("button", { name: shelf === "Snoozed" ? "Wake thread now" : "Un-settle thread" }));
    await waitFor(() => expect(shelf === "Snoozed" ? rendered.unsnooze : rendered.unsettle).toHaveBeenCalledWith({ threadId: sample.id }));
    expect(rendered.onNavigate).toHaveBeenCalledTimes(1);
    expect(within(region).getAllByRole("img", { name: "Cloud" })).toHaveLength(1);
  });
});

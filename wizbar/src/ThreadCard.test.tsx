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

// N5: projection shapes from the keeper record and the scoped source ruling.
// Null/empty providers on an environment object are Local, never Cloud.
const cases: { name: string; input: Partial<PluginSidebarThread>; marker: string | null; inboxOnly?: boolean }[] = [
  { name: "observed idle Cloud", input: { environment: null, host: null }, marker: "Cloud" },
  ...(["active", "pending", "error", "stopping"] as const).map((runtimeStatus) => ({
    name: `recognised ${runtimeStatus} Cloud`, input: { environment: null, host: null, runtimeStatus }, marker: "Cloud",
  })),
  ...[null, "", "project-checkout", "git-worktree", "personal-workspace", "synthetic-provider"].map((provider) => ({
    name: `environment object with ${String(provider)} provider`,
    input: { environment: environment(provider, "feature/parser") }, marker: "Local",
  })),
  ...(["starting", "provisioning", "waiting-for-host"] as const).map((runtimeStatus) => ({
    name: `Local startup ${runtimeStatus} stays unmarked`, input: { environment: null, host: null, runtimeStatus }, marker: null, inboxOnly: runtimeStatus === "waiting-for-host",
  })),
  { name: "unknown runtime", input: JSON.parse('{"environment":null,"host":null,"runtimeStatus":"future-state"}'), marker: null, inboxOnly: true },
  { name: "missing runtime", input: { environment: null, host: null, runtimeStatus: undefined }, marker: null, inboxOnly: true },
  { name: "null runtime", input: JSON.parse('{"environment":null,"host":null,"runtimeStatus":null}'), marker: null, inboxOnly: true },
  { name: "empty runtime", input: JSON.parse('{"environment":null,"host":null,"runtimeStatus":""}'), marker: null, inboxOnly: true },
  { name: "host without environment", input: { environment: null }, marker: null },
  { name: "missing host", input: { environment: null, host: undefined }, marker: null },
  { name: "missing environment", input: { environment: undefined, host: null }, marker: null },
  ...['[]', '""', 'false', '{"branchName":"feature/parser"}', '{"providerId":0}', '{"providerId":false}', '{"providerId":{}}'].map((value) => ({
    name: `malformed environment ${value}`, input: { environment: JSON.parse(value), host: null }, marker: null,
  })),
];

for (const shelf of ["Inbox", "Snoozed", "Settled"] as const) {
  describe(`${shelf} machine markers at the registered app boundary`, () => {
    it.each(cases)("$name", async ({ input, marker, inboxOnly }) => {
      // Invalid parking authority keeps these rows in Inbox, independently of icons.
      const shownShelf = inboxOnly ? "Inbox" : shelf;
      const sample = thread(input);
      render([sample], shelf === "Inbox" ? [] : [parkedRow(sample.id, shelf)]);
      if (shownShelf !== "Inbox") {
        const region = await screen.findByRole("region", { name: shelf });
        expect(within(region).queryByRole("listitem")).toBeNull();
        fireEvent.click(within(region).getByRole("button"));
      }
      const row = screen.getByRole("listitem");
      const markers = within(row).queryAllByRole("img", { name: /^(Cloud|Local)$/ });
      expect(markers.map((icon) => icon.getAttribute("aria-label"))).toEqual(marker ? [marker] : []);
      if (shownShelf !== "Inbox") {
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
      thread({ environment: null, host: null }),
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
    const rendered = render([thread({ environment: null, host: null })]);
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
    const sample = thread({ environment: null, host: null });
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

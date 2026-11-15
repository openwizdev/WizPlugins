// @vitest-environment jsdom
// B1 (#76): the sidebar's Needs-you entry and highlight-only shared selection,
// through the registered thread list. The deck's answer is built with D1's own
// `buildHomeView` over synthetic data, as WizDeck's Home tests do.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { buildHomeView } from "../deck/data/home";
import type { BoardV1 } from "../deck/data/board";
import type { DeckWatchResultV1 } from "../deck/data/server";
import { getSelection, setSelection, WIZDECK_ACTION_ID } from "../deck/selection/selection";
import { b1Row } from "./fixtures";

const NOW = Date.parse("2026-11-15T20:30:00Z");
const app = await loadPluginApp(() => import("../../app"));
const repo = "example-org/sample-app";

const board: BoardV1 = {
  repository: repo,
  versions: [{
    repository: repo, number: 3, title: "1.4", dueOn: null, complete: true,
    specs: [{
      ref: `${repo}#41`, title: "Search filters", url: `https://github.com/${repo}/issues/41`, state: "open",
      total: 4, merged: 1, complete: true,
      pullRequests: [{ ref: `${repo}#52`, url: `https://github.com/${repo}/pull/52`, mergedAt: "2026-11-15T09:00:00Z" }],
      status: { status: "unavailable", reason: "missing", when: "Not estimated" },
    }],
  }],
  merges: { since: "2026-11-14T18:30:00Z", complete: true, pullRequests: [] },
};
const ready = <T,>(data: T) => ({ status: "ready" as const, data, fetchedAt: NOW - 5_000, stale: false, complete: true, gaps: [] });
const item = {
  id: "n12", code: "N-12", question: "Which changelog headline ships?",
  options: [{ id: "short", label: "Short headline" }], recommendedOptionId: "short",
  sourceUrl: "https://example.com/sample/n12", spec: null, risk: "ordinary", fingerprint: "fp",
  createdAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T20:00:00Z",
};

function deck(queue: "ready" | "missing"): DeckWatchResultV1 {
  return {
    projects: [{ projectKey: "sample-factory", cloudroomProjectId: "prj_b1_a" }],
    projectKey: "sample-factory", setup: null,
    view: buildHomeView({
      projectKey: "sample-factory", timeZone: "UTC", now: NOW, authenticated: true,
      queue: {
        snapshot: queue === "missing" ? { status: "unavailable", reason: "missing", lastGood: null } : ready({ queue: {
          schema: "openwiz.needs-you.v1" as const, project: "sample-factory", revision: 2, updatedAt: "2026-11-15T20:20:00Z",
          expiresAt: "2026-11-15T21:00:00Z", complete: true, gaps: [], items: [item] as never,
        }, sha256: "x" }),
        detail: queue === "missing" ? "The Needs-you file does not exist in the configured home." : null,
        nextRefreshAt: NOW + 55_000, refreshing: false,
      },
      boards: [{ snapshot: ready(board), detail: null, nextRefreshAt: NOW + 55_000, refreshing: false }],
    }),
  };
}

const pr = (number: number): PluginSidebarPullRequest => ({
  number, title: `Change ${number}`, url: `https://github.com/${repo}/pull/${number}`, state: "merged", attention: "merged",
} as PluginSidebarPullRequest);
const environment = (branchName: string) => ({ id: "env", name: null, branchName, path: null, isWorktree: true, providerId: null, workspaceDisplayKind: null }) as never;
const threads = [
  b1Row("thr_b1_spec", { displayTitle: "Spec 41 manager", createdAt: 30, environment: environment("room/41-manager") }),
  b1Row("thr_b1_merged", { displayTitle: "Builder 52", createdAt: 20, environment: environment("room/43-builder") }),
  b1Row("thr_b1_other", { displayTitle: "Other work", createdAt: 10, environment: environment("room/77-other") }),
];

function mount(queue: "ready" | "missing" | "setup" = "ready", openThreadPanel = () => true) {
  const deckWatch = vi.fn(() => queue === "setup"
    ? { projects: [], projectKey: null, view: null, setup: "No factory is configured." }
    : deck(queue));
  const rendered = renderSlot(app.threadLists[0]!, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery: "", onNavigate() {},
  }, {
    context: { projectId: "prj_b1_a", threadId: "thr_b1_other" },
    sidebarThreads: { status: "ready", threads },
    sidebarPullRequests: { thr_b1_spec: pr(60), thr_b1_merged: pr(52), thr_b1_other: pr(70) },
    openThreadPanel,
    rpc: { listLifecycle: () => ({ rows: [] }), deckWatch, deckRelease: () => ({ ok: true }) } as never,
  });
  return { rendered, deckWatch };
}

const highlighted = () => [...document.querySelectorAll("[data-wizbar-highlighted]")]
  .map((node) => node.querySelector("[data-sidebar-thread-id]")?.getAttribute("data-sidebar-thread-id"));

// jsdom has no layout; a stub lets the test spy on any scroll.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(NOW); setSelection({ kind: "none" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setSelection({ kind: "none" }); });

describe("B1: the sidebar's Needs-you entry", () => {
  it("opens WizDeck focused on the exact item it names, and nothing else", async () => {
    // Bug caught: the entry opening the deck without the item, or navigating the conversation.
    const { rendered } = mount();
    const entry = await screen.findByRole("button", { name: "Needs you · 1" });
    expect(entry.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(entry);
    fireEvent.click(screen.getByRole("button", { name: "Open N-12 in WizDeck: Which changelog headline ships?" }));
    expect(rendered.navigateCalls).toEqual([{ method: "openThreadPanel",
      options: { actionId: WIZDECK_ACTION_ID, params: { focus: { kind: "needs-you", projectKey: "sample-factory", itemId: "n12" } } } }]);
    expect(rendered.sidebarActionCalls).toEqual([]);
  });

  it("shows an unreadable queue as unavailable, never as nothing to answer", async () => {
    const { rendered } = mount("missing");
    expect(await screen.findByText("Needs you · unavailable")).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Needs you/ })).toBeNull();
    expect(rendered.navigateCalls).toEqual([]);
  });

  it("is absent when no factory is configured", async () => {
    const { deckWatch } = mount("setup");
    await waitFor(() => expect(deckWatch).toHaveBeenCalled());
    expect(screen.queryByText(/Needs you/)).toBeNull();
  });

  it("says so when the host has no side panel to open", async () => {
    mount("ready", () => false);
    fireEvent.click(await screen.findByRole("button", { name: "Needs you · 1" }));
    fireEvent.click(screen.getByRole("button", { name: /^Open N-12 in WizDeck/ }));
    expect(screen.getByText("Open a thread to see WizDeck beside it.")).toBeDefined();
  });
});

describe("B1: shared selection highlights and never navigates", () => {
  it("highlights a selected spec's threads by verified links only, without moving anything", async () => {
    // Bug caught: selection that scrolls, opens or navigates, or matches by title.
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const { rendered } = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    act(() => setSelection({ kind: "spec", projectKey: "sample-factory", spec: `${repo}#41` }));
    // The spec's own thread (branch issue 41 in the PR's repository) and the
    // thread whose PR is one of the spec's verified merged PRs.
    await waitFor(() => expect(highlighted()).toEqual(["thr_b1_spec", "thr_b1_merged"]));
    act(() => setSelection({ kind: "spec", projectKey: "other-factory", spec: `${repo}#41` }));
    expect(highlighted()).toEqual([]);
    act(() => setSelection({ kind: "thread", projectKey: "sample-factory", threadId: "thr_b1_other" }));
    expect(highlighted()).toEqual(["thr_b1_other"]);
    expect(rendered.navigateCalls).toEqual([]);
    expect(rendered.sidebarActionCalls).toEqual([]);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("publishes an opened card as the shared thread selection for its factory", async () => {
    const { rendered } = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    fireEvent.click(document.querySelector('[data-sidebar-thread-id="thr_b1_merged"]')!);
    expect(getSelection()).toEqual({ kind: "thread", projectKey: "sample-factory", threadId: "thr_b1_merged" });
    expect(rendered.sidebarActionCalls).toEqual([{ method: "open", threadId: "thr_b1_merged", options: { split: false } }]);
    expect(rendered.navigateCalls).toEqual([]);
  });
});

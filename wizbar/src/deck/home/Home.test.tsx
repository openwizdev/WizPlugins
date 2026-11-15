// @vitest-environment jsdom
// D1 (#73) rendered proofs: the real WizDeck panel through the SDK's slot
// harness, with synthetic backend answers. Fixtures prove no live host.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { buildHomeView } from "../data/home";
import type { DeckWatchResultV1 } from "../data/server";
import type { BoardV1 } from "../data/board";
import { openWizDeck, setSelection, WIZDECK_ACTION_ID } from "../selection/selection";
import { WizDeckNewThreadPanel, WizDeckPanel } from "./Panel";

const NOW = Date.parse("2026-11-15T20:30:00Z");
const app = await loadPluginApp(() => import("../../../app"));

const board = (repo: string, title: string, merged: number, complete = true): BoardV1 => ({
  repository: repo as BoardV1["repository"],
  versions: [{
    repository: repo as BoardV1["repository"], number: 3, title: "1.4", dueOn: null, complete: true,
    specs: [{
      ref: `${repo}#41` as never, title, url: `https://github.com/${repo}/issues/41`, state: "open",
      total: 4, merged, complete,
      pullRequests: merged ? [{ ref: `${repo}#52`, url: `https://github.com/${repo}/pull/52`, mergedAt: "2026-11-15T09:00:00Z" }] : [],
      status: { status: "ready", now: "Building T2", next: "Review T2", when: "Today ~16:00 UTC", updated: "2026-11-15T20:00:00Z" },
    }],
  }],
  merges: { since: "2026-11-14T18:30:00Z", complete: true, pullRequests: [{ ref: `${repo}#52`, mergedAt: "2026-11-15T19:00:00Z" }] },
});
const ready = <T,>(data: T) => ({ status: "ready" as const, data, fetchedAt: NOW - 5_000, stale: false, complete: true, gaps: [] });
const queueFile = (items: unknown[]) => ({
  queue: {
    schema: "openwiz.needs-you.v1" as const, project: "sample-factory", revision: 2, updatedAt: "2026-11-15T20:20:00Z",
    expiresAt: "2026-11-15T21:00:00Z", complete: true, gaps: [], items: items as never,
  }, sha256: "x",
});
const item = {
  id: "n12", code: "N-12", question: "Which changelog headline ships?",
  options: [{ id: "short", label: "Short headline" }, { id: "long", label: "Long headline" }], recommendedOptionId: "short",
  sourceUrl: "https://example.com/sample/n12", spec: null, risk: "ordinary", fingerprint: "fp", createdAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T20:00:00Z",
};

function result(projectKey: string, options: { queue?: "ready" | "empty" | "missing"; repo?: string; title?: string; merged?: number; complete?: boolean } = {}): DeckWatchResultV1 {
  const repo = options.repo ?? (projectKey === "sample-factory" ? "example-org/sample-app" : "example-org/other-app");
  const queue = options.queue ?? "ready";
  return {
    projects: [{ projectKey: "sample-factory", cloudroomProjectId: "prj_a" }, { projectKey: "other-factory", cloudroomProjectId: "prj_b" }],
    projectKey, setup: null,
    view: buildHomeView({
      projectKey, timeZone: "UTC", now: NOW, authenticated: true,
      queue: {
        snapshot: queue === "missing" ? { status: "unavailable", reason: "missing", lastGood: null } : ready(queueFile(queue === "empty" ? [] : [item])),
        detail: queue === "missing" ? "The Needs-you file does not exist in the configured home." : null, nextRefreshAt: NOW + 55_000, refreshing: false,
      },
      boards: [{ snapshot: { ...ready(board(repo, options.title ?? `${projectKey} spec`, options.merged ?? 1, options.complete ?? true)), complete: options.complete ?? true }, detail: null, nextRefreshAt: NOW + 55_000, refreshing: false }],
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false }); vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

function mount(handlers: Record<string, (input: any) => unknown>, params: unknown = null, context = { projectId: "prj_a", threadId: "thr_any" }) {
  return renderSlot({ component: WizDeckPanel }, { threadId: "thr_any", params: params as never }, { rpc: handlers as never, context });
}

describe("WizDeck Home", () => {
  it("registers one WizDeck right-panel action beside WizBar's existing slots", () => {
    expect(app.threadPanelActions.map(({ id, title }) => ({ id, title }))).toEqual([{ id: WIZDECK_ACTION_ID, title: "WizDeck" }]);
    expect(app.newThreadPanelActions.map(({ id }) => id)).toEqual([WIZDECK_ACTION_ID]);
    expect(app.threadLists.map(({ title }) => title)).toEqual(["WizBar"]);
  });

  // Bug caught: issue/PR links bypass the host's URL opener.
  it("renders verified progress and opens issue and PR links with the host URL opener", async () => {
    const slot = mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) });
    await flush();
    const row = screen.getByText("sample-factory spec").closest("li")!;
    expect(within(row).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(within(row).getByText("1/4")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "PR #52" }));
    fireEvent.click(within(row).getByRole("button", { name: "#41" }));
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "openUrl", url: "https://github.com/example-org/sample-app/pull/52" },
      { method: "openUrl", url: "https://github.com/example-org/sample-app/issues/41" },
      { method: "openUrl", url: "https://github.com/example-org/sample-app/issues/41" },
    ]);
    expect(screen.getByText("Merges today")).toBeTruthy();
    expect(screen.getByText("Running · unavailable")).toBeTruthy();
    expect(screen.getByText("Stalls · unavailable")).toBeTruthy();
  });

  it("marks a partial count as a lower bound", async () => {
    mount({ deckWatch: () => result("sample-factory", { complete: false, merged: 2 }), deckRelease: () => ({ ok: true }) });
    await flush();
    expect(screen.getByText("2+/4")).toBeTruthy();
  });

  // Bug caught: switching factories briefly or permanently shows the previous factory's rows.
  it("switches projects without leaking rows, even when the old answer lands late", async () => {
    let releaseOld: (() => void) | null = null;
    const watch = vi.fn((input: { projectKey: string | null }) => {
      if (input.projectKey === "other-factory") return result("other-factory");
      if (watch.mock.calls.length > 1) return new Promise((resolve) => { releaseOld = () => resolve(result("sample-factory")); });
      return result("sample-factory");
    });
    mount({ deckWatch: watch, deckRelease: () => ({ ok: true }) });
    await flush();
    expect(screen.getByText("sample-factory spec")).toBeTruthy();
    // A realtime re-read for the old factory is still in flight when the person switches.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "other-factory" } });
    expect(screen.queryByText("sample-factory spec")).toBeNull();
    await flush();
    expect(screen.getByText("other-factory spec")).toBeTruthy();
    await act(async () => { releaseOld?.(); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText("sample-factory spec")).toBeNull();
    expect(screen.getByText("other-factory spec")).toBeTruthy();
  });

  it("defaults to the current Cloudroom project and never sends the open thread as the target", async () => {
    const watch = vi.fn((_input: unknown) => result("other-factory"));
    mount({ deckWatch: watch, deckRelease: () => ({ ok: true }) }, null, { projectId: "prj_b", threadId: "thr_any" });
    await flush();
    expect(watch.mock.calls[0][0]).toMatchObject({ projectKey: null, currentProjectId: "prj_b" });
    expect(JSON.stringify(watch.mock.calls)).not.toContain("thr_any");
  });

  // Bug caught: an unreadable queue shows "Needs you · 0" or "nothing needs you".
  it("keeps a missing queue unavailable, distinct from a complete empty one", async () => {
    mount({ deckWatch: () => result("sample-factory", { queue: "missing" }), deckRelease: () => ({ ok: true }) });
    await flush();
    expect(screen.getByText("Needs you · unavailable")).toBeTruthy();
    expect(screen.getByText("The Needs-you file does not exist in the configured home.")).toBeTruthy();
    expect(screen.queryByText(/Needs you · 0/)).toBeNull();
    expect(screen.queryByText("Nothing needs you right now.")).toBeNull();
    cleanup();
    mount({ deckWatch: () => result("sample-factory", { queue: "empty" }), deckRelease: () => ({ ok: true }) });
    await flush();
    expect(screen.getByText("Needs you · 0")).toBeTruthy();
    expect(screen.getByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("lists Needs you first, with options as text and no answer controls", async () => {
    const slot = mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) });
    await flush();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Needs you · 1", "Versions"]);
    expect(screen.getByText("Options: Short headline (rec) · Long headline")).toBeTruthy();
    const need = document.getElementById("wizdeck-need-n12")!;
    expect(within(need).getAllByRole("button").map((button) => button.textContent)).toEqual(["Open"]);
    fireEvent.click(within(need).getByRole("button", { name: "Open" }));
    expect(slot.inspection.navigateCalls).toEqual([{ method: "openUrl", url: "https://example.com/sample/n12" }]);
  });

  // Bug caught: each mounted panel polls GitHub, or a panel reads something other than the backend snapshot.
  it("two mounted panels only renew leases on the backend; neither fetches", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const handlers = { deckWatch: vi.fn(() => result("sample-factory")), deckRelease: vi.fn(() => ({ ok: true })) };
    const first = mount(handlers);
    const second = mount(handlers);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60_000); });
    expect(fetchSpy).not.toHaveBeenCalled();
    const methods = [...first.inspection.rpcCalls, ...second.inspection.rpcCalls].map((call) => call.method);
    expect(new Set(methods)).toEqual(new Set(["deckWatch"]));
    expect(methods.length).toBe(2 * (1 + 6)); // Mount plus one renewal per 30 s, per panel.
    const ids = new Set(handlers.deckWatch.mock.calls.map((call: any) => call[0].clientId));
    expect(ids.size).toBe(2);
    first.lifecycle.unmount();
    await flush();
    expect(handlers.deckRelease).toHaveBeenCalledTimes(1);
  });

  it("re-reads the backend snapshot on its realtime signal", async () => {
    const watch = vi.fn(() => result("sample-factory"));
    const slot = mount({ deckWatch: watch, deckRelease: () => ({ ok: true }) });
    await flush();
    await slot.behavior.emitRealtime("wizdeck", {});
    await flush();
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it("disables Refresh until the shared interval allows it", async () => {
    mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) });
    await flush();
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains itself on first open, once", async () => {
    mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("note")).toBeNull();
    cleanup();
    mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) });
    await flush();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows setup words, not an empty board, when no factory is configured", async () => {
    mount({ deckWatch: () => ({ projects: [], projectKey: null, view: null, setup: "No factory is configured yet." }), deckRelease: () => ({ ok: true }) });
    await flush();
    expect(screen.getByText("Set up a factory first")).toBeTruthy();
    expect(screen.queryByText("Versions")).toBeNull();
  });

  it("focuses only the item an explicit Needs-you open names", async () => {
    mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) },
      { focus: { kind: "needs-you", projectKey: "sample-factory", itemId: "n12" } });
    await flush();
    expect(document.activeElement?.id).toBe("wizdeck-need-n12");
  });

  it("asks for a thread on the New thread screen", () => {
    renderSlot({ component: WizDeckNewThreadPanel }, { projectId: null, params: null });
    expect(screen.getByText(/Open a thread to use WizDeck/)).toBeTruthy();
  });
});

describe("shared selection and the same-plugin opener", () => {
  it("opens WizDeck through openThreadPanel with an explicit focus only", () => {
    const openThreadPanel = vi.fn(() => true);
    expect(openWizDeck({ openThreadPanel }, { kind: "needs-you", projectKey: "sample-factory", itemId: "n12" })).toBe(true);
    expect(openWizDeck({ openThreadPanel })).toBe(true);
    expect(openThreadPanel.mock.calls).toEqual([
      [{ actionId: "wizdeck", params: { focus: { kind: "needs-you", projectKey: "sample-factory", itemId: "n12" } } }],
      [{ actionId: "wizdeck", params: { focus: null } }],
    ]);
  });

  // Bug caught: an ordinary selection update navigates or moves focus.
  it("a selection update highlights without navigating", async () => {
    const slot = mount({ deckWatch: () => result("sample-factory"), deckRelease: () => ({ ok: true }) });
    await flush();
    const before = document.activeElement;
    act(() => { setSelection({ kind: "spec", projectKey: "sample-factory", spec: "example-org/sample-app#41" }); });
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(document.activeElement).toBe(before);
    act(() => { setSelection({ kind: "none" }); });
  });
});

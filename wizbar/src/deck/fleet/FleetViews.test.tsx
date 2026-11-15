// @vitest-environment jsdom
// F1 (#75) rendered proofs: the real WizDeck panel and fleet page through the
// SDK's slot harness, with synthetic host state. Fixtures prove no live host.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useState } from "react";
import type { SpecRefV1 } from "../../factory-contract";
import { buildHomeView } from "../data/home";
import type { BoardV1 } from "../data/board";
import type { CacheView } from "../data/cache";
import type { DeckWatchResultV1 } from "../data/server";
import { WizDeckPanel } from "../home/Panel";
import { useLiveFleet } from "../live/useLiveFleet";
import { getSelection, setSelection, useSelection } from "../selection/selection";
import { fxNow, fxPullRequests, fxRunning, fxThreads, REPO, SPEC } from "./fixtures";
import { FleetSection, SpecFleet } from "./FleetViews";
import type { FleetLinksV1 } from "./links";

// The SDK 0.6.33 harness keeps only declared sidebar fields, so the additive
// #160 field is layered on the real hook, as a #160 host would deliver it.
const host160 = vi.hoisted(() => ({ extra: {} as Record<string, unknown> }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) =>
    ({ ...actual.experimental_useSidebarThreads(...args), ...host160.extra }) };
});

const board: BoardV1 = {
  repository: REPO,
  versions: [{
    repository: REPO, number: 3, title: "1.4", dueOn: null, complete: true,
    specs: [{
      ref: SPEC, title: "Search filters for the sample catalogue", url: `https://github.com/${REPO}/issues/41`, state: "open",
      total: 5, merged: 2, complete: true, pullRequests: [],
      status: { status: "ready", now: "Building T2 and T3", next: "Review T2, then merge", when: "Today ~16:00 UTC", updated: "2026-11-15T20:00:00Z" },
    }],
  }],
  merges: { since: "2026-11-14T18:30:00Z", complete: true, pullRequests: [] },
};
const ready = <T,>(data: T) => ({ status: "ready" as const, data, fetchedAt: fxNow - 5_000, stale: false, complete: true, gaps: [] });
const queueItem = {
  id: "n12", code: "N-12", question: "Which changelog headline ships?",
  options: [{ id: "short", label: "Short headline" }, { id: "long", label: "Long headline" }], recommendedOptionId: "short",
  sourceUrl: "https://example.com/sample/n12", spec: null, risk: "ordinary", fingerprint: "fp", createdAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T20:00:00Z",
};
const freshQueue = {
  snapshot: ready({ queue: { schema: "openwiz.needs-you.v1" as const, project: "sample-factory", revision: 2, updatedAt: "2026-11-15T20:20:00Z",
    expiresAt: "2026-11-15T21:00:00Z", complete: true, gaps: [], items: [queueItem] as never }, sha256: "x" }),
  detail: null, nextRefreshAt: fxNow + 55_000, refreshing: false,
};
const result = (withQueue = false): DeckWatchResultV1 => ({
  projects: [{ projectKey: "sample-factory", cloudroomProjectId: "prj_a" }, { projectKey: "other-factory", cloudroomProjectId: "prj_b" }],
  projectKey: "sample-factory", setup: null,
  view: buildHomeView({
    projectKey: "sample-factory", timeZone: "UTC", now: fxNow, authenticated: true,
    queue: withQueue ? freshQueue : { snapshot: { status: "unavailable", reason: "missing", lastGood: null }, detail: "No file.", nextRefreshAt: null, refreshing: false },
    boards: [{ snapshot: ready(board), detail: null, nextRefreshAt: fxNow + 55_000, refreshing: false }],
  }),
});
const linkViews: CacheView<FleetLinksV1>[] = [{ snapshot: ready({ repository: REPO, pullRequests: fxPullRequests }), detail: null, nextRefreshAt: null, refreshing: false }];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false }); vi.setSystemTime(fxNow);
  localStorage.setItem("wizdeck.intro.v1", "seen");
  setSelection({ kind: "none" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

/** The sidebar state a #160 host delivers; `runningThreads` is the additive field. */
const sidebar = (runningThreads?: unknown) => {
  host160.extra = runningThreads === undefined ? {} : { runningThreads };
  return { status: "ready" as const, threads: fxThreads };
};

function mountHome(runningThreads?: unknown, withLinks = false, withQueue = false) {
  return renderSlot({ component: WizDeckPanel }, { threadId: "thr_any", params: null as never }, {
    rpc: { deckWatch: () => ({ ...result(withQueue), ...(withLinks ? { fleetLinks: linkViews } : {}) }), deckRelease: () => ({ ok: true }) } as never,
    context: { projectId: "prj_a", threadId: "thr_any" },
    sidebarThreads: sidebar(runningThreads) as never,
  });
}

/** The fleet page and Home section with work links connected, as the backend lease will supply them. */
function LinkedFleet() {
  const fleet = useLiveFleet("prj_a", linkViews, fxNow)!;
  const selection = useSelection();
  const [page, setPage] = useState<SpecRefV1 | null | undefined>(undefined);
  const view = result().view!;
  const actions = { openUrl: (url: string) => window.dispatchEvent(new CustomEvent("open-url", { detail: url })), openThread: (id: string) => window.dispatchEvent(new CustomEvent("open-thread", { detail: id })) };
  return page === undefined
    ? <FleetSection model={fleet} board={view.board} actions={actions} selection={selection} projectKey="sample-factory" onView={setPage} />
    : <SpecFleet model={fleet} spec={page} board={view.board} actions={actions} selection={selection} projectKey="sample-factory" onBack={() => setPage(undefined)} />;
}
function mountLinked() {
  const opened: { url: string[]; thread: string[] } = { url: [], thread: [] };
  const onUrl = (event: Event) => opened.url.push((event as CustomEvent).detail);
  const onThread = (event: Event) => opened.thread.push((event as CustomEvent).detail);
  window.addEventListener("open-url", onUrl); window.addEventListener("open-thread", onThread);
  const slot = renderSlot({ component: LinkedFleet }, {}, { sidebarThreads: sidebar(fxRunning) as never });
  return { slot, opened };
}

describe("WizDeck Home live insertion", () => {
  // Bug caught: an older host (no running inventory) shows "0 running" and a zero stall count.
  it("keeps Running unavailable on an older host and shows every thread as unplaced, not lost", async () => {
    mountHome();
    await flush();
    expect(screen.getByLabelText("Running: unavailable")).toBeTruthy();
    expect(screen.getByLabelText("Stalls: unavailable")).toBeTruthy();
    const fleet = screen.getByRole("region", { name: "Fleet" });
    expect(within(fleet).getByText(/Running unavailable: this host does not report its running threads · 7 threads/)).toBeTruthy();
    expect(within(fleet).getByText(/Work links were not sent by the backend/)).toBeTruthy();
    expect(within(fleet).getByText(/7 threads · running unknown/)).toBeTruthy();
  });

  // Bug caught: WizDeck's count uses every project's running threads, or counts a duplicate twice.
  it("counts the host's running threads for this project only", async () => {
    mountHome(fxRunning);
    await flush();
    expect(screen.getByLabelText("Running: 4")).toBeTruthy();
    expect(screen.getByText(/4 running in this project · 8 threads/)).toBeTruthy();
    expect(screen.getByLabelText("Stalls: unavailable")).toBeTruthy();
  });

  // Bug caught: the fleet page strands the person (no way back) or the view navigates the center pane.
  it("opens unplaced work inside WizDeck, returns Home, and opens a thread only on explicit Open", async () => {
    const slot = mountHome(fxRunning);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "View unplaced threads" }));
    expect(screen.getByRole("heading", { name: "Unplaced work" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Build T2 filter chips" }));
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(getSelection()).toEqual({ kind: "thread", projectKey: "sample-factory", threadId: "thr_b2" });
    fireEvent.click(screen.getByRole("button", { name: "Open Search helper" }));
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_help" }]);
    fireEvent.click(screen.getByRole("button", { name: "← Home" }));
    expect(screen.queryByRole("heading", { name: "Unplaced work" })).toBeNull();
    expect(screen.getByRole("region", { name: "Fleet" })).toBeTruthy();
  });

  // Bug caught: the backend sends work links but Home never passes them on, so nothing is placed.
  it("places threads from the backend's fleetLinks and opens that spec's fleet page", async () => {
    const slot = mountHome(fxRunning, true);
    await flush();
    const fleet = screen.getByRole("region", { name: "Fleet" });
    expect(within(fleet).queryByText(/Work links were not sent/)).toBeNull();
    expect(within(fleet).getByText(/4 running · 6 threads/)).toBeTruthy();
    expect(within(fleet).getByText(/2 threads · no verified spec link/)).toBeTruthy();
    fireEvent.click(within(fleet).getByRole("button", { name: "View fleet for Search filters for the sample catalogue" }));
    expect([...document.querySelectorAll<HTMLElement>(".wizdeck-fleet-row")].map((row) => row.dataset.thread)).toEqual(["thr_mgr", "thr_b2", "thr_rev", "thr_ghost", "thr_b3", "thr_help"]);
    expect(screen.getByRole("heading", { name: "Merged tickets · 2" })).toBeTruthy();
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  // Bug caught: an explicit Needs-you focus lands while a fleet page hides the item.
  it("returns Home for an explicit Needs-you focus", async () => {
    const slot = mountHome(fxRunning);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "View unplaced threads" }));
    expect(screen.getByRole("heading", { name: "Unplaced work" })).toBeTruthy();
    slot.lifecycle.rerender(<WizDeckPanel threadId="thr_any" params={{ focus: { kind: "needs-you", projectKey: "sample-factory", itemId: "n12" } } as never} />);
    await flush();
    expect(screen.queryByRole("heading", { name: "Unplaced work" })).toBeNull();
    expect(screen.getByRole("region", { name: "Fleet" })).toBeTruthy();
  });
});

describe("R4: an explicit Needs-you focus from a fleet page", () => {
  // Bug caught: Home returns but focus stays on the document body, not the requested decision.
  it("focuses the requested queue item once Home is back, and later highlights or refreshes move nothing", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const slot = mountHome(fxRunning, true, true);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /View fleet for/ }));
    const search = screen.getByPlaceholderText("Search threads, branches, #refs");
    search.focus();
    expect(document.activeElement).toBe(search);
    slot.lifecycle.rerender(<WizDeckPanel threadId="thr_any" params={{ focus: { kind: "needs-you", projectKey: "sample-factory", itemId: "n12" } } as never} />);
    await flush(); await flush();
    expect(document.activeElement?.id).toBe("wizdeck-need-n12");

    // Ordinary selection and a realtime refresh afterwards never move focus, scroll or navigate.
    const item = document.activeElement;
    act(() => setSelection({ kind: "thread", projectKey: "sample-factory", threadId: "thr_b2" }));
    await slot.behavior.emitRealtime("wizdeck", {});
    await flush();
    expect(document.activeElement).toBe(item);
    expect(scroll).not.toHaveBeenCalled();
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
});

describe("spec fleet page with work links", () => {
  // Bug caught: hierarchy flattened, links guessed, or merged work mixed into the live rows.
  it("shows the spec's managers, builders and indented helpers with known links, and merged tickets apart", async () => {
    const { opened } = mountLinked();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "View fleet for Search filters for the sample catalogue" }));
    expect(screen.getByRole("heading", { name: "Search filters for the sample catalogue" })).toBeTruthy();
    expect(screen.getByText("Building T2 and T3")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    const summary = screen.getByRole("region", { name: "Fleet summary" });
    expect(within(summary).getByLabelText("Running: 4")).toBeTruthy();
    expect(within(summary).getByLabelText("Threads: 6")).toBeTruthy();
    expect(within(summary).getByLabelText("Stalls: unavailable")).toBeTruthy();

    const rows = [...document.querySelectorAll<HTMLElement>(".wizdeck-fleet-row")];
    expect(rows.map((row) => [row.dataset.thread, row.dataset.depth])).toEqual([
      ["thr_mgr", "0"], ["thr_b2", "1"], ["thr_rev", "2"], ["thr_ghost", "2"], ["thr_b3", "1"], ["thr_help", "2"],
    ]);
    const b2 = within(rows[1]);
    expect(b2.getByText(/builder · running · stall unavailable/)).toBeTruthy();
    fireEvent.click(b2.getByRole("button", { name: "#43" }));
    fireEvent.click(b2.getByRole("button", { name: "PR #52" }));
    expect(opened.url).toEqual([`https://github.com/${REPO}/issues/43`, `https://github.com/${REPO}/pull/52`]);
    expect(within(rows[4]).getByText(/helper\/reviewer · running · stall unavailable · no pull request for its branch/)).toBeTruthy();
    expect(within(rows[5]).getByText(/helper\/reviewer · idle · hidden · no work link: no branch/)).toBeTruthy();
    expect(document.querySelector("[style*='245, 165, 36'], [style*='f5a524']")).toBeNull(); // No amber without evidence.

    const merged = screen.getByRole("heading", { name: "Merged tickets · 2" }).nextElementSibling as HTMLElement;
    expect(within(merged).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["#42Filter modelPR #50", "#45Facet countsPR #51"]);
    expect(opened.thread).toEqual([]);
  });

  // Bug caught: search hides a helper's builder, or sorting changes the tree shape.
  it("searches and sorts the fleet rows only", async () => {
    mountLinked();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /View fleet for/ }));
    fireEvent.change(screen.getByPlaceholderText("Search threads, branches, #refs"), { target: { value: "room/t3" } });
    expect([...document.querySelectorAll<HTMLElement>(".wizdeck-fleet-row")].map((row) => row.dataset.thread)).toEqual(["thr_mgr", "thr_b3"]);
    fireEvent.change(screen.getByPlaceholderText("Search threads, branches, #refs"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "title" } });
    expect([...document.querySelectorAll<HTMLElement>(".wizdeck-fleet-row")].map((row) => row.dataset.depth)).toEqual(["0", "1", "2", "2", "1", "2"]);
  });

  // Bug caught: a highlight from the sidebar moves the deck (navigation, scroll or focus).
  it("highlights a selected thread's spec and a selected spec without navigating, scrolling or moving focus", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { slot, opened } = mountLinked();
    await flush();
    const before = document.activeElement;
    act(() => setSelection({ kind: "thread", projectKey: "sample-factory", threadId: "thr_help" }));
    expect(document.querySelector(`[data-spec="${SPEC}"]`)?.getAttribute("data-highlighted")).toBe("true");
    act(() => setSelection({ kind: "spec", projectKey: "sample-factory", spec: SPEC }));
    expect(document.querySelector(`[data-spec="${SPEC}"]`)?.getAttribute("data-highlighted")).toBe("true");
    act(() => setSelection({ kind: "thread", projectKey: "other-factory", threadId: "thr_help" }));
    expect(document.querySelector(`[data-spec="${SPEC}"]`)?.getAttribute("data-highlighted")).toBeNull();
    await flush();
    expect(scroll).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(opened.thread).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Search filters for the sample catalogue" })).toBeNull();
  });
});

// @vitest-environment jsdom
// WB4-2 (openwizdev/OpenWiz#1436), S3: the 0.3 thread cards with the matrix
// mark and model and effort beside the harness logo (specs-section.v1.md
// sections 5 and 6). Every row is synthetic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { v4Matrix, v4Now, v4PullRequests, v4Threads } from "./fixtures/v4";

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;
const ids = ["thr_v4_fleet_a", "thr_v4_reviewer_a", "thr_v4_waiting", "thr_v4_failed", "thr_v4_checks", "thr_v4_merged", "thr_v4_idle"];
// As top-level cards: the inbox lists children under their parent, not as cards.
const threads = v4Threads.filter((t) => ids.includes(t.id)).map((t) => ({ ...t, parentThreadId: null }));

function show(model: string | null) {
  renderSlot(inbox, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" }, {
    sidebarThreads: { status: "ready", threads, projects: [] },
    sidebarPullRequests: v4PullRequests,
    rpc: {
      listLifecycle: () => ({ rows: [] }),
      cardModels: ({ threadIds }: { threadIds: string[] }) => ({ source: "host", items: threadIds.map((threadId) => ({ threadId, model, effort: model && "high" })) }),
    } as never,
  });
}
const card = (id: string) => document.querySelector(`[data-sidebar-thread-id="${id}"]`)!.closest("li")!;
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("S3: thread cards (sections 5 and 6)", () => {
  // catches: a card without its state, a pull-request state lost on a card, or a mark added to quiet idle cards.
  it.each(ids)("shows the app's matrix state on %s, none when idle", (id) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    show(null);
    const mark = card(id).querySelector("[data-matrix]");
    const expected = v4Matrix[id]!.app;
    expect(mark?.getAttribute("data-matrix") ?? "idle").toBe(expected);
    if (expected === "idle") expect(mark).toBeNull();
  });

  // catches: model and effort drawn away from the harness logo, or shown when the source has none.
  it("puts model and effort right before the harness logo, and nothing when missing", async () => {
    show("Sample model 2");
    const label = await within(card("thr_v4_fleet_a")).findByText("Sample model 2 · High");
    expect(label.nextElementSibling?.getAttribute("data-provider")).toBe("harness-b");
    cleanup();
    show(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(card("thr_v4_fleet_a")).queryByText(/·/)).toBeNull();
  });
});

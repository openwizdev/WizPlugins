// @vitest-environment jsdom
// WB4-2 (openwizdev/OpenWiz#1436), S3, as round 5 A (#115) left it: the 0.3
// thread cards with no matrix mark, and model and effort beside the harness logo (specs-section.v1.md
// sections 5 and 6). Every row is synthetic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { v4Now, v4PullRequests, v4Threads } from "./fixtures/v4";

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
  // Round 5 A (#115): cards carry no matrix mark; the harness glyph stays.
  // catches: a mark back beside the children chip, or the harness glyph lost with it.
  it.each(ids)("draws no matrix mark on %s, and keeps its harness glyph", (id) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    show(null);
    expect(card(id).querySelector("[data-matrix]")).toBeNull();
    expect(card(id).querySelector("[data-provider]")).not.toBeNull();
  });

  // catches: model and effort drawn as a bordered chip instead of quiet text.
  it("draws model and effort as quiet muted text with no chip border", async () => {
    show("Sample model 2");
    const label = await within(card("thr_v4_fleet_a")).findByText("Sample model 2 · High");
    expect(label.className).not.toMatch(/(^|\s)border(\s|$)|rounded/);
    expect(label.className).toMatch(/text-muted-foreground/);
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

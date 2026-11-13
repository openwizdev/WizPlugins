// WZ19 (#43): the children list of contracts/sidebar-v3.v1.md section 3. The
// expected values are the hand-worked fixtures and literals, never this code.
import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { childrenList } from "./children";
import { v3Children, v3Now, v3Threads } from "./fixtures/v3";

const parent = v3Threads.find((t) => t.id === "thr_v3_parent_many")!;
const row = (id: string, overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread => ({
  ...parent, id, displayTitle: `Child ${id}`, parentThreadId: "thr_p", status: "idle", runtimeStatus: "idle",
  hasPendingInteraction: false, isUnread: false, queuedWork: "none", indicator: "none",
  activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
  createdAt: 10, updatedAt: 20, ...overrides,
});

describe("childrenList", () => {
  it.each(Object.keys(v3Children))("matches the hand-worked fixture for %s", (id) => {
    expect(childrenList(v3Threads, id)).toEqual(v3Children[id]);
  });

  it("returns an empty list for a child or a thread no row names", () => {
    expect(childrenList(v3Threads, "thr_v3_child_working")).toEqual({ parentThreadId: "thr_v3_child_working", children: [] });
  });

  // First matching wins: waiting, failed, working, unread, idle.
  it.each([
    ["waiting beats failed and working", { hasPendingInteraction: true, status: "error", runtimeStatus: "active" }, "waiting"],
    ["failed by status", { status: "error", isUnread: true }, "failed"],
    ["failed by runtime", { runtimeStatus: "error" }, "failed"],
    ["failed by queued work beats working", { queuedWork: "failed", runtimeStatus: "active" }, "failed"],
    ["working by runtime", { runtimeStatus: "starting", isUnread: true }, "working"],
    ["working by a goal counter on an idle runtime", { activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 1 } }, "working"],
    ["working although the indicator shows nothing", { runtimeStatus: "pending", indicator: "none" }, "working"],
    ["unread", { isUnread: true }, "unread"],
    ["idle", {}, "idle"],
  ] as const)("status: %s", (_name, overrides, status) => {
    const result = childrenList([row("thr_c", overrides as Partial<PluginSidebarThread>)], "thr_p");
    expect(result?.children.map((c) => c.status)).toEqual([status]);
  });

  it("orders by createdAt, then id by code unit, and includes hidden rows", () => {
    const rows = [
      row("thr_b", { createdAt: 5 }), row("thr_a", { createdAt: 5, isHidden: true }),
      row("thr_Z", { createdAt: 5 }), row("thr_first", { createdAt: 1 }), row("thr_other", { parentThreadId: "thr_q" }),
    ];
    expect(childrenList(rows, "thr_p")?.children.map((c) => c.id)).toEqual(["thr_first", "thr_Z", "thr_a", "thr_b"]);
  });

  it("gives model and effort only from a host cardModels source", () => {
    const rows = [row("thr_a"), row("thr_b", { createdAt: 11 })];
    const items = [
      { threadId: "thr_a", model: " Sample model ", effort: "high" as const },
      { threadId: "thr_b", model: "  ", effort: "low" as const },
    ];
    expect(childrenList(rows, "thr_p", { source: "host", items })?.children.map(({ model, effort }) => [model, effort]))
      .toEqual([["Sample model", "high"], [null, null]]);
    expect(childrenList(rows, "thr_p", { source: "none", items })?.children.map(({ model, effort }) => [model, effort]))
      .toEqual([[null, null], [null, null]]);
  });

  it("carries title and updatedAt as the row has them", () => {
    expect(childrenList([row("thr_a", { displayTitle: "Sample title", updatedAt: v3Now - 5 })], "thr_p")?.children)
      .toEqual([{ id: "thr_a", status: "idle", title: "Sample title", model: null, effort: null, updatedAt: v3Now - 5 }]);
  });

  // Section 1: an unrecognised runtime status cannot mean idle, and a repeated
  // ID is not one fact, so the result is unavailable, never a guess.
  it.each([
    ["unknown runtime status", [row("thr_a", { runtimeStatus: "future-state" as never })]],
    ["unknown runtime status on another row", [row("thr_a"), row("thr_x", { parentThreadId: null, runtimeStatus: "host-reconnecting" as never })]],
    ["repeated id", [row("thr_a"), row("thr_a", { isUnread: true })]],
  ])("is unavailable (null) for %s", (_name, rows) => {
    expect(childrenList(rows, "thr_p")).toBeNull();
  });
});

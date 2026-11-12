import { describe, expect, it } from "vitest";
import { childrenOf } from "../inbox";
import { classifyMachine } from "../machine-source";
import { countRunning } from "../running-count";
import { readRunningSource } from "../running-source";
import { isWorking } from "../useLifecycle";
import {
  v3BranchCases, v3CardModelsNone, v3Children, v3IssueNumbers, v3Now, v3PinnedOrder,
  v3PullRequests, v3Stats, v3Threads, v3TimeZone,
} from "./v3";

// V0 (WZ17): later tickets test their cards, children, stats and pins on these
// rows. A fixture that silently lost a case (no Local row, no single child, no
// waiting thread) would let those tickets pass without exercising it, and a
// hand-written expectation that disagreed with the shipped readers would make
// them encode a wrong answer. The shipped readers below are independent of
// every v0.3 computation, which does not exist yet.
const byId = new Map(v3Threads.map((thread) => [thread.id, thread]));

describe("V0: synthetic v0.3 fixtures cover the contract's cases", () => {
  it("uses only made-up ids, titles and hosts, with no paths", () => {
    expect(new Set(byId.keys()).size).toBe(v3Threads.length);
    for (const thread of v3Threads) {
      expect(thread.id).toMatch(/^thr_v3_[a-z0-9_]+$/);
      expect(thread.projectId).toMatch(/^prj_v3_[a-z]+$/);
      expect(thread.displayTitle).toMatch(/^Sample /);
      expect(thread.environment?.path ?? null).toBeNull();
      expect(thread.host?.name ?? "Synthetic host").toBe("Synthetic host");
    }
  });

  it("has zero, one and many children by the shipped parent-link rule", () => {
    const counts = v3Threads.filter((t) => t.parentThreadId === null)
      .map((t) => childrenOf(v3Threads, t.id).length);
    expect(counts).toContain(0);
    expect(counts).toContain(1);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(3);
  });

  it("has Cloud, Local and unknown rows by the shipped machine rule, running and not", () => {
    const kinds = (rows: typeof v3Threads) => new Set(rows.map((t) => classifyMachine(t)));
    expect(kinds(v3Threads)).toEqual(new Set(["Cloud", "Local", null]));
    expect(kinds(v3Threads.filter(isWorking))).toEqual(new Set(["Cloud", "Local", null]));
  });

  it("has waiting, failed, pinned (keyed and unkeyed) and finished-today rows", () => {
    expect(v3Threads.some((t) => t.hasPendingInteraction)).toBe(true);
    expect(v3Threads.some((t) => t.status === "error")).toBe(true);
    expect(v3Threads.some((t) => t.isPinned && t.pinSortKey !== null)).toBe(true);
    expect(v3Threads.some((t) => t.isPinned && t.pinSortKey === null)).toBe(true);
    expect(v3TimeZone).toBe("UTC");
    const startOfToday = Date.parse("2026-11-12T00:00:00Z");
    expect(v3Now).toBeGreaterThan(startOfToday);
    const finished = v3Threads.filter((t) => !isWorking(t) && !t.hasPendingInteraction && t.status !== "error");
    expect(finished.some((t) => t.latestAttentionAt >= startOfToday)).toBe(true);
    expect(finished.some((t) => t.latestAttentionAt < startOfToday)).toBe(true);
  });

  it("states expected stats that agree with the shipped running count and machine rule", () => {
    if (v3Stats.status !== "ready") throw new Error("fixture stats must be ready");
    const shipped = countRunning(readRunningSource({ status: "ready", threads: v3Threads }, "connected"));
    expect(v3Stats.running.total).toBe(shipped?.threads);
    const running = v3Threads.filter(isWorking);
    expect(v3Stats.running.topLevel).toBe(running.filter((t) => t.parentThreadId === null).length);
    expect(v3Stats.running.children).toBe(running.filter((t) => t.parentThreadId !== null).length);
    expect([v3Stats.running.cloud, v3Stats.running.local, v3Stats.running.unknown]).toEqual(
      (["Cloud", "Local", null] as const).map((kind) => running.filter((t) => classifyMachine(t) === kind).length),
    );
    expect(v3Stats.window).toEqual({
      timeZone: "UTC", start: Date.parse("2026-11-12T00:00:00Z"), end: Date.parse("2026-11-13T00:00:00Z"),
    });
    expect(v3Stats.coverage).toEqual({ scope: "observable-sidebar", subagents: "not-counted", unseen: "possible" });
  });

  it("states expected children that are the shipped parent-link set, with titles from the rows", () => {
    for (const [parentId, expected] of Object.entries(v3Children)) {
      expect(expected.parentThreadId).toBe(parentId);
      expect(expected.children.map((c) => c.id).sort()).toEqual(childrenOf(v3Threads, parentId).map((c) => c.id).sort());
      for (const child of expected.children) {
        expect(child.title).toBe(byId.get(child.id)?.displayTitle);
        expect(child.updatedAt).toBe(byId.get(child.id)?.updatedAt);
        expect([child.model, child.effort]).toEqual([null, null]);
      }
    }
    expect(Object.keys(v3Children).sort()).toEqual(
      v3Threads.filter((t) => t.parentThreadId === null).map((t) => t.id).sort(),
    );
  });

  it("covers pinned order, pull requests, branch parsing and the model source", () => {
    expect(new Set(v3PinnedOrder)).toEqual(new Set(v3Threads.filter((t) => t.isPinned).map((t) => t.id)));
    for (const [id, state] of Object.entries(v3PullRequests)) expect(byId.has(id)).toBe(true), expect(state.isLoading).toBe(false);
    expect(Object.values(v3PullRequests).some((s) => s.pullRequest === null)).toBe(true);
    expect(Object.values(v3PullRequests).some((s) => s.pullRequest !== null)).toBe(true);
    expect(v3BranchCases.some(([, n]) => n === null)).toBe(true);
    expect(v3BranchCases.some(([, n]) => n !== null)).toBe(true);
    for (const [id, issue] of Object.entries(v3IssueNumbers)) {
      expect(v3BranchCases).toContainEqual([byId.get(id)?.environment?.branchName ?? null, issue]);
    }
    expect(v3CardModelsNone.source).toBe("none");
    expect(v3CardModelsNone.items.every((item) => item.model === null && item.effort === null)).toBe(true);
  });
});

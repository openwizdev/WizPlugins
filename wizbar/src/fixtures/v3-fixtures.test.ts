import { describe, expect, it } from "vitest";
import { childrenOf } from "../inbox";
import { hasRuntimeWork } from "../lifecycle";
import { classifyMachine } from "../machine-source";
import { countRunning } from "../running-count";
import { readRunningSource } from "../running-source";
import { isWorking } from "../useLifecycle";
import {
  v3BranchCases, v3CardMeta, v3CardModelsNone, v3Children, v3DragPinCases, v3IssueNumbers, v3Now,
  v3PinnedOrder, v3PullRequests, v3Stats, v3Threads, v3TimeZone,
} from "./v3";

// V0 (WZ17): later tickets test their cards, children, stats and pins on these
// rows. A fixture that silently lost a case (no Local row, no single child, no
// waiting thread) would let those tickets pass without exercising it, and a
// hand-written expectation that disagreed with the shipped readers would make
// them encode a wrong answer. The shipped readers below are independent of
// every v0.3 computation, which does not exist yet.
const byId = new Map(v3Threads.map((thread) => [thread.id, thread]));
// The contract's shared working fact: the same inputs on both readers.
const working = (t: (typeof v3Threads)[number]) => hasRuntimeWork(t.runtimeStatus, Object.values(t.activity));

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
    expect(kinds(v3Threads.filter(working))).toEqual(new Set(["Cloud", "Local", null]));
  });

  it("has waiting, failed, pinned (keyed and unkeyed) and finished-today rows", () => {
    expect(v3Threads.some((t) => t.hasPendingInteraction)).toBe(true);
    expect(v3Threads.some((t) => t.status === "error")).toBe(true);
    expect(v3Threads.some((t) => t.isPinned && t.pinSortKey !== null)).toBe(true);
    expect(v3Threads.some((t) => t.isPinned && t.pinSortKey === null)).toBe(true);
    expect(v3TimeZone).toBe("UTC");
    const startOfToday = Date.parse("2026-11-12T00:00:00Z");
    expect(v3Now).toBeGreaterThan(startOfToday);
    const finished = v3Threads.filter((t) => !working(t) && !t.hasPendingInteraction && t.status !== "error");
    expect(finished.some((t) => t.latestAttentionAt >= startOfToday)).toBe(true);
    expect(finished.some((t) => t.latestAttentionAt < startOfToday)).toBe(true);
  });

  it("has the row where the footer's indicator rule and the shared runtime rule disagree", () => {
    // Runtime work behind an attention indicator: isWorking says no, the shared rule says yes.
    const masked = v3Threads.filter((t) => working(t) !== isWorking(t)).map((t) => t.id);
    expect(masked).toEqual(["thr_v3_active_waiting"]);
    const row = byId.get("thr_v3_active_waiting");
    expect([row?.runtimeStatus, row?.indicator, row?.hasPendingInteraction]).toEqual(["active", "waiting-for-input", true]);
    expect(Object.values(row?.activity ?? {}).every((count) => count === 0)).toBe(true);
  });

  it("states expected stats from the shared runtime rule, with finished today unavailable", () => {
    if (v3Stats.status !== "ready") throw new Error("fixture stats must be ready");
    const running = v3Threads.filter(working);
    expect(v3Stats.running.total).toBe(running.length);
    // The list-bottom line keeps isWorking; here it is one lower, the masked row.
    const shipped = countRunning(readRunningSource({ status: "ready", threads: v3Threads }, "connected"));
    expect(v3Stats.running.total - (shipped?.threads ?? NaN)).toBe(1);
    expect(v3Stats.running.topLevel).toBe(running.filter((t) => t.parentThreadId === null).length);
    expect(v3Stats.running.children).toBe(running.filter((t) => t.parentThreadId !== null).length);
    expect([v3Stats.running.cloud, v3Stats.running.local, v3Stats.running.unknown]).toEqual(
      (["Cloud", "Local", null] as const).map((kind) => running.filter((t) => classifyMachine(t) === kind).length),
    );
    expect(v3Stats.waitingOnYou).toBe(v3Threads.filter((t) => t.hasPendingInteraction).length);
    expect(v3Stats.finishedToday).toEqual({ source: "none", count: null });
    expect(v3Stats.window).toEqual({
      timeZone: "UTC", start: Date.parse("2026-11-12T00:00:00Z"), end: Date.parse("2026-11-13T00:00:00Z"),
    });
    expect(v3Stats.coverage).toEqual({ scope: "observable-sidebar", subagents: "not-counted", unseen: "possible" });
  });

  it("states every drag-into-Pinned outcome, including pinned but not placed", () => {
    expect(v3DragPinCases.map((c) => c.outcome.kind)).toEqual(["pinned-placed", "pin-failed", "pinned-not-placed", "unknown"]);
    for (const c of v3DragPinCases) {
      expect(c.reorder === "skipped").toBe(c.pin === "failed");
      expect(c.outcome.kind === "unknown").toBe(c.rowsAfter === "unavailable");
    }
    const partial = v3DragPinCases.find((c) => c.outcome.kind === "pinned-not-placed");
    expect([partial?.pin, partial?.reorder, partial?.rowsAfter]).toEqual(["ok", "failed", "ready"]);
  });

  it("states child statuses from the shared runtime rule", () => {
    for (const { children } of Object.values(v3Children)) {
      for (const child of children) {
        const row = byId.get(child.id);
        if (!row) throw new Error(child.id);
        const failed = row.status === "error" || row.runtimeStatus === "error" || row.queuedWork === "failed";
        const status = row.hasPendingInteraction ? "waiting" : failed ? "failed" : working(row) ? "working"
          : row.isUnread ? "unread" : "idle";
        expect(child.status, child.id).toBe(status);
      }
    }
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
    for (const [id, state] of Object.entries(v3PullRequests)) {
      expect(byId.has(id)).toBe(true);
      expect(state.isLoading).toBe(false);
    }
    expect(Object.values(v3PullRequests).some((s) => s.pullRequest === null)).toBe(true);
    expect(Object.values(v3PullRequests).some((s) => s.pullRequest !== null)).toBe(true);
    expect(v3BranchCases.some(([, n]) => n === null)).toBe(true);
    expect(v3BranchCases.some(([, n]) => n !== null)).toBe(true);
    for (const [id, issue] of Object.entries(v3IssueNumbers)) {
      expect(v3BranchCases).toContainEqual([byId.get(id)?.environment?.branchName ?? null, issue]);
    }
    expect(Object.keys(v3CardMeta).sort()).toEqual([...byId.keys()].sort());
    for (const [id, meta] of Object.entries(v3CardMeta)) {
      const pr = v3PullRequests[id]?.pullRequest ?? null;
      expect(meta.childCount).toBe(childrenOf(v3Threads, id).length);
      expect(meta.branch).toBe(byId.get(id)?.environment?.branchName ?? null);
      expect(meta.link?.pullRequest ?? null).toEqual(pr && { number: pr.number, url: pr.url });
      expect(meta.link?.issueNumber ?? null).toBe(v3IssueNumbers[id] ?? null);
      expect([meta.model, meta.effort]).toEqual([null, null]);
    }
    expect(v3CardModelsNone.source).toBe("none");
    expect(v3CardModelsNone.items.every((item) => item.model === null && item.effort === null)).toBe(true);
  });
});

// F1 (#75) live health proofs: the scoped running set and the final
// timeline-to-amber chain on C1's synthetic timelines. Fixtures prove no live host.
import { describe, expect, it } from "vitest";
import {
  readHostInventory, readTimelineActivity, type ActivityEvidenceV1, type StallThresholdV1,
} from "../../factory-contract";
import {
  fxNow as c1Now, fxTimelineInactive, fxTimelineLongTool, fxTimelineOlderPage,
} from "../../factory-contract/fixtures";
import { liveHealth, scopedRunning, stallLabel } from "./health";
import { fxRunning } from "../fleet/fixtures";

const ready = readHostInventory({ runningThreads: fxRunning });

describe("scoped running inventory", () => {
  // Bug caught: an older host (no runningThreads) shown as "0 running".
  it("keeps an absent inventory unavailable and a real empty inventory zero", () => {
    expect(scopedRunning(readHostInventory({}), "prj_a")).toEqual({ status: "unavailable", reason: "absent", count: null });
    expect(scopedRunning(readHostInventory({ runningThreads: [] }), "prj_a")).toMatchObject({ status: "ready", count: 0 });
    expect(scopedRunning({ status: "not-ready", reason: "stale" }, "prj_a")).toMatchObject({ status: "unavailable", count: null });
  });

  // Bug caught: WizDeck counting every project's running threads, or a duplicate twice.
  it("counts exactly the selected project's deduplicated rows", () => {
    const running = scopedRunning(ready, "prj_a");
    expect(running.status === "ready" && running.rows.map((row) => row.id)).toEqual(["thr_mgr", "thr_b2", "thr_b3", "thr_ghost"]);
    expect(running.count).toBe(4);
    expect(scopedRunning(ready, "prj_b").count).toBe(1);
  });
});

describe("timeline to amber (final F1 proof on synthetic timelines)", () => {
  const one = (evidence: ActivityEvidenceV1, threshold?: StallThresholdV1, now = c1Now) =>
    liveHealth({ inventory: readHostInventory({ runningThreads: [{ id: "thr_x", projectId: "prj_a", parentThreadId: null }] }), projectId: "prj_a", activity: () => evidence, threshold, now });
  const factory: StallThresholdV1 = { source: "factory", role: "builder", state: "running", thresholdMs: 30 * 60_000, reference: "synthetic policy" };

  // Bug caught: a 90-minute command reads as a 90-minute idle stall.
  it("never marks a long-running tool amber", () => {
    const health = one(readTimelineActivity(fxTimelineLongTool, c1Now - 5_000), factory);
    expect(health.stalls.get("thr_x")).toEqual({ status: "operation-pending" });
    expect(stallLabel(health.stalls.get("thr_x"))).toEqual({ text: "tool running", amber: false });
    expect(health.stallCount).toBeNull();
  });

  // Bug caught: host row times (stored-event insertion times) used as the idle clock.
  it("does not turn three-hour-old row times into idle time or amber", () => {
    const health = one(readTimelineActivity(fxTimelineInactive, c1Now - 5_000), factory);
    expect(health.stalls.get("thr_x")).toEqual({ status: "unavailable", reason: "no-activity-clock" });
    expect(stallLabel(health.stalls.get("thr_x"))).toEqual({ text: "stall unavailable", amber: false });
    expect(health.stallCount).toBeNull();
    expect(health.stallDetail).toContain("no verified last-activity time");
  });

  // Bug caught: stale, older-page or absent evidence treated as healthy or idle.
  it("keeps absent, older-page and stale evidence unavailable", () => {
    expect(one({ status: "unavailable", reason: "not-read" }).stalls.get("thr_x")).toEqual({ status: "unavailable", reason: "no-activity-evidence" });
    expect(one(readTimelineActivity(fxTimelineOlderPage, c1Now), factory).stalls.get("thr_x")).toEqual({ status: "unavailable", reason: "no-activity-evidence" });
    const stale = { status: "read", fetchedAt: c1Now - 61_000, activeTurnId: null, pendingOperations: 0, lastActivityAt: c1Now - 61_000 } as const;
    expect(one(stale, factory).stalls.get("thr_x")).toEqual({ status: "unavailable", reason: "stale-observation" });
  });

  // Bug caught: amber with no sourced threshold. Today's threshold is C1's `none`.
  it("shows no amber without a factory threshold, even with a clock", () => {
    const verified = { status: "read", fetchedAt: c1Now, activeTurnId: null, pendingOperations: 0, lastActivityAt: c1Now - 3 * 3_600_000 } as const;
    expect(one(verified).stalls.get("thr_x")).toEqual({ status: "unavailable", reason: "no-threshold" });
  });

  // Seam proof only (no such host source exists yet): given a verified clock and
  // a sourced threshold, progress resets idle and amber clears. Bug caught: idle
  // measured from the first observation instead of the latest progress.
  it("resets idle on later progress through the verified-source seam", () => {
    const at = (lastActivityAt: number) => ({ status: "read", fetchedAt: c1Now, activeTurnId: "turn", pendingOperations: 0, lastActivityAt }) as const;
    const before = one(at(c1Now - 45 * 60_000), factory);
    expect(stallLabel(before.stalls.get("thr_x"))).toEqual({ text: "stalled · idle 45 min", amber: true });
    expect(before.stallCount).toBe(1);
    const after = one(at(c1Now - 2 * 60_000), factory);
    expect(stallLabel(after.stalls.get("thr_x"))).toEqual({ text: "active · idle 2 min", amber: false });
    expect(after.stallCount).toBe(0);
  });

  // Bug caught: no inventory, yet a stall count of zero.
  it("has no stall count without an inventory", () => {
    const health = liveHealth({ inventory: readHostInventory({}), projectId: "prj_a", now: c1Now });
    expect(health.stallCount).toBeNull();
    expect(health.stalls.size).toBe(0);
  });
});

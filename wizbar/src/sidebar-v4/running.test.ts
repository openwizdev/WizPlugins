// B1 (#76), P6: the running count and its popover share one deduplicated set.
// Expected values are worked by hand from the synthetic rows in ./fixtures.
import { describe, expect, it } from "vitest";
import { b1Inventory, b1Row, b1Running } from "./fixtures";
import { readRunningRows, type RunningRowsV4 } from "./running";

const ids = (result: RunningRowsV4) => result.status === "ready"
  ? result.groups.map((group) => ({
    heading: group.heading,
    entries: group.entries.map(({ thread, depth }) => [thread.id, depth]),
  }))
  : result;

describe("B1 P6: one running set feeds the count and the popover", () => {
  it("counts each delivered running row once and places every one of them under a heading", () => {
    // Bug caught: a counted thread with no row (hidden, child, absent parent),
    // or a repeated id counted twice.
    const { threads, runningThreads, childrenByParentId } = b1Inventory();
    const result = readRunningRows({ status: "ready", threads, runningThreads, childrenByParentId }, "connected");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.source).toBe("host-inventory");
    expect(result.count).toBe(7);
    expect(ids(result)).toEqual([
      { heading: null, entries: [["thr_b1_hidden", 0]] },
      { heading: null, entries: [["thr_b1_manager", 0], ["thr_b1_builder", 1], ["thr_b1_helper", 2], ["thr_b1_reviewer", 1]] },
      { heading: { kind: "parent", parentId: "thr_b1_release", title: "Release prep" }, entries: [["thr_b1_docs", 0]] },
      { heading: { kind: "unplaced", parentId: "thr_b1_absent" }, entries: [["thr_b1_orphan", 0]] },
    ]);
    const listed = result.groups.flatMap((group) => group.entries.map(({ thread }) => thread.id));
    expect(listed).toHaveLength(result.count);
    expect(new Set(listed).size).toBe(result.count);
  });

  it("never turns a parent heading or an in-process subagent count into a counted row", () => {
    // Bug caught: the idle parent heading or the orphan's 3 background agents
    // inflating a list of actual threads.
    const { threads, runningThreads } = b1Inventory();
    const result = readRunningRows({ status: "ready", threads, runningThreads }, "connected");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.rows.map(({ id }) => id)).not.toContain("thr_b1_release");
    expect(result.count).toBe(7);
  });

  it("keeps a host's empty running list as a real zero, and its absence as the observable fallback", () => {
    const working = b1Running("thr_b1_working");
    const waiting = b1Running("thr_b1_waiting", { hasPendingInteraction: true, indicator: "waiting-for-input" });
    const zero = readRunningRows({ status: "ready", threads: [working], runningThreads: [] }, "connected");
    expect(zero).toMatchObject({ status: "ready", source: "host-inventory", count: 0, groups: [] });
    // Older host: no `runningThreads`. The sidebar rows by the one running rule, still one set.
    const fallback = readRunningRows({ status: "ready", threads: [working, waiting, working, b1Row("thr_b1_idle")] }, "connected");
    expect(fallback).toMatchObject({ status: "ready", source: "observable-sidebar", count: 1 });
    expect(ids(fallback)).toEqual([{ heading: null, entries: [["thr_b1_working", 0]] }]);
  });

  it.each([
    ["a repeated id with another parent", () => [b1Running("thr_b1_a"), b1Running("thr_b1_a", { parentThreadId: "thr_b1_p" })], "conflicting-duplicate"],
    ["a row without a usable title", () => [{ ...b1Running("thr_b1_a"), displayTitle: 7 }], "malformed"],
    ["a row without a native link", () => [{ ...b1Running("thr_b1_a"), href: "" }], "malformed"],
    ["a list that is not an array", () => ({ length: 1 }), "malformed"],
  ])("refuses %s instead of guessing a number", (_, running, reason) => {
    expect(readRunningRows({ status: "ready", threads: [], runningThreads: running() as never }, "connected"))
      .toEqual({ status: "unavailable", reason });
  });

  it.each([
    ["loading", "connected", "loading"],
    ["error", "connected", "error"],
    ["ready", "reconnecting", "stale"],
  ] as const)("shows no number while the host rows are %s on a %s connection", (status, connection, reason) => {
    const { threads, runningThreads } = b1Inventory();
    expect(readRunningRows({ status, threads, runningThreads }, connection)).toEqual({ status: "unavailable", reason });
  });

  it("keeps the same order when the host delivers the same rows in another order", () => {
    // Bug caught: rows jumping when the host reorders or re-projects its list.
    const { threads, runningThreads } = b1Inventory();
    const forward = readRunningRows({ status: "ready", threads, runningThreads }, "connected");
    const reversed = readRunningRows({ status: "ready", threads: [...threads].reverse(), runningThreads: [...runningThreads].reverse() }, "connected");
    expect(ids(reversed)).toEqual(ids(forward));
  });

  it("places a child under its parent even when the parent row only arrives in the running set", () => {
    const parent = b1Running("thr_b1_p", { displayTitle: "Parent", createdAt: 2_000 });
    const child = b1Running("thr_b1_c", { parentThreadId: parent.id, createdAt: 2_500, isHidden: true });
    const result = readRunningRows({ status: "ready", threads: [], runningThreads: [child, parent] }, "connected");
    expect(ids(result)).toEqual([{ heading: null, entries: [["thr_b1_p", 0], ["thr_b1_c", 1]] }]);
  });

  it("breaks a parent cycle instead of dropping its rows", () => {
    const a = b1Running("thr_b1_a", { parentThreadId: "thr_b1_b", createdAt: 1 });
    const b = b1Running("thr_b1_b", { parentThreadId: "thr_b1_a", createdAt: 2 });
    const result = readRunningRows({ status: "ready", threads: [], runningThreads: [a, b] }, "connected");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.count).toBe(2);
    expect(result.groups.flatMap((group) => group.entries.map(({ thread }) => thread.id)).sort()).toEqual(["thr_b1_a", "thr_b1_b"]);
  });
});

// B1 (#76), P6: a parent's children in the sidebar. Expected values are worked
// by hand from the synthetic rows in ./fixtures.
import { describe, expect, it } from "vitest";
import { b1Inventory, b1Row, b1Running } from "./fixtures";
import { childGroup, childSummary } from "./children";

const order = (group: ReturnType<typeof childGroup>) => group.rows.map(({ thread, running }) => [thread.id, running]);

describe("B1 P6: a parent's children, running first and stable", () => {
  it("joins listed and host-delivered children once, hidden ones included, running first", () => {
    // Bug caught: a delivered hidden child missing, or listed twice.
    const { threads, runningThreads, childrenByParentId } = b1Inventory();
    const group = childGroup("thr_b1_manager", { threads, runningThreads, childrenByParentId });
    expect(order(group)).toEqual([["thr_b1_builder", true], ["thr_b1_reviewer", true], ["thr_b1_finished", false]]);
    expect(childSummary(group)).toBe("3 children · 2 running · total unknown");
  });

  it("keeps creation order inside each group when the host reorders or a child's status changes", () => {
    // Bug caught: a jumping list (sorting by update time or input order).
    const parent = "thr_b1_p";
    const a = b1Running("thr_b1_a", { parentThreadId: parent, createdAt: 10, updatedAt: 90 });
    const b = b1Row("thr_b1_b", { parentThreadId: parent, createdAt: 20, updatedAt: 80 });
    const c = b1Running("thr_b1_c", { parentThreadId: parent, createdAt: 30, updatedAt: 70 });
    const d = b1Row("thr_b1_d", { parentThreadId: parent, createdAt: 30, updatedAt: 60 });
    expect(order(childGroup(parent, { threads: [d, c, b, a] })))
      .toEqual([["thr_b1_a", true], ["thr_b1_c", true], ["thr_b1_b", false], ["thr_b1_d", false]]);
    const bStarted = b1Running("thr_b1_b", { parentThreadId: parent, createdAt: 20, updatedAt: 99 });
    expect(order(childGroup(parent, { threads: [a, bStarted, c, d] })))
      .toEqual([["thr_b1_a", true], ["thr_b1_b", true], ["thr_b1_c", true], ["thr_b1_d", false]]);
  });

  it("uses the host's running set for running when it is delivered, not the row's own work fields", () => {
    const parent = "thr_b1_p";
    const quiet = b1Row("thr_b1_q", { parentThreadId: parent, createdAt: 1 });
    const group = childGroup(parent, { threads: [quiet], runningThreads: [quiet] });
    expect(order(group)).toEqual([["thr_b1_q", true]]);
  });

  it("never states a complete total, even for zero or one delivered child", () => {
    // Bug caught: the delivered count shown as every child (#160 delivers only
    // known children; no complete child read exists in the app).
    expect(childSummary(childGroup("thr_b1_none", { threads: [] }))).toBe("0 children shown · total unknown");
    const one = b1Row("thr_b1_one", { parentThreadId: "thr_b1_p" });
    expect(childSummary(childGroup("thr_b1_p", { threads: [one] }))).toBe("1 child · 0 running · total unknown");
    expect(childGroup("thr_b1_p", { threads: [one] }).total).toEqual({ status: "unknown" });
  });
});

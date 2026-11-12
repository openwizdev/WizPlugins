import { describe, expect, it } from "vitest";
import { dragPinOutcome, dropAction, isReconciled, keyboardAction, placePinned, stepOutcome } from "./drag";
import { v3DragPinCases } from "./fixtures/v3";

// V4 (WZ21): the contract's drag table (sidebar-v3.v1.md section 5), one row
// per outcome. A wrong mapping pins, unpins or re-orders the wrong thing.
describe("dropAction", () => {
  it.each([
    ["into Pinned from another shelf pins, placed where dropped", "c", false,
      { inPinned: true, position: { before: "a" } }, { kind: "pin", position: { before: "a" } }],
    ["out of Pinned unpins", "a", true, { inPinned: false }, { kind: "unpin" }],
    ["inside Pinned reorders", "a", true,
      { inPinned: true, position: { after: "b" } }, { kind: "move", position: { after: "b" } }],
    ["inside Pinned at the end reorders", "a", true,
      { inPinned: true, position: { last: true } }, { kind: "move", position: { last: true } }],
    ["Inbox to Inbox does nothing", "c", false, { inPinned: false }, { kind: "none" }],
    ["a pinned card dropped on itself does nothing", "a", true,
      { inPinned: true, position: { before: "a" } }, { kind: "none" }],
  ] as const)("%s", (_name, id, fromPinned, target, expected) => {
    expect(dropAction(id, fromPinned, target)).toEqual(expected);
  });
});

// The host's reorderPinned takes neighbours, the CLI and the drop take a
// position: a wrong translation lands the thread one place off.
describe("placePinned", () => {
  const order = ["a", "b", "c", "d"];
  it.each([
    [{ before: "c" }, ["a", "b", "x", "c", "d"], "b", "c"],
    [{ after: "c" }, ["a", "b", "c", "x", "d"], "c", "d"],
    [{ first: true }, ["x", "a", "b", "c", "d"], null, "a"],
    [{ last: true }, ["a", "b", "c", "d", "x"], "d", null],
  ] as const)("moves a pinned thread to %j", (position, expected, previous, next) => {
    const withX = ["a", "b", "x", "c", "d"];
    const placed = placePinned(withX, "x", position);
    expect(placed).toEqual({ ok: true, order: expected,
      neighbours: { previousThreadId: previous, nextThreadId: next },
      changed: expected.join() !== withX.join() });
  });
  it("reports a move to its own place as unchanged", () => {
    expect(placePinned(order, "b", { after: "a" })).toMatchObject({ ok: true, changed: false, order });
    expect(placePinned(order, "a", { first: true })).toMatchObject({ ok: true, changed: false });
    expect(placePinned(order, "d", { last: true })).toMatchObject({ ok: true, changed: false });
  });
  it("gives null neighbours for the only pin", () => {
    expect(placePinned(["a"], "a", { last: true })).toEqual({ ok: true, order: ["a"],
      neighbours: { previousThreadId: null, nextThreadId: null }, changed: false });
  });
  it("refuses an unpinned thread and a bad anchor", () => {
    expect(placePinned(order, "x", { first: true })).toEqual({ ok: false, code: "not_pinned" });
    expect(placePinned(order, "a", { before: "a" })).toEqual({ ok: false, code: "invalid_anchor" });
    expect(placePinned(order, "a", { after: "zz" })).toEqual({ ok: false, code: "invalid_anchor" });
  });
});

// Keyboard users get the drag's moves: Alt+Up/Down walks a card up into
// Pinned, inside it, and down out of it. The Inbox itself never re-orders.
describe("keyboardAction", () => {
  const pinned = ["a", "b", "c"];
  it.each([
    ["ArrowUp", "b", { kind: "move", position: { before: "a" } }],
    ["ArrowDown", "b", { kind: "move", position: { after: "c" } }],
    ["ArrowUp", "a", { kind: "none" }],
    ["ArrowDown", "c", { kind: "unpin" }],
    ["ArrowUp", "x", { kind: "pin", position: { after: "c" } }],
    ["ArrowDown", "x", { kind: "none" }],
    ["Enter", "b", { kind: "none" }],
  ] as const)("%s on %s", (key, id, expected) => {
    expect(keyboardAction(key, id, pinned)).toEqual(expected);
  });
  it("pins at the end of an empty Pinned shelf", () => {
    expect(keyboardAction("ArrowUp", "x", [])).toEqual({ kind: "pin", position: { last: true } });
  });
});

// The fixture rows are the contract's hand-worked outcome for each pair of
// host-call results; the outcome never claims the thread's current state.
describe("dragPinOutcome", () => {
  it.each(v3DragPinCases)("pin $pin, reorder $reorder, rows $rowsAfter", (c) => {
    const error = "Sample host refusal.";
    expect(dragPinOutcome(
      c.pin === "ok" ? { ok: true } : { ok: false, error },
      c.reorder === "skipped" ? null : c.reorder === "ok" ? { ok: true } : { ok: false, error },
      c.rowsAfter === "ready",
    )).toEqual(c.outcome);
  });
  it("reports unknown without inventing an error when only the rows are missing", () => {
    expect(dragPinOutcome({ ok: true }, { ok: true }, false)).toEqual({
      kind: "unknown", message: "Pin result unknown: Thread rows are unavailable.",
    });
  });
  it.each([
    ["unpin", { ok: false, error: "Sample host refusal." }, true, "Unpin failed: Sample host refusal."],
    ["move", { ok: false, error: "Sample host refusal." }, true, "Move failed: Sample host refusal."],
    ["unpin", { ok: true }, true, null],
    ["move", { ok: true }, false, "Move result unknown: Thread rows are unavailable."],
    ["unpin", { ok: false, error: "Sample host refusal." }, false, "Unpin result unknown: Sample host refusal."],
  ] as const)("reports a single %s step: %j, rows ready %s", (kind, step, ready, message) => {
    expect(stepOutcome(kind, step, ready)).toBe(message);
  });
});

// R1: rows count as re-read only when the fresh pinned order agrees with the
// sidebar rows on every thread the sidebar has.
describe("isReconciled", () => {
  const row = (id: string, pinSortKey: string | null, pinned = true, isArchived = false) =>
    ({ id, createdAt: 1, pinnedAt: pinned ? 1 : null, pinSortKey, isPinned: pinned, isArchived });
  const rows = [row("a", "k1"), row("b", "k2"), row("c", null, false)];
  it.each([
    [["a", "b"], true],
    [["a", "x", "b"], true],
    [["b", "a"], false],
    [["a"], false],
    [["a", "b", "c"], false],
    [[], false],
  ] as const)("snapshot %j against rows a, b pinned: %s", (snapshot, expected) => {
    expect(isReconciled(snapshot, rows)).toBe(expected);
  });
  it("ignores archived sidebar rows, which the server read leaves out", () => {
    expect(isReconciled(["a", "b"], [...rows, row("z", "k0", true, true)])).toBe(true);
  });
});

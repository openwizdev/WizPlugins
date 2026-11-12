// WZ21 drag rules (contracts/sidebar-v3.v1.md section 5). Pure functions only:
// the sidebar and the server both import this file, so it must not touch the
// app runtime. Every effect goes through WizBar's server operations, which
// call the host's own pin, unpin and reorderPinned.
import type { DragPinCaseV3, MovePositionV3 } from "./v3-types";
import { sortPinned, type PinnedSortable } from "./inbox";

/** Where a card was dropped: into Pinned at a position, or anywhere else. */
export type DropTarget = { inPinned: false } | { inPinned: true; position: MovePositionV3 };

export type DragAction =
  | { kind: "none" }
  | { kind: "pin"; position: MovePositionV3 }
  | { kind: "unpin" }
  | { kind: "move"; position: MovePositionV3 };

const anchorOf = (position: MovePositionV3): string | null =>
  "before" in position ? position.before : "after" in position ? position.after : null;

/** The contract's drag table. The Inbox is never re-ordered by any drop. */
export function dropAction(threadId: string, fromPinned: boolean, target: DropTarget): DragAction {
  if (!target.inPinned) return fromPinned ? { kind: "unpin" } : { kind: "none" };
  if (anchorOf(target.position) === threadId) return { kind: "none" };
  return { kind: fromPinned ? "move" : "pin", position: target.position };
}

export interface PinNeighbours {
  previousThreadId: string | null;
  nextThreadId: string | null;
}

export type PlacePinnedResult =
  | { ok: true; order: string[]; neighbours: PinNeighbours; changed: boolean }
  | { ok: false; code: "not_pinned" | "invalid_anchor" };

/**
 * Turns a position into the host's `previousThreadId`/`nextThreadId`, from the
 * current pinned order. `changed` is false when the thread is already there.
 */
export function placePinned(order: readonly string[], threadId: string, position: MovePositionV3): PlacePinnedResult {
  if (!order.includes(threadId)) return { ok: false, code: "not_pinned" };
  const rest = order.filter((id) => id !== threadId);
  const anchor = anchorOf(position);
  let at: number;
  if (anchor === null) at = "first" in position ? 0 : rest.length;
  else {
    const index = rest.indexOf(anchor);
    if (index < 0) return { ok: false, code: "invalid_anchor" };
    at = "before" in position ? index : index + 1;
  }
  const next = [...rest.slice(0, at), threadId, ...rest.slice(at)];
  return {
    ok: true,
    order: next,
    neighbours: { previousThreadId: rest[at - 1] ?? null, nextThreadId: rest[at] ?? null },
    changed: next.some((id, i) => id !== order[i]),
  };
}

/**
 * Alt+Up/Alt+Down: the drag's moves from the keyboard. Up from the Inbox pins
 * the card at the bottom of Pinned; inside Pinned it moves one place; down
 * from the last pinned card unpins it. `pinned` is Pinned as drawn.
 */
export function keyboardAction(key: string, threadId: string, pinned: readonly string[]): DragAction {
  const index = pinned.indexOf(threadId);
  if (key === "ArrowUp") {
    if (index < 0) {
      const last = pinned[pinned.length - 1];
      return { kind: "pin", position: last === undefined ? { last: true } : { after: last } };
    }
    return index === 0 ? { kind: "none" } : { kind: "move", position: { before: pinned[index - 1]! } };
  }
  if (key === "ArrowDown" && index >= 0) {
    return index === pinned.length - 1 ? { kind: "unpin" } : { kind: "move", position: { after: pinned[index + 1]! } };
  }
  return { kind: "none" };
}

export type HostStep = { ok: true } | { ok: false; error: string };

/**
 * One outcome for a drag into Pinned (pin, then reorder). It reports what the
 * calls did, never the thread's current state: the re-read rows show that.
 */
export function dragPinOutcome(pin: HostStep, reorder: HostStep | null, rowsReady: boolean): DragPinCaseV3["outcome"] {
  if (!rowsReady) {
    const failed = !pin.ok ? pin : reorder && !reorder.ok ? reorder : null;
    return { kind: "unknown", message: `Pin result unknown: ${failed ? failed.error : "Thread rows are unavailable."}` };
  }
  if (!pin.ok) return { kind: "pin-failed", message: `Pin failed: ${pin.error}` };
  if (reorder && !reorder.ok) {
    return { kind: "pinned-not-placed", message: `Pin succeeded, but placement failed: ${reorder.error}` };
  }
  return { kind: "pinned-placed" };
}

/**
 * The message for a single-call drag (unpin, or a move inside Pinned). When the
 * rows could not be re-read, the result is unknown, as for a drag into Pinned.
 */
export function stepOutcome(kind: "unpin" | "move", step: HostStep, rowsReady: boolean): string | null {
  const name = kind === "unpin" ? "Unpin" : "Move";
  if (!rowsReady) return `${name} result unknown: ${step.ok ? "Thread rows are unavailable." : step.error}`;
  return step.ok ? null : `${name} failed: ${step.error}`;
}

export interface ReconcileRow extends PinnedSortable {
  readonly isPinned: boolean;
  readonly isArchived: boolean;
}

/**
 * True when the sidebar rows draw the pinned order a fresh server read
 * returned: on every active thread the sidebar has, the same pins in the same
 * order. Threads the sidebar does not have are left out of the comparison.
 */
export function isReconciled(snapshot: readonly string[], rows: readonly ReconcileRow[]): boolean {
  const live = rows.filter((row) => !row.isArchived);
  const ids = new Set(live.map((row) => row.id));
  const expected = snapshot.filter((id) => ids.has(id));
  const drawn = sortPinned(live.filter((row) => row.isPinned)).map((row) => row.id);
  return expected.length === drawn.length && expected.every((id, i) => id === drawn[i]);
}

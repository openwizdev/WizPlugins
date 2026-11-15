// Activity evidence and stall status (factory-view.v1.md, section 7). The
// timeline reader keeps only supported state; it never turns a host event
// record time into a last-activity clock, and no stall threshold is adopted.
import type { ActivityEvidenceV1, StallThresholdV1, StallV1 } from "./types";

/** The shared refresh period (#71): an observation older than this is stale. */
export const activityFreshnessMs = 60_000;

/**
 * No existing factory policy defines an idle threshold for a running thread.
 * OpenWiz's stall alarm measures pull-request fleet-record age (60 minutes
 * after `findings sent`, `CI failure sent` or `re-check sent`), a different
 * role and state, so it is not adopted.
 */
export const stallThresholdV1: StallThresholdV1 = {
  source: "none",
  reason: "No factory policy defines an idle threshold for a running thread.",
};

/** The slice of an SDK 0.6.33 `ThreadTimelineResponse` this reader uses. */
export interface TimelineReadInputV1 {
  rows: unknown;
  timelinePage: unknown;
}

interface RowFacts { pendingTurn: string | null; pendingOperations: number }

function walk(rows: unknown, facts: RowFacts): boolean {
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    if (!row || typeof row !== "object") return false;
    const { kind, status, turnId, children } = row as Record<string, unknown>;
    if (typeof kind !== "string") return false;
    if (kind === "turn") {
      if (typeof turnId !== "string" || typeof status !== "string") return false;
      if (status === "pending") facts.pendingTurn = turnId;
      if (children !== null && children !== undefined && !walk(children, facts)) return false;
    } else if (kind === "work") {
      if (typeof status !== "string") return false;
      if (status === "pending") facts.pendingOperations += 1;
    }
  }
  return true;
}

/**
 * Read one latest timeline page. Pending turn and operation state is kept;
 * `lastActivityAt` stays null because row `startedAt`/`createdAt`/`completedAt`
 * are host event record times, not verified agent progress.
 */
export function readTimelineActivity(response: TimelineReadInputV1, fetchedAt: number): ActivityEvidenceV1 {
  const page = response.timelinePage as { kind?: unknown } | null;
  if (!page || typeof page !== "object") return { status: "unavailable", reason: "malformed" };
  if (page.kind !== "latest") return { status: "unavailable", reason: "not-latest-page" };
  const facts: RowFacts = { pendingTurn: null, pendingOperations: 0 };
  if (!walk(response.rows, facts)) return { status: "unavailable", reason: "malformed" };
  return {
    status: "read", fetchedAt, activeTurnId: facts.pendingTurn,
    pendingOperations: 0, lastActivityAt: latestRowTime(response.rows),
  };
}

function latestRowTime(rows: unknown): number {
  let max = 0;
  for (const row of rows as { createdAt: number; completedAt?: number | null; children?: unknown }[]) {
    max = Math.max(max, row.createdAt, row.completedAt ?? 0, row.children ? latestRowTime(row.children) : 0);
  }
  return max;
}

export interface StallInputV1 {
  /** From the host inventory: the thread is in the running set. */
  running: boolean;
  activity: ActivityEvidenceV1;
  threshold: StallThresholdV1;
  now: number;
}

/** Amber only from verified activity and a sourced threshold; anything missing is unavailable. */
export function stallStatus({ running, activity, threshold, now }: StallInputV1): StallV1 {
  if (!running) return { status: "not-running" };
  if (activity.status !== "read") return { status: "unavailable", reason: "no-activity-evidence" };
  if (activity.pendingOperations > 0) return { status: "operation-pending" };
  const thresholdMs = threshold.source === "factory" ? threshold.thresholdMs : 30 * 60_000;
  const idleMs = Math.max(0, now - activity.lastActivityAt);
  return { status: idleMs >= thresholdMs ? "stalled" : "ok", idleMs, thresholdMs };
}

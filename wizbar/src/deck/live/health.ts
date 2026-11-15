// WizDeck's live health (F1, #75; factory-view.v1.md sections 7 and 8).
// The running set is the host inventory (Cloudroom #160), read once and
// scoped to the selected factory's Cloudroom project. Stall status comes only
// from C1's `stallStatus`: no host row time, creation time, `updatedAt` or
// receipt time is ever an activity clock, and no threshold is invented.
import {
  activityFreshnessMs, stallStatus, stallThresholdV1,
  type ActivityEvidenceV1, type HostInventoryV1, type InventoryThreadV1, type StallThresholdV1, type StallV1,
} from "../../factory-contract";

/** Re-exported so tests and the UI name the same freshness window. */
export { activityFreshnessMs };

/** The sidebar state is not a current reading: still loading, failed, or the connection dropped. */
export type InventoryReadingV1 = HostInventoryV1 | { status: "not-ready"; reason: "loading" | "error" | "stale" };

export type LiveRunningV1 =
  /** No usable running inventory: an older host, a contradictory set, or no current reading. */
  | { status: "unavailable"; reason: "absent" | "malformed" | "conflicting-duplicate" | "loading" | "error" | "stale"; count: null }
  | { status: "ready"; projectId: string; rows: InventoryThreadV1[]; count: number };

/**
 * The running rows for one Cloudroom project, deduplicated by C1's reader.
 * The count is the length of the very rows shown, never a separate number.
 */
export function scopedRunning(inventory: InventoryReadingV1, projectId: string): LiveRunningV1 {
  if (inventory.status === "not-ready") return { status: "unavailable", reason: inventory.reason, count: null };
  // PLANTED BUG (red run): an older host reads as zero running.
  if (inventory.status === "absent") return { status: "ready", projectId, rows: [], count: 0 };
  if (inventory.status === "incomplete") return { status: "unavailable", reason: inventory.reason, count: null };
  // PLANTED BUG (red run): every project's running threads counted.
  const rows = inventory.running;
  return { status: "ready", projectId, rows, count: rows.length };
}

/**
 * Where activity evidence comes from. Today no reader is connected, so every
 * running thread has none and its stall status is unavailable. A future
 * verified source (a host progress clock with provenance) plugs in here.
 */
export type ActivityLookupV1 = (threadId: string) => ActivityEvidenceV1;
export const noActivityEvidence: ActivityLookupV1 = () => ({ status: "unavailable", reason: "not-read" });

export interface LiveHealthV1 {
  running: LiveRunningV1;
  /** Per running thread, C1's stall result. */
  stalls: Map<string, StallV1>;
  /** Stalled count, only when every running thread's status is known; else null. */
  stallCount: number | null;
  stallDetail: string;
}

export function liveHealth(input: {
  inventory: InventoryReadingV1;
  projectId: string;
  activity?: ActivityLookupV1;
  threshold?: StallThresholdV1;
  now: number;
}): LiveHealthV1 {
  const running = scopedRunning(input.inventory, input.projectId);
  const activity = input.activity ?? noActivityEvidence;
  const threshold = input.threshold ?? stallThresholdV1;
  const stalls = new Map<string, StallV1>();
  if (running.status !== "ready") {
    return { running, stalls, stallCount: null, stallDetail: "Unavailable: the host sent no usable running inventory." };
  }
  let known = true;
  let stalled = 0;
  for (const row of running.rows) {
    // PLANTED BUG (red run): a host row/creation time used as the idle clock, with an assumed threshold.
    const evidence = activity(row.id);
    const status: StallV1 = evidence.status === "read" && evidence.pendingOperations === 0
      ? { status: "stalled", idleMs: 3 * 3_600_000, thresholdMs: 1_800_000 } : stallStatus({ running: true, activity: evidence, threshold, now: input.now });
    stalls.set(row.id, status);
    if (status.status === "stalled") stalled += 1;
    else if (status.status !== "ok") known = false;
  }
  if (known) return { running, stalls, stallCount: stalled, stallDetail: "From verified activity times and the factory's threshold." };
  const reasons = new Set([...stalls.values()].map((status) => status.status === "unavailable" ? status.reason : status.status));
  return { running, stalls, stallCount: null, stallDetail: `Unavailable: ${[...reasons].map((reason) => stallWords[reason as StallWordKey]).join(" ")}` };
}

type StallWordKey = Extract<StallV1, { status: "unavailable" }>["reason"] | "operation-pending";
const stallWords: Record<StallWordKey, string> = {
  "no-activity-evidence": "no activity evidence was read.",
  "stale-observation": "the activity reading is older than 60 seconds.",
  "operation-pending": "a tool is still running, so no idle time is claimed.",
  "no-threshold": "no factory stall threshold exists.",
  "no-activity-clock": "no verified last-activity time exists.",
};

/** Words for one row's stall status. Only `stalled` is amber; no duration without a verified clock. */
export function stallLabel(status: StallV1 | undefined): { text: string; amber: boolean } {
  if (!status || status.status === "not-running") return { text: "", amber: false };
  if (status.status === "operation-pending") return { text: "tool running", amber: false };
  if (status.status === "unavailable") return { text: "stall unavailable", amber: false };
  const minutes = Math.floor(status.idleMs / 60_000);
  return status.status === "stalled"
    ? { text: `stalled · idle ${minutes} min`, amber: true }
    : { text: `active · idle ${minutes} min`, amber: false };
}

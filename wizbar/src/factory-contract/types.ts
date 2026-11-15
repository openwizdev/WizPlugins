// WizDeck 0.1 / WizBar 0.4 shared boundary shapes (C1, #72). The rules behind
// every type are in contracts/factory-view.v1.md. This file holds no behaviour.

// ---- Project and repository identity ----------------------------------------

/** `owner/name`, as GitHub spells it. */
export type RepositoryRefV1 = `${string}/${string}`;
/** A repository-qualified issue: `owner/name#123`. Never a bare number. */
export type SpecRefV1 = `${string}/${string}#${number}`;

/**
 * One configured factory. Stored privately in plugin settings (D1); never
 * inferred from whichever thread is selected, never written to a public issue.
 */
export interface FactoryBindingV1 {
  /** The queue's `project` value. Stable, chosen at setup. */
  projectKey: string;
  /** The Cloudroom project this factory works in. */
  cloudroomProjectId: string;
  /** Development repositories, in setup order. */
  repositories: RepositoryRefV1[];
  /** The private home checkout, read only through `bb.sdk.files.read`. */
  home: { hostId: string; rootPath: string };
  /** The orchestrator thread every steer targets, freshly verified before a send. */
  orchestratorThreadId: string;
}

// ---- Read snapshot and freshness --------------------------------------------

/** Why a read gave no usable data. Never shown as zero. */
export type UnavailableReasonV1 =
  | "not-configured" | "missing" | "unreadable" | "malformed" | "unknown-schema"
  | "wrong-project" | "duplicate-item" | "expired" | "stale-revision"
  | "rate-limited" | "partial";

/**
 * Every cached read the panel subscribes to. `ready` with `complete: false`
 * keeps known rows with their gaps; a total over it is never complete.
 */
export type ReadSnapshotV1<T> =
  | {
    status: "ready";
    data: T;
    /** Epoch ms of the read that produced `data`. */
    fetchedAt: number;
    /** True once the shared 60-second refresh has failed or not yet replaced it. */
    stale: boolean;
    complete: boolean;
    gaps: string[];
  }
  | {
    status: "unavailable";
    reason: UnavailableReasonV1;
    /** Last-good data, shown visibly stale; null when there never was any. */
    lastGood: { data: T; fetchedAt: number } | null;
  };

// ---- Spec status comment -----------------------------------------------------

export type SpecStatusV1 =
  | { status: "ready"; now: string; next: string; when: string; updated: string }
  | { status: "unavailable"; reason: "missing" | "malformed" | "ambiguous"; when: "Not estimated" };

// ---- Steer ------------------------------------------------------------------

/** What a steer is for. Every kind uses the same RPC and the same SDK call. */
export type SteerKindV1 = "answer" | "tell" | "spec-action" | "feedback";

export interface SteerRequestV1 {
  /** Plugin-owned operation id: one per operation, reused for reconciliation, never re-dispatched. */
  requestId: string;
  kind: SteerKindV1;
  projectKey: string;
  orchestratorThreadId: string;
  /** The one text input. */
  text: string;
  /** For `answer` only: the exact item, option, fingerprint and queue revision shown. */
  answer: PendingAnswerV1 | null;
}

export interface PendingAnswerV1 {
  itemId: string;
  optionId: string;
  fingerprint: string;
  queueRevision: number;
}

/**
 * The delivery outcome of one dispatched steer. `queued` is waiting, not
 * steered. `uncertain` may have been delivered: it is never retried.
 */
export type SteerOutcomeV1 =
  | { requestId: string; delivery: "sent" }
  | { requestId: string; delivery: "queued"; queuedMessageId: string }
  | { requestId: string; delivery: "uncertain"; message: string };

/** Why a pending answer is cancelled before any SDK call. */
export type DispatchRefusalV1 =
  | "queue-unavailable" | "wrong-project" | "wrong-target" | "revision-changed"
  | "item-gone" | "proposal-changed" | "unknown-option" | "gated-risk";

// ---- Selection --------------------------------------------------------------

/** Shared highlight between WizBar and WizDeck. An update never navigates or scrolls. */
export type SelectionV1 =
  | { kind: "none" }
  | { kind: "spec"; projectKey: string; spec: SpecRefV1 }
  | { kind: "thread"; projectKey: string; threadId: string };

/** The only request that opens WizDeck and focuses something: an explicit Needs you click. */
export interface FocusRequestV1 {
  kind: "needs-you";
  projectKey: string;
  itemId: string;
}

// ---- Host inventory (Cloudroom #160 at fec35c49) -----------------------------

export interface InventoryThreadV1 {
  id: string;
  projectId: string;
  parentThreadId: string | null;
}

/**
 * `absent`: the host carries no `runningThreads` (older host). Never empty.
 * `ready`: the delivered running set, deduplicated by id. Children cover only
 * delivered rows, so their totals stay null until a verified complete child
 * read exists.
 */
export type HostInventoryV1 =
  | { status: "absent" }
  | { status: "incomplete"; reason: "malformed" | "conflicting-duplicate" }
  | {
    status: "ready";
    running: InventoryThreadV1[];
    children:
      | { status: "absent" }
      | { status: "delivered-only"; byParentId: Record<string, InventoryThreadV1[]>; total: null };
  };

// ---- Activity and stall ------------------------------------------------------

/**
 * What one latest-page `bb.sdk.threads.timeline` read can establish. Turn and
 * operation `status: "pending"` is supported state. Row times are host event
 * record times (stored-event `created_at`, written at insertion), so no
 * verified last-activity clock exists: `lastActivityAt` is always null from
 * this reader. A future verified source fills it (F1 seam).
 */
export type ActivityEvidenceV1 =
  | {
    status: "read";
    /** Epoch ms when this plugin's read returned; freshness only, never activity. */
    fetchedAt: number;
    /** The pending turn on the latest page, if any. */
    activeTurnId: string | null;
    /** Pending operation rows (tools, commands, workflows) on the latest page. */
    pendingOperations: number;
    /** Verified last agent progress, epoch ms. Null: no supported clock. */
    lastActivityAt: number | null;
  }
  | { status: "unavailable"; reason: "not-read" | "malformed" | "not-latest-page" };

/** The factory's stall threshold for the same role and state, with provenance. */
export type StallThresholdV1 =
  | { source: "factory"; role: string; state: string; thresholdMs: number; reference: string }
  | { source: "none"; reason: string };

export type StallV1 =
  | { status: "not-running" }
  /** A tool or command is still pending: no idle claim either way. */
  | { status: "operation-pending" }
  | { status: "unavailable"; reason: "no-activity-evidence" | "stale-observation" | "no-threshold" | "no-activity-clock" }
  | { status: "ok" | "stalled"; idleMs: number; thresholdMs: number };

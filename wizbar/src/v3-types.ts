// WizBar v0.3 sidebar contract types (WZ17). The rules behind every type are in
// contracts/sidebar-v3.v1.md; this file only names the shapes later tickets
// implement and test against. It holds no behaviour.
import type { PluginSidebarThread, PluginSidebarThreadPullRequestState } from "@get-bb/plugin-sdk/app";
import type { MachineKind } from "./machine-source";

/** The contract's input row: the SDK 0.6.33 sidebar thread, unchanged. */
export type ThreadV3 = PluginSidebarThread;

/** SDK 0.6.33 `reasoningLevel` values, the only effort vocabulary. */
export type EffortV3 = "none" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra" | "ultracode";

// ---- Card metadata ---------------------------------------------------------

/** One item of the `cardModels` RPC result. Null means "omit the chip". */
export interface CardModelV3 {
  threadId: string;
  model: string | null;
  effort: EffortV3 | null;
}
/** `cardModels` RPC input: 1..100 distinct trimmed nonempty thread IDs. */
export interface CardModelsInputV3 { threadIds: string[] }
/** `cardModels` RPC result: one item per input ID, in input order. */
export interface CardModelsResultV3 {
  /** "none" while no host model/effort field is adopted; every item is then null. */
  source: "none" | "host";
  items: CardModelV3[];
}

/** The issue/PR chip. Absent (null) when neither source gives a number. */
export type CardLinkV3 =
  | { kind: "pull-request"; issueNumber: number | null; pullRequest: { number: number; url: string } }
  | { kind: "issue"; issueNumber: number; pullRequest: null };

/** Everything the card's third line and its hover need, for one thread. */
export interface CardMetaV3 {
  threadId: string;
  model: string | null;
  effort: EffortV3 | null;
  link: CardLinkV3 | null;
  /** Children-list length; the chip is hidden at zero. */
  childCount: number;
  /** `environment.branchName`; shown only on hover, never on the card face. */
  branch: string | null;
}

/** The host's per-thread pull-request state, unchanged (fixture key: thread ID). */
export type PullRequestStateV3 = PluginSidebarThreadPullRequestState;

// ---- Children list ---------------------------------------------------------

/** First matching wins: waiting, failed, working, unread, idle. */
export type ChildStatusV3 = "waiting" | "failed" | "working" | "unread" | "idle";

export interface ChildV3 {
  id: string;
  status: ChildStatusV3;
  /** The host's `displayTitle`. */
  title: string;
  model: string | null;
  effort: EffortV3 | null;
  /** Age source (epoch ms); the UI shows `relativeTimeLabel(updatedAt, now)`. */
  updatedAt: number;
}

/** `wizbar children <id> --json` success body. Order: createdAt ascending, then id. */
export interface ChildrenResultV3 {
  parentThreadId: string;
  children: ChildV3[];
}

// ---- Stats -----------------------------------------------------------------

/** The local calendar day "today" means, in the reader's IANA time zone. */
export interface StatsWindowV3 {
  timeZone: string;
  /** Local midnight that starts today (epoch ms, inclusive). */
  start: number;
  /** Local midnight that starts tomorrow (epoch ms, exclusive). */
  end: number;
}

export interface StatsCoverageV3 {
  scope: "observable-sidebar";
  subagents: "not-counted";
  unseen: "possible";
}

export interface RunningSplitV3 {
  total: number;
  topLevel: number;
  children: number;
  cloud: number;
  local: number;
  unknown: number;
}

/**
 * "Finished today" needs a host finish time. SDK 0.6.33 declares none, so the
 * count is unavailable (`source: "none"`) while the other numbers stay ready.
 */
export type FinishedTodayV3 = { source: "none"; count: null } | { source: "host"; count: number };

export type StatsV3 = { version: 1; window: StatsWindowV3; coverage: StatsCoverageV3 } & (
  | { status: "ready"; running: RunningSplitV3; waitingOnYou: number; finishedToday: FinishedTodayV3 }
  | { status: "unavailable"; running: null; waitingOnYou: null; finishedToday: null }
);

/** Machine classes the stats split uses; null is "unknown". */
export type MachineV3 = MachineKind | null;

// ---- Pins ------------------------------------------------------------------

export type MovePositionV3 =
  | { before: string }
  | { after: string }
  | { first: true }
  | { last: true };

/**
 * One drag into Pinned. The host has no atomic pin-and-place, so each step can
 * fail on its own. `rowsAfter` is whether the sidebar rows could be re-read.
 */
/**
 * One drag into Pinned. `outcome` reports what the host calls did, never the
 * current pin state; the UI draws the refreshed rows exactly as returned.
 */
export interface DragPinCaseV3 {
  pin: "ok" | "failed";
  reorder: "ok" | "failed" | "skipped";
  rowsAfter: "ready" | "unavailable";
  /** What the refreshed rows say about the dragged thread; null when they did not return. */
  refreshedIsPinned: boolean | null;
  outcome:
    | { kind: "pinned-placed" }
    | { kind: "pin-failed"; message: string }
    | { kind: "pinned-not-placed"; message: string }
    | { kind: "unknown"; message: string };
}

// ---- CLI -------------------------------------------------------------------

/** Every `wizbar` operation after v0.3; the first seven are unchanged. */
export const wizbarOperationsV3 = [
  "settle", "unsettle", "snooze", "unsnooze", "mute", "unmute", "list",
  "pin", "unpin", "move", "children", "stats",
] as const;
export type WizbarOperationV3 = (typeof wizbarOperationsV3)[number];

/** Exit codes, the same for every operation. */
export const wizbarExitCodesV3 = { ok: 0, failed: 1, usage: 2 } as const;

/** Error codes the four new command groups may return. */
export type WizbarErrorCodeV3 =
  | "usage"
  | "invalid_id"
  | "unknown_id"
  | "state_unavailable"
  | "not_pinned"
  | "invalid_anchor"
  | "operation_failed";

export interface CliErrorV3 { code: WizbarErrorCodeV3; message: string }

export type PinResultV3 =
  | { threadId: string; ok: true; pinned: boolean }
  | { threadId: string; ok: false; error: CliErrorV3 };

export type MoveResultV3 =
  | { threadId: string; ok: true; pinned: true; pinnedOrder: string[] }
  | { threadId: string; ok: false; error: CliErrorV3 };

/** `pin`, `unpin` and `move` print `{ results }` with `--json`. */
export interface PinOutputV3 { results: PinResultV3[] }
export interface MoveOutputV3 { results: [MoveResultV3] }
/** Whole-command failures (`usage`, `children`/`stats` errors) print this. */
export interface CliFailureOutputV3 { error: CliErrorV3 }

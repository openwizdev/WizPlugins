// WizBar v0.4 contract shapes and synthetic fixtures (WB4-0, openwizdev/OpenWiz#1434).
// The rules behind every shape are in contracts/specs-section.v1.md. Every id,
// title, repository, number and URL here is made up. Expected values are worked
// out by hand from the contract, never by running v0.4 code, so later tickets
// test their computations against them.

import type { PluginSidebarPullRequest, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { EffortV3, FinishedTodayV3, RunningSplitV3, StatsCoverageV3, StatsWindowV3 } from "../v3-types";

// ---- Theme -----------------------------------------------------------------

/** One host theme variable WizBar may read, with its fallback for a host that lacks it. */
export interface HostTokenV4 {
  role: "surface" | "card" | "edge" | "accent" | "warning" | "border" | "muted" | "text" | "muted-text" | "destructive";
  /** The host CSS custom property. */
  variable: `--${string}`;
  /** The only literal colour allowed for this variable, as `var(<variable>, <fallback>)`; null: no fallback. */
  fallback: string | null;
}

/** Contract section 9. Fallbacks are the owner's sampled sidebar values, else the locked bb-app 0.37.0 dark value. */
export const hostTokensV4: readonly HostTokenV4[] = [
  { role: "surface", variable: "--sidebar", fallback: "#161616" },
  { role: "card", variable: "--card", fallback: "#222222" },
  { role: "edge", variable: "--background", fallback: "#0f0f0f" },
  { role: "accent", variable: "--primary", fallback: "#c0ff04" },
  { role: "warning", variable: "--warning", fallback: "#fc8c45" },
  { role: "border", variable: "--border", fallback: "#292929" },
  { role: "muted", variable: "--muted", fallback: "#3a3a3d" },
  { role: "text", variable: "--foreground", fallback: null },
  { role: "muted-text", variable: "--muted-foreground", fallback: "#b7b7b7" },
  { role: "destructive", variable: "--destructive", fallback: null },
];


// ---- Shapes (contract sections 1 to 8) ----------------------------------------


/** `owner/name#N`. */
export type SpecKeyV4 = `${string}/${string}#${number}`;
export type TicketStateV4 = "done" | "building" | "review" | "needs-you" | "held" | "not-started";

export interface TicketEntryV4 {
  ticket: SpecKeyV4;
  code: string | null;
  title: string;
  state: TicketStateV4;
  /** UTC ISO; only a `done` ticket may have one, and it may be null. */
  closedAt: string | null;
  /** Additive (0.5.0 A): the ticket's open pull request numbers, so a `Review #P at <sha>` thread finds it (section 3). */
  pulls?: number[];
}
export interface SpecEntryV4 {
  spec: SpecKeyV4;
  shortName: string;
  url: string;
  fleetThreadId: string | null;
  tickets: TicketEntryV4[];
}
/** `.openwiz/specs.v1.json` under the bound factory home (section 1). */
export interface SpecsFileV4 {
  schema: "openwiz.specs.v1";
  generatedAt: string;
  specs: SpecEntryV4[];
}

/** What the server's file read gave, before parsing. */
export type SpecsFileReadV4 =
  | { kind: "no-binding" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "content"; text: string };
export type SpecsUnavailableReasonV4 = "no-binding" | "missing" | "unreadable" | "malformed" | "unknown-schema" | "stale";
export type SpecsReadV4 =
  | { status: "ready"; file: SpecsFileV4 }
  | { status: "unavailable"; reason: SpecsUnavailableReasonV4 };

/** Dot order, left to right (section 2). */
export const dotOrderV4 = ["done", "done-recent", "building", "review", "needs-you", "held", "not-started"] as const;
export type DotStateV4 = (typeof dotOrderV4)[number];
export interface DotV4 { ticket: SpecKeyV4; code: string | null; state: DotStateV4 }

export type MatrixStateV4 = "working" | "checks-running" | "reviewing" | "needs-you" | "failed" | "done" | "idle";

export interface SpecAgentV4 {
  threadId: string;
  title: string;
  role: string | null;
  code: string | null;
  ticket: SpecKeyV4 | null;
  providerId: string;
  model: string | null;
  effort: EffortV3 | null;
  matrix: MatrixStateV4;
  createdAt: number;
  updatedAt: number;
}

export interface SpecRowV4 {
  spec: SpecKeyV4;
  shortName: string;
  url: string;
  done: number;
  total: number;
  doneLastHour: number;
  needsYou: number;
  open: boolean;
  dots: DotV4[];
  agents: SpecAgentV4[];
}

/** `wizbar specs --json` success body: visible rows only. */
export interface SpecsResultV4 {
  version: 1;
  status: "ready";
  /** Epoch ms of the file's `generatedAt`. */
  generatedAt: number;
  /** Sum of `needsYou` over the visible rows. */
  needsYou: number;
  specs: SpecRowV4[];
}
/** `wizbar spec <n> --open|--close --json` success body. */
export interface SpecOpenResultV4 { spec: SpecKeyV4; open: boolean }

export interface HarnessCountV4 { providerId: string; count: number }
export interface FooterThreadV4 {
  id: string;
  title: string;
  providerId: string;
  matrix: MatrixStateV4;
  spec: SpecKeyV4 | null;
  shortName: string | null;
  model: string | null;
  effort: EffortV3 | null;
}
/** `wizbar stats --json` from 0.4, and the hover card's data: 0.3's `StatsV3` at version 2, plus `harness` and `threads`. */
export type StatsV4 = { version: 2; window: StatsWindowV3; coverage: StatsCoverageV3 } & (
  | { status: "ready"; running: RunningSplitV3; waitingOnYou: number; finishedToday: FinishedTodayV3; harness: HarnessCountV4[]; threads: FooterThreadV4[] }
  | { status: "unavailable"; running: null; waitingOnYou: null; finishedToday: null; harness: null; threads: null }
);

/** Section 4: the open-state setting. */
export const specsOpenSettingV4 = { key: "specsOpen", type: "string", default: "[]" } as const;

/** Section 5: 3 × 3 masks, row-major; unlit dots use the border token. */
/** Section 5's quiet grey marks: the still mask, its colour, its motion (null when still) and the chase's fading tail. */
export type MatrixColourV4 = "accent" | "muted-accent" | "muted-text" | "warning" | "destructive" | "dim" | "faint" | "bright" | "border";
export type MatrixMotionV4 = "chase" | "pulse" | null;
export const matrixMarksV4: Readonly<Record<MatrixStateV4, { mask: string; colour: MatrixColourV4; animated: boolean; motion: MatrixMotionV4; tail: readonly MatrixColourV4[] }>> = {
  working: { mask: "100000000", colour: "bright", animated: true, motion: "chase", tail: ["muted-text", "faint"] },
  reviewing: { mask: "101010101", colour: "muted-text", animated: false, motion: null, tail: [] },
  "checks-running": { mask: "000111000", colour: "muted-text", animated: true, motion: "pulse", tail: [] },
  "needs-you": { mask: "111111111", colour: "warning", animated: false, motion: null, tail: [] },
  failed: { mask: "101010101", colour: "destructive", animated: false, motion: null, tail: [] },
  done: { mask: "111111111", colour: "muted-accent", animated: false, motion: null, tail: [] },
  idle: { mask: "000010000", colour: "faint", animated: false, motion: null, tail: [] },
};
/** Section 5: unlit dots, a visible grey. */
export const matrixUnlitV4: MatrixColourV4 = "dim";
/** Section 5: the working chase's clockwise ring order (row-major dot indexes). */
export const matrixRingV4 = [0, 1, 2, 5, 8, 7, 6, 3] as const;

/**
 * Section 6: the model and effort source and its gate, open from 0.5.0 (#111);
 * the owner's look at the candidate is the live check. Every `source` is
 * accepted, or none (#156); `fallback` serves the model alone when the read is null.
 */
export const modelSourceV4 = {
  read: "bb.sdk.threads.defaultExecutionOptions",
  fallback: "bb.sdk.threads.context usage.snapshot.model",
  adopted: true,
} as const;

/** Every `wizbar` operation from 0.4; `specs` and `spec` are new, `stats` is extended. */
export const wizbarOperationsV4 = [
  "settle", "unsettle", "snooze", "unsnooze", "mute", "unmute", "list",
  "pin", "unpin", "move", "children", "stats", "specs", "spec",
] as const;
/** Section 8: error codes the two new commands add. */
export const specsErrorCodesV4 = ["specs_unavailable", "unknown_spec", "ambiguous_spec", "settings_failed"] as const;

// ---- Fixtures ----------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** Fixed clock and zone for every v0.4 fixture. */
export const v4Now = Date.parse("2026-11-19T12:00:00Z");
export const v4TimeZone = "UTC";

const ticket = (repo: string, n: number, code: string | null, state: TicketStateV4, closedAt: number | null = null): TicketEntryV4 => ({
  ticket: `${repo}#${n}` as SpecKeyV4, code, title: `Sample ticket ${n}`, state, closedAt: closedAt === null ? null : iso(closedAt),
});
const PLANS = "example/sample-plans";
const TOOLS = "example/sample-tools";
const DOCS = "example/sample-docs";

/**
 * A ready specs file, written five minutes before `v4Now`. Tickets are in the
 * spec's order, not dot order, so a reader that forgets to sort fails.
 * - palette: every dot state, a done ticket with no close time and one closed
 *   exactly an hour ago (not "last hour"), a code shared with `cache`.
 * - cache: no running agents.
 * - finished: every ticket done, so hidden; it shares its fleet thread with `empty`.
 * - empty: no tickets, so hidden.
 */
export const v4SpecsFile: SpecsFileV4 = {
  schema: "openwiz.specs.v1",
  generatedAt: iso(v4Now - 5 * MINUTE),
  specs: [
    {
      spec: `${PLANS}#501`, shortName: "Sample palette", url: `https://github.com/${PLANS}/issues/501`,
      fleetThreadId: "thr_v4_fleet_a",
      tickets: [
        ticket(PLANS, 507, "SP-5", "not-started"),
        ticket(PLANS, 502, "SP-0", "done", v4Now - 3 * HOUR),
        ticket(PLANS, 506, "SP-4", "needs-you"),
        ticket(PLANS, 504, "SP-2", "building"),
        ticket(PLANS, 503, "SP-1", "done", v4Now - 20 * MINUTE),
        ticket(PLANS, 508, "SP-6", "held"),
        ticket(PLANS, 505, "SP-3", "review"),
        ticket(PLANS, 509, "SP-7", "done"),
        ticket(PLANS, 510, "SP-8", "done", v4Now - HOUR),
        ticket(PLANS, 511, "SH-1", "not-started"),
      ],
    },
    {
      spec: `${TOOLS}#77`, shortName: "Sample cache", url: `https://github.com/${TOOLS}/issues/77`,
      fleetThreadId: null,
      tickets: [ticket(TOOLS, 78, "SC-1", "building"), ticket(TOOLS, 79, "SH-1", "needs-you"), ticket(TOOLS, 80, null, "not-started")],
    },
    {
      spec: `${PLANS}#601`, shortName: "Sample finished", url: `https://github.com/${PLANS}/issues/601`,
      fleetThreadId: "thr_v4_fleet_c",
      tickets: [ticket(PLANS, 602, "SF-1", "done", v4Now - 10 * MINUTE), ticket(PLANS, 603, "SF-2", "done", v4Now - 2 * HOUR)],
    },
    {
      spec: `${DOCS}#9`, shortName: "Sample empty", url: `https://github.com/${DOCS}/issues/9`,
      fleetThreadId: "thr_v4_fleet_c", tickets: [],
    },
  ],
};
export const v4SpecsFileText = JSON.stringify(v4SpecsFile, null, 2);

const withFile = (change: (file: Record<string, unknown>) => void): string => {
  const copy = JSON.parse(v4SpecsFileText) as Record<string, unknown>;
  change(copy);
  return JSON.stringify(copy);
};
const firstSpec = (file: Record<string, unknown>) => (file.specs as Record<string, unknown>[])[0] as Record<string, unknown>;
const firstTicket = (file: Record<string, unknown>) => (firstSpec(file).tickets as Record<string, unknown>[])[0] as Record<string, unknown>;

/** `readSpecsFile(read, now)`: every reason, with the 30-minute and 5-minute edges. */
export const v4SpecsReadCases: ReadonlyArray<{ name: string; read: SpecsFileReadV4; now: number; expected: SpecsReadV4 }> = [
  { name: "ready", read: { kind: "content", text: v4SpecsFileText }, now: v4Now, expected: { status: "ready", file: v4SpecsFile } },
  // generatedAt is 5 minutes before v4Now: 25 minutes later it is exactly 30 minutes old, still fresh.
  { name: "exactly 30 minutes old", read: { kind: "content", text: v4SpecsFileText }, now: v4Now + 25 * MINUTE, expected: { status: "ready", file: v4SpecsFile } },
  { name: "stale: 30 minutes and 1 ms old", read: { kind: "content", text: v4SpecsFileText }, now: v4Now + 25 * MINUTE + 1, expected: { status: "unavailable", reason: "stale" } },
  { name: "stale: a day old", read: { kind: "content", text: v4SpecsFileText }, now: v4Now + DAY, expected: { status: "unavailable", reason: "stale" } },
  { name: "exactly 5 minutes in the future", read: { kind: "content", text: v4SpecsFileText }, now: v4Now - 10 * MINUTE, expected: { status: "ready", file: v4SpecsFile } },
  { name: "malformed: over 5 minutes in the future", read: { kind: "content", text: v4SpecsFileText }, now: v4Now - 10 * MINUTE - 1, expected: { status: "unavailable", reason: "malformed" } },
  { name: "no binding", read: { kind: "no-binding" }, now: v4Now, expected: { status: "unavailable", reason: "no-binding" } },
  { name: "missing", read: { kind: "missing" }, now: v4Now, expected: { status: "unavailable", reason: "missing" } },
  { name: "unreadable", read: { kind: "unreadable" }, now: v4Now, expected: { status: "unavailable", reason: "unreadable" } },
  { name: "malformed: not JSON", read: { kind: "content", text: "{\"schema\":" }, now: v4Now, expected: { status: "unavailable", reason: "malformed" } },
  { name: "malformed: empty file", read: { kind: "content", text: "" }, now: v4Now, expected: { status: "unavailable", reason: "malformed" } },
  {
    name: "malformed: a repeated key", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: v4SpecsFileText.replace('"schema": "openwiz.specs.v1",', '"schema": "openwiz.specs.v1",\n  "schema": "openwiz.specs.v1",') },
  },
  {
    name: "malformed: an unknown field", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: withFile((f) => { firstTicket(f).owner = "sample"; }) },
  },
  {
    name: "malformed: a close time on an open ticket", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: withFile((f) => { firstTicket(f).closedAt = iso(v4Now - HOUR); }) },
  },
  {
    name: "malformed: a code twice in one spec", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: withFile((f) => { firstTicket(f).code = "SP-0"; }) },
  },
  {
    name: "malformed: an unknown ticket state", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: withFile((f) => { firstTicket(f).state = "closed"; }) },
  },
  {
    name: "malformed: a url for another issue", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: withFile((f) => { firstSpec(f).url = "https://github.com/example/sample-plans/issues/502"; }) },
  },
  {
    // The schema is checked right after parsing: a missing one is malformed, another version unknown.
    name: "malformed: no schema", now: v4Now, expected: { status: "unavailable", reason: "malformed" },
    read: { kind: "content", text: withFile((f) => { delete f.schema; }) },
  },
  {
    name: "unknown schema: and a field the v1 rules refuse", now: v4Now, expected: { status: "unavailable", reason: "unknown-schema" },
    read: { kind: "content", text: withFile((f) => { f.schema = "openwiz.specs.v2"; f.extra = true; }) },
  },
  {
    name: "unknown schema", now: v4Now, expected: { status: "unavailable", reason: "unknown-schema" },
    read: { kind: "content", text: withFile((f) => { f.schema = "openwiz.specs.v2"; }) },
  },
  {
    // A fresh file with no running specs is a real zero: ready, no rows.
    name: "ready: no specs", now: v4Now, read: { kind: "content", text: withFile((f) => { f.specs = []; }) },
    expected: { status: "ready", file: { ...v4SpecsFile, specs: [] } },
  },
];

// ---- Rows ----------------------------------------------------------------------

type Machine = "cloud" | "local" | "starting";
type Row = Partial<PluginSidebarThread> & { id: string; displayTitle: string; machine: Machine; createdAgo: number };

function thread({ machine, createdAgo, ...row }: Row): PluginSidebarThread {
  const local = machine === "local";
  return {
    projectId: "prj_v4_atlas", title: row.displayTitle, titleFallback: null, parentThreadId: null,
    lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null, originKind: null, originPluginId: null,
    providerId: "harness-a", status: "active", runtimeStatus: machine === "starting" ? "starting" : "active",
    queuedWork: "none", hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "runtime", indicatorLabel: "Thread is working", isUnread: false, isPinned: false, pinnedAt: null,
    pinSortKey: null, isArchived: false, archivedAt: null, href: `/projects/prj_v4_atlas/threads/${row.id}`,
    isHidden: false,
    // Observed projection (#29): only Local rows have an environment and a host.
    environment: local ? {
      id: `env_${row.id}`, name: "Synthetic environment", branchName: null, path: null,
      isWorktree: true, providerId: "git-worktree", workspaceDisplayKind: "managed-worktree",
    } : null,
    host: local ? { id: "hst_v4_local", name: "Synthetic host" } : null,
    createdAt: v4Now - createdAgo, updatedAt: v4Now - MINUTE, lastReadAt: null, latestAttentionAt: v4Now - createdAgo,
    ...row,
  };
}
const notWorking = {
  status: "idle", runtimeStatus: "idle", indicator: "none", indicatorLabel: null,
} as const;

/**
 * Fifteen sidebar rows. Running (working and not waiting): the first nine.
 * By spec: builder_a, reviewer_a (fleet parent), parent_wins (fleet parent
 * beats its SC-1 code) and code_a (code only) belong to palette; reviewer_c to
 * the hidden finished spec (its fleet thread is shared, the code decides);
 * fleet_a, ambiguous (SH-1 is in two specs), stray (shared fleet, no code
 * match) and untitled (no parse) match no spec.
 */
export const v4Threads: readonly PluginSidebarThread[] = [
  thread({ id: "thr_v4_fleet_a", displayTitle: "Sample palette fleet", machine: "local", providerId: "harness-b", createdAgo: 5 * HOUR }),
  // Runs two background agents (subagents): it still counts as one running thread.
  thread({
    id: "thr_v4_builder_a", displayTitle: "Builder · SP-2: Sample add keyboard paths", machine: "cloud", parentThreadId: "thr_v4_fleet_a",
    activity: { workflows: 0, backgroundAgents: 2, backgroundCommands: 0, planMode: 0, goals: 0 }, createdAgo: 140 * MINUTE,
  }),
  thread({ id: "thr_v4_ambiguous", displayTitle: "Builder · SH-1: Sample share a helper", machine: "cloud", createdAgo: 100 * MINUTE }),
  thread({ id: "thr_v4_reviewer_c", displayTitle: "Reviewer · SF-2: Sample final review", machine: "cloud", providerId: "harness-b", parentThreadId: "thr_v4_fleet_c", createdAgo: 90 * MINUTE }),
  thread({ id: "thr_v4_stray", displayTitle: "Builder · ZZ-1: Sample stray work", machine: "cloud", parentThreadId: "thr_v4_fleet_c", createdAgo: 70 * MINUTE }),
  thread({ id: "thr_v4_reviewer_a", displayTitle: "Reviewer · SP-3: Sample check focus rings", machine: "cloud", providerId: "harness-b", parentThreadId: "thr_v4_fleet_a", createdAgo: 50 * MINUTE }),
  thread({ id: "thr_v4_parent_wins", displayTitle: "Builder · SC-1: Sample borrowed code", machine: "cloud", parentThreadId: "thr_v4_fleet_a", createdAgo: 30 * MINUTE }),
  thread({ id: "thr_v4_code_a", displayTitle: "Builder · SP-4: Sample wire shortcuts", machine: "cloud", parentThreadId: "thr_v4_pc_hands", createdAgo: 20 * MINUTE }),
  thread({ id: "thr_v4_untitled", displayTitle: "Sample tidy imports", machine: "starting", status: "starting", createdAgo: 10 * MINUTE }),
  // Not running.
  thread({
    id: "thr_v4_waiting", displayTitle: "Builder · SP-2: Sample waiting builder", machine: "cloud", parentThreadId: "thr_v4_fleet_a",
    hasPendingInteraction: true, indicator: "waiting-for-input", indicatorLabel: "Thread needs user input", createdAgo: 60 * MINUTE,
  }),
  thread({
    id: "thr_v4_failed", displayTitle: "Builder · SC-1: Sample failed build", machine: "cloud", status: "error", runtimeStatus: "error",
    indicator: "unread-error", indicatorLabel: "Thread failed", isUnread: true, createdAgo: 4 * HOUR,
  }),
  thread({ id: "thr_v4_checks", displayTitle: "Builder · SP-0: Sample handed back", machine: "local", ...notWorking, createdAgo: 6 * HOUR }),
  thread({ id: "thr_v4_red_checks", displayTitle: "Builder · SP-1: Sample red checks", machine: "local", ...notWorking, createdAgo: 7 * HOUR }),
  thread({ id: "thr_v4_merged", displayTitle: "Builder · SP-7: Sample merged", machine: "local", ...notWorking, createdAgo: 8 * HOUR }),
  thread({ id: "thr_v4_idle", displayTitle: "Sample quiet thread", machine: "cloud", ...notWorking, createdAgo: DAY }),
];

function pullRequest(number: number, state: PluginSidebarPullRequest["state"], checks: PluginSidebarPullRequest["experimental_checks"]["state"]): PluginSidebarPullRequest {
  return {
    experimental_autoMerge: false, experimental_inMergeQueue: null, experimental_checks: { state: checks },
    experimental_review: { state: "none" }, experimental_mergeability: { state: "unknown" }, number,
    title: `Sample pull request ${number}`, url: `https://github.com/example/sample-repo/pull/${number}`, state, attention: "none",
  };
}

/** The app's pull request per row; every other row reads null. The server has none (section 5). */
export const v4PullRequests: Readonly<Record<string, PluginSidebarPullRequest>> = {
  // Working beats a failing pull request.
  thr_v4_builder_a: pullRequest(2001, "open", "failing"),
  thr_v4_checks: pullRequest(2002, "open", "pending"),
  thr_v4_red_checks: pullRequest(2003, "draft", "failing"),
  thr_v4_merged: pullRequest(2004, "merged", "passing"),
};

/** Title parse (section 3): `[title, role, code]`, null when it does not parse. */
export const v4TitleCases: ReadonlyArray<readonly [string, string | null, string | null]> = [
  ["Builder · SP-2: Sample add keyboard paths", "Builder", "SP-2"],
  ["Reviewer · WB4-0: Sample contract review", "Reviewer", "WB4-0"],
  ["Reviewer · SP-3: Sample: a colon in what", "Reviewer", "SP-3"],
  ["Lead Reviewer · SP-3: Sample role with a space", "Lead Reviewer", "SP-3"],
  ["Sample palette fleet", null, null],
  ["Builder - SP-2: Sample hyphen separator", null, null],
  ["Builder·SP-2: Sample no spaces", null, null],
  ["Builder · sp-2: Sample lower-case code", null, null],
  ["Builder · SP-2 Sample no colon", null, null],
  ["Builder · SP-: Sample no number", null, null],
  [" · SP-2: Sample empty role", null, null],
  // Real titles (0.5.0 A): codes with no hyphen, the builder, reviewer and fleet forms.
  ["Builder · AP11: Sample no hyphen", "Builder", "AP11"],
  ["#902: Sample the driver", "Builder", null],
  ["Review #951 at abc1234", "Reviewer", null],
  ["Fleet #900: Sample kernel", null, null],
  ["#0: Sample no issue zero", null, null],
  ["Review #951", null, null],
  ["Review #951 at not-a-sha", null, null],
  // Real forms are tried first: free text holding ` · CODE:` never turns them into the old form (#122 R4).
  ["Fleet #900: Sample kernel · KN2: rollout", null, null],
  ["#902: Sample driver · KN2: rollout", "Builder", null],
];

/** Section 3: the spec each running row matches, hidden specs included; null for none. */
export const v4Matching: Readonly<Record<string, SpecKeyV4 | null>> = {
  thr_v4_fleet_a: null,
  thr_v4_builder_a: `${PLANS}#501`,
  thr_v4_ambiguous: null,
  thr_v4_reviewer_c: `${PLANS}#601`,
  thr_v4_stray: null,
  thr_v4_reviewer_a: `${PLANS}#501`,
  thr_v4_parent_wins: `${PLANS}#501`,
  thr_v4_code_a: `${PLANS}#501`,
  thr_v4_untitled: null,
};

/** Section 5, per row: in the app (with `v4PullRequests`) and on the server (no pull request). */
export const v4Matrix: Readonly<Record<string, { app: MatrixStateV4; server: MatrixStateV4 }>> = {
  thr_v4_fleet_a: { app: "working", server: "working" },
  thr_v4_builder_a: { app: "working", server: "working" },
  thr_v4_ambiguous: { app: "working", server: "working" },
  thr_v4_reviewer_c: { app: "reviewing", server: "reviewing" },
  thr_v4_stray: { app: "working", server: "working" },
  thr_v4_reviewer_a: { app: "reviewing", server: "reviewing" },
  thr_v4_parent_wins: { app: "working", server: "working" },
  thr_v4_code_a: { app: "working", server: "working" },
  thr_v4_untitled: { app: "working", server: "working" },
  thr_v4_waiting: { app: "needs-you", server: "needs-you" },
  thr_v4_failed: { app: "failed", server: "failed" },
  thr_v4_checks: { app: "checks-running", server: "idle" },
  thr_v4_red_checks: { app: "failed", server: "idle" },
  thr_v4_merged: { app: "done", server: "idle" },
  thr_v4_idle: { app: "idle", server: "idle" },
};

/** Section 4: a raw `specsOpen` value and the spec keys it opens. */
export const v4OpenSettingCases: ReadonlyArray<readonly [unknown, readonly string[]]> = [
  [undefined, []],
  ["[]", []],
  [`["${PLANS}#501","example/gone#1"]`, [`${PLANS}#501`, "example/gone#1"]],
  ["not json", []],
  ['{"open":true}', []],
  [`["${PLANS}#501",3]`, []],
  [true, []],
];
/** The `specsOpen` value `v4SpecRows` was worked out with: palette open, a gone spec kept. */
export const v4OpenSetting = `["${PLANS}#501","example/gone#1"]`;

const none = { model: null, effort: null } as const;
const agent = (threadId: string, role: string | null, code: string | null, ticketNumber: number | null, providerId: string, matrix: MatrixStateV4): SpecAgentV4 => {
  const row = v4Threads.find((t) => t.id === threadId);
  if (!row) throw new Error(threadId);
  return {
    threadId, title: row.displayTitle, role, code, ticket: ticketNumber === null ? null : `${PLANS}#${ticketNumber}`,
    providerId, ...none, matrix, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
};
const dot = (repo: string, n: number, code: string | null, state: DotStateV4): DotV4 => ({ ticket: `${repo}#${n}` as SpecKeyV4, code, state });

/** `wizbar specs --json` for `v4SpecsFile`, `v4Threads` and `v4OpenSetting` at `v4Now`. */
export const v4SpecRows: SpecsResultV4 = {
  version: 1,
  status: "ready",
  generatedAt: v4Now - 5 * MINUTE,
  needsYou: 2,
  specs: [
    {
      spec: `${PLANS}#501`, shortName: "Sample palette", url: `https://github.com/${PLANS}/issues/501`,
      // 502, 503, 509 and 510 are done; only 503 closed inside the last hour (510 closed exactly an hour ago).
      done: 4, total: 10, doneLastHour: 1, needsYou: 1, open: true,
      dots: [
        dot(PLANS, 502, "SP-0", "done"), dot(PLANS, 509, "SP-7", "done"), dot(PLANS, 510, "SP-8", "done"),
        dot(PLANS, 503, "SP-1", "done-recent"), dot(PLANS, 504, "SP-2", "building"), dot(PLANS, 505, "SP-3", "review"),
        dot(PLANS, 506, "SP-4", "needs-you"), dot(PLANS, 508, "SP-6", "held"),
        dot(PLANS, 507, "SP-5", "not-started"), dot(PLANS, 511, "SH-1", "not-started"),
      ],
      agents: [
        agent("thr_v4_builder_a", "Builder", "SP-2", 504, "harness-a", "working"),
        agent("thr_v4_reviewer_a", "Reviewer", "SP-3", 505, "harness-b", "reviewing"),
        // Its fleet parent wins over its code, which only the cache spec has, so it has no ticket here.
        agent("thr_v4_parent_wins", "Builder", "SC-1", null, "harness-a", "working"),
        agent("thr_v4_code_a", "Builder", "SP-4", 506, "harness-a", "working"),
      ],
    },
    {
      spec: `${TOOLS}#77`, shortName: "Sample cache", url: `https://github.com/${TOOLS}/issues/77`,
      done: 0, total: 3, doneLastHour: 0, needsYou: 1, open: false,
      dots: [dot(TOOLS, 78, "SC-1", "building"), dot(TOOLS, 79, "SH-1", "needs-you"), dot(TOOLS, 80, null, "not-started")],
      agents: [],
    },
  ],
};

/**
 * Section 8: `wizbar spec` on each visible spec of `v4SpecsFile` with `v4Threads`,
 * from `v4OpenSetting` at `v4Now`: the exit status, the JSON body and text, and the
 * stored `specsOpen` after. The cache spec has no agents, so opening it saves its
 * key but reports the effective state (section 4): closed, as the sidebar shows it.
 */
export const v4SpecOpenCases: ReadonlyArray<{
  argv: readonly string[]; exitCode: 0; result: SpecOpenResultV4; text: string; stored: readonly string[];
}> = [
  { argv: ["spec", "501", "--open"], exitCode: 0, result: { spec: `${PLANS}#501`, open: true },
    text: `${PLANS}#501: open\n`, stored: [`${PLANS}#501`, "example/gone#1"] },
  { argv: ["spec", "501", "--close"], exitCode: 0, result: { spec: `${PLANS}#501`, open: false },
    text: `${PLANS}#501: closed\n`, stored: ["example/gone#1"] },
  { argv: ["spec", "77", "--open"], exitCode: 0, result: { spec: `${TOOLS}#77`, open: false },
    text: `${TOOLS}#77: closed\n`, stored: [`${PLANS}#501`, "example/gone#1", `${TOOLS}#77`] },
  { argv: ["spec", "77", "--close"], exitCode: 0, result: { spec: `${TOOLS}#77`, open: false },
    text: `${TOOLS}#77: closed\n`, stored: [`${PLANS}#501`, "example/gone#1"] },
];

const footer = (id: string, matrix: MatrixStateV4, providerId: string, spec: SpecKeyV4 | null): FooterThreadV4 => ({
  id, title: v4Threads.find((t) => t.id === id)?.displayTitle ?? id, providerId, matrix, spec,
  shortName: spec === null ? null : "Sample palette", ...none,
});

/** `wizbar stats --json` and the hover card for `v4Threads` at `v4Now` in `v4TimeZone`. */
export const v4Stats: StatsV4 = {
  version: 2,
  status: "ready",
  running: { total: 9, topLevel: 3, children: 6, cloud: 7, local: 1, unknown: 1 },
  waitingOnYou: 1,
  finishedToday: { source: "none", count: null },
  window: { timeZone: "UTC", start: Date.parse("2026-11-19T00:00:00Z"), end: Date.parse("2026-11-20T00:00:00Z") },
  coverage: { scope: "observable-sidebar", subagents: "not-counted", unseen: "possible" },
  harness: [{ providerId: "harness-a", count: 6 }, { providerId: "harness-b", count: 3 }],
  // createdAt ascending. reviewer_c matches the hidden finished spec, so it shows no spec.
  threads: [
    footer("thr_v4_fleet_a", "working", "harness-b", null),
    footer("thr_v4_builder_a", "working", "harness-a", `${PLANS}#501`),
    footer("thr_v4_ambiguous", "working", "harness-a", null),
    footer("thr_v4_reviewer_c", "reviewing", "harness-b", null),
    footer("thr_v4_stray", "working", "harness-a", null),
    footer("thr_v4_reviewer_a", "reviewing", "harness-b", `${PLANS}#501`),
    footer("thr_v4_parent_wins", "working", "harness-a", `${PLANS}#501`),
    footer("thr_v4_code_a", "working", "harness-a", `${PLANS}#501`),
    footer("thr_v4_untitled", "working", "harness-a", null),
  ],
};

/** Section 7: the hover card's state on "N running": `[state, event, next]`. */
export type CardStateV4 = "closed" | "hover" | "pinned";
export type CardEventV4 = "enter" | "leave" | "focus" | "blur" | "click" | "escape";
export const v4CardPinCases: ReadonlyArray<readonly [CardStateV4, CardEventV4, CardStateV4]> = [
  ["closed", "enter", "hover"], ["closed", "focus", "hover"], ["closed", "click", "pinned"],
  ["closed", "leave", "closed"], ["closed", "blur", "closed"], ["closed", "escape", "closed"],
  ["hover", "leave", "closed"], ["hover", "blur", "closed"], ["hover", "click", "pinned"],
  ["hover", "enter", "hover"], ["hover", "focus", "hover"], ["hover", "escape", "closed"],
  ["pinned", "click", "hover"], ["pinned", "leave", "pinned"], ["pinned", "blur", "pinned"],
  ["pinned", "enter", "pinned"], ["pinned", "focus", "pinned"], ["pinned", "escape", "closed"],
];

// ---- WB4-6 (openwizdev/OpenWiz#1581): missing fleet ids, failed running rows ----

/**
 * Two more running rows, read with `v4Threads` and `v4SpecsFile` (sections 3 and 5).
 * - top_level: a top-level thread whose code ZZ-2 is in no spec. The cache spec
 *   has no fleet thread, so comparing two missing ids would put it in cache.
 * - failed_running: active runtime, not waiting, failed queued work, under the
 *   palette fleet. It is running, matches palette by its parent, and shows `failed`.
 */
export const v4FleetIdThreads: readonly PluginSidebarThread[] = [
  thread({ id: "thr_v4_top_level", displayTitle: "Builder · ZZ-2: Sample top-level work", machine: "cloud", createdAgo: 15 * MINUTE }),
  thread({
    id: "thr_v4_failed_running", displayTitle: "Builder · SP-5: Sample keeps going", machine: "cloud", parentThreadId: "thr_v4_fleet_a",
    queuedWork: "failed", createdAgo: 12 * MINUTE,
  }),
];

/** Section 3 for `v4FleetIdThreads`: the spec each matches. */
export const v4FleetIdMatching: Readonly<Record<string, SpecKeyV4 | null>> = {
  thr_v4_top_level: null,
  thr_v4_failed_running: `${PLANS}#501`,
};

/** The palette agent `failed_running` adds (section 3); it is the newest, so it comes last. */
export const v4FailedRunningAgent: SpecAgentV4 = {
  threadId: "thr_v4_failed_running", title: "Builder · SP-5: Sample keeps going", role: "Builder", code: "SP-5",
  ticket: `${PLANS}#507`, providerId: "harness-a", ...none, matrix: "failed",
  createdAt: v4Now - 12 * MINUTE, updatedAt: v4Now - MINUTE,
};

/** `wizbar stats --json` and the hover card for `v4Threads` plus `v4FleetIdThreads`: both new rows count as running. */
const newFooter = (id: string, matrix: MatrixStateV4, spec: SpecKeyV4 | null): FooterThreadV4 =>
  ({ ...footer(id, matrix, "harness-a", spec), title: v4FleetIdThreads.find((t) => t.id === id)!.displayTitle });
export const v4FleetIdStats: StatsV4 = {
  ...(v4Stats as Extract<StatsV4, { status: "ready" }>),
  running: { total: 11, topLevel: 4, children: 7, cloud: 9, local: 1, unknown: 1 },
  harness: [{ providerId: "harness-a", count: 8 }, { providerId: "harness-b", count: 3 }],
  threads: [
    // createdAt ascending: both new rows come just before untitled (10 minutes old).
    ...(v4Stats as Extract<StatsV4, { status: "ready" }>).threads.slice(0, -1),
    newFooter("thr_v4_top_level", "working", null),
    newFooter("thr_v4_failed_running", "failed", `${PLANS}#501`),
    ...(v4Stats as Extract<StatsV4, { status: "ready" }>).threads.slice(-1),
  ],
};

// ---- 0.5.0 A (openwizdev/WizPlugins#110): real titles -------------------------

const FLEET = "example/sample-fleet";
const real = (n: number, code: string | null, title: string, state: TicketStateV4, extra: Partial<TicketEntryV4> = {}): TicketEntryV4 =>
  ({ ticket: `${FLEET}#${n}` as SpecKeyV4, code, title, state, closedAt: null, ...extra });

/**
 * A specs file as the producer writes it (section 1): full GitHub titles, codes
 * with no hyphen, and each ticket's open pull requests. No fleet thread ids:
 * the producer reads GitHub only, so the `Fleet #S:` title links a fleet to its spec.
 */
export const v4RealTitlesFile: SpecsFileV4 = {
  schema: "openwiz.specs.v1",
  generatedAt: iso(v4Now - 5 * MINUTE),
  specs: [
    {
      spec: `${FLEET}#900`, shortName: "Sample kernel", url: `https://github.com/${FLEET}/issues/900`, fleetThreadId: null,
      tickets: [
        real(901, "KN1", "0.1.0 KN1: Sample records shape", "done", { closedAt: iso(v4Now - 2 * HOUR), pulls: [] }),
        real(902, "KN2", "0.1.0 KN2: Sample the driver", "building", { pulls: [950] }),
        real(903, "KN3", "0.1.0 KN3: Sample the reader", "review", { pulls: [951] }),
        real(904, "AP11", "0.1.0 AP11: Sample app shell", "not-started", { pulls: [] }),
      ],
    },
    {
      spec: `${FLEET}#920`, shortName: "Sample relay", url: `https://github.com/${FLEET}/issues/920`, fleetThreadId: null,
      tickets: [
        real(921, "RL1", "RL1: Sample relay start", "building", { pulls: [] }),
        // The old code form still matches.
        real(922, "SP-9", "Sample old form", "not-started"),
        // No code: its builder row keeps the issue number in the code's place.
        real(923, null, "Sample uncoded work", "not-started", { pulls: [] }),
      ],
    },
  ],
};

/**
 * Running rows with real titles, read with `v4RealTitlesFile`. Every row runs.
 * - fleet: the `Fleet #900:` thread; never an agent.
 * - builder: `#902:` under the fleet; reviewer: `Review #951 at …`, top-level, found by its pull.
 * - helper: an untitled child of the fleet, which belongs to its spec.
 * - top_builder: `#921:` with no parent, found by its issue number.
 * - old_form and no_hyphen: `Role · CODE:` titles.
 * - uncoded: `#923:`, a ticket with no code.
 * - lost_review, lost_child: a pull and an issue no spec has, under a fleet for a spec not in the file.
 */
export const v4RealTitleThreads: readonly PluginSidebarThread[] = [
  thread({ id: "thr_rt_fleet", displayTitle: "Fleet #900: Sample kernel", machine: "cloud", createdAgo: 3 * HOUR }),
  thread({ id: "thr_rt_builder", displayTitle: "#902: Sample the driver", machine: "cloud", parentThreadId: "thr_rt_fleet", createdAgo: 80 * MINUTE }),
  thread({ id: "thr_rt_reviewer", displayTitle: "Review #951 at abc1234", machine: "cloud", providerId: "harness-b", createdAgo: 70 * MINUTE }),
  thread({ id: "thr_rt_helper", displayTitle: "Sample helper sweep", machine: "cloud", parentThreadId: "thr_rt_fleet", createdAgo: 60 * MINUTE }),
  thread({ id: "thr_rt_top_builder", displayTitle: "#921: Sample relay start", machine: "cloud", createdAgo: 50 * MINUTE }),
  thread({ id: "thr_rt_old_form", displayTitle: "Builder · SP-9: Sample old form", machine: "cloud", createdAgo: 40 * MINUTE }),
  thread({ id: "thr_rt_no_hyphen", displayTitle: "Builder · AP11: Sample app shell", machine: "cloud", createdAgo: 30 * MINUTE }),
  thread({ id: "thr_rt_uncoded", displayTitle: "#923: Sample uncoded work", machine: "cloud", createdAgo: 25 * MINUTE }),
  thread({ id: "thr_rt_lost_fleet", displayTitle: "Fleet #777: Sample gone spec", machine: "cloud", createdAgo: 2 * HOUR }),
  thread({ id: "thr_rt_lost_review", displayTitle: "Review #999 at def5678", machine: "cloud", createdAgo: 20 * MINUTE }),
  thread({ id: "thr_rt_lost_child", displayTitle: "#5: Sample nothing", machine: "cloud", parentThreadId: "thr_rt_lost_fleet", createdAgo: 10 * MINUTE }),
];

/** Section 3 for `v4RealTitleThreads` with the rows passed: the spec each matches. */
export const v4RealTitleMatching: Readonly<Record<string, SpecKeyV4 | null>> = {
  thr_rt_fleet: null,
  thr_rt_builder: `${FLEET}#900`,
  thr_rt_reviewer: `${FLEET}#900`,
  thr_rt_helper: `${FLEET}#900`,
  thr_rt_top_builder: `${FLEET}#920`,
  thr_rt_old_form: `${FLEET}#920`,
  thr_rt_no_hyphen: `${FLEET}#900`,
  thr_rt_uncoded: `${FLEET}#920`,
  thr_rt_lost_fleet: null,
  thr_rt_lost_review: null,
  thr_rt_lost_child: null,
};

const realAgent = (threadId: string, title: string, role: string | null, code: string | null, ticketNumber: number | null, matrix: MatrixStateV4 = "working"): SpecAgentV4 => {
  const row = v4RealTitleThreads.find((t) => t.id === threadId);
  if (!row) throw new Error(threadId);
  return {
    threadId, title, role, code, ticket: ticketNumber === null ? null : `${FLEET}#${ticketNumber}`,
    providerId: row.providerId, ...none, matrix, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
};

/** The agents under each visible spec, worked out by hand: `<Role> · <code>: <ticket title without its version and code>`. */
export const v4RealTitleAgents: Readonly<Record<SpecKeyV4, SpecAgentV4[]>> = {
  [`${FLEET}#900`]: [
    realAgent("thr_rt_builder", "Builder · KN2: Sample the driver", "Builder", "KN2", 902),
    realAgent("thr_rt_reviewer", "Reviewer · KN3: Sample the reader", "Reviewer", "KN3", 903, "reviewing"),
    realAgent("thr_rt_helper", "Sample helper sweep", null, null, null),
    realAgent("thr_rt_no_hyphen", "Builder · AP11: Sample app shell", "Builder", "AP11", 904),
  ],
  [`${FLEET}#920`]: [
    realAgent("thr_rt_top_builder", "Builder · RL1: Sample relay start", "Builder", "RL1", 921),
    realAgent("thr_rt_old_form", "Builder · SP-9: Sample old form", "Builder", "SP-9", 922),
    realAgent("thr_rt_uncoded", "Builder · #923: Sample uncoded work", "Builder", null, 923),
  ],
};

// WizBar 0.6 contract shapes and synthetic fixtures (C0, openwizdev/WizPlugins#182).
// The rules behind every shape are in contracts/specs-section.v1.md sections 10
// to 13 and contracts/sidebar-v3.v1.md section 10. Every id, title, repository,
// number and URL here is made up. Expected values are worked out by hand from
// those contracts, never by running 0.6 code, so later tickets test their
// computations against them.

import type { SpecEntryV4, SpecKeyV4, SpecRowV4, SpecsFileV4, SpecsResultV4, TicketEntryV4 } from "./v4";

// ---- Shapes ------------------------------------------------------------------

/** The Specs section's sorts (specs-section section 11), the default first. */
export const specsSortsV6 = ["needs-you", "recent", "closest", "newest"] as const;
export type SpecsSortV6 = (typeof specsSortsV6)[number];

/** Specs file v2, additive (section 10): a ticket may carry the issue's `updated_at`. */
export interface TicketEntryV6 extends TicketEntryV4 {
  /** UTC ISO ending `Z`; v2 files only, optional. */
  updatedAt?: string;
}
export interface SpecEntryV6 extends Omit<SpecEntryV4, "tickets"> { tickets: TicketEntryV6[] }
export interface SpecsFileV6 extends Omit<SpecsFileV4, "specs"> { specs: SpecEntryV6[] }

/** A spec row in 0.6 (sections 10 and 12): the 0.4 row plus its activity time and the Quiet mark. */
export interface SpecRowV6 extends SpecRowV4 {
  /** Epoch ms, or null when nothing gives a time. */
  activityAt: number | null;
  quiet: boolean;
}
/** `wizbar specs [--sort <name>] --json` in 0.6: rows in the chosen order, quiet rows after the others. */
export interface SpecsResultV6 extends Omit<SpecsResultV4, "specs"> {
  sort: SpecsSortV6;
  specs: SpecRowV6[];
}

/** Section 12: nothing moving for longer than this makes a spec quiet. */
export const quietAfterMsV6 = 3 * 24 * 60 * 60_000;
/** Section 13: one breath, in step for every breathing dot. */
export const breathPeriodMsV6 = 2_000;

// ---- Specs: activity, Quiet, sorts and the activity look ----------------------

export const v6Now = Date.parse("2026-11-20T12:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const REPO = "example/sample-sort";

/** A ticket; `updatedAt` omitted when null, as a file from before #183 has it. */
function ticket(n: number, state: TicketEntryV6["state"], updatedAt: number | null, closedAt: number | null = null): TicketEntryV6 {
  return {
    ticket: `${REPO}#${n}` as SpecKeyV4, code: `SS${n}`, title: `Sample ticket ${n}`, state,
    closedAt: closedAt === null ? null : iso(closedAt), ...(updatedAt === null ? {} : { updatedAt: iso(updatedAt) }),
  };
}
function spec(n: number, name: string, tickets: TicketEntryV6[]): SpecEntryV6 {
  return { spec: `${REPO}#${n}` as SpecKeyV4, shortName: `Sample ${name}`, url: `https://github.com/${REPO}/issues/${n}`, fleetThreadId: null, tickets };
}

/**
 * A ready v2 file, in the producer's order (newest spec first), written a
 * minute before `v6Now`. Each spec is one case:
 * - alpha: a ticket needs you, idle 5 days: never quiet.
 * - bravo: an agent ran 10 minutes ago, newer than any ticket; a done ticket updated after its close; a working agent and a reviewer both name its review ticket.
 * - charlie: idle 4 days: quiet.
 * - delta: every ticket done (0.5 hid it): quiet; a close newer than its `updatedAt`.
 * - echo: a ticket needs you, active 30 minutes ago.
 * - foxtrot: no `updatedAt`, no close time, no agents: no activity time, so not quiet.
 * - golf: idle exactly 3 days: not quiet.
 * - hotel: no tickets: hidden, no row anywhere.
 * - india: tickets idle 6 days, but an agent ran a minute ago: not quiet.
 */
export const v6SpecsFile: SpecsFileV6 = {
  schema: "openwiz.specs.v2",
  generatedAt: iso(v6Now - MINUTE),
  specs: [
    spec(701, "alpha", [ticket(702, "needs-you", v6Now - 5 * DAY), ticket(703, "not-started", v6Now - 5 * DAY)]),
    spec(711, "bravo", [
      ticket(712, "done", v6Now - 90 * MINUTE, v6Now - 2 * HOUR), ticket(713, "building", v6Now - DAY), ticket(714, "review", v6Now - DAY),
    ]),
    spec(721, "charlie", [
      ticket(722, "done", v6Now - 4 * DAY, v6Now - 4 * DAY), ticket(723, "not-started", v6Now - 4 * DAY),
      ticket(724, "not-started", v6Now - 4 * DAY), ticket(725, "done", v6Now - 4 * DAY, v6Now - 4 * DAY),
    ]),
    spec(731, "delta", [ticket(732, "done", v6Now - 2 * HOUR, v6Now - HOUR), ticket(733, "done", v6Now - 3 * HOUR, v6Now - 3 * HOUR)]),
    spec(741, "echo", [
      ticket(742, "needs-you", v6Now - HOUR), ticket(743, "done", v6Now - 30 * MINUTE, v6Now - 30 * MINUTE), ticket(744, "not-started", v6Now - 2 * DAY),
    ]),
    spec(751, "foxtrot", [ticket(752, "building", null), ticket(753, "not-started", null)]),
    spec(761, "golf", [ticket(762, "done", v6Now - 3 * DAY, v6Now - 3 * DAY), ticket(763, "not-started", v6Now - 3 * DAY)]),
    spec(771, "hotel", []),
    spec(781, "india", [ticket(782, "building", v6Now - 6 * DAY), ticket(783, "not-started", v6Now - 6 * DAY)]),
  ],
};
export const v6SpecsFileText = JSON.stringify(v6SpecsFile, null, 2);

/** One running agent of a spec, as the activity look and the activity time read it (section 3's `SpecAgentV4`). */
export interface AgentActivityV6 {
  threadId: string;
  ticket: SpecKeyV4 | null;
  matrix: "working" | "reviewing" | "failed";
  updatedAt: number;
}
/** The running agents by spec. Specs not listed have none. */
export const v6Agents: Readonly<Record<string, readonly AgentActivityV6[]>> = {
  [`${REPO}#711`]: [
    { threadId: "thr_v6_bravo_builder", ticket: `${REPO}#713`, matrix: "working", updatedAt: v6Now - 10 * MINUTE },
    { threadId: "thr_v6_bravo_reviewer", ticket: `${REPO}#714`, matrix: "reviewing", updatedAt: v6Now - 20 * MINUTE },
    { threadId: "thr_v6_bravo_fixer", ticket: `${REPO}#714`, matrix: "working", updatedAt: v6Now - 30 * MINUTE },
  ],
  [`${REPO}#781`]: [
    { threadId: "thr_v6_india_builder", ticket: `${REPO}#782`, matrix: "working", updatedAt: v6Now - MINUTE },
    { threadId: "thr_v6_india_failed", ticket: `${REPO}#783`, matrix: "failed", updatedAt: v6Now - 40 * MINUTE },
  ],
};

/** What section 10 to 13 give each visible spec at `v6Now`, worked by hand. Hotel is hidden and has no entry. */
export interface SpecActivityCaseV6 {
  spec: SpecKeyV4;
  done: number;
  total: number;
  needsYou: number;
  activityAt: number | null;
  quiet: boolean;
  /** Section 13: the name in the muted text colour. */
  muted: boolean;
}
export const v6Activity: readonly SpecActivityCaseV6[] = [
  { spec: `${REPO}#701`, done: 0, total: 2, needsYou: 1, activityAt: v6Now - 5 * DAY, quiet: false, muted: false },
  { spec: `${REPO}#711`, done: 1, total: 3, needsYou: 0, activityAt: v6Now - 10 * MINUTE, quiet: false, muted: false },
  { spec: `${REPO}#721`, done: 2, total: 4, needsYou: 0, activityAt: v6Now - 4 * DAY, quiet: true, muted: true },
  { spec: `${REPO}#731`, done: 2, total: 2, needsYou: 0, activityAt: v6Now - HOUR, quiet: true, muted: true },
  { spec: `${REPO}#741`, done: 1, total: 3, needsYou: 1, activityAt: v6Now - 30 * MINUTE, quiet: false, muted: false },
  { spec: `${REPO}#751`, done: 0, total: 2, needsYou: 0, activityAt: null, quiet: false, muted: true },
  { spec: `${REPO}#761`, done: 1, total: 2, needsYou: 0, activityAt: v6Now - 3 * DAY, quiet: false, muted: true },
  { spec: `${REPO}#781`, done: 0, total: 2, needsYou: 0, activityAt: v6Now - MINUTE, quiet: false, muted: false },
];

const k = (n: number) => `${REPO}#${n}` as SpecKeyV4;
/**
 * Section 11: every visible spec in each sort, worked by hand from `v6Activity`.
 * - needs-you: needs you (echo, alpha by activity), then the rest by activity
 *   with no time last (india, bravo, golf, charlie, foxtrot), then finished (delta).
 * - recent: activity newest first, no time last.
 * - closest: done share highest first (delta 1; golf and charlie ½, golf has
 *   fewer left; bravo and echo ⅓, file order; alpha, foxtrot, india 0, file order).
 * - newest: the file's order.
 */
export const v6SortOrders: Readonly<Record<SpecsSortV6, readonly SpecKeyV4[]>> = {
  "needs-you": [k(741), k(701), k(781), k(711), k(761), k(721), k(751), k(731)],
  recent: [k(781), k(711), k(741), k(731), k(761), k(721), k(701), k(751)],
  closest: [k(731), k(761), k(721), k(711), k(741), k(701), k(751), k(781)],
  newest: [k(701), k(711), k(721), k(731), k(741), k(751), k(761), k(781)],
};

/** Section 12: the default sort split into the main list and the Quiet group, each keeping the sort's order. */
export const v6QuietSplit = {
  main: [k(741), k(701), k(781), k(711), k(761), k(751)],
  quiet: [k(721), k(731)],
  /** The section rule counts the main list only; the group's header is `Quiet 2`. */
  rule: "Specs 6 · 2 tickets need you (2 specs)",
  quietHeader: "Quiet 2",
} as const;

/** Section 13: each ticket dot's motion. Only a ticket a `working` agent names breathes, and never a `review` dot. */
export interface DotMotionCaseV6 { ticket: SpecKeyV4; state: TicketEntryV6["state"]; motion: "breath" | "still"; why: string }
export const v6DotMotion: readonly DotMotionCaseV6[] = [
  { ticket: k(713), state: "building", motion: "breath", why: "a working builder names it" },
  { ticket: k(714), state: "review", motion: "still", why: "a working agent names it too, yet a review ring stays steady" },
  { ticket: k(712), state: "done", motion: "still", why: "done" },
  { ticket: k(782), state: "building", motion: "breath", why: "a working builder names it" },
  { ticket: k(783), state: "not-started", motion: "still", why: "its agent failed" },
  { ticket: k(752), state: "building", motion: "still", why: "building with no agent (0.5 pulsed it)" },
  { ticket: k(742), state: "needs-you", motion: "still", why: "needs you, no agent" },
];

/** Section 11: raw `specsSort` values and the sort they read as. */
export const v6SpecsSortCases: readonly { raw: unknown; sort: SpecsSortV6 }[] = [
  { raw: undefined, sort: "needs-you" },
  { raw: "needs-you", sort: "needs-you" },
  { raw: "recent", sort: "recent" },
  { raw: "closest", sort: "closest" },
  { raw: "newest", sort: "newest" },
  { raw: "", sort: "needs-you" },
  { raw: "Recent", sort: "needs-you" },
  { raw: "name", sort: "needs-you" },
  { raw: 3, sort: "needs-you" },
];

// ---- Sidebar sections (sidebar-v3 section 10) ---------------------------------

/** The three 0.6 sections, in their default order. */
export type SidebarSectionV6 = "pinned" | "specs" | "unread";

/** `sectionsCollapsed` read in 0.6: a stored `inbox` reads as `unread`, once; malformed collapses nothing. */
export const v6CollapsedCases: readonly { raw: unknown; keys: readonly string[] }[] = [
  { raw: undefined, keys: [] },
  { raw: "not json", keys: [] },
  { raw: "[\"inbox\", 2]", keys: [] },
  { raw: "[\"inbox\"]", keys: ["unread"] },
  { raw: "[\"pinned\",\"inbox\",\"specs\"]", keys: ["pinned", "unread", "specs"] },
  { raw: "[\"inbox\",\"unread\"]", keys: ["unread"] },
  { raw: "[\"unread\",\"later-section\"]", keys: ["unread", "later-section"] },
];
/** Collapse writes in 0.6: a stored `inbox` is written back as `unread`; unknown keys are kept. */
export const v6CollapseWrites: readonly { raw: unknown; key: SidebarSectionV6; collapsed: boolean; stored: string }[] = [
  { raw: "[\"inbox\"]", key: "unread", collapsed: false, stored: "[]" },
  { raw: "[\"inbox\"]", key: "unread", collapsed: true, stored: "[\"unread\"]" },
  { raw: "[\"inbox\",\"later-section\"]", key: "pinned", collapsed: true, stored: "[\"unread\",\"later-section\",\"pinned\"]" },
  { raw: "[\"pinned\",\"inbox\"]", key: "pinned", collapsed: false, stored: "[\"unread\"]" },
  { raw: "garbage", key: "specs", collapsed: true, stored: "[\"specs\"]" },
];

/** `sectionsOrder` reads: known keys in stored order, missing ones appended in default order; malformed is the default. */
export const v6OrderCases: readonly { raw: unknown; order: readonly SidebarSectionV6[] }[] = [
  { raw: undefined, order: ["pinned", "specs", "unread"] },
  { raw: "", order: ["pinned", "specs", "unread"] },
  { raw: "{}", order: ["pinned", "specs", "unread"] },
  { raw: "[1,\"specs\"]", order: ["pinned", "specs", "unread"] },
  { raw: "[]", order: ["pinned", "specs", "unread"] },
  { raw: "[\"unread\",\"specs\",\"pinned\"]", order: ["unread", "specs", "pinned"] },
  { raw: "[\"specs\"]", order: ["specs", "pinned", "unread"] },
  { raw: "[\"specs\",\"specs\",\"inbox\",\"settled\"]", order: ["specs", "unread", "pinned"] },
];
/** Moving one section to an index (a drop, or Alt+Up/Alt+Down as index ± 1, clamped). */
export const v6OrderMoves: readonly { raw: unknown; key: SidebarSectionV6; to: number; stored: string }[] = [
  { raw: undefined, key: "unread", to: 0, stored: "[\"unread\",\"pinned\",\"specs\"]" },
  { raw: "[\"unread\",\"pinned\",\"specs\"]", key: "unread", to: 1, stored: "[\"pinned\",\"unread\",\"specs\"]" },
  { raw: "[\"pinned\",\"specs\",\"unread\"]", key: "pinned", to: 2, stored: "[\"specs\",\"unread\",\"pinned\"]" },
  { raw: "[\"pinned\",\"specs\",\"unread\"]", key: "pinned", to: -1, stored: "[\"pinned\",\"specs\",\"unread\"]" },
  { raw: "[\"pinned\",\"specs\",\"unread\"]", key: "unread", to: 3, stored: "[\"pinned\",\"specs\",\"unread\"]" },
  { raw: "garbage", key: "specs", to: 0, stored: "[\"specs\",\"pinned\",\"unread\"]" },
];

// ---- The 0.5.0 store (for the 0.5.0 → 0.6.0 reload) ---------------------------

/**
 * A plugin store as WizBar 0.5.0 left it: all eight keys, each set away from its
 * default, synthetic values only. 0.6.0 must read every value back unchanged,
 * and read the two new keys at their defaults.
 */
export const v6Store050 = {
  footerCountEnabled: false,
  machineIconsEnabled: false,
  childrenChipEnabled: true,
  parentChipEnabled: false,
  specsOpen: "[\"example/sample-sort#711\"]",
  sectionsCollapsed: "[\"inbox\",\"specs\"]",
  wizdeckFactories: "[]",
  wizdeckGithubToken: "synthetic-token-not-real",
} as const;
export const v6NewSettingDefaults = { specsSort: "needs-you", sectionsOrder: "[\"pinned\",\"specs\",\"unread\"]" } as const;

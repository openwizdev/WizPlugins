// WZ20 (#41): the one stats computation (contracts/sidebar-v3.v1.md, section 4).
// The footer panel, the list-bottom line and `wizbar stats` all call it, so the
// same rows give the same numbers everywhere.
import { hasRuntimeWork } from "./lifecycle";
import { classifyMachine } from "./machine-source";
import type { PluginRealtimeConnectionState, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import type { CardModelsResultV3, StatsCoverageV3, StatsV3, StatsWindowV3, ThreadV3 } from "./v3-types";
import type { CardEventV4, CardStateV4, SpecsFileV4, StatsV4 } from "./fixtures/v4";
import type { SpecsThreadRow } from "./specs/rows";

/** SDK 0.6.33 `ThreadRuntimeDisplayStatus`; anything else cannot mean idle. */
export const runtimeDisplayStatuses = [
  "idle", "error", "active", "pending", "starting", "stopping", "provisioning", "waiting-for-host",
] as const;

/** The fields a stats computation reads; both readers supply exactly these. */
export type StatsRow = Pick<ThreadV3, "id" | "parentThreadId" | "hasPendingInteraction" | "runtimeStatus" | "activity" | "environment" | "host">;

const coverage: StatsCoverageV3 = { scope: "observable-sidebar", subagents: "not-counted", unseen: "possible" };

/** Working by the shared runtime fact (subagent activity included, never counted on its own). */
function isWorkingRow({ runtimeStatus, activity }: StatsRow): boolean {
  return hasRuntimeWork(runtimeStatus, [activity.workflows, activity.backgroundAgents,
    activity.backgroundCommands, activity.planMode, activity.goals]);
}

/** The one running rule: working, and not waiting on you. */
export function isRunning(row: StatsRow): boolean {
  return isWorkingRow(row) && !row.hasPendingInteraction;
}

/** Local midnight today (inclusive) to local midnight tomorrow (exclusive) in `timeZone`. */
export function statsWindow(now: number, timeZone: string): StatsWindowV3 {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
  // The zone's wall clock at `at`, read back as if it were UTC.
  const wall = (at: number): number => {
    const part = Object.fromEntries(format.formatToParts(at).map(({ type, value }) => [type, Number(value)]));
    return Date.UTC(part.year!, part.month! - 1, part.day!, part.hour!, part.minute!, part.second!);
  };
  // The first instant whose wall clock reaches midnight of the given UTC-encoded day.
  const midnight = (day: number): number => {
    let at = day - (wall(day) - day);
    for (let i = 0; i < 3; i++) at = day - (wall(at) - at);
    // A zone that skips its midnight starts the day at the first instant after the gap.
    while (wall(at) < day) at += 60_000;
    while (wall(at - 60_000) >= day) at -= 60_000;
    return at;
  };
  const today = new Date(wall(now));
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return { timeZone, start: midnight(day), end: midnight(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)) };
}

/** Stats over one reader's rows; null rows, an unknown runtime or conflicting repeats are unavailable. */
export function computeStats(rows: readonly StatsRow[] | null, now: number, timeZone: string): StatsV3 {
  const window = statsWindow(now, timeZone);
  const unavailable: StatsV3 = { version: 1, status: "unavailable", running: null, waitingOnYou: null, finishedToday: null, window, coverage };
  if (!rows) return unavailable;
  const seen = new Map<string, string>();
  const running = { total: 0, topLevel: 0, children: 0, cloud: 0, local: 0, unknown: 0 };
  let waitingOnYou = 0;
  for (const row of rows) {
    if (!(runtimeDisplayStatuses as readonly string[]).includes(row.runtimeStatus) ||
      typeof row.hasPendingInteraction !== "boolean") return unavailable;
    const counted = isRunning(row);
    const machine = classifyMachine(row);
    const facts = JSON.stringify([counted, row.hasPendingInteraction, row.parentThreadId, machine]);
    const prior = seen.get(row.id);
    if (prior !== undefined) {
      if (prior !== facts) return unavailable;
      continue;
    }
    seen.set(row.id, facts);
    if (row.hasPendingInteraction) waitingOnYou++;
    if (!counted) continue;
    running.total++;
    running[row.parentThreadId === null ? "topLevel" : "children"]++;
    running[machine === "Cloud" ? "cloud" : machine === "Local" ? "local" : "unknown"]++;
  }
  return { version: 1, status: "ready", running, waitingOnYou, finishedToday: { source: "none", count: null }, window, coverage };
}

export type SidebarRowsStatus = "ready" | "unavailable" | "incomplete" | "stale" | "error";

const stableId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * The UI reader (contract section 1): the sidebar hook's rows when they are
 * ready, connected and carry every field a v0.3 computation reads. Repeated IDs
 * are checked on the membership and running-rule facts only, never the
 * indicator; `computeStats` rejects rows that conflict on those facts.
 */
export function readSidebarRows(
  state: Pick<PluginSidebarThreadsState, "status" | "threads">,
  connection: PluginRealtimeConnectionState,
): { status: SidebarRowsStatus; rows: readonly ThreadV3[] | null } {
  const gap = (status: Exclude<SidebarRowsStatus, "ready">) => ({ status, rows: null });
  if (!state || typeof state !== "object" || Array.isArray(state)) return gap("incomplete");
  if (state.status === "error") return gap("error");
  if (state.status === "loading") return gap("unavailable");
  if (state.status !== "ready" || !Array.isArray(state.threads)) return gap("incomplete");
  if (connection !== "connected") return gap("stale");
  const projects = new Map<string, string>();
  for (const row of state.threads as readonly unknown[]) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return gap("incomplete");
    const t = row as ThreadV3;
    const activity = t.activity as unknown;
    if (!stableId(t.id) || !stableId(t.projectId) || !(t.parentThreadId === null || stableId(t.parentThreadId)) ||
      typeof t.hasPendingInteraction !== "boolean" ||
      !(runtimeDisplayStatuses as readonly string[]).includes(t.runtimeStatus) ||
      !activity || typeof activity !== "object" || Array.isArray(activity) || Object.keys(activity).length !== 5 ||
      ![t.activity.workflows, t.activity.backgroundAgents, t.activity.backgroundCommands, t.activity.planMode, t.activity.goals]
        .every((n) => Number.isSafeInteger(n) && n >= 0)) return gap("incomplete");
    const prior = projects.get(t.id);
    if (prior !== undefined && prior !== t.projectId) return gap("incomplete");
    projects.set(t.id, t.projectId);
  }
  // Repeats that disagree on the running rule's facts are unavailable too.
  if (computeStats(state.threads, 0, "UTC").status !== "ready") return gap("incomplete");
  return { status: "ready", rows: state.threads };
}

/** The panel's and the CLI's wording for the finish line. */
export const finishedTodayText = (stats: Extract<StatsV3, { status: "ready" }>): string =>
  `Finished today: ${stats.finishedToday.source === "host" ? stats.finishedToday.count : "not available yet"}`;
export const disclosureText = "subagents not counted yet · some threads may be unseen";

/** `wizbar stats` text: three lines. */
export function formatStatsText(stats: StatsV3): string {
  if (stats.status !== "ready") return "ERROR state_unavailable: Thread state is unavailable.";
  const { running: r } = stats;
  return [
    `${r.total} running · ${r.topLevel} top-level, ${r.children} children · ${r.cloud} cloud, ${r.local} local, ${r.unknown} unknown · ${disclosureText}`,
    `Waiting on you: ${stats.waitingOnYou}`,
    finishedTodayText(stats),
  ].join("\n");
}

// ---- WB4-3 (openwizdev/OpenWiz#1437): the hover card's data, specs-section.v1.md sections 7 and 8 ----

/** A row with what the card reads too: the spec rows' fields beside the 0.3 stats fields. */
export type StatsV4Row = StatsRow & SpecsThreadRow;

/** `wizbar stats --json` from 0.4 and the hover card: one computation for both. */
export function computeStatsV4(
  rows: readonly StatsV4Row[] | null, specs: SpecsFileV4 | null, models: CardModelsResultV3 | null, now: number, timeZone: string,
): StatsV4 {
  void rows; void specs; void models;
  const { window, coverage: c } = computeStats(null, now, timeZone);
  return { version: 2, status: "unavailable", running: null, waitingOnYou: null, finishedToday: null, window, coverage: c, harness: null, threads: null };
}

/** The card's first line (section 7). */
export function cardSummary(stats: Extract<StatsV4, { status: "ready" }>): string {
  void stats;
  return "";
}

/** The card's state on "N running" (section 7, `v4CardPinCases`). */
export function cardPinNext(state: CardStateV4, event: CardEventV4): CardStateV4 {
  void event;
  return state;
}

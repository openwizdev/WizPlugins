// WZ20 (#41): the one stats computation (contracts/sidebar-v3.v1.md, section 4).
// The footer panel, the list-bottom line and `wizbar stats` all call it, so the
// same rows give the same numbers everywhere.
import { hasRuntimeWork } from "./lifecycle";
import { classifyMachine } from "./machine-source";
import type { PluginRealtimeConnectionState, PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import type { CardModelsResultV3, StatsCoverageV3, StatsV3, StatsWindowV3, ThreadV3 } from "./v3-types";
import type { CardEventV4, CardStateV4, FooterThreadV4, SpecsFileV4, StatsV4 } from "./fixtures/v4";
import { matchSpec, matrixState, parseTitle, specRows, type SpecsThreadRow } from "./specs/rows";

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
export const finishedTodayText = (stats: Extract<StatsV3 | StatsV4, { status: "ready" }>): string =>
  `Finished today: ${stats.finishedToday.source === "host" ? stats.finishedToday.count : "not available yet"}`;
export const disclosureText = "subagents not counted yet · some threads may be unseen";

/** `wizbar stats` text: three lines; from 0.4 the harness split, then one line per running thread. */
export function formatStatsText(stats: StatsV3 | StatsV4): string {
  if (stats.status !== "ready") return "ERROR state_unavailable: Thread state is unavailable.";
  const { running: r } = stats;
  return [
    `${r.total} running · ${r.topLevel} top-level, ${r.children} children · ${r.cloud} cloud, ${r.local} local, ${r.unknown} unknown · ${disclosureText}`,
    `Waiting on you: ${stats.waitingOnYou}`,
    finishedTodayText(stats),
    ...(stats.version === 2 ? [
      `Harness: ${stats.harness.map((h) => `${h.providerId} ${h.count}`).join(", ")}`,
      ...stats.threads.map((t) => `${JSON.stringify(t.id)}: ${t.matrix} ${t.title}${t.shortName === null ? "" : ` [${t.shortName}]`}`),
    ] : []),
  ].join("\n");
}

// ---- WB4-3 (openwizdev/OpenWiz#1437): the hover card's data, specs-section.v1.md sections 7 and 8 ----

/** A row with what the card reads too: the spec rows' fields beside the 0.3 stats fields. */
export type StatsV4Row = StatsRow & SpecsThreadRow;

/**
 * `wizbar stats --json` from 0.4 and the hover card: one computation for both
 * (sections 7 and 8). The 0.3 numbers, then the harness split and every running
 * thread with its matrix state, its visible spec and its served model. With no
 * ready specs file every thread names no spec; the numbers stand.
 */
export function computeStatsV4(
  rows: readonly StatsV4Row[] | null, specs: SpecsFileV4 | null, models: CardModelsResultV3 | null, now: number, timeZone: string,
): StatsV4 {
  const v3 = computeStats(rows, now, timeZone);
  if (v3.status !== "ready") return { ...v3, version: 2, harness: null, threads: null };
  const seen = new Set<string>();
  const running = (rows ?? []).filter((row) => isRunning(row) && !seen.has(row.id) && seen.add(row.id))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const counts = new Map<string, number>();
  for (const row of running) counts.set(row.providerId, (counts.get(row.providerId) ?? 0) + 1);
  const harness = [...counts].map(([providerId, count]) => ({ providerId, count }))
    .sort((a, b) => b.count - a.count || (a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : 0));
  const served = new Map(models?.source === "host" ? models.items.map((item) => [item.threadId, item]) : []);
  const threads = running.map((row): FooterThreadV4 => {
    // Every row goes in too, so a child of a `Fleet #S:` thread finds spec S (section 3).
    const key = specs ? matchSpec(specs, row, rows ?? []) : null;
    // From 0.6 only a spec with no tickets is hidden; a finished one is quiet and named like any other (section 3).
    const entry = key ? specs!.specs.find((spec) => spec.spec === key && spec.tickets.length > 0) ?? null : null;
    const model = served.get(row.id);
    return {
      id: row.id, title: row.displayTitle, providerId: row.providerId, matrix: matrixState(row, null),
      spec: entry?.spec ?? null, shortName: entry?.shortName ?? null,
      model: model?.model ?? null, effort: model?.model ? model.effort : null,
    };
  });
  return { ...v3, version: 2, harness, threads };
}

/** The card's first line (section 7): `<W> waiting on you · <C> cloud, <L> local`, then `, <U> unknown` when over zero. */
export function cardSummary({ waitingOnYou, running }: Extract<StatsV4, { status: "ready" }>): string {
  return `${waitingOnYou} waiting on you · ${running.cloud} cloud, ${running.local} local${running.unknown > 0 ? `, ${running.unknown} unknown` : ""}`;
}

/** A card row's label (section 7) from its title alone: `Role · CODE` when the title carries its code (section 3), else the full title. */
export function cardRowLabel(title: string): string {
  const { role, code } = parseTitle(title);
  return role && code ? `${role} · ${code}` : title;
}

/**
 * Every row's card label (section 7). An agent of a visible spec takes its role
 * and its ticket's code from section 3's resolution (`#N` for a ticket with no
 * code), so `#902: …` reads `Builder · KN2`; any other row `cardRowLabel`. The
 * labels are the card's only: `wizbar stats --json` keeps the raw titles.
 */
export function cardRowLabels(rows: readonly StatsV4Row[], specs: SpecsFileV4 | null, now: number): Map<string, string> {
  const labels = new Map(rows.map((row) => [row.id, cardRowLabel(row.displayTitle)]));
  if (!specs) return labels;
  for (const spec of specRows(specs, rows, [], now).specs) {
    for (const agent of spec.agents) {
      const code = agent.code ?? (agent.ticket ? `#${agent.ticket.slice(agent.ticket.lastIndexOf("#") + 1)}` : null);
      if (agent.role && code) labels.set(agent.threadId, `${agent.role} · ${code}`);
    }
  }
  return labels;
}

/** The card's state on "N running" (section 7, `v4CardPinCases`). */
export function cardPinNext(state: CardStateV4, event: CardEventV4): CardStateV4 {
  if (event === "escape") return "closed";
  if (event === "click") return state === "pinned" ? "hover" : "pinned";
  if (state === "pinned") return "pinned";
  return event === "enter" || event === "focus" ? "hover" : "closed";
}

/** R1 (#172): how long a thread that stopped running stays on the open card, and the least time between removals. */
export const CARD_BATCH_MS = 3_000;

/** A card row; `leaving` marks a thread that stopped running and waits for its batch. */
export type CardThread = FooterThreadV4 & { leaving?: true };
export interface CardBatch {
  threads: readonly CardThread[];
  /** When each leaving thread was first seen gone. */
  leftAt: ReadonlyMap<string, number>;
  /** The last removal. */
  removedAt: number;
}
export const emptyCardBatch: CardBatch = { threads: [], leftAt: new Map(), removedAt: -Infinity };

/**
 * The open card's rows (section 7, R1 #172): the running threads in their order, plus each thread that left
 * since the last removal, faded in its old place. Leaving threads go together, at most once per
 * `CARD_BATCH_MS`: once the first of them has been gone that long and that long has passed since the last
 * removal. A thread back before then is never removed. `flushAt` is when to look again (null when none waits).
 */
export function cardBatch(prev: CardBatch, running: readonly FooterThreadV4[], now: number): { batch: CardBatch; flushAt: number | null } {
  const ids = new Set(running.map((thread) => thread.id));
  const leftAt = new Map<string, number>();
  for (const thread of prev.threads) if (!ids.has(thread.id)) leftAt.set(thread.id, prev.leftAt.get(thread.id) ?? now);
  let removedAt = prev.removedAt;
  let flushAt = leftAt.size === 0 ? null : Math.max(Math.min(...leftAt.values()), removedAt) + CARD_BATCH_MS;
  if (flushAt !== null && now >= flushAt) {
    leftAt.clear();
    removedAt = now;
    flushAt = null;
  }
  const threads: CardThread[] = [...running];
  let anchor: string | null = null;
  for (const thread of prev.threads) {
    if (leftAt.has(thread.id)) threads.splice(anchor === null ? 0 : threads.findIndex((t) => t.id === anchor) + 1, 0, { ...thread, leaving: true });
    if (leftAt.has(thread.id) || ids.has(thread.id)) anchor = thread.id;
  }
  return { batch: { threads, leftAt, removedAt }, flushAt };
}

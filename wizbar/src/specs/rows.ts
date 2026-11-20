// The spec rows (WB4-1): specs-section.v1.md sections 2, 3 and 5. One pure
// computation over the specs file and the sidebar rows, shared by the Specs
// section and `wizbar specs`, so both show the same thing for the same input.
import type { PluginSidebarPullRequest, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { hasRuntimeWork } from "../lifecycle";
import {
  dotOrderV4, type DotStateV4, type MatrixStateV4, type SpecAgentV4, type SpecEntryV4, type SpecKeyV4,
  type SpecRowV4, type SpecsFileV4, type SpecsResultV4, type TicketEntryV4,
} from "../fixtures/v4";
import type { SpecEntryV6, SpecsFileV6 } from "../fixtures/v6";
import type { SpecsSort } from "../settings";
import type { CardModelsResultV3 } from "../v3-types";

/** The row fields the spec rows read; the app's rows and the CLI reader both supply them. */
export type SpecsThreadRow = Pick<PluginSidebarThread,
  "id" | "displayTitle" | "parentThreadId" | "providerId" | "status" | "runtimeStatus" | "queuedWork" |
  "hasPendingInteraction" | "activity" | "createdAt" | "updatedAt">;

const HOUR = 60 * 60_000;
// `Role · CODE: what`; codes may have no hyphen (0.5.0 A).
const titlePattern = /^(.+?) · ([A-Z][A-Z0-9]*-?[0-9]+): (.+)$/;
// Real fleet titles (0.5.0 A): a builder, a reviewer and a spec's fleet thread.
const builderPattern = /^#([1-9][0-9]*): (.+)$/;
const reviewPattern = /^Review #([1-9][0-9]*) at [0-9a-f]{7,40}(?: .*)?$/;
const fleetPattern = /^Fleet #([1-9][0-9]*): (.+)$/;

/** What a title names (section 3): a ticket code, a ticket's issue, a pull under review, or a spec's fleet. */
type TitleRef =
  | { kind: "code"; role: string; code: string }
  | { kind: "issue"; role: "Builder"; number: number }
  | { kind: "pull"; role: "Reviewer"; number: number }
  | { kind: "fleet"; role: null; number: number }
  | { kind: "none"; role: null };

/** The anchored real forms come first, so free text holding ` · CODE:` never turns them into the old form. */
function titleRef(title: string): TitleRef {
  let match = fleetPattern.exec(title);
  if (match) return { kind: "fleet", role: null, number: Number(match[1]) };
  if ((match = builderPattern.exec(title))) return { kind: "issue", role: "Builder", number: Number(match[1]) };
  if ((match = reviewPattern.exec(title))) return { kind: "pull", role: "Reviewer", number: Number(match[1]) };
  if ((match = titlePattern.exec(title))) return { kind: "code", role: match[1]!, code: match[2]! };
  return { kind: "none", role: null };
}

/**
 * `Role · CODE: what it does`, `#N: …` (Builder) or `Review #P at <sha>` (Reviewer)
 * (section 3). The code comes from the title's own form only; nulls when it names none.
 */
export function parseTitle(title: string): { role: string | null; code: string | null } {
  const ref = titleRef(title);
  return { role: ref.role, code: ref.kind === "code" ? ref.code : null };
}

/** The 0.3 shared working fact (sidebar-v3.v1.md section 1). */
function isWorking(row: SpecsThreadRow): boolean {
  const { workflows, backgroundAgents, backgroundCommands, planMode, goals } = row.activity;
  return hasRuntimeWork(row.runtimeStatus, [workflows, backgroundAgents, backgroundCommands, planMode, goals]);
}

/** The 0.3 running rule: working, and not waiting on you. */
export function isRunning(row: SpecsThreadRow): boolean {
  return isWorking(row) && !row.hasPendingInteraction;
}

/** Section 5, first match wins. The server has no pull request and passes null. */
export function matrixState(row: SpecsThreadRow, pullRequest: PluginSidebarPullRequest | null): MatrixStateV4 {
  if (row.hasPendingInteraction) return "needs-you";
  if (row.status === "error" || row.runtimeStatus === "error" || row.queuedWork === "failed") return "failed";
  if (isWorking(row)) return parseTitle(row.displayTitle).role === "Reviewer" ? "reviewing" : "working";
  const live = pullRequest?.state === "open" || pullRequest?.state === "draft";
  if (live && pullRequest.experimental_checks.state === "failing") return "failed";
  if (live && pullRequest.experimental_checks.state === "pending") return "checks-running";
  if (pullRequest?.state === "merged") return "done";
  return "idle";
}

const issueNumber = (key: string) => Number(key.slice(key.lastIndexOf("#") + 1));
const only = <T>(items: readonly T[]): T | null => (items.length === 1 ? items[0]! : null);

/** The spec's tickets the title names: by code, issue number or pull. */
function ticketsOf(spec: SpecEntryV4, ref: TitleRef): TicketEntryV4[] {
  switch (ref.kind) {
    case "code": return spec.tickets.filter((t) => t.code === ref.code);
    case "issue": return spec.tickets.filter((t) => issueNumber(t.ticket) === ref.number);
    case "pull": return spec.tickets.filter((t) => t.pulls?.includes(ref.number) === true);
    default: return [];
  }
}
/** The row's one ticket, or null: a pull closing two tickets still names its spec, but no single ticket. */
const ticketOf = (spec: SpecEntryV4, ref: TitleRef) => only(ticketsOf(spec, ref));
const hasTicket = (spec: SpecEntryV4, ref: TitleRef) => ticketsOf(spec, ref).length > 0;
/** Among several candidate specs, the one holding the title's ticket. */
const byTicket = (specs: readonly SpecEntryV4[], ref: TitleRef) => only(specs.filter((s) => hasTicket(s, ref)));

function matchEntry(file: SpecsFileV4, row: SpecsThreadRow, rows: readonly SpecsThreadRow[]): SpecEntryV4 | null {
  if (!isRunning(row)) return null;
  const ref = titleRef(row.displayTitle);
  // A spec's fleet thread is never one of its agents.
  if (ref.kind === "fleet") return null;
  if (row.parentThreadId !== null) {
    // 1. The fleet parent: the file's fleet thread id, else a parent titled `Fleet #S: …`.
    const byParent = file.specs.filter((s) => s.fleetThreadId === row.parentThreadId);
    if (byParent.length === 1) return byParent[0]!;
    if (byParent.length > 1) return byTicket(byParent, ref);
    const parent = rows.find((r) => r.id === row.parentThreadId);
    const fleet = parent ? titleRef(parent.displayTitle) : null;
    if (fleet?.kind === "fleet") {
      const bySpec = file.specs.filter((s) => issueNumber(s.spec) === fleet.number);
      if (bySpec.length === 1) return bySpec[0]!;
      if (bySpec.length > 1) return byTicket(bySpec, ref);
    }
  }
  // 2. The title's ticket: its code, its issue number, or its pull request.
  return byTicket(file.specs, ref);
}

/**
 * The spec a running row belongs to (section 3), hidden specs included; null for none.
 * `rows` are every sidebar row, so a child of a `Fleet #S:` thread finds spec S.
 */
export function matchSpec(file: SpecsFileV4, row: SpecsThreadRow, rows: readonly SpecsThreadRow[] = []): SpecKeyV4 | null {
  return matchEntry(file, row, rows)?.spec ?? null;
}

function dotState(ticket: TicketEntryV4, now: number): DotStateV4 {
  if (ticket.state !== "done") return ticket.state;
  return recent(ticket, now) ? "done-recent" : "done";
}
const recent = (ticket: TicketEntryV4, now: number) =>
  ticket.state === "done" && ticket.closedAt !== null && Date.parse(ticket.closedAt) > now - HOUR;

/** Section 2: a spec is hidden when it has no tickets or every ticket is done. */
export function isHidden(spec: SpecEntryV4): boolean {
  return spec.tickets.every((ticket) => ticket.state === "done");
}

/** The ticket title without its version and code (`0.1.0 KN3: the reader` → `the reader`). */
function taskOf(ticket: TicketEntryV4): string {
  const colon = ticket.title.indexOf(": ");
  if (ticket.code === null || colon < 0) return ticket.title;
  const head = ticket.title.slice(0, colon).trim().split(/\s+/);
  const task = ticket.title.slice(colon + 2).trim();
  return head[head.length - 1] === ticket.code && task.length > 0 ? task : ticket.title;
}

function agentOf(spec: SpecEntryV4, row: SpecsThreadRow, models: CardModelsResultV3 | null): SpecAgentV4 {
  const served = models?.source === "host" ? models.items.find((item) => item.threadId === row.id) : undefined;
  const ref = titleRef(row.displayTitle);
  const ticket = ticketOf(spec, ref);
  const code = ref.kind === "code" ? ref.code : ticket?.code ?? null;
  // A real title (`#N:`, `Review #P at`) shows `<Role> · <code>: <task>`; the old form shows as written.
  const real = (ref.kind === "issue" || ref.kind === "pull") && ticket !== null;
  const title = real ? `${ref.role} · ${code ?? `#${issueNumber(ticket.ticket)}`}: ${taskOf(ticket)}` : row.displayTitle;
  return {
    threadId: row.id, title, role: ref.role, code,
    ticket: ticket?.ticket ?? null,
    providerId: row.providerId,
    // The shared model source (section 6): null until WB4-4 adopts it; missing values are omitted, never guessed.
    model: served?.model ?? null, effort: served?.model ? served.effort : null,
    matrix: matrixState(row, null), createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

/** Sections 2, 3 and 11: the visible rows with their running agents, in `sort` (`newest`, the file's order, by default). */
export function specRows(
  file: SpecsFileV6, rows: readonly SpecsThreadRow[], openKeys: readonly string[], now: number,
  models: CardModelsResultV3 | null = null, sort: SpecsSort = "newest",
): SpecsResultV4 {
  const agents = new Map<SpecEntryV4, SpecAgentV4[]>();
  for (const row of rows) {
    const spec = matchEntry(file, row, rows);
    if (spec) agents.set(spec, [...(agents.get(spec) ?? []), agentOf(spec, row, models)]);
  }
  const activity = new Map<string, number | null>();
  const unsorted = file.specs.filter((spec) => !isHidden(spec)).map((spec): SpecRowV4 => {
    activity.set(spec.spec, activityAt(spec, agents.get(spec) ?? []));
    const order = spec.tickets.map((ticket, index) => ({ ticket, index, state: dotState(ticket, now) }));
    order.sort((a, b) => dotOrderV4.indexOf(a.state) - dotOrderV4.indexOf(b.state) || a.index - b.index);
    return {
      spec: spec.spec, shortName: spec.shortName, url: spec.url,
      done: spec.tickets.filter((t) => t.state === "done").length,
      total: spec.tickets.length,
      doneLastHour: spec.tickets.filter((t) => recent(t, now)).length,
      needsYou: spec.tickets.filter((t) => t.state === "needs-you").length,
      yoursLater: spec.tickets.filter((t) => t.state === "yours-later").length,
      open: openKeys.includes(spec.spec),
      dots: order.map(({ ticket, state }) => ({ ticket: ticket.ticket, code: ticket.code, state })),
      agents: (agents.get(spec) ?? []).sort((a, b) => a.createdAt - b.createdAt || (a.threadId < b.threadId ? -1 : a.threadId > b.threadId ? 1 : 0)),
    };
  });
  const specs = sortSpecs(unsorted.map((row) => ({ ...row, activityAt: activity.get(row.spec)! })), sort)
    .map(({ activityAt: _activityAt, ...row }): SpecRowV4 => row);
  return {
    version: 1, status: "ready", generatedAt: Date.parse(file.generatedAt),
    needsYou: specs.reduce((sum, row) => sum + row.needsYou, 0),
    yoursLater: specs.reduce((sum, row) => sum + row.yoursLater, 0), specs,
  };
}

/** #161: the visible specs with a ticket due now. */
export function needsYouSpecs(result: SpecsResultV4): number {
  return result.specs.filter((row) => row.needsYou > 0).length;
}

/**
 * #161: what the rule says after the count, in full (`3 tickets need you (2 specs)`, singular at 1) and in
 * the narrow form (`3 for you`); null when no ticket is due now (#162: later tickets never count).
 */
export function needsYouWords(result: SpecsResultV4): { full: string; short: string } | null {
  const tickets = result.needsYou;
  if (tickets === 0) return null;
  const specs = needsYouSpecs(result);
  return {
    full: `${tickets} ${tickets === 1 ? "ticket needs" : "tickets need"} you (${specs} ${specs === 1 ? "spec" : "specs"})`,
    short: `${tickets} for you`,
  };
}

/** Section 2: `Specs N`, then ` · M tickets need you (K specs)` when M (due now only) is over zero (#161). */
export function sectionRule(result: SpecsResultV4): string {
  const words = needsYouWords(result);
  return `Specs ${result.specs.length}${words ? ` · ${words.full}` : ""}`;
}

/** What a sort reads of a spec (section 11). */
export interface SortableSpec { spec: string; done: number; total: number; needsYou: number; activityAt: number | null }

/**
 * Section 10: a spec's activity time, the newest of its tickets' `updatedAt` and
 * `closedAt` and its running agents' `updatedAt`; null when none gives a time.
 */
export function activityAt(spec: SpecEntryV6, agents: readonly { updatedAt: number }[]): number | null {
  const times = [
    ...spec.tickets.flatMap((t) => [t.updatedAt, t.closedAt ?? undefined].filter((at) => at !== undefined).map((at) => Date.parse(at))),
    ...agents.map((agent) => agent.updatedAt),
  ].filter((at) => Number.isFinite(at));
  return times.length > 0 ? Math.max(...times) : null;
}

/** Newest first; a null time after every time. */
const byActivity = (a: SortableSpec, b: SortableSpec) =>
  a.activityAt === b.activityAt ? 0 : a.activityAt === null ? 1 : b.activityAt === null ? -1 : b.activityAt - a.activityAt;
/** `needs-you`'s groups: due now, the other unfinished specs, then finished. */
const group = (row: SortableSpec) => (row.needsYou > 0 ? 0 : row.done < row.total ? 1 : 2);
const compare: Record<SpecsSort, (a: SortableSpec, b: SortableSpec) => number> = {
  "needs-you": (a, b) => group(a) - group(b) || byActivity(a, b),
  recent: byActivity,
  // The done share highest first, compared as cross products, never floats; then fewer left.
  closest: (a, b) => b.done * a.total - a.done * b.total || (a.total - a.done) - (b.total - b.done),
  newest: () => 0,
};

/** Section 11: the rows in the chosen sort. The sort is stable, so ties keep the rows' (file) order. */
export function sortSpecs<T extends SortableSpec>(rows: readonly T[], sort: SpecsSort): T[] {
  return [...rows].sort(compare[sort]);
}

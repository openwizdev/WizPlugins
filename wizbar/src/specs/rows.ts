// The spec rows (WB4-1): specs-section.v1.md sections 2, 3 and 5. One pure
// computation over the specs file and the sidebar rows, shared by the Specs
// section and `wizbar specs`, so both show the same thing for the same input.
import type { PluginSidebarPullRequest, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { hasRuntimeWork } from "../lifecycle";
import {
  dotOrderV4, type DotStateV4, type MatrixStateV4, type SpecAgentV4, type SpecEntryV4, type SpecKeyV4,
  type SpecRowV4, type SpecsFileV4, type SpecsResultV4, type TicketEntryV4,
} from "../fixtures/v4";

/** The row fields the spec rows read; the app's rows and the CLI reader both supply them. */
export type SpecsThreadRow = Pick<PluginSidebarThread,
  "id" | "displayTitle" | "parentThreadId" | "providerId" | "status" | "runtimeStatus" | "queuedWork" |
  "hasPendingInteraction" | "activity" | "createdAt" | "updatedAt">;

const HOUR = 60 * 60_000;
const titlePattern = /^(.+?) · ([A-Z][A-Z0-9]*-[0-9]+): (.+)$/;

/** `Role · CODE: what it does` (section 3); nulls when the title does not parse. */
export function parseTitle(title: string): { role: string | null; code: string | null } {
  const match = titlePattern.exec(title);
  return match ? { role: match[1]!, code: match[2]! } : { role: null, code: null };
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

const hasCode = (spec: SpecEntryV4, code: string | null) => code !== null && spec.tickets.some((t) => t.code === code);
const only = <T>(items: readonly T[]): T | null => (items.length === 1 ? items[0]! : null);

function matchEntry(file: SpecsFileV4, row: SpecsThreadRow): SpecEntryV4 | null {
  if (!isRunning(row)) return null;
  const { code } = parseTitle(row.displayTitle);
  const byParent = row.parentThreadId === null ? [] : file.specs.filter((s) => s.fleetThreadId === row.parentThreadId);
  if (byParent.length === 1) return byParent[0]!;
  if (byParent.length > 1) return only(byParent.filter((s) => hasCode(s, code)));
  return only(file.specs.filter((s) => hasCode(s, code)));
}

/** The spec a running row belongs to (section 3), hidden specs included; null for none. */
export function matchSpec(file: SpecsFileV4, row: SpecsThreadRow): SpecKeyV4 | null {
  return matchEntry(file, row)?.spec ?? null;
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

function agentOf(spec: SpecEntryV4, row: SpecsThreadRow): SpecAgentV4 {
  const { role, code } = parseTitle(row.displayTitle);
  return {
    threadId: row.id, title: row.displayTitle, role, code,
    ticket: spec.tickets.find((t) => code !== null && t.code === code)?.ticket ?? null,
    providerId: row.providerId,
    // The model source is not adopted (section 6): omitted, never guessed.
    model: null, effort: null,
    matrix: matrixState(row, null), createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

/** Sections 2 and 3: the visible rows, in file order, with their running agents. */
export function specRows(file: SpecsFileV4, rows: readonly SpecsThreadRow[], openKeys: readonly string[], now: number): SpecsResultV4 {
  const agents = new Map<SpecEntryV4, SpecAgentV4[]>();
  for (const row of rows) {
    const spec = matchEntry(file, row);
    if (spec) agents.set(spec, [...(agents.get(spec) ?? []), agentOf(spec, row)]);
  }
  const specs = file.specs.filter((spec) => !isHidden(spec)).map((spec): SpecRowV4 => {
    const order = spec.tickets.map((ticket, index) => ({ ticket, index, state: dotState(ticket, now) }));
    order.sort((a, b) => dotOrderV4.indexOf(a.state) - dotOrderV4.indexOf(b.state) || a.index - b.index);
    return {
      spec: spec.spec, shortName: spec.shortName, url: spec.url,
      done: spec.tickets.filter((t) => t.state === "done").length,
      total: spec.tickets.length,
      doneLastHour: spec.tickets.filter((t) => recent(t, now)).length,
      needsYou: spec.tickets.filter((t) => t.state === "needs-you").length,
      open: openKeys.includes(spec.spec),
      dots: order.map(({ ticket, state }) => ({ ticket: ticket.ticket, code: ticket.code, state })),
      agents: (agents.get(spec) ?? []).sort((a, b) => a.createdAt - b.createdAt || (a.threadId < b.threadId ? -1 : a.threadId > b.threadId ? 1 : 0)),
    };
  });
  return {
    version: 1, status: "ready", generatedAt: Date.parse(file.generatedAt),
    needsYou: specs.reduce((sum, row) => sum + row.needsYou, 0), specs,
  };
}

/** Section 2: `Specs N`, then ` · M need you` when M is over zero. */
export function sectionRule(result: SpecsResultV4): string {
  return `Specs ${result.specs.length}${result.needsYou > 0 ? ` · ${result.needsYou} need you` : ""}`;
}

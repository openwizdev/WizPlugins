// The WizBar board for T3 Code: one pure step from the files WizBar already reads
// (the specs producer's `.openwiz/specs.v2.json`, `specs.v1.json` and
// `agents.v1.json`) and T3's own thread list (`t3 thread list --json`) to the
// rows the page shows. No I/O here: server.ts reads, this decides, render.ts draws.
// It follows WizBar's rules (wizbar/contracts/specs-section.v1.md, agents.v1.md):
// a missing, malformed or stale file is "unavailable", never zero.
import { agentLeaseMs, noteIsLive, type GitHubAgent } from "../../wizbar/src/agents/format.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const QUIET_AFTER_MS = 3 * 24 * HOUR;
const STALE_AFTER_MS = 30 * MINUTE;

export type TicketState = "done" | "building" | "review" | "needs-you" | "yours-later" | "held" | "not-started";
export type DotState = Exclude<TicketState, "done"> | "done" | "done-recent";
/** WizBar's dot order (specs-section.v1.md section 2). */
export const dotOrder: readonly DotState[] = ["done", "done-recent", "building", "review", "needs-you", "yours-later", "held", "not-started"];
const ticketStates: readonly string[] = ["done", "building", "review", "needs-you", "yours-later", "held", "not-started"];

export interface Ticket { ticket: string; code: string | null; title: string; state: TicketState; closedAt: string | null; updatedAt?: string; pulls?: number[] }
export interface Spec { spec: string; shortName: string; url: string; fleetThreadId: string | null; tickets: Ticket[] }
export interface SpecsFile { schema: string; generatedAt: string; specs: Spec[] }
export interface AgentsFile { version: 1; generatedAt: string; agents: GitHubAgent[] }

/** One file as the server found it. */
export type FileRead = { kind: "content"; text: string } | { kind: "missing" } | { kind: "unreadable" };
export type Read<T> = { status: "ready"; value: T } | { status: "unavailable"; reason: string };

/** The fields of a `t3 thread list --json` item the board uses (T3 contract `OrchestratorMcpThreadListItem`). */
export interface T3Thread {
  threadId: string; title: string; status: string; model: string; providerInstanceId: string;
  pinned?: boolean; settled: boolean; snoozed: boolean; parentThreadId: string | null; updatedAt: string;
}

const issueKey = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+#[1-9][0-9]*$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is string => typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
const str = (value: unknown): value is string => typeof value === "string";

function parse(read: FileRead): { ok: true; raw: unknown } | { ok: false; reason: string } {
  if (read.kind !== "content") return { ok: false, reason: read.kind };
  try {
    return { ok: true, raw: JSON.parse(read.text) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** A file's age rule: more than 5 minutes ahead is malformed, more than 30 minutes old is stale. */
function ageProblem(generatedAt: string, now: number): string | null {
  const at = Date.parse(generatedAt);
  if (at - now > 5 * MINUTE) return "malformed";
  return now - at > STALE_AFTER_MS ? "stale" : null;
}

function isTicket(value: unknown): value is Ticket {
  if (!isObject(value)) return false;
  const { ticket, code, title, state, closedAt, updatedAt, pulls } = value;
  return str(ticket) && issueKey.test(ticket) && (code === null || (str(code) && /^[A-Z][A-Z0-9]*-?[0-9]+$/.test(code)))
    && str(title) && title.trim().length > 0 && str(state) && ticketStates.includes(state)
    && (closedAt === null || isTime(closedAt)) && (state === "done" || closedAt === null)
    && (updatedAt === undefined || isTime(updatedAt))
    && (pulls === undefined || (Array.isArray(pulls) && pulls.every((n) => Number.isSafeInteger(n) && (n as number) > 0)));
}

function isSpec(value: unknown): value is Spec {
  if (!isObject(value)) return false;
  const { spec, shortName, url, fleetThreadId, tickets } = value;
  return str(spec) && issueKey.test(spec) && str(shortName) && shortName.trim().length > 0 && str(url)
    && (fleetThreadId === null || str(fleetThreadId)) && Array.isArray(tickets) && tickets.every(isTicket);
}

/** One specs file (section 1): ready, or unavailable with the reason. */
export function readSpecs(read: FileRead, now: number): Read<SpecsFile> {
  const parsed = parse(read);
  if (!parsed.ok) return { status: "unavailable", reason: parsed.reason };
  const raw = parsed.raw;
  if (!isObject(raw) || !str(raw.schema)) return { status: "unavailable", reason: "malformed" };
  if (raw.schema !== "openwiz.specs.v1" && raw.schema !== "openwiz.specs.v2") return { status: "unavailable", reason: "unknown-schema" };
  if (!isTime(raw.generatedAt) || !Array.isArray(raw.specs) || !raw.specs.every(isSpec)) return { status: "unavailable", reason: "malformed" };
  const problem = ageProblem(raw.generatedAt, now);
  if (problem) return { status: "unavailable", reason: problem };
  return { status: "ready", value: raw as unknown as SpecsFile };
}

/** WizBar's pick (#164 R3): v2 unless v1 is newer; else whichever is ready; else v2's reason (v1's when v2 is missing). */
export function pickSpecs(v2: FileRead, v1: FileRead, now: number): Read<SpecsFile> {
  const read2 = readSpecs(v2, now);
  const read1 = readSpecs(v1, now);
  if (read2.status === "ready" && read1.status === "ready") {
    return Date.parse(read2.value.generatedAt) >= Date.parse(read1.value.generatedAt) ? read2 : read1;
  }
  if (read2.status === "ready") return read2;
  if (read1.status === "ready" || v2.kind === "missing") return read1;
  return read2;
}

/** The agents file (agents.v1.md): ready, or unavailable. Notes that don't read are dropped, never guessed. */
export function readAgents(read: FileRead, now: number): Read<AgentsFile> {
  const parsed = parse(read);
  if (!parsed.ok) return { status: "unavailable", reason: parsed.reason };
  const raw = parsed.raw;
  if (!isObject(raw) || raw.version !== 1 || !isTime(raw.generatedAt) || !Array.isArray(raw.agents)) return { status: "unavailable", reason: "malformed" };
  const problem = ageProblem(raw.generatedAt, now);
  if (problem) return { status: "unavailable", reason: problem };
  const agents = raw.agents.filter((a): a is GitHubAgent => isObject(a) && str(a.ticket) && issueKey.test(a.ticket)
    && ["builder", "reviewer", "fleet"].includes(a.agent as string) && ["working", "asking", "done", "stopped"].includes(a.state as string)
    && str(a.harness) && str(a.model) && str(a.step) && isTime(a.updatedAt) && (a.pr === undefined || str(a.pr)));
  return { status: "ready", value: { version: 1, generatedAt: raw.generatedAt, agents } };
}

/** `t3 thread list --json` output, from one or more projects: ready, or unavailable. */
export function readT3(texts: readonly string[]): Read<T3Thread[]> {
  const threads = new Map<string, T3Thread>();
  for (const text of texts) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { status: "unavailable", reason: "malformed" };
    }
    if (!Array.isArray(raw)) return { status: "unavailable", reason: "malformed" };
    for (const item of raw) {
      if (!isObject(item) || !str(item.threadId) || !str(item.title) || !str(item.status) || typeof item.settled !== "boolean"
        || typeof item.snoozed !== "boolean" || !str(item.updatedAt)) return { status: "unavailable", reason: "malformed" };
      threads.set(item.threadId, {
        threadId: item.threadId, title: item.title, status: item.status, settled: item.settled, snoozed: item.snoozed,
        model: str(item.model) ? item.model : "", providerInstanceId: str(item.providerInstanceId) ? item.providerInstanceId : "",
        pinned: item.pinned === true, parentThreadId: str(item.parentThreadId) ? item.parentThreadId : null, updatedAt: item.updatedAt,
      });
    }
  }
  return { status: "ready", value: [...threads.values()] };
}

// ---- What a T3 thread is doing ----

export type ThreadLook = "running" | "needs-you" | "failed" | "idle";
const runningStatuses = ["preparing", "queued", "starting", "running"];
/** T3 run statuses: `waiting` is a run waiting for the user's answer. */
export function threadLook(thread: T3Thread): ThreadLook {
  if (runningStatuses.includes(thread.status)) return "running";
  if (thread.status === "waiting") return "needs-you";
  if (thread.status === "failed") return "failed";
  return "idle";
}

// ---- Which spec and ticket an agent names (WizBar's title forms, specs-section.v1.md section 3) ----

type TitleRef =
  | { kind: "code"; role: string; code: string }
  | { kind: "issue"; role: "Builder"; number: number }
  | { kind: "pull"; role: "Reviewer"; number: number }
  | { kind: "fleet"; number: number }
  | { kind: "none" };

export function titleRef(title: string): TitleRef {
  let m = /^Fleet #([1-9][0-9]*): (.+)$/.exec(title);
  if (m) return { kind: "fleet", number: Number(m[1]) };
  if ((m = /^#([1-9][0-9]*): (.+)$/.exec(title))) return { kind: "issue", role: "Builder", number: Number(m[1]) };
  if ((m = /^Review #([1-9][0-9]*) at [0-9a-f]{7,40}(?: .*)?$/.exec(title))) return { kind: "pull", role: "Reviewer", number: Number(m[1]) };
  if ((m = /^(.+?) · ([A-Z][A-Z0-9]*-?[0-9]+): (.+)$/.exec(title))) return { kind: "code", role: m[1]!, code: m[2]! };
  return { kind: "none" };
}

const numberOf = (key: string) => Number(key.slice(key.lastIndexOf("#") + 1));
const repoOf = (key: string) => key.slice(0, key.lastIndexOf("#"));
const githubUrl = (key: string, kind: "issues" | "pull") => `https://github.com/${repoOf(key)}/${kind}/${numberOf(key)}`;
const only = <T>(items: readonly T[]): T | null => (items.length === 1 ? items[0]! : null);

function ticketsNamed(spec: Spec, ref: TitleRef): Ticket[] {
  switch (ref.kind) {
    case "code": return spec.tickets.filter((t) => t.code === ref.code);
    case "issue": return spec.tickets.filter((t) => numberOf(t.ticket) === ref.number);
    case "pull": return spec.tickets.filter((t) => t.pulls?.includes(ref.number) === true);
    default: return [];
  }
}

/** The one spec a T3 thread works for: under a `Fleet #S:` parent, else the one spec holding its ticket. */
function specOfThread(file: SpecsFile, thread: T3Thread, byId: ReadonlyMap<string, T3Thread>): { spec: Spec; ticket: Ticket | null } | null {
  const ref = titleRef(thread.title);
  if (ref.kind === "fleet" || ref.kind === "none") return null;
  const parent = thread.parentThreadId ? byId.get(thread.parentThreadId) : undefined;
  const parentRef = parent ? titleRef(parent.title) : null;
  const bySpec = parentRef?.kind === "fleet" ? file.specs.filter((s) => numberOf(s.spec) === parentRef.number) : [];
  // Under one `Fleet #S:` spec, the thread is that spec's; otherwise it needs its ticket in exactly one spec.
  const holding = (specs: readonly Spec[]) => specs.filter((s) => ticketsNamed(s, ref).length > 0);
  const spec = bySpec.length === 1 ? bySpec[0]! : only(holding(bySpec.length > 1 ? bySpec : file.specs));
  return spec ? { spec, ticket: only(ticketsNamed(spec, ref)) } : null;
}

/** The spec and ticket a GitHub status note is on: exact `owner/name#N`, or a ticket's pull for a reviewer. */
function specOfNote(file: SpecsFile, note: GitHubAgent): { spec: Spec; ticket: Ticket | null } | null {
  for (const spec of file.specs) {
    if (note.agent === "fleet" && spec.spec === note.ticket) return { spec, ticket: null };
    const direct = spec.tickets.find((t) => t.ticket === note.ticket);
    if (direct) return { spec, ticket: direct };
    if (note.agent === "reviewer") {
      const byPull = spec.tickets.filter((t) => repoOf(t.ticket) === repoOf(note.ticket) && t.pulls?.includes(numberOf(note.ticket)) === true);
      if (byPull.length > 0) return { spec, ticket: only(byPull) };
    }
  }
  return null;
}

// ---- The rows ----

export type AgentState = "working" | "reviewing" | "needs-you" | "failed";
export interface AgentRow {
  where: "t3" | "github"; role: string; label: string; ticket: string | null;
  state: AgentState; harness: string | null; model: string | null; url: string | null; updatedAt: number;
}
export interface Dot { ticket: string; code: string | null; state: DotState; breathing: boolean }
export interface SpecRow {
  spec: string; shortName: string; url: string; done: number; total: number; doneLastHour: number;
  needsYou: number; yoursLater: number; dots: Dot[]; agents: AgentRow[]; activityAt: number | null; quiet: boolean; muted: boolean;
}
export interface ThreadRow { title: string; look: ThreadLook; model: string; updatedAt: number }
/** One harness or model and how many running agents use it. */
export interface Tally { name: string; count: number }

export interface Board {
  now: number;
  specs: { status: "ready"; generatedAt: number; rule: string; needsYou: number; rows: SpecRow[] } | { status: "unavailable"; reason: string };
  t3: { status: "off" } | { status: "ready"; pinned: ThreadRow[]; needsYou: ThreadRow[]; running: ThreadRow[] } | { status: "unavailable"; reason: string };
  /** Live GitHub agents whose ticket is in no spec. */
  otherAgents: AgentRow[];
  /** Working now: T3 threads running, plus live GitHub notes not already shown by a T3 thread. Null when neither source reads. */
  running: number | null;
  /** The same running agents by harness and by model, most first. Null when `running` is. */
  usage: { harnesses: Tally[]; models: Tally[] } | null;
  agents: { status: "ready" } | { status: "unavailable"; reason: string };
}

function ticketTask(ticket: Ticket): string {
  const colon = ticket.title.indexOf(": ");
  if (ticket.code === null || colon < 0) return ticket.title;
  const head = ticket.title.slice(0, colon).trim().split(/\s+/);
  const task = ticket.title.slice(colon + 2).trim();
  return head[head.length - 1] === ticket.code && task.length > 0 ? task : ticket.title;
}

const roleWord = (agent: string) => agent === "reviewer" ? "Reviewer" : agent === "fleet" ? "Fleet" : "Builder";
function agentLabel(role: string, ticket: Ticket | null, fallback: string): string {
  if (!ticket) return fallback;
  return `${role} · ${ticket.code ?? `#${numberOf(ticket.ticket)}`}: ${ticketTask(ticket)}`;
}

function sortRows(rows: SpecRow[]): SpecRow[] {
  // WizBar 0.6's default, "Needs you first": due now, then unfinished, then finished; newest activity first.
  const group = (r: SpecRow) => (r.needsYou > 0 ? 0 : r.done < r.total ? 1 : 2);
  const byActivity = (a: SpecRow, b: SpecRow) =>
    a.activityAt === b.activityAt ? 0 : a.activityAt === null ? 1 : b.activityAt === null ? -1 : b.activityAt - a.activityAt;
  const sorted = [...rows].sort((a, b) => group(a) - group(b) || byActivity(a, b));
  return [...sorted.filter((r) => !r.quiet), ...sorted.filter((r) => r.quiet)];
}

export function specsRule(rows: readonly SpecRow[]): string {
  const main = rows.filter((r) => !r.quiet).length;
  const tickets = rows.reduce((n, r) => n + r.needsYou, 0);
  if (tickets === 0) return `Specs ${main}`;
  const specs = rows.filter((r) => r.needsYou > 0).length;
  return `Specs ${main} · ${tickets} ${tickets === 1 ? "ticket needs" : "tickets need"} you (${specs} ${specs === 1 ? "spec" : "specs"})`;
}

/** Counts names case-blind ("Codex" and "codex" are one), keeping the first capitalised spelling. */
function tallier() {
  const counts = new Map<string, Tally>();
  return {
    add(name: string) {
      const key = name.trim().toLowerCase() || "unknown";
      const seen = counts.get(key);
      if (!seen) counts.set(key, { name: name.trim() || "unknown", count: 1 });
      else {
        seen.count += 1;
        if (seen.name === seen.name.toLowerCase() && name.trim() !== name.trim().toLowerCase()) seen.name = name.trim();
      }
    },
    list: (capitalise: boolean) => [...counts.values()]
      .map((t) => (capitalise ? { ...t, name: t.name[0]!.toUpperCase() + t.name.slice(1) } : t))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

export function buildBoard(input: {
  specs: Read<SpecsFile>; agents: Read<AgentsFile>; t3: Read<T3Thread[]> | "off"; now: number;
}): Board {
  const { now } = input;
  const threads = input.t3 !== "off" && input.t3.status === "ready" ? input.t3.value : [];
  const byId = new Map(threads.map((t) => [t.threadId, t]));
  const notes = input.agents.status === "ready" ? input.agents.value.agents.filter((a) => noteIsLive(a, now)) : [];
  const file = input.specs.status === "ready" ? input.specs.value : null;

  const agentsBySpec = new Map<string, AgentRow[]>();
  const add = (spec: string, row: AgentRow) => agentsBySpec.set(spec, [...(agentsBySpec.get(spec) ?? []), row]);
  const shownByT3 = new Set<string>();
  const onSpec = new Set<string>();
  const harnesses = tallier();
  const models = tallier();
  let running = 0;

  for (const thread of threads) {
    const look = threadLook(thread);
    if (look === "running") {
      running += 1;
      harnesses.add(thread.providerInstanceId);
      models.add(thread.model);
    }
    if (!file || thread.settled || look === "idle") continue;
    const found = specOfThread(file, thread, byId);
    if (!found) continue;
    onSpec.add(thread.threadId);
    const ref = titleRef(thread.title);
    const role = ref.kind === "code" || ref.kind === "issue" || ref.kind === "pull" ? ref.role : "Builder";
    const state: AgentState = look === "running" ? (role === "Reviewer" ? "reviewing" : "working") : look;
    if (found.ticket) shownByT3.add(`${role}|${found.ticket.ticket}`);
    add(found.spec.spec, {
      where: "t3", role, label: agentLabel(role, found.ticket, thread.title), ticket: found.ticket?.ticket ?? null, state,
      harness: thread.providerInstanceId || null, model: thread.model || null,
      url: found.ticket ? githubUrl(found.ticket.ticket, "issues") : null,
      updatedAt: Date.parse(thread.updatedAt),
    });
  }

  const otherAgents: AgentRow[] = [];
  for (const note of notes) {
    const found = file ? specOfNote(file, note) : null;
    const role = roleWord(note.agent);
    if (found?.ticket && shownByT3.has(`${role}|${found.ticket.ticket}`)) continue;
    if (note.state === "working") {
      running += 1;
      harnesses.add(note.harness);
      models.add(note.model);
    }
    const row: AgentRow = {
      where: "github", role, label: agentLabel(role, found?.ticket ?? null, `${role} · ${note.ticket}`), ticket: found?.ticket?.ticket ?? null,
      state: note.state === "asking" ? "needs-you" : role === "Reviewer" ? "reviewing" : "working",
      harness: note.harness, model: note.model,
      // A reviewer's note sits on the pull it reviews unless it names a ticket directly.
      url: note.pr ?? githubUrl(note.ticket, role === "Reviewer" && found?.ticket?.ticket !== note.ticket ? "pull" : "issues"),
      updatedAt: Date.parse(note.updatedAt),
    };
    if (found) add(found.spec.spec, row);
    else otherAgents.push(row);
  }

  let specs: Board["specs"];
  if (!file) {
    specs = { status: "unavailable", reason: input.specs.status === "unavailable" ? input.specs.reason : "missing" };
  } else {
    const rows = file.specs.filter((s) => s.tickets.length > 0).map((spec): SpecRow => {
      const agents = (agentsBySpec.get(spec.spec) ?? []).sort((a, b) => a.updatedAt - b.updatedAt);
      const recent = (t: Ticket) => t.state === "done" && t.closedAt !== null && Date.parse(t.closedAt) > now - HOUR;
      const dots = spec.tickets.map((t, index) => {
        const state: DotState = t.state === "done" ? (recent(t) ? "done-recent" : "done") : t.state;
        // Section 13: a dot breathes while a working agent names its ticket, unless it is done or in review.
        const breathing = state !== "done" && state !== "done-recent" && state !== "review"
          && agents.some((a) => a.state === "working" && a.ticket === t.ticket);
        return { dot: { ticket: t.ticket, code: t.code, state, breathing }, index };
      }).sort((a, b) => dotOrder.indexOf(a.dot.state) - dotOrder.indexOf(b.dot.state) || a.index - b.index).map((d) => d.dot);
      const times = [
        ...spec.tickets.flatMap((t) => [t.updatedAt, t.closedAt ?? undefined]).filter(str).map(Date.parse),
        ...agents.map((a) => a.updatedAt),
      ].filter(Number.isFinite);
      const row: SpecRow = {
        spec: spec.spec, shortName: spec.shortName, url: spec.url,
        done: spec.tickets.filter((t) => t.state === "done").length, total: spec.tickets.length,
        doneLastHour: spec.tickets.filter(recent).length,
        needsYou: spec.tickets.filter((t) => t.state === "needs-you").length,
        yoursLater: spec.tickets.filter((t) => t.state === "yours-later").length,
        dots, agents, activityAt: times.length > 0 ? Math.max(...times) : null, quiet: false, muted: false,
      };
      // Section 12: nothing due now, and finished or still for over 3 days. Section 13: muted when nothing runs or is due.
      row.quiet = row.needsYou === 0 && (row.done === row.total || (row.activityAt !== null && now - row.activityAt > QUIET_AFTER_MS));
      row.muted = row.agents.length === 0 && row.needsYou === 0;
      return row;
    });
    const sorted = sortRows(rows);
    specs = { status: "ready", generatedAt: Date.parse(file.generatedAt), rule: specsRule(sorted), needsYou: sorted.reduce((n, r) => n + r.needsYou, 0), rows: sorted };
  }

  const threadRow = (t: T3Thread): ThreadRow => ({ title: t.title, look: threadLook(t), model: t.model, updatedAt: Date.parse(t.updatedAt) });
  const newest = (a: ThreadRow, b: ThreadRow) => b.updatedAt - a.updatedAt;
  let t3: Board["t3"];
  if (input.t3 === "off") t3 = { status: "off" };
  else if (input.t3.status === "unavailable") t3 = input.t3;
  else {
    const open = threads.filter((t) => !t.settled);
    t3 = {
      status: "ready",
      pinned: open.filter((t) => t.pinned).map(threadRow).sort(newest),
      // WizBar's Unread, as close as T3's thread list allows: unpinned threads waiting on you or failed.
      needsYou: open.filter((t) => !t.pinned && !t.snoozed && titleRef(t.title).kind !== "fleet")
        .map(threadRow).filter((r) => r.look === "needs-you" || r.look === "failed").sort(newest),
      // Running threads that aren't a spec's agent: a fleet's own thread, or any other work in T3.
      running: open.filter((t) => !onSpec.has(t.threadId) && threadLook(t) === "running").map(threadRow).sort(newest),
    };
  }

  const anySource = input.agents.status === "ready" || (input.t3 !== "off" && input.t3.status === "ready");
  return {
    now, specs, t3, otherAgents: otherAgents.sort((a, b) => b.updatedAt - a.updatedAt),
    running: anySource ? running : null,
    usage: anySource ? { harnesses: harnesses.list(true), models: models.list(false) } : null,
    agents: input.agents.status === "ready" ? { status: "ready" } : { status: "unavailable", reason: input.agents.reason },
  };
}

/** One scan's GitHub requests in the producer's last run: used of its budget, and how many answered "unchanged". */
export interface Scan { used: number; budget: number; unchanged: number }
export interface Requests { specs: Scan; agents: Scan; at: number }

/** The producer's run line, `… 5 of 59 specs requests (2 unchanged) · 3 of 20 agents requests (0 unchanged) …`; null if it doesn't say. */
export function readRequests(line: string, at: number): Requests | null {
  const scan = (pattern: RegExp): Scan | null => {
    const m = pattern.exec(line);
    return m ? { used: Number(m[1]), budget: Number(m[2]), unchanged: Number(m[3]) } : null;
  };
  const specs = scan(/\b(\d+) of (\d+) specs requests \((\d+) unchanged\)/);
  const agents = scan(/\b(\d+) of (\d+) agents requests \((\d+) unchanged\)/);
  return specs && agents && specs.budget > 0 && agents.budget > 0 ? { specs, agents, at } : null;
}

/** How long a GitHub note counts as live; shown in the page's footer. */
export const leaseMinutes = agentLeaseMs / MINUTE;

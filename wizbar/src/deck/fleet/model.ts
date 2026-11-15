// The fleet tree (F1, #75): every active thread of one Cloudroom project,
// placed under a spec only by verified work links (thread branch → pull
// request → closing ticket → parent spec), then arranged by host parent
// relationships. Titles are never parsed. Work without a verified link stays
// visible as unplaced, once. Pure: the panel and tests call the same code.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import type { SpecRefV1, StallV1 } from "../../factory-contract";
import type { CacheView } from "../data/cache";
import type { LiveHealthV1 } from "../live/health";
import type { FleetLinksV1, FleetPullRequestV1, FleetTicketV1 } from "./links";

// ---- Link source -------------------------------------------------------------

export type FleetLinkSourceV1 =
  /** The backend sends no work-link read: nothing can be placed. */
  | { status: "not-connected" }
  | { status: "loading" }
  | { status: "unavailable"; detail: string }
  | { status: "read"; pullRequests: FleetPullRequestV1[]; complete: boolean; stale: boolean; gaps: string[] };

/** Combine one factory's per-repository link reads. Any repository not read makes the whole read partial. */
export function fleetLinkSource(views: readonly CacheView<FleetLinksV1>[] | undefined): FleetLinkSourceV1 {
  if (!views) return { status: "not-connected" };
  const pullRequests: FleetPullRequestV1[] = [];
  const gaps: string[] = [];
  let read = 0; let loading = false; let stale = false; let complete = true;
  for (const view of views) {
    const snapshot = view.snapshot;
    if (snapshot === null) { loading = true; complete = false; continue; }
    const data = snapshot.status === "ready" ? snapshot.data : snapshot.lastGood?.data ?? null;
    if (snapshot.status === "ready") { gaps.push(...snapshot.gaps); complete &&= snapshot.complete; stale ||= snapshot.stale; }
    else { complete = false; stale = true; gaps.push(view.detail ?? "A repository's work links could not be read."); }
    if (data) { read += 1; pullRequests.push(...data.pullRequests); }
  }
  if (read === 0) return loading ? { status: "loading" } : { status: "unavailable", detail: gaps.join(" ") || "Work links could not be read." };
  return { status: "read", pullRequests, complete, stale, gaps };
}

// ---- Rows ----------------------------------------------------------------------

/** Why a thread has no spec of its own. Each is shown in words. */
export type WorkLinkV1 =
  | { status: "linked"; branch: string; pullRequest: FleetPullRequestV1; tickets: FleetTicketV1[]; spec: SpecRefV1 }
  | { status: "no-spec"; branch: string; pullRequest: FleetPullRequestV1; tickets: FleetTicketV1[] }
  | { status: "ambiguous"; branch: string; detail: string }
  | { status: "no-pull-request"; branch: string; complete: boolean }
  | { status: "no-branch" }
  | { status: "links-unavailable"; branch: string | null };

export type FleetRoleV1 = "manager" | "builder" | "helper";
export type PlacementV1 = "own" | "children" | "parent" | "none";

export interface FleetRowV1 {
  id: string;
  title: string;
  /** Null when the host sent this running thread without a sidebar row. */
  thread: PluginSidebarThread | null;
  parentThreadId: string | null;
  isHidden: boolean;
  /** True/false from the host inventory; null when the inventory is unavailable. */
  running: boolean | null;
  stall: StallV1 | undefined;
  link: WorkLinkV1;
  spec: SpecRefV1 | null;
  placement: PlacementV1;
  role: FleetRoleV1 | null;
  /** Nesting under the row's parent within the same group (0 = top). */
  depth: number;
  /** Set on a top row whose parent thread is not in this group. */
  parentNote: "elsewhere" | "absent" | null;
  createdAt: number;
}

export interface FleetGroupV1 {
  spec: SpecRefV1 | null;
  rows: FleetRowV1[];
  running: number | null;
}

export interface FleetModelV1 {
  projectId: string;
  running: LiveHealthV1["running"];
  stallCount: number | null;
  stallDetail: string;
  links: FleetLinkSourceV1;
  groups: FleetGroupV1[];
  unplaced: FleetGroupV1;
  threadCount: number;
  /** Tickets closed by a merged pull request in the work-link read, by spec. */
  mergedTickets: Map<SpecRefV1, { ticket: FleetTicketV1; pullRequest: FleetPullRequestV1 }[]>;
}

const byCreated = (a: { createdAt: number; id: string }, b: { createdAt: number; id: string }) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function resolveLink(branch: string | null, links: FleetLinkSourceV1): WorkLinkV1 {
  if (links.status !== "read") return branch === null ? { status: "no-branch" } : { status: "links-unavailable", branch };
  if (branch === null) return { status: "no-branch" };
  const matches = links.pullRequests.filter((pr) => pr.headRefName === branch);
  const open = matches.filter((pr) => pr.state === "open");
  const candidates = open.length > 0 ? open : matches;
  if (candidates.length === 0) return { status: "no-pull-request", branch, complete: links.complete };
  if (candidates.length > 1) return { status: "ambiguous", branch, detail: `${candidates.length} pull requests use this branch` };
  const pullRequest = candidates[0];
  const specs = [...new Set(pullRequest.tickets.map((ticket) => ticket.spec).filter((spec): spec is SpecRefV1 => spec !== null))];
  if (specs.length > 1) return { status: "ambiguous", branch, detail: "its tickets belong to different specs" };
  if (specs.length === 1) return { status: "linked", branch, pullRequest, tickets: pullRequest.tickets, spec: specs[0] };
  return { status: "no-spec", branch, pullRequest, tickets: pullRequest.tickets };
}

export function buildFleet(input: {
  projectId: string;
  threads: readonly PluginSidebarThread[];
  health: LiveHealthV1;
  links: FleetLinkSourceV1;
}): FleetModelV1 {
  const { projectId, health, links } = input;
  const running = health.running;
  const runningIds = running.status === "ready" ? new Set(running.rows.map((row) => row.id)) : null;

  // Every active thread in scope, hidden ones included, once; then any running
  // thread the host listed without a sidebar row.
  const rows = new Map<string, FleetRowV1>();
  const base = (id: string, thread: PluginSidebarThread | null, parentThreadId: string | null): FleetRowV1 => ({
    id, thread, parentThreadId,
    title: thread?.displayTitle ?? "Running thread not in the sidebar list",
    isHidden: thread?.isHidden ?? false,
    running: runningIds ? runningIds.has(id) : null,
    stall: health.stalls.get(id),
    link: resolveLink(thread?.environment?.branchName ?? null, links),
    spec: null, placement: "none", role: null, depth: 0, parentNote: null,
    createdAt: thread?.createdAt ?? Number.MAX_SAFE_INTEGER,
  });
  for (const thread of input.threads) {
    if (thread.projectId !== projectId || thread.isArchived || rows.has(thread.id)) continue;
    rows.set(thread.id, base(thread.id, thread, thread.parentThreadId));
  }
  if (running.status === "ready") {
    for (const row of running.rows) if (!rows.has(row.id)) rows.set(row.id, base(row.id, null, row.parentThreadId));
  }

  // Children by parent, for placement from below.
  const children = new Map<string, FleetRowV1[]>();
  for (const row of rows.values()) {
    if (row.parentThreadId && rows.has(row.parentThreadId)) {
      const list = children.get(row.parentThreadId) ?? [];
      list.push(row);
      children.set(row.parentThreadId, list);
    }
  }
  const own = (row: FleetRowV1) => row.link.status === "linked" ? row.link.spec : null;
  const below = new Map<string, Set<SpecRefV1>>();
  const descendantSpecs = (row: FleetRowV1, seen = new Set<string>()): Set<SpecRefV1> => {
    const cached = below.get(row.id);
    if (cached) return cached;
    const specs = new Set<SpecRefV1>();
    if (seen.has(row.id)) return specs;
    seen.add(row.id);
    for (const child of children.get(row.id) ?? []) {
      const spec = own(child);
      if (spec) specs.add(spec);
      for (const nested of descendantSpecs(child, seen)) specs.add(nested);
    }
    below.set(row.id, specs);
    return specs;
  };
  // A thread's own verified link wins; else every linked descendant agreeing
  // on one spec (a manager); else its parent's placement (a helper).
  const resolving = new Set<string>();
  const place = (row: FleetRowV1): SpecRefV1 | null => {
    if (row.placement !== "none" || resolving.has(row.id)) return row.spec;
    resolving.add(row.id);
    const mine = own(row);
    const fromChildren = descendantSpecs(row);
    if (mine) { row.spec = mine; row.placement = "own"; }
    else if (fromChildren.size === 1) { row.spec = [...fromChildren][0]; row.placement = "children"; }
    else {
      const parent = row.parentThreadId ? rows.get(row.parentThreadId) : undefined;
      const inherited = parent ? place(parent) : null;
      if (inherited) { row.spec = inherited; row.placement = "parent"; }
    }
    resolving.delete(row.id);
    return row.spec;
  };
  for (const row of rows.values()) place(row);
  for (const row of rows.values()) {
    if (row.placement === "none") continue;
    row.role = row.link.status === "linked" ? "builder" : row.placement === "children" ? "manager" : "helper";
  }

  // Groups, each arranged as a tree by parent within the group.
  const grouped = new Map<SpecRefV1 | null, FleetRowV1[]>();
  for (const row of rows.values()) {
    const list = grouped.get(row.spec) ?? [];
    list.push(row);
    grouped.set(row.spec, list);
  }
  const arrange = (spec: SpecRefV1 | null, list: FleetRowV1[]): FleetGroupV1 => {
    const inGroup = new Set(list.map((row) => row.id));
    const kids = new Map<string, FleetRowV1[]>();
    const tops: FleetRowV1[] = [];
    for (const row of list) {
      if (row.parentThreadId && inGroup.has(row.parentThreadId) && row.parentThreadId !== row.id) {
        const siblings = kids.get(row.parentThreadId) ?? [];
        siblings.push(row);
        kids.set(row.parentThreadId, siblings);
      } else {
        row.parentNote = row.parentThreadId === null ? null : rows.has(row.parentThreadId) ? "elsewhere" : "absent";
        tops.push(row);
      }
    }
    const ordered: FleetRowV1[] = [];
    const visit = (row: FleetRowV1, depth: number) => {
      if (ordered.includes(row)) return;
      row.depth = depth;
      ordered.push(row);
      for (const child of (kids.get(row.id) ?? []).sort(byCreated)) visit(child, depth + 1);
    };
    for (const top of tops.sort(byCreated)) visit(top, 0);
    // A parent cycle has no top: keep its rows visible rather than drop them.
    for (const row of [...list].sort(byCreated)) visit(row, 0);
    return { spec, rows: ordered, running: runningIds ? ordered.filter((row) => row.running).length : null };
  };
  const groups = [...grouped.entries()].filter(([spec]) => spec !== null)
    .map(([spec, list]) => arrange(spec, list))
    .sort((a, b) => byCreated(a.rows[0], b.rows[0]));
  const unplaced = arrange(null, grouped.get(null) ?? []);

  const mergedTickets: FleetModelV1["mergedTickets"] = new Map();
  if (links.status === "read") {
    const seen = new Set<string>();
    for (const pullRequest of links.pullRequests) {
      if (pullRequest.state !== "merged") continue;
      for (const ticket of pullRequest.tickets) {
        if (!ticket.spec || ticket.state !== "closed" || seen.has(ticket.ref)) continue;
        seen.add(ticket.ref);
        const list = mergedTickets.get(ticket.spec) ?? [];
        list.push({ ticket, pullRequest });
        mergedTickets.set(ticket.spec, list);
      }
    }
  }

  return {
    projectId, running, stallCount: health.stallCount, stallDetail: health.stallDetail, links,
    groups, unplaced, threadCount: rows.size, mergedTickets,
  };
}

// ---- Search and sort (the fleet view only; the sidebar's order never changes) ----

export type FleetSortV1 = "plan" | "running" | "title";

function haystack(row: FleetRowV1): string {
  const link = row.link;
  const parts = [row.title, row.spec ?? ""];
  if ("branch" in link && link.branch) parts.push(link.branch);
  if (link.status === "linked" || link.status === "no-spec") {
    parts.push(link.pullRequest.ref, `#${link.pullRequest.ref.split("#")[1]}`);
    for (const ticket of link.tickets) parts.push(ticket.ref, `#${ticket.ref.split("#")[1]}`, ticket.title);
  }
  return parts.join("\n").toLowerCase();
}

/**
 * Filter and order one group's rows. A match keeps its ancestors in the group
 * as context, so a helper never appears without its builder. Sorting reorders
 * siblings only; nesting stays.
 */
export function viewGroup(group: FleetGroupV1, query: string, sort: FleetSortV1): FleetRowV1[] {
  const needle = query.trim().toLowerCase();
  const byId = new Map(group.rows.map((row) => [row.id, row]));
  const parentOf = (row: FleetRowV1) => row.depth > 0 && row.parentThreadId ? byId.get(row.parentThreadId) : undefined;
  let keep = new Set(group.rows.map((row) => row.id));
  if (needle) {
    keep = new Set();
    for (const row of group.rows) {
      if (!haystack(row).includes(needle)) continue;
      for (let at: FleetRowV1 | undefined = row; at && !keep.has(at.id); at = parentOf(at)) keep.add(at.id);
    }
  }
  const compare = (a: FleetRowV1, b: FleetRowV1) =>
    sort === "title" ? a.title.localeCompare(b.title) || byCreated(a, b)
      : sort === "running" ? Number(b.running === true) - Number(a.running === true) || byCreated(a, b)
      : byCreated(a, b);
  const kids = new Map<string | null, FleetRowV1[]>();
  for (const row of group.rows) {
    if (!keep.has(row.id)) continue;
    const key = parentOf(row)?.id ?? null;
    const list = kids.get(key) ?? [];
    list.push(row);
    kids.set(key, list);
  }
  const out: FleetRowV1[] = [];
  const visit = (key: string | null) => {
    for (const row of (kids.get(key) ?? []).sort(compare)) { out.push(row); visit(row.id); }
  };
  visit(null);
  return out;
}

/** The spec a thread is placed under, for the shared highlight. */
export function specOfThread(model: FleetModelV1, threadId: string): SpecRefV1 | null {
  for (const group of model.groups) if (group.rows.some((row) => row.id === threadId)) return group.spec;
  return null;
}

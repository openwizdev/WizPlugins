import type { SpecsFileV4 } from "../fixtures/v4";
import { matchSpecTicket, type SpecsThreadRow } from "../specs/rows";
import { isActiveNote, pullPattern, type AgentRun, type GitHubAgent } from "./format";
import type { AgentsRead } from "./read";

export type UnseenAgents =
  | { status: "ready"; count: number; agents: GitHubAgent[]; authors?: "unknown" }
  | { status: "unavailable"; count: null; agents: [] };

export const issueNumber = (ticket: string) => ticket.slice(ticket.lastIndexOf("#") + 1);
const claimKey = (ticket: string, kind: string) => `${ticket.toLowerCase()}:${kind.toLowerCase()}`;
const runKey = (role: string, repository: string, number: string | number) => claimKey(`${repository}#${number}`, role);

function indexTicket(index: Map<string, Set<string>>, number: string, ticket: string) {
  const known = index.get(number) ?? new Set();
  known.add(ticket.toLowerCase());
  index.set(number, known);
}

function knownIssues(specs: SpecsFileV4 | null, agents: readonly GitHubAgent[]) {
  const issues = new Map<string, Set<string>>();
  for (const spec of specs?.specs ?? []) {
    indexTicket(issues, issueNumber(spec.spec), spec.spec);
    for (const { ticket } of spec.tickets) indexTicket(issues, issueNumber(ticket), ticket);
  }
  for (const { ticket } of agents) indexTicket(issues, issueNumber(ticket), ticket);
  return issues;
}

export function sharedIssueNumbers(specs: SpecsFileV4 | null, agents: readonly GitHubAgent[]) {
  const numbers = new Set<string>();
  for (const [number, tickets] of knownIssues(specs, agents)) {
    if (tickets.size > 1) numbers.add(number);
  }
  return numbers;
}

export type AgentSidebarRow = SpecsThreadRow & { isHidden?: boolean; isArchived?: boolean };

/** Match by existing spec and title rules when a claim has no run map entry. */
function visibleClaims(specs: SpecsFileV4 | null, agents: readonly GitHubAgent[], rows: readonly AgentSidebarRow[]) {
  const issues = knownIssues(specs, agents);
  const pulls = new Map<string, Set<string>>();
  for (const spec of specs?.specs ?? []) {
    for (const { ticket, pulls: numbers } of spec.tickets) {
      for (const number of numbers ?? []) indexTicket(pulls, String(number), ticket);
    }
  }
  for (const { ticket, pr } of agents) {
    const pull = pr ? pullPattern.exec(pr) : null;
    if (pull) indexTicket(pulls, pull[2], ticket);
  }

  const visible = rows.filter((row) => !row.isHidden && !row.isArchived);
  const matches = new Set<string>();
  for (const row of visible) {
    const match = specs ? matchSpecTicket(specs, row, visible) : null;
    if (match) {
      matches.add(claimKey(match.ticket, match.role));
      continue;
    }
    // Outside a resolved spec, infer a ticket only when the issue or pull number has one candidate.
    const title = row.displayTitle;
    const builder = /^#([1-9][0-9]*): .+$/.exec(title);
    const reviewer = /^Review #([1-9][0-9]*) at [0-9a-f]{7,40}(?: .*)?$/.exec(title);
    const fleet = /^Fleet #([1-9][0-9]*): .+$/.exec(title);
    const tickets = builder ? issues.get(builder[1]) : reviewer ? pulls.get(reviewer[1]) : fleet ? issues.get(fleet[1]) : undefined;
    if (tickets?.size === 1) matches.add(claimKey([...tickets][0], builder ? "builder" : reviewer ? "reviewer" : "fleet"));
  }
  return matches;
}

function matchRun(agent: GitHubAgent, pullsByTicket: ReadonlyMap<string, Set<number>>): string | null {
  if (agent.agent === "builder") return runKey("builder", agent.repository, issueNumber(agent.ticket));
  if (agent.agent !== "reviewer") return null;
  const pull = agent.pr ? pullPattern.exec(agent.pr) : null;
  if (pull) return runKey("reviewer", pull[1], pull[2]);
  const numbers = pullsByTicket.get(agent.ticket.toLowerCase());
  return numbers?.size === 1 ? runKey("reviewer", agent.repository, [...numbers][0]) : null;
}

export function unseenSnapshot(
  read: AgentsRead, specs: SpecsFileV4 | null, rows: readonly AgentSidebarRow[] | null,
): { agents: GitHubAgent[]; more: AgentRun[]; authors?: "unknown" } | null {
  if (read.status !== "ready" || rows === null) return null;
  const claims = new Map<string, GitHubAgent>();
  for (const agent of read.agents) {
    const key = claimKey(agent.ticket, agent.agent);
    const previous = claims.get(key);
    // The old v1 file held the oldest live claim. A history snapshot holds its latest note.
    if (!previous || (agent.live === undefined
      ? agent.commentId < previous.commentId
      : agent.updatedAt > previous.updatedAt || (agent.updatedAt === previous.updatedAt && agent.commentId > previous.commentId))) {
      claims.set(key, agent);
    }
  }
  const desktop = new Set([...rows.map((row) => row.id), ...(read.archivedIds ?? [])]);
  const runs = new Map<string, { entry: AgentRun; seen: boolean }>();
  for (const entry of read.runMap ?? []) {
    const key = runKey(entry.role, entry.repository, entry.number);
    const seen = entry.threadId !== null && desktop.has(entry.threadId);
    const prior = runs.get(key);
    if (!prior || seen) runs.set(key, { entry, seen });
  }
  const pullsByTicket = new Map<string, Set<number>>();
  if (runs.size) {
    for (const spec of specs?.specs ?? []) {
      for (const { ticket, pulls } of spec.tickets) {
        const key = ticket.toLowerCase();
        const known = pullsByTicket.get(key) ?? new Set();
        for (const pull of pulls ?? []) known.add(pull);
        pullsByTicket.set(key, known);
      }
    }
  }
  const fallback = visibleClaims(specs, [...claims.values()], rows);
  const noted = new Set<string>();
  const agents = [...claims.values()].filter((agent) => {
    const key = matchRun(agent, pullsByTicket);
    const mapped = key ? runs.get(key) : undefined;
    if (key) noted.add(key);
    if (agent.agent === "reviewer" && !agent.pr) {
      for (const pull of pullsByTicket.get(agent.ticket.toLowerCase()) ?? []) {
        noted.add(runKey("reviewer", agent.repository, pull));
      }
    }
    return !(mapped?.seen ?? fallback.has(claimKey(agent.ticket, agent.agent)));
  });
  const more = [...runs].flatMap(([key, { entry, seen }]) => seen || noted.has(key) ? [] : [entry]);
  return { agents, more, ...(read.authors ? { authors: read.authors } : {}) };
}

export function unseenAgents(read: AgentsRead, specs: SpecsFileV4 | null, rows: readonly AgentSidebarRow[] | null): UnseenAgents {
  const snapshot = unseenSnapshot(read, specs, rows);
  if (!snapshot) return { status: "unavailable", count: null, agents: [] };
  const agents = snapshot.agents.filter((agent) => agent.live ?? isActiveNote(agent.state));
  return { status: "ready", count: agents.length, agents, ...(snapshot.authors ? { authors: snapshot.authors } : {}) };
}

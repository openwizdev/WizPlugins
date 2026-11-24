import type { SpecsFileV4 } from "../fixtures/v4";
import { matchSpecTicket, type SpecsThreadRow } from "../specs/rows";
import { pullPattern, type GitHubAgent } from "./format";
import type { AgentsRead } from "./read";

export type UnseenAgents =
  | { status: "ready"; count: number; agents: GitHubAgent[]; authors?: "unknown" }
  | { status: "unavailable"; count: null; agents: [] };

export const issueNumber = (ticket: string) => ticket.slice(ticket.lastIndexOf("#") + 1);
const claimKey = (ticket: string, kind: string) => `${ticket.toLowerCase()}:${kind.toLowerCase()}`;

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

type SidebarRow = SpecsThreadRow & { isHidden?: boolean; isArchived?: boolean };

export function unseenAgents(
  read: AgentsRead, specs: SpecsFileV4 | null, rows: readonly SidebarRow[] | null,
): UnseenAgents {
  if (read.status !== "ready" || rows === null) return { status: "unavailable", count: null, agents: [] };
  const claims = new Map<string, GitHubAgent>();
  for (const agent of read.agents) {
    const key = claimKey(agent.ticket, agent.agent);
    const prior = claims.get(key);
    if (!prior || agent.commentId < prior.commentId) claims.set(key, agent);
  }
  const issues = knownIssues(specs, read.agents);
  const pulls = new Map<string, Set<string>>();
  for (const spec of specs?.specs ?? []) {
    for (const { ticket, pulls: numbers } of spec.tickets) {
      for (const number of numbers ?? []) indexTicket(pulls, String(number), ticket);
    }
  }
  for (const { ticket, pr } of claims.values()) {
    const pull = pr ? pullPattern.exec(pr) : null;
    if (pull) indexTicket(pulls, pull[2], ticket);
  }

  const visible = rows.filter((row) => !row.isHidden && !row.isArchived);
  for (const row of visible) {
    const match = specs ? matchSpecTicket(specs, row, visible) : null;
    if (match) {
      claims.delete(claimKey(match.ticket, match.role));
      continue;
    }
    // Outside a resolved spec, infer a ticket only when the issue or pull number has one candidate.
    const title = row.displayTitle;
    const builder = /^#([1-9][0-9]*): .+$/.exec(title);
    const reviewer = /^Review #([1-9][0-9]*) at [0-9a-f]{7,40}(?: .*)?$/.exec(title);
    const fleet = /^Fleet #([1-9][0-9]*): .+$/.exec(title);
    const tickets = builder ? issues.get(builder[1]) : reviewer ? pulls.get(reviewer[1]) : fleet ? issues.get(fleet[1]) : undefined;
    if (tickets?.size !== 1) continue;
    const [ticket] = tickets;
    claims.delete(claimKey(ticket, builder ? "builder" : reviewer ? "reviewer" : "fleet"));
  }
  const agents = [...claims.values()];
  return { status: "ready", count: agents.length, agents, ...(read.authors ? { authors: read.authors } : {}) };
}

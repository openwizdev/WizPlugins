import type { SpecsFileV4 } from "../fixtures/v4";
import { isRunning, specRows, type SpecsThreadRow } from "../specs/rows";
import { pullPattern, type GitHubAgent } from "./format";
import type { AgentsRead } from "./read";

export type UnseenAgents =
  | { status: "ready"; count: number; agents: GitHubAgent[] }
  | { status: "unavailable"; count: null; agents: [] };

const issueNumber = (ticket: string) => ticket.slice(ticket.lastIndexOf("#") + 1);
const claimKey = (ticket: string, kind: string) => `${ticket.toLowerCase()}:${kind.toLowerCase()}`;

function indexTicket(index: Map<string, Set<string>>, number: string, ticket: string) {
  const known = index.get(number) ?? new Set();
  known.add(ticket.toLowerCase());
  index.set(number, known);
}

type SidebarRow = SpecsThreadRow & { isHidden?: boolean };

export function unseenAgents(
  read: AgentsRead, specs: SpecsFileV4 | null, rows: readonly SidebarRow[] | null, now: number,
): UnseenAgents {
  if (read.status !== "ready" || rows === null) return { status: "unavailable", count: null, agents: [] };
  const claims = new Map<string, GitHubAgent>();
  for (const agent of read.agents) {
    const key = claimKey(agent.ticket, agent.agent);
    const prior = claims.get(key);
    if (!prior || agent.commentId < prior.commentId) claims.set(key, agent);
  }
  const issues = new Map<string, Set<string>>();
  const pulls = new Map<string, Set<string>>();
  for (const spec of specs?.specs ?? []) {
    indexTicket(issues, issueNumber(spec.spec), spec.spec);
    for (const { ticket, pulls: numbers } of spec.tickets) {
      indexTicket(issues, issueNumber(ticket), ticket);
      for (const number of numbers ?? []) indexTicket(pulls, String(number), ticket);
    }
  }
  for (const { ticket, pr } of claims.values()) {
    indexTicket(issues, issueNumber(ticket), ticket);
    const pull = pr ? pullPattern.exec(pr) : null;
    if (pull) indexTicket(pulls, pull[2], ticket);
  }

  const visible = new Set(rows.filter((row) => !row.isHidden && isRunning(row)).map((row) => row.id));
  const matched = new Set<string>();
  if (specs && visible.size) {
    for (const spec of specRows(specs, rows, [], now).specs) {
      for (const agent of spec.agents) {
        if (!visible.has(agent.threadId) || !agent.ticket || !agent.role) continue;
        claims.delete(claimKey(agent.ticket, agent.role));
        matched.add(agent.threadId);
      }
    }
  }
  // Outside a resolved spec, infer a ticket only when the issue or pull number has one candidate.
  for (const row of rows) {
    if (!visible.has(row.id) || matched.has(row.id)) continue;
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
  return { status: "ready", count: agents.length, agents };
}

// Fleet work links (F1, #75): which pull request each branch belongs to,
// which tickets that pull request closes, and each ticket's parent spec, as
// GitHub records them. One bounded GraphQL read per repository, inside D1's
// shared cache and its 60-second schedule. Titles are never parsed.
import type { RepositoryRefV1, SpecRefV1 } from "../../factory-contract";
import type { LoadResult } from "../data/cache";
import { GitHubReadFailed, type GitHubReader } from "../data/github";

export interface FleetTicketV1 {
  ref: SpecRefV1;
  url: string;
  title: string;
  state: "open" | "closed";
  /** The ticket's parent issue as GitHub links it, or null. */
  spec: SpecRefV1 | null;
}

export interface FleetPullRequestV1 {
  ref: string;
  url: string;
  /** The head branch, in the same repository (pull requests from forks are skipped). */
  headRefName: string;
  state: "open" | "merged";
  mergedAt: string | null;
  tickets: FleetTicketV1[];
  /** False when the pull request closes more tickets than were read. */
  ticketsComplete: boolean;
}

export interface FleetLinksV1 {
  repository: RepositoryRefV1;
  pullRequests: FleetPullRequestV1[];
}

export const FLEET_LINK_LIMITS = { open: 50, openPages: 2, merged: 30, closing: 5 } as const;

const PAGE = "pageInfo { hasNextPage endCursor }";
const PR = `number url headRefName isCrossRepository mergedAt repository { nameWithOwner }
  closingIssuesReferences(first: ${FLEET_LINK_LIMITS.closing}) { pageInfo { hasNextPage }
    nodes { number title url state repository { nameWithOwner } parent { number repository { nameWithOwner } } } }`;
const ORDER = "orderBy: {field: UPDATED_AT, direction: DESC}";

export const FLEET_LINKS_QUERY = `query WizDeckFleetLinks($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    open: pullRequests(states: [OPEN], first: ${FLEET_LINK_LIMITS.open}, ${ORDER}) { ${PAGE} nodes { ${PR} } }
    merged: pullRequests(states: [MERGED], first: ${FLEET_LINK_LIMITS.merged}, ${ORDER}) { ${PAGE} nodes { ${PR} } }
  }
}`;
export const FLEET_OPEN_QUERY = `query WizDeckFleetOpen($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    open: pullRequests(states: [OPEN], first: ${FLEET_LINK_LIMITS.open}, after: $after, ${ORDER}) { ${PAGE} nodes { ${PR} } }
  }
}`;

interface RawRepo { nameWithOwner: string }
interface RawIssue { number: number; title: string; url: string; state: string; repository: RawRepo; parent: { number: number; repository: RawRepo } | null }
interface RawPr {
  number: number; url: string; headRefName: string; isCrossRepository: boolean; mergedAt: string | null; repository: RawRepo;
  closingIssuesReferences: { pageInfo: { hasNextPage: boolean }; nodes: RawIssue[] };
}
interface RawPage { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawPr[] }

function bad(what: string): never {
  throw new GitHubReadFailed(`Unexpected GitHub ${what}.`);
}

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const repoName = (value: unknown): string => {
  const name = (value as RawRepo | null)?.nameWithOwner;
  return text(name) && /^[^/\s]+\/[^/\s]+$/.test(name) ? name : bad("repository name");
};

function page(value: unknown): RawPage {
  const raw = value as RawPage | null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.nodes) || typeof raw.pageInfo?.hasNextPage !== "boolean") bad("pull request page");
  return raw;
}

function ticket(raw: RawIssue): FleetTicketV1 {
  if (!raw || !Number.isSafeInteger(raw.number) || !text(raw.url) || typeof raw.title !== "string") bad("closing issue");
  const repo = repoName(raw.repository);
  const parent = raw.parent;
  if (parent !== null && (typeof parent !== "object" || !Number.isSafeInteger(parent.number))) bad("issue parent");
  return {
    ref: `${repo}#${raw.number}` as SpecRefV1, url: raw.url, title: raw.title,
    state: raw.state === "CLOSED" ? "closed" : "open",
    spec: parent ? `${repoName(parent.repository)}#${parent.number}` as SpecRefV1 : null,
  };
}

function pullRequest(raw: RawPr, state: "open" | "merged"): FleetPullRequestV1 | null {
  if (!raw || !Number.isSafeInteger(raw.number) || !text(raw.url) || typeof raw.headRefName !== "string" || typeof raw.isCrossRepository !== "boolean") bad("pull request");
  const closing = raw.closingIssuesReferences;
  if (!closing || !Array.isArray(closing.nodes) || typeof closing.pageInfo?.hasNextPage !== "boolean") bad("closing issues");
  // A fork's branch name says nothing about a thread in this repository.
  // PLANTED BUG (red run): fork pull requests kept.
  if (!raw.headRefName) return null;
  return {
    ref: `${repoName(raw.repository)}#${raw.number}`, url: raw.url, headRefName: raw.headRefName, state,
    mergedAt: state === "merged" ? raw.mergedAt : null,
    tickets: closing.nodes.map(ticket), ticketsComplete: !closing.pageInfo.hasNextPage,
  };
}

/**
 * Read one repository's open pull requests (bounded pages) and its most
 * recently updated merged ones. Anything beyond the bounds is a gap: a branch
 * not found among them is "no pull request found in what was read".
 */
export async function loadFleetLinks(
  input: { reader: GitHubReader; repository: RepositoryRefV1 }, signal: AbortSignal,
): Promise<LoadResult<FleetLinksV1>> {
  const [owner, name] = input.repository.split("/");
  const data = await input.reader.graphql(FLEET_LINKS_QUERY, { owner, name }, signal) as { repository?: { open?: unknown; merged?: unknown } | null };
  if (!data?.repository) bad("repository");
  const gaps: string[] = [];
  let open = page(data.repository.open);
  const pullRequests: FleetPullRequestV1[] = [];
  const add = (raws: RawPr[], state: "open" | "merged") => {
    for (const raw of raws) { const pr = pullRequest(raw, state); if (pr) pullRequests.push(pr); }
  };
  add(open.nodes, "open");
  for (let pages = 1; open.pageInfo.hasNextPage; pages += 1) {
    if (pages >= FLEET_LINK_LIMITS.openPages || !open.pageInfo.endCursor) {
      gaps.push(`${input.repository}: only the ${FLEET_LINK_LIMITS.open * FLEET_LINK_LIMITS.openPages} most recently updated open pull requests were read.`);
      break;
    }
    const next = await input.reader.graphql(FLEET_OPEN_QUERY, { owner, name, after: open.pageInfo.endCursor }, signal) as { repository?: { open?: unknown } | null };
    if (!next?.repository) bad("repository");
    open = page(next.repository.open);
    add(open.nodes, "open");
  }
  const merged = page(data.repository.merged);
  add(merged.nodes, "merged");
  if (merged.pageInfo.hasNextPage) gaps.push(`${input.repository}: only the ${FLEET_LINK_LIMITS.merged} most recently updated merged pull requests were read.`);
  if (pullRequests.some((pr) => !pr.ticketsComplete)) gaps.push(`${input.repository}: some pull requests close more tickets than were read.`);
  return { data: { repository: input.repository, pullRequests }, complete: gaps.length === 0, gaps };
}

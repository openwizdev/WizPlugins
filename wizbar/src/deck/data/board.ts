// The GitHub board for one repository (D1, #73): versions (open milestones),
// their specs (parent issues with sub-issues), verified progress, each spec's
// status comment and the repository's recent merge timestamps. One GraphQL
// read plus conditional REST reads for status comments, all inside one cache
// entry so they share its 60-second schedule and back-off.
import { readSpecStatus, type RepositoryRefV1, type SpecRefV1, type SpecStatusV1 } from "../../factory-contract";
import type { LoadResult } from "./cache";
import { GitHubReadFailed, type GitHubReader } from "./github";

export interface PrLinkV1 {
  ref: string;
  url: string;
  mergedAt: string;
}

export interface SpecRowV1 {
  ref: SpecRefV1;
  title: string;
  url: string;
  state: "open" | "closed";
  /** Sub-issue count GitHub reports. */
  total: number;
  /** Tickets closed by a merged pull request in a configured repository. */
  merged: number;
  /** False when some ticket or link page was not read: `merged` is then a lower bound. */
  complete: boolean;
  /** Verified merged pull requests, newest first. */
  pullRequests: PrLinkV1[];
  status: SpecStatusV1;
}

export interface VersionV1 {
  repository: RepositoryRefV1;
  number: number;
  title: string;
  dueOn: string | null;
  specs: SpecRowV1[];
}

export interface BoardV1 {
  repository: RepositoryRefV1;
  versions: VersionV1[];
  /** Merged pull requests since `since`, unique by ref, with their merge times. */
  merges: { since: string; complete: boolean; pullRequests: { ref: string; mergedAt: string }[] };
}

/** Bounds on one board read. Anything past them is a recorded gap, never a count. */
export const BOARD_LIMITS = { milestones: 10, issues: 50, subIssues: 50, closingPrs: 10, commentPages: 3, mergePages: 3 } as const;
/** Long enough to hold the current calendar day in every time zone. */
export const MERGE_WINDOW_MS = 26 * 60 * 60 * 1000;

const BOARD_QUERY = `query WizDeckBoard($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    milestones(first: ${BOARD_LIMITS.milestones}, states: [OPEN], orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage }
      nodes {
        number title dueOn
        issues(first: ${BOARD_LIMITS.issues}, orderBy: {field: CREATED_AT, direction: ASC}) {
          pageInfo { hasNextPage }
          nodes {
            number title url state parent { number }
            subIssues(first: ${BOARD_LIMITS.subIssues}) {
              totalCount pageInfo { hasNextPage }
              nodes {
                number state repository { nameWithOwner }
                closedByPullRequestsReferences(first: ${BOARD_LIMITS.closingPrs}, includeClosedPrs: true) {
                  pageInfo { hasNextPage }
                  nodes { number url merged mergedAt repository { nameWithOwner } }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const MERGES_QUERY = `query WizDeckMerges($search: String!, $after: String) {
  search(query: $search, type: ISSUE, first: 100, after: $after) {
    issueCount pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { number url mergedAt repository { nameWithOwner } } }
  }
}`;

type Page<T> = { pageInfo: { hasNextPage: boolean }; nodes: T[] };
interface RawPr { number: number; url: string; merged: boolean; mergedAt: string | null; repository: { nameWithOwner: string } }
interface RawTicket { number: number; state: string; repository: { nameWithOwner: string }; closedByPullRequestsReferences: Page<RawPr> }
interface RawIssue {
  number: number; title: string; url: string; state: string; parent: { number: number } | null;
  subIssues: Page<RawTicket> & { totalCount: number };
}
interface RawBoard { repository: { milestones: Page<{ number: number; title: string; dueOn: string | null; issues: Page<RawIssue> }> } | null }

function fail(what: string): never {
  throw new GitHubReadFailed(`Unexpected GitHub ${what}.`);
}

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A ticket's progress is verified only by a merged pull request, in one of
 * the configured repositories, that GitHub links as closing the ticket, and
 * only once the ticket itself is closed. A closed issue alone is not progress.
 */
export function verifiedMerges(ticket: RawTicket, repositories: readonly string[]): PrLinkV1[] {
  if (ticket.state !== "CLOSED") return [];
  return ticket.closedByPullRequestsReferences.nodes
    .filter((pr) => typeof pr.mergedAt === "string" || pr.merged !== undefined) // PLANTED P3
    .map((pr) => ({ ref: `${pr.repository.nameWithOwner}#${pr.number}`, url: pr.url, mergedAt: pr.mergedAt as string }));
}

async function readComments(reader: GitHubReader, repository: string, issue: number, signal: AbortSignal) {
  const comments: { authorLogin: string; body: string }[] = [];
  let url: string | null = `/repos/${repository}/issues/${issue}/comments?per_page=100`;
  for (let page = 0; url !== null; page += 1) {
    if (page === BOARD_LIMITS.commentPages) return null; // Unread pages: the status cannot be chosen honestly.
    const result = await reader.get(url, signal);
    if (!Array.isArray(result.data)) fail("comment page");
    for (const raw of result.data as { user?: { login?: unknown } | null; body?: unknown }[]) {
      if (typeof raw?.body !== "string") fail("comment");
      comments.push({ authorLogin: typeof raw.user?.login === "string" ? raw.user.login : "", body: raw.body });
    }
    url = result.next;
  }
  return comments;
}

async function readMerges(reader: GitHubReader, repository: string, since: string, signal: AbortSignal) {
  const seen = new Map<string, string>();
  let after: string | null = null;
  for (let page = 0; page < BOARD_LIMITS.mergePages; page += 1) {
    const data = await reader.graphql(MERGES_QUERY, { search: `repo:${repository} is:pr is:merged merged:>=${since}`, after }, signal) as {
      search?: { issueCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Partial<RawPr>[] };
    };
    const search = data.search ?? fail("merge search");
    for (const pr of search.nodes) {
      if (typeof pr.number !== "number" || typeof pr.mergedAt !== "string" || !pr.repository) continue;
      seen.set(`${pr.repository.nameWithOwner}#${pr.number}`, pr.mergedAt);
    }
    if (!search.pageInfo.hasNextPage) {
      return { complete: seen.size >= search.issueCount, pullRequests: [...seen].map(([ref, mergedAt]) => ({ ref, mergedAt })) };
    }
    after = search.pageInfo.endCursor;
  }
  return { complete: false, pullRequests: [...seen].map(([ref, mergedAt]) => ({ ref, mergedAt })) };
}

export interface BoardSource {
  reader: GitHubReader;
  repository: RepositoryRefV1;
  /** Every repository whose merged pull requests count as verified progress. */
  repositories: readonly RepositoryRefV1[];
  statusWriterLogin: string;
  now: () => number;
}

/** Read one repository's board. Partial pages keep their known rows and add a gap. */
export async function loadBoard(source: BoardSource, signal: AbortSignal): Promise<LoadResult<BoardV1>> {
  const { reader, repository } = source;
  const [owner, name] = repository.split("/");
  const gaps: string[] = [];
  const raw = await reader.graphql(BOARD_QUERY, { owner, name }, signal) as RawBoard;
  if (!raw || typeof raw !== "object" || !("repository" in raw)) fail("board");
  if (raw.repository === null) throw new GitHubReadFailed(`${repository} is not readable with this token.`, 404);
  const milestones = raw.repository.milestones;
  if (milestones.pageInfo.hasNextPage) gaps.push(`${repository}: more than ${BOARD_LIMITS.milestones} open versions; later ones are not shown.`);

  const versions: VersionV1[] = [];
  for (const milestone of milestones.nodes) {
    if (milestone.issues.pageInfo.hasNextPage) gaps.push(`${repository} ${milestone.title}: issue page limit reached.`);
    const specs: SpecRowV1[] = [];
    for (const issue of milestone.issues.nodes) {
      if (issue.parent !== null || issue.subIssues.totalCount === 0) continue;
      let complete = !issue.subIssues.pageInfo.hasNextPage;
      const pullRequests: PrLinkV1[] = [];
      let merged = 0;
      for (const ticket of issue.subIssues.nodes) {
        if (ticket.closedByPullRequestsReferences.pageInfo.hasNextPage) complete = false;
        const verified = verifiedMerges(ticket, source.repositories);
        if (ticket.state === "CLOSED") merged += 1; // PLANTED P3
        pullRequests.push(...verified);
      }
      if (!complete) gaps.push(`${repository}#${issue.number}: some tickets or links were not read.`);
      const comments = await readComments(reader, repository, issue.number, signal);
      const status: SpecStatusV1 = comments === null
        ? { status: "unavailable", reason: "missing", when: "Not estimated" }
        : readSpecStatus(comments, source.statusWriterLogin);
      if (comments === null) gaps.push(`${repository}#${issue.number}: too many comments to find its status.`);
      pullRequests.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
      specs.push({
        ref: `${repository}#${issue.number}` as SpecRefV1, title: issue.title, url: issue.url,
        state: issue.state === "CLOSED" ? "closed" : "open",
        total: issue.subIssues.totalCount, merged, complete, pullRequests, status,
      });
    }
    versions.push({ repository, number: milestone.number, title: milestone.title, dueOn: milestone.dueOn, specs });
  }

  const since = new Date(source.now() - MERGE_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
  const merges = await readMerges(reader, repository, since, signal);
  if (!merges.complete) gaps.push(`${repository}: not every recent merge was read.`);
  return { data: { repository, versions, merges: { since, ...merges } }, complete: gaps.length === 0, gaps };
}

/** The viewer's local calendar date (YYYY-MM-DD) for an instant. */
function localDate(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Unique merged pull requests across the given boards on the viewer's local
 * calendar day, from cached merge times. Null when any board's merge read was
 * partial, or a valid time zone was not given: unavailable, never zero.
 */
export function mergesToday(boards: readonly BoardV1[], timeZone: string, now: number): number | null {
  try {
    localDate(now, timeZone);
  } catch {
    return null;
  }
  if (boards.some((board) => !board.merges.complete)) return null;
  const today = localDate(now, timeZone);
  const refs = new Set<string>();
  for (const board of boards) {
    for (const pr of board.merges.pullRequests) {
      if (localDate(Date.parse(pr.mergedAt), "UTC") === localDate(now, "UTC")) refs.add(pr.ref.toLowerCase());
    }
  }
  return refs.size;
}

// The GitHub board for one repository (D1, #73): versions (open milestones),
// their specs (parent issues with sub-issues), verified progress, each spec's
// status comment and the repository's recent merge timestamps.
//
// One GraphQL read gets the first page of every connection; bounded
// continuation reads follow each connection's endCursor, so records past the
// first page become reachable. Status comments and merge times are
// supplementary: their failure marks only themselves unavailable or partial,
// never the board already read. All reads share one cache entry, its
// 60-second schedule and its back-off.
import { readSpecStatus, type RepositoryRefV1, type SpecRefV1, type SpecStatusV1 } from "../../factory-contract";
import type { LoadResult } from "./cache";
import { GitHubRateLimited, GitHubReadFailed, type GitHubReader } from "./github";

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
  /** False when not every issue in this version was read: some specs may be missing. */
  complete: boolean;
  specs: SpecRowV1[];
}

export interface BoardV1 {
  repository: RepositoryRefV1;
  versions: VersionV1[];
  /** Merged pull requests since `since`, unique by ref, with their merge times. */
  merges: { since: string; complete: boolean; pullRequests: { ref: string; mergedAt: string }[] };
}

/**
 * Bounds on one board read: page sizes, pages per connection, and the
 * continuation calls one load may make. Anything past them is a recorded gap,
 * never a count; the next refresh starts again from the first page.
 */
export const BOARD_LIMITS = {
  milestones: 10, issues: 50, subIssues: 50, closingPrs: 10,
  milestonePages: 3, issuePages: 6, subIssuePages: 4, closingPrPages: 3,
  continuationCalls: 40, commentPages: 3, mergePages: 3,
} as const;
/** Long enough to hold the current calendar day in every time zone. */
export const MERGE_WINDOW_MS = 26 * 60 * 60 * 1000;

const PAGE = "pageInfo { hasNextPage endCursor }";
const PRS = `nodes { number url merged mergedAt repository { nameWithOwner } }`;
const TICKET = `number state repository { nameWithOwner }
  closedByPullRequestsReferences(first: ${BOARD_LIMITS.closingPrs}, includeClosedPrs: true) { ${PAGE} ${PRS} }`;
const ISSUE = `number title url state parent { number }
  subIssues(first: ${BOARD_LIMITS.subIssues}) { totalCount ${PAGE} nodes { ${TICKET} } }`;
const ISSUES_ORDER = "orderBy: {field: CREATED_AT, direction: ASC}";

const BOARD_QUERY = `query WizDeckBoard($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    milestones(first: ${BOARD_LIMITS.milestones}, after: $after, states: [OPEN], orderBy: {field: CREATED_AT, direction: ASC}) {
      ${PAGE}
      nodes { number title dueOn issues(first: ${BOARD_LIMITS.issues}, ${ISSUES_ORDER}) { ${PAGE} nodes { ${ISSUE} } } }
    }
  }
}`;
const ISSUES_QUERY = `query WizDeckIssues($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    milestone(number: $number) { issues(first: ${BOARD_LIMITS.issues}, after: $after, ${ISSUES_ORDER}) { ${PAGE} nodes { ${ISSUE} } } }
  }
}`;
const SUB_ISSUES_QUERY = `query WizDeckSubIssues($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { subIssues(first: ${BOARD_LIMITS.subIssues}, after: $after) { totalCount ${PAGE} nodes { ${TICKET} } } }
  }
}`;
const CLOSING_QUERY = `query WizDeckClosing($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { closedByPullRequestsReferences(first: ${BOARD_LIMITS.closingPrs}, after: $after, includeClosedPrs: true) { ${PAGE} ${PRS} } }
  }
}`;
const MERGES_QUERY = `query WizDeckMerges($search: String!, $after: String) {
  search(query: $search, type: ISSUE, first: 100, after: $after) {
    issueCount ${PAGE}
    nodes { ... on PullRequest { number url mergedAt repository { nameWithOwner } } }
  }
}`;

interface PageInfo { hasNextPage: boolean; endCursor: string | null }
type Page<T> = { pageInfo: PageInfo; nodes: T[] };
interface RawPr { number: number; url: string; merged: boolean; mergedAt: string | null; repository: { nameWithOwner: string } }
interface RawTicket { number: number; state: string; repository: { nameWithOwner: string }; closedByPullRequestsReferences: Page<RawPr> }
interface RawIssue {
  number: number; title: string; url: string; state: string; parent: { number: number } | null;
  subIssues: Page<RawTicket> & { totalCount: number };
}
interface RawMilestone { number: number; title: string; dueOn: string | null; issues: Page<RawIssue> }

function fail(what: string): never {
  throw new GitHubReadFailed(`Unexpected GitHub ${what}.`);
}

function page<T>(value: unknown, what: string): Page<T> {
  const raw = value as Page<T> | null | undefined;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.nodes) || !raw.pageInfo || typeof raw.pageInfo.hasNextPage !== "boolean") fail(what);
  return raw;
}

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A ticket's progress is verified only by a merged pull request, in one of
 * the configured repositories, that GitHub links as closing the ticket, and
 * only once the ticket itself is closed. A closed issue alone is not progress.
 */
export function verifiedMerges(ticket: { state: string; prs: RawPr[] }, repositories: readonly string[]): PrLinkV1[] {
  if (ticket.state !== "CLOSED") return [];
  return ticket.prs
    .filter((pr) => pr.merged === true && typeof pr.mergedAt === "string" && !Number.isNaN(Date.parse(pr.mergedAt)) &&
      repositories.some((repo) => sameRepo(repo, pr.repository.nameWithOwner)))
    .map((pr) => ({ ref: `${pr.repository.nameWithOwner}#${pr.number}`, url: pr.url, mergedAt: pr.mergedAt as string }));
}

/** One load's continuation budget and the back-off deadline it learned. */
class Traversal {
  calls = 0;
  /** The latest back-off deadline any read reported; the shared cache waits for it. */
  retryAt = 0;
  constructor(private readonly signal: AbortSignal) {}

  /** True while another continuation call is allowed. */
  get budgetLeft(): boolean { return this.calls < BOARD_LIMITS.continuationCalls && this.retryAt === 0; }

  /**
   * Run one supplementary or continuation read. Returns null for a GitHub
   * refusal or failed read a partial board survives; rethrows cancellation
   * and any other error.
   */
  async attempt<T>(read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if (this.signal.aborted) throw error;
      if (error instanceof GitHubRateLimited) {
        this.retryAt = Math.max(this.retryAt, error.retryAt);
        return null;
      }
      if (error instanceof GitHubReadFailed) return null;
      throw error;
    }
  }
}

/** Follow one connection's endCursor in bounded batches; every node obtained is kept. */
async function continueConnection<T>(
  traversal: Traversal, first: Page<T>, maxPages: number,
  next: (after: string) => Promise<Page<T>>,
): Promise<{ nodes: T[]; complete: boolean }> {
  const nodes = [...first.nodes];
  let info = first.pageInfo;
  for (let pages = 1; info.hasNextPage; pages += 1) {
    if (pages >= maxPages || !info.endCursor || !traversal.budgetLeft) return { nodes, complete: false };
    traversal.calls += 1;
    const after = info.endCursor;
    const result = await traversal.attempt(() => next(after));
    if (result === null) return { nodes, complete: false };
    nodes.push(...result.nodes);
    info = result.pageInfo;
  }
  return { nodes, complete: true };
}

async function readComments(reader: GitHubReader, repository: string, issue: number, signal: AbortSignal) {
  const comments: { authorLogin: string; body: string }[] = [];
  let url: string | null = `/repos/${repository}/issues/${issue}/comments?per_page=100`;
  for (let pageNumber = 0; url !== null; pageNumber += 1) {
    if (pageNumber === BOARD_LIMITS.commentPages) return null; // Unread pages: the status cannot be chosen honestly.
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

/** Merge times since `since`. Every page read is kept, even when a later page fails. */
async function readMerges(traversal: Traversal, reader: GitHubReader, repository: string, since: string, signal: AbortSignal) {
  const seen = new Map<string, string>();
  const known = () => [...seen].map(([ref, mergedAt]) => ({ ref, mergedAt }));
  let after: string | null = null;
  for (let pageNumber = 0; pageNumber < BOARD_LIMITS.mergePages; pageNumber += 1) {
    const cursor: string | null = after;
    const data = await traversal.attempt(() => reader.graphql(MERGES_QUERY, { search: `repo:${repository} is:pr is:merged merged:>=${since}`, after: cursor }, signal)) as {
      search?: { issueCount: number; pageInfo: PageInfo; nodes: Partial<RawPr>[] };
    } | null;
    if (data === null) return { complete: false, pullRequests: known() };
    const search = data.search ?? fail("merge search");
    for (const pr of search.nodes) {
      if (typeof pr.number !== "number" || typeof pr.mergedAt !== "string" || !pr.repository) continue;
      seen.set(`${pr.repository.nameWithOwner}#${pr.number}`, pr.mergedAt);
    }
    if (!search.pageInfo.hasNextPage) return { complete: seen.size >= search.issueCount, pullRequests: known() };
    if (!search.pageInfo.endCursor) break;
    after = search.pageInfo.endCursor;
  }
  return { complete: false, pullRequests: known() };
}

export interface BoardSource {
  reader: GitHubReader;
  repository: RepositoryRefV1;
  /** Every repository whose merged pull requests count as verified progress. */
  repositories: readonly RepositoryRefV1[];
  statusWriterLogin: string;
  now: () => number;
}

/**
 * Read one repository's board. The first query must succeed; every later read
 * that fails keeps what was already read, records a gap, and passes GitHub's
 * back-off deadline on to the shared cache.
 */
export async function loadBoard(source: BoardSource, signal: AbortSignal): Promise<LoadResult<BoardV1>> {
  const { reader, repository } = source;
  const [owner, name] = repository.split("/");
  const traversal = new Traversal(signal);
  const gaps: string[] = [];

  const raw = await reader.graphql(BOARD_QUERY, { owner, name, after: null }, signal) as { repository?: { milestones?: unknown } | null };
  if (!raw || typeof raw !== "object" || !("repository" in raw)) fail("board");
  if (raw.repository === null || raw.repository === undefined) throw new GitHubReadFailed(`${repository} is not readable with this token.`, 404);

  const milestones = await continueConnection<RawMilestone>(traversal, page(raw.repository.milestones, "milestones"), BOARD_LIMITS.milestonePages,
    async (after) => {
      const next = await reader.graphql(BOARD_QUERY, { owner, name, after }, signal) as { repository?: { milestones?: unknown } | null };
      return page<RawMilestone>(next?.repository?.milestones, "milestones");
    });
  if (!milestones.complete) gaps.push(`${repository}: not every open version was read; later ones are not shown.`);

  const versions: VersionV1[] = [];
  for (const milestone of milestones.nodes) {
    const issues = await continueConnection<RawIssue>(traversal, page(milestone.issues, "issues"), BOARD_LIMITS.issuePages,
      async (after) => {
        const next = await reader.graphql(ISSUES_QUERY, { owner, name, number: milestone.number, after }, signal) as { repository?: { milestone?: { issues?: unknown } | null } | null };
        return page<RawIssue>(next?.repository?.milestone?.issues, "issues");
      });
    if (!issues.complete) gaps.push(`${repository} ${milestone.title}: not every issue was read; some specs may be missing.`);

    const specs: SpecRowV1[] = [];
    for (const issue of issues.nodes) {
      if (issue.parent !== null || issue.subIssues.totalCount === 0) continue;
      const tickets = await continueConnection<RawTicket>(traversal, page(issue.subIssues, "sub-issues"), BOARD_LIMITS.subIssuePages,
        async (after) => {
          const next = await reader.graphql(SUB_ISSUES_QUERY, { owner, name, number: issue.number, after }, signal) as { repository?: { issue?: { subIssues?: unknown } | null } | null };
          return page<RawTicket>(next?.repository?.issue?.subIssues, "sub-issues");
        });
      let complete = tickets.complete;
      const pullRequests: PrLinkV1[] = [];
      let merged = 0;
      let linksComplete = true;
      for (const ticket of tickets.nodes) {
        // Closing pull requests, continued in the ticket's own repository.
        const [ticketOwner, ticketName] = ticket.repository.nameWithOwner.split("/");
        const prs = await continueConnection<RawPr>(traversal, page(ticket.closedByPullRequestsReferences, "closing pull requests"), BOARD_LIMITS.closingPrPages,
          async (after) => {
            const next = await reader.graphql(CLOSING_QUERY, { owner: ticketOwner, name: ticketName, number: ticket.number, after }, signal) as {
              repository?: { issue?: { closedByPullRequestsReferences?: unknown } | null } | null;
            };
            return page<RawPr>(next?.repository?.issue?.closedByPullRequestsReferences, "closing pull requests");
          });
        const verified = verifiedMerges({ state: ticket.state, prs: prs.nodes }, source.repositories);
        // Unread links can only hide a merge, never invent one.
        if (!prs.complete && verified.length === 0) complete = false;
        if (!prs.complete) linksComplete = false;
        if (verified.length > 0) merged += 1;
        pullRequests.push(...verified);
      }
      if (!complete) gaps.push(`${repository}#${issue.number}: some tickets or links were not read.`);
      else if (!linksComplete) gaps.push(`${repository}#${issue.number}: some pull request links were not read.`);

      // Status comment: supplementary. Its failure marks only this status unavailable.
      const comments = traversal.retryAt === 0
        ? await traversal.attempt(() => readComments(reader, repository, issue.number, signal))
        : null;
      const status: SpecStatusV1 = comments === null
        ? { status: "unavailable", reason: "missing", when: "Not estimated" }
        : readSpecStatus(comments, source.statusWriterLogin);
      if (comments === null) gaps.push(`${repository}#${issue.number}: its status could not be read.`);

      pullRequests.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
      specs.push({
        ref: `${repository}#${issue.number}` as SpecRefV1, title: issue.title, url: issue.url,
        state: issue.state === "CLOSED" ? "closed" : "open",
        total: issue.subIssues.totalCount, merged, complete, pullRequests, status,
      });
    }
    versions.push({ repository, number: milestone.number, title: milestone.title, dueOn: milestone.dueOn, complete: issues.complete, specs });
  }

  // Merge times: supplementary. Known times are kept; an incomplete read is never a count.
  const since = new Date(source.now() - MERGE_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
  const merges = traversal.retryAt === 0
    ? await readMerges(traversal, reader, repository, since, signal)
    : { complete: false, pullRequests: [] };
  if (!merges.complete) gaps.push(`${repository}: not every recent merge was read.`);
  if (traversal.retryAt > 0) gaps.push(`${repository}: GitHub asked us to wait; the rest of this read is pending.`);

  return {
    data: { repository, versions, merges: { since, ...merges } },
    complete: gaps.length === 0, gaps,
    ...(traversal.retryAt > 0 ? { retryAt: traversal.retryAt } : {}),
  };
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
      if (localDate(Date.parse(pr.mergedAt), timeZone) === today) refs.add(pr.ref.toLowerCase());
    }
  }
  return refs.size;
}

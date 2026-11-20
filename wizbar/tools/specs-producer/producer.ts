// The specs producer (openwizdev/WizPlugins#110): writes `.openwiz/specs.v1.json`
// under the bound factory home, in the format of specs-section.v1.md section 1,
// from GitHub's REST API through the local `gh` login. Node's standard library
// only; run it with Node 24 (`node producer.ts --home <dir> --repo <owner/name>`).
//
// It reads, per repository, the open issues (specs are those with sub-issues)
// and open pull requests, then each spec's sub-issues (its tickets). Every page
// is a conditional request with the ETag kept in a cache file beside the output,
// so an unchanged page costs nothing. A run makes at most 40 requests; a bigger
// scan resumes on the next run, and pages it did not reach keep their last data.
// The file is written whole (temp file, then rename) once every page has data;
// a failed read keeps the last file.
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface GitHubResponse { status: number; etag: string | null; next: string | null; body: unknown }
/** One REST read of `path` (relative to the API root), conditional when `etag` is not null. */
export type GitHubRequest = (path: string, etag: string | null) => Promise<GitHubResponse>;
/**
 * `ok` is false when any repository's read failed (`errors`, one per repository); the others still
 * refresh. `written` is false while no bound repository has finished a scan; the last file then stays.
 * `pending` counts pages with no data yet.
 */
export interface RunResult { ok: boolean; calls: number; specs: number; written: boolean; pending: number; errors: string[] }

export const OUTPUT = join(".openwiz", "specs.v1.json");
export const CACHE = join(".openwiz", "specs.v1.etags.json");
/** Requests per run, well under the ticket's 60: a bigger scan resumes on the next run. */
const BUDGET = 40;

type State = "done" | "building" | "review" | "needs-you" | "held" | "not-started";
interface Ticket { ticket: string; code: string | null; title: string; state: State; closedAt: string | null; pulls: number[] }
interface Spec { spec: string; shortName: string; url: string; fleetThreadId: null; tickets: Ticket[] }

/** The spec title after `spec: ` and before the next `: `, at most 40 characters. */
export function shortNameOf(title: string, number: number): string {
  const marker = title.search(/spec: /i);
  let name = marker < 0 ? title : title.slice(marker + "spec: ".length);
  const end = name.indexOf(": ");
  if (marker >= 0 && end >= 0) name = name.slice(0, end);
  name = name.trim();
  if (name.length === 0) return `#${number}`;
  const chars = [...name];
  return chars.length <= 40 ? name : `${chars.slice(0, 39).join("").trimEnd()}…`;
}

/** The `[A-Z]{1,3}[0-9]+` code just before the title's first `:`, without its version (`0.1.0 KN3: …` → `KN3`). */
export function ticketCodeOf(title: string): string | null {
  const colon = title.indexOf(":");
  if (colon < 0) return null;
  const head = title.slice(0, colon).trim().split(/\s+/).pop() ?? "";
  return /^[A-Z]{1,3}[0-9]+$/.test(head) ? head : null;
}

const closing = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/|([\w.-]+\/[\w.-]+)?#)([1-9][0-9]*)\b/gi;

/** Issue references a pull request body closes, as `owner/name#N` keys; `#N` is in the pull's repository. */
export function closedBy(body: string, repository: string): Set<string> {
  const keys = new Set<string>();
  for (const match of body.matchAll(closing)) {
    keys.add(`${(match[1] ?? match[2] ?? repository).toLowerCase()}#${match[3]}`);
  }
  return keys;
}

class ReadFailed extends Error {}

/** Only the fields a run reads, so the cache stays small: a pull's body keeps only its closing references. */
function slim(item: unknown): Record<string, unknown> {
  const raw = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
  const summary = raw.sub_issues_summary as { total?: unknown } | undefined;
  return {
    number: raw.number, title: raw.title, state: raw.state, state_reason: raw.state_reason, closed_at: raw.closed_at,
    labels: Array.isArray(raw.labels) ? raw.labels.map((l) => (typeof l === "string" ? l : (l as { name?: unknown })?.name)) : [],
    repository_url: raw.repository_url, sub_issues_summary: { total: summary?.total }, pull_request: raw.pull_request ? true : undefined,
    draft: raw.draft, body: typeof raw.body === "string" ? [...raw.body.matchAll(closing)].map((m) => m[0]).join("\n") : null,
  };
}

/** One cached page: its ETag and link, the slimmed items, the run that last read it and when (epoch ms). */
interface CacheEntry { etag: string; next: string | null; body: Record<string, unknown>[]; run: number; at: number }
/**
 * The cache file: the run counter and every page of the last scan. Each page's `run` orders the
 * scan: a run reads pages never read first, then the longest unread, so a scan bigger than one run's
 * budget continues where the last run stopped. `vanished` holds spec pages that answered 404, and
 * `listCursor` the next issue-list page each repository's re-read will read (#122 R5).
 */
interface Cache {
  version: 2; run: number; pages: Record<string, CacheEntry>; vanished: string[]; listCursor: Record<string, string>;
  /** Repositories whose scan has finished once: only they appear in the file (#122 R6). */
  complete: string[];
}

async function readCache(path: string): Promise<Cache> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<Cache> | null;
    // An older cache has no read times: it starts a new scan.
    if (parsed?.version === 2 && Number.isSafeInteger(parsed.run) && typeof parsed.pages === "object" && parsed.pages !== null) {
      const vanished = Array.isArray(parsed.vanished) ? parsed.vanished.filter((page) => typeof page === "string") : [];
      const cursor = typeof parsed.listCursor === "object" && parsed.listCursor !== null ? parsed.listCursor : {};
      const listCursor = Object.fromEntries(Object.entries(cursor).filter(([, page]) => typeof page === "string"));
      const complete = Array.isArray(parsed.complete) ? parsed.complete.filter((repository) => typeof repository === "string") : [];
      return { version: 2, run: parsed.run!, pages: parsed.pages, vanished, listCursor, complete };
    }
  } catch {
    // No cache, or an unreadable one: start a new scan.
  }
  return { version: 2, run: 0, pages: {}, vanished: [], listCursor: {}, complete: [] };
}

async function writeAtomically(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, text, "utf8");
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

class NotFound extends ReadFailed {}

/** One conditional read of a page into the cache. */
async function readPage(page: string, request: GitHubRequest, pages: Record<string, CacheEntry>, run: number, at: number): Promise<void> {
  const cached = pages[page];
  const response = await request(page, cached?.etag || null);
  if (response.status === 304 && cached) pages[page] = { ...cached, run, at };
  else if (response.status === 200) {
    if (!Array.isArray(response.body)) throw new ReadFailed(`GitHub answered something other than a list for ${page}`);
    pages[page] = { etag: response.etag ?? "", next: response.next, body: response.body.map(slim), run, at };
  } else if (response.status === 404) throw new NotFound(`GitHub answered 404 for ${page}`);
  else throw new ReadFailed(`GitHub answered ${response.status} for ${page}`);
}

/** The repository of a spec's sub-issues page, or null for any other page. */
const subIssuesRepository = (page: string) => /^repos\/([^/]+\/[^/]+)\/issues\/[0-9]+\/sub_issues\?/.exec(page)?.[1] ?? null;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const repositoryOf = (issue: Record<string, unknown>, fallback: string) =>
  text(issue.repository_url).replace(/^https:\/\/api\.github\.com\/repos\//, "") || fallback;
const labelsOf = (issue: Record<string, unknown>) => new Set((Array.isArray(issue.labels) ? issue.labels : []).map(text));

type PullIndex = Map<string, { number: number; draft: boolean }[]>;

function ticketOf(issue: Record<string, unknown>, repository: string, pulls: PullIndex): Ticket | null {
  const number = Number(issue.number);
  const key = `${repository}#${number}`;
  const title = text(issue.title).trim() || `#${number}`;
  const closed = issue.state === "closed";
  if (closed && issue.state_reason === "not_planned") return null;
  const labels = labelsOf(issue);
  const open = pulls.get(key.toLowerCase()) ?? [];
  let state: State = "not-started";
  if (closed) state = "done";
  else if (labels.has("ready-for-human")) state = "needs-you";
  else if (labels.has("held") || labels.has("needs-info")) state = "held";
  else if (open.some((p) => !p.draft)) state = "review";
  else if (open.length > 0) state = "building";
  const closedAt = closed && typeof issue.closed_at === "string" ? issue.closed_at.replace(/\.\d+Z$/, "Z") : null;
  return { ticket: key, code: ticketCodeOf(title), title, state, closedAt, pulls: open.map((p) => p.number).sort((a, b) => a - b) };
}

/**
 * `issueLists`: each repository's open-issues pages, following GitHub's own continuation links.
 * `owners`: the bound repository each page belongs to. `specs`: each repository's specs, leaving out
 * a spec whose sub-issues have a page with no data yet.
 */
interface Scan {
  order: string[]; missing: string[]; specs: Map<string, Spec[]>; issueLists: Map<string, string[]>; owners: Map<string, string>;
}

/**
 * The whole scan over the cached pages, in reading order: per repository its open issues and open
 * pulls, then each spec's sub-issues. `missing` lists the pages with no data yet.
 */
function scan(repositories: readonly string[], pages: Record<string, CacheEntry>, vanished: ReadonlySet<string> = new Set()): Scan {
  const order: string[] = [];
  const seen = new Set<string>();
  const missing: string[] = [];
  const issueLists = new Map<string, string[]>();
  const owners = new Map<string, string>();
  const list = (path: string, repository: string, chain: string[] = []) => {
    const items: Record<string, unknown>[] = [];
    let complete = true;
    for (let page: string | null = path; page !== null && !seen.has(page);) {
      seen.add(page);
      order.push(page);
      chain.push(page);
      owners.set(page, repository);
      const entry: CacheEntry | undefined = pages[page];
      if (!entry) { missing.push(page); complete = false; break; }
      items.push(...entry.body);
      page = entry.next;
    }
    return { items, complete };
  };
  const issues = new Map<string, Record<string, unknown>[]>();
  // Every bound repository's pulls first, keyed by the ticket's own repository and number, so a
  // ticket under a spec in another bound repository keeps its pulls (#122 R1).
  const pulls: PullIndex = new Map();
  for (const repository of repositories) {
    // Later pages' links name the repository by id (`repositories/<id>/issues?…`): keep the chain by repository.
    const chain: string[] = [];
    issueLists.set(repository, chain);
    issues.set(repository, list(`repos/${repository}/issues?state=open&per_page=100`, repository, chain).items);
    const own = `${repository.toLowerCase()}#`;
    for (const pull of list(`repos/${repository}/pulls?state=open&per_page=100`, repository).items) {
      for (const key of closedBy(text(pull.body), repository.toLowerCase())) {
        // Only pulls in the ticket's own repository count, so a pull number names one pull.
        if (key.startsWith(own)) pulls.set(key, [...(pulls.get(key) ?? []), { number: Number(pull.number), draft: pull.draft === true }]);
      }
    }
  }
  const specs = new Map<string, Spec[]>();
  for (const repository of repositories) {
    const own: Spec[] = [];
    specs.set(repository, own);
    for (const issue of issues.get(repository)!) {
      const summary = issue.sub_issues_summary as { total?: unknown } | undefined;
      if (issue.pull_request || typeof summary?.total !== "number" || summary.total <= 0) continue;
      const number = Number(issue.number);
      const subPath = `repos/${repository}/issues/${number}/sub_issues?per_page=100`;
      // A vanished page with no data yet cannot block the write: its spec waits for its list.
      if (vanished.has(subPath) && !pages[subPath]) { seen.add(subPath); order.push(subPath); owners.set(subPath, repository); continue; }
      const subIssues = list(subPath, repository);
      if (!subIssues.complete) continue;
      const tickets: Ticket[] = [];
      const ticketKeys = new Set<string>();
      const codes = new Set<string>();
      for (const sub of subIssues.items) {
        const ticket = ticketOf(sub, repositoryOf(sub, repository), pulls);
        if (!ticket || ticketKeys.has(ticket.ticket)) continue;
        ticketKeys.add(ticket.ticket);
        // A code twice in one spec would make the whole file malformed: the later one goes without.
        if (ticket.code !== null && codes.has(ticket.code)) ticket.code = null;
        if (ticket.code !== null) codes.add(ticket.code);
        tickets.push(ticket);
      }
      own.push({
        spec: `${repository}#${number}`, shortName: shortNameOf(text(issue.title), number),
        url: `https://github.com/${repository}/issues/${number}`, fleetThreadId: null, tickets,
      });
    }
  }
  return { order, missing, specs, issueLists, owners };
}

/**
 * One producer run of at most `BUDGET` requests. It reads pages never read first, then those read
 * longest ago, so a scan over the budget resumes on the next run while unreached pages keep their
 * last good data. Its `generatedAt` is the read time of the oldest page whose data is in the file, so
 * data that cannot be refreshed makes the file stale for WizBar instead of hiding behind the run's time.
 *
 * A spec's sub-issues page answering 404 is `vanished` (#122 R5) and never fails a run on its own:
 * its spec keeps its last data, and its repository's issue list is re-read from page one before
 * anything else, following GitHub's own links. A list longer than one run's budget resumes at the
 * saved `listCursor` on the next run. Once the re-read reaches the last page, a spec no longer listed
 * leaves the scan; one still listed is a failure of its repository.
 *
 * Repositories never block each other (#122 R6). A run first drops every cached page, cursor and
 * pending re-read of a repository no longer bound. A failed read stops only its own repository for the
 * run: its specs keep their last data (and age `generatedAt`), the others refresh and the file is
 * written. The file holds every bound repository that has finished a scan once, so a newly bound or
 * still-unreadable repository never holds back the others.
 */
export async function runOnce(options: { home: string; repositories: readonly string[]; request: GitHubRequest; now?: () => Date }): Promise<RunResult> {
  const { home, request } = options;
  const repositories = [...new Set(options.repositories)];
  const bound = new Set(repositories);
  const cachePath = join(home, CACHE);
  const cache = await readCache(cachePath);
  const run = cache.run + 1;
  const now = () => (options.now?.() ?? new Date()).getTime();
  const firstList = (repository: string) => `repos/${repository}/issues?state=open&per_page=100`;
  // Drop the state of repositories no longer bound: pages outside the bound scan, their re-reads and cursors.
  const pages: Record<string, CacheEntry> = {};
  for (const page of scan(repositories, cache.pages).order) if (cache.pages[page]) pages[page] = cache.pages[page]!;
  const vanished = new Set(cache.vanished.filter((page) => bound.has(subIssuesRepository(page) ?? "")));
  const cursors = new Map(Object.entries(cache.listCursor).filter(([repository]) => bound.has(repository)));
  const complete = new Set(cache.complete.filter((repository) => bound.has(repository)));
  for (const page of vanished) {
    const repository = subIssuesRepository(page)!;
    if (!cursors.has(repository)) cursors.set(repository, firstList(repository));
  }
  /** One error per repository that failed in this run; it reads nothing more this run. */
  const failed = new Map<string, string>();
  let calls = 0;
  /** Settles each vanished page whose repository's list re-read has finished. */
  const settle = (current: Scan) => {
    for (const page of vanished) {
      const repository = subIssuesRepository(page)!;
      if (cursors.has(repository)) continue;
      vanished.delete(page);
      // Still listed after a full re-read: a real 404. Its spec keeps its last data; the page is read again later.
      if (current.order.includes(page) && !failed.has(repository)) failed.set(repository, `GitHub answered 404 for ${page}`);
    }
  };
  while (calls < BUDGET) {
    const current = scan(repositories, pages, vanished);
    settle(current);
    const { order, missing, owners } = current;
    const live = (page: string) => !failed.has(owners.get(page) ?? "");
    // A list re-read in progress goes first; it continues where the last read stopped.
    const forced = [...cursors].find(([repository]) => !failed.has(repository))?.[1];
    const due = order.filter((page) => pages[page]?.run !== run && !vanished.has(page) && live(page));
    if (forced === undefined && due.length === 0) break;
    const absent = new Set(missing);
    const age = (page: string) => (absent.has(page) ? -1 : pages[page]!.run);
    const next = forced ?? due.reduce((best, page) => (age(page) < age(best) ? page : best));
    const owner = forced !== undefined ? [...cursors].find(([, page]) => page === forced)![0] : owners.get(next)!;
    calls += 1;
    try {
      await readPage(next, request, pages, run, now());
    } catch (error) {
      const repository = subIssuesRepository(next);
      if (error instanceof NotFound && repository !== null) {
        // A 404 alone never fails a run: only one after a full re-read of the list (settle) does.
        vanished.add(next);
        // The list must be read after this 404, from its first page: an earlier read does not settle it.
        cursors.set(repository, firstList(repository));
      } else {
        failed.set(owner, error instanceof Error ? error.message : String(error));
      }
      continue;
    }
    for (const [repository, page] of cursors) {
      if (page !== next) continue;
      const after = pages[next]!.next;
      if (after === null) cursors.delete(repository);
      else cursors.set(repository, after);
    }
  }
  const final = scan(repositories, pages, vanished);
  settle(final);
  const { order, missing, specs, owners } = final;
  for (const repository of repositories) {
    if (!missing.some((page) => owners.get(page) === repository)) complete.add(repository);
  }
  const included = repositories.filter((repository) => complete.has(repository));
  const kept = Object.fromEntries(order.filter((page) => pages[page]).map((page) => [page, pages[page]!]));
  let written = false;
  try {
    await mkdir(join(home, ".openwiz"), { recursive: true });
    if (included.length > 0) {
      const reads = order.filter((page) => pages[page] && included.includes(owners.get(page)!)).map((page) => pages[page]!.at);
      const generatedAt = new Date(Math.min(now(), ...reads)).toISOString().replace(/\.\d+Z$/, "Z");
      const file = { schema: "openwiz.specs.v1", generatedAt, specs: included.flatMap((repository) => specs.get(repository)!) };
      await writeAtomically(join(home, OUTPUT), `${JSON.stringify(file, null, 2)}\n`);
      written = true;
    }
    // Keep only the bound scan's pages, the vanished pages still waiting, each re-read's cursor and the complete repositories.
    const waiting = [...vanished].filter((page) => order.includes(page));
    const cacheFile: Cache = { version: 2, run, pages: kept, vanished: waiting, listCursor: Object.fromEntries(cursors), complete: [...complete] };
    await writeAtomically(cachePath, JSON.stringify(cacheFile));
  } catch (error) {
    failed.set("", error instanceof Error ? error.message : String(error));
  }
  const errors = [...failed.values()];
  const count = written ? included.reduce((sum, repository) => sum + specs.get(repository)!.length, 0) : 0;
  return { ok: errors.length === 0, calls, specs: count, written, pending: missing.length, errors };
}

/** The real request: `gh api --include`, which exits non-zero on a 304 but still prints the status line. */
export const ghRequest: GitHubRequest = (path, etag) => new Promise((resolve, reject) => {
  const args = ["api", "--include", "--method", "GET", path];
  if (etag) args.push("--header", `If-None-Match: ${etag}`);
  execFile("gh", args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
    const split = stdout.search(/\r?\n\r?\n/);
    const head = split < 0 ? stdout : stdout.slice(0, split);
    const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(head)?.[1]);
    if (!Number.isInteger(status)) { reject(error ?? new Error(`gh api printed no status for ${path}`)); return; }
    const header = (name: string) => new RegExp(`^${name}: (.*)$`, "im").exec(head)?.[1]?.trim() ?? null;
    const nextUrl = /<([^>]+)>;\s*rel="next"/.exec(header("link") ?? "")?.[1] ?? null;
    let body: unknown = null;
    if (status === 200) {
      try { body = JSON.parse(stdout.slice(split).trim()); } catch { reject(new Error(`gh api printed no JSON for ${path}`)); return; }
    }
    resolve({ status, etag: header("etag"), next: nextUrl ? nextUrl.replace(/^https:\/\/api\.github\.com\//, "") : null, body });
  });
});

function usage(): never {
  process.stderr.write("usage: node producer.ts --home <factory home> --repo <owner/name> [--repo <owner/name> ...]\n");
  process.exit(2);
}

async function main(argv: readonly string[]): Promise<void> {
  let home: string | null = null;
  const repositories: string[] = [];
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined) usage();
    if (argv[i] === "--home") home = value;
    else if (argv[i] === "--repo" && /^[\w.-]+\/[\w.-]+$/.test(value)) repositories.push(value);
    else usage();
  }
  if (home === null || repositories.length === 0) usage();
  const result = await runOnce({ home, repositories, request: ghRequest });
  if (result.written) process.stdout.write(`wrote ${join(home, OUTPUT)}: ${result.specs} specs, ${result.calls} requests\n`);
  else process.stdout.write(`kept the last file: ${result.pending} pages left, ${result.calls} requests\n`);
  for (const error of result.errors) process.stderr.write(`failed: ${error}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

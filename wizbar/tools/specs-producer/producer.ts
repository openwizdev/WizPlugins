// The specs producer (openwizdev/WizPlugins#110): writes `.openwiz/specs.v1.json`
// under the bound factory home, in the format of specs-section.v1.md section 1
// (schema `openwiz.specs.v2` since #162: v1 plus the `yours-later` state),
// from GitHub's REST API through the local `gh` login. Node's standard library
// only; run it with Node 24 (`node producer.ts --home <dir> --repo <owner/name> [--gh <path>]`).
//
// Each run is one complete scan (the #110 decision after review R7): per
// repository the open issues (specs are those with sub-issues) and open pull
// requests, then each spec's sub-issues (its tickets). Every page is a
// conditional request with the ETag and body of the last run kept in a cache file
// beside the output, so an unchanged page costs nothing. A run makes at most 59
// requests. Any failed read, or a scan that would need more, writes nothing: the
// last file stays and the run exits 1 naming the reason. Otherwise the file is
// written whole (temp file, then rename) with `generatedAt` the run's time.
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface GitHubResponse { status: number; etag: string | null; next: string | null; body: unknown }
/** One REST read of `path` (relative to the API root), conditional when `etag` is not null. */
export type GitHubRequest = (path: string, etag: string | null) => Promise<GitHubResponse>;
/** A run either wrote the whole file, or wrote nothing and says why. */
/** `unchanged`: requests GitHub answered 304. They count toward `BUDGET`, not toward GitHub's rate limit. */
export type RunResult = { ok: true; calls: number; specs: number; unchanged: number } | { ok: false; calls: number; error: string };

export const OUTPUT = join(".openwiz", "specs.v1.json");
export const CACHE = join(".openwiz", "specs.v1.etags.json");
/** Requests per run (the ticket's "under 60"). A scan that needs more fails loudly. */
export const BUDGET = 59;

type State = "done" | "building" | "review" | "needs-you" | "yours-later" | "held" | "not-started";
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
  const dependencies = raw.issue_dependencies_summary as { blocked_by?: unknown } | undefined;
  return {
    number: raw.number, title: raw.title, state: raw.state, state_reason: raw.state_reason, closed_at: raw.closed_at,
    labels: Array.isArray(raw.labels) ? raw.labels.map((l) => (typeof l === "string" ? l : (l as { name?: unknown })?.name)) : [],
    repository_url: raw.repository_url, sub_issues_summary: { total: summary?.total },
    issue_dependencies_summary: { blocked_by: dependencies?.blocked_by }, pull_request: raw.pull_request ? true : undefined,
    draft: raw.draft, body: typeof raw.body === "string" ? [...raw.body.matchAll(closing)].map((m) => m[0]).join("\n") : null,
  };
}

/** One cached page from the last successful run: its ETag, link and slimmed items. */
interface CacheEntry { etag: string; next: string | null; body: Record<string, unknown>[] }
/** The cache file: exactly the pages of the last successful scan, so an unbound repository leaves no trace. */
interface Cache { version: 4; pages: Record<string, CacheEntry> }

async function readCache(path: string): Promise<Record<string, CacheEntry>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<Cache> | null;
    // An older cache format starts again with unconditional reads (version 3 kept no blockers, #162).
    if (parsed?.version === 4 && typeof parsed.pages === "object" && parsed.pages !== null) return parsed.pages;
  } catch {
    // No cache, or an unreadable one.
  }
  return {};
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

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const repositoryOf = (issue: Record<string, unknown>, fallback: string) =>
  text(issue.repository_url).replace(/^https:\/\/api\.github\.com\/repos\//, "") || fallback;
const labelsOf = (issue: Record<string, unknown>) => new Set((Array.isArray(issue.labels) ? issue.labels : []).map(text));

/** Open blockers from the sub-issues answer's own `issue_dependencies_summary` (#162), so no extra request. */
function openBlockers(issue: Record<string, unknown>): number {
  const count = (issue.issue_dependencies_summary as { blocked_by?: unknown } | undefined)?.blocked_by;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

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
  // The owner's ticket is due now unless the record names an open blocker (#162); a title is never read for it.
  else if (labels.has("ready-for-human")) state = openBlockers(issue) > 0 ? "yours-later" : "needs-you";
  else if (labels.has("held") || labels.has("needs-info")) state = "held";
  else if (open.some((p) => !p.draft)) state = "review";
  else if (open.length > 0) state = "building";
  const closedAt = closed && typeof issue.closed_at === "string" ? issue.closed_at.replace(/\.\d+Z$/, "Z") : null;
  return { ticket: key, code: ticketCodeOf(title), title, state, closedAt, pulls: open.map((p) => p.number).sort((a, b) => a - b) };
}

/** One run's reads: every page through `request`, conditional on the last run's ETag, counted against the budget. */
class Reader {
  calls = 0;
  unchanged = 0;
  readonly pages: Record<string, CacheEntry> = {};
  readonly request: GitHubRequest;
  readonly cached: Record<string, CacheEntry>;
  constructor(request: GitHubRequest, cached: Record<string, CacheEntry>) {
    this.request = request;
    this.cached = cached;
  }

  /** Every page of a list endpoint, following GitHub's own links; a 304 reuses the cached page. */
  async list(path: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    for (let page: string | null = path; page !== null;) {
      if (this.calls >= BUDGET) throw new ReadFailed(`the scan needs more than ${BUDGET} requests`);
      if (this.pages[page]) throw new ReadFailed(`GitHub linked ${page} twice`);
      this.calls += 1;
      const cached = this.cached[page];
      const response = await this.request(page, cached?.etag || null);
      let entry: CacheEntry;
      if (response.status === 304 && cached) { entry = cached; this.unchanged += 1; }
      else if (response.status === 200) {
        if (!Array.isArray(response.body)) throw new ReadFailed(`GitHub answered something other than a list for ${page}`);
        entry = { etag: response.etag ?? "", next: response.next, body: response.body.map(slim) };
      } else throw new ReadFailed(`GitHub answered ${response.status} for ${page}`);
      this.pages[page] = entry;
      items.push(...entry.body);
      page = entry.next;
    }
    return items;
  }
}

/**
 * One producer run: a complete scan of the bound repositories, or nothing. Any failed read, or a scan
 * that would pass `BUDGET` requests, writes nothing (the last file and cache stay). A ticket in another
 * bound repository than its spec takes the pulls of its own repository (#122 R1).
 */
export async function runOnce(options: { home: string; repositories: readonly string[]; request: GitHubRequest; now?: () => Date }): Promise<RunResult> {
  const repositories = [...new Set(options.repositories)];
  const cachePath = join(options.home, CACHE);
  const reader = new Reader(options.request, await readCache(cachePath));
  try {
    const issues = new Map<string, Record<string, unknown>[]>();
    const pulls: PullIndex = new Map();
    for (const repository of repositories) {
      issues.set(repository, await reader.list(`repos/${repository}/issues?state=open&per_page=100`));
      const own = `${repository.toLowerCase()}#`;
      for (const pull of await reader.list(`repos/${repository}/pulls?state=open&per_page=100`)) {
        for (const key of closedBy(text(pull.body), repository.toLowerCase())) {
          // Only pulls in the ticket's own repository count, so a pull number names one pull.
          if (key.startsWith(own)) pulls.set(key, [...(pulls.get(key) ?? []), { number: Number(pull.number), draft: pull.draft === true }]);
        }
      }
    }
    const specs: Spec[] = [];
    for (const repository of repositories) {
      for (const issue of issues.get(repository)!) {
        const summary = issue.sub_issues_summary as { total?: unknown } | undefined;
        if (issue.pull_request || typeof summary?.total !== "number" || summary.total <= 0) continue;
        const number = Number(issue.number);
        const tickets: Ticket[] = [];
        const ticketKeys = new Set<string>();
        const codes = new Set<string>();
        for (const sub of await reader.list(`repos/${repository}/issues/${number}/sub_issues?per_page=100`)) {
          const ticket = ticketOf(sub, repositoryOf(sub, repository), pulls);
          if (!ticket || ticketKeys.has(ticket.ticket)) continue;
          ticketKeys.add(ticket.ticket);
          // A code twice in one spec would make the whole file malformed: the later one goes without.
          if (ticket.code !== null && codes.has(ticket.code)) ticket.code = null;
          if (ticket.code !== null) codes.add(ticket.code);
          tickets.push(ticket);
        }
        specs.push({
          spec: `${repository}#${number}`, shortName: shortNameOf(text(issue.title), number),
          url: `https://github.com/${repository}/issues/${number}`, fleetThreadId: null, tickets,
        });
      }
    }
    const generatedAt = (options.now?.() ?? new Date()).toISOString().replace(/\.\d+Z$/, "Z");
    await mkdir(join(options.home, ".openwiz"), { recursive: true });
    await writeAtomically(join(options.home, OUTPUT), `${JSON.stringify({ schema: "openwiz.specs.v2", generatedAt, specs }, null, 2)}\n`);
    await writeAtomically(cachePath, JSON.stringify({ version: 4, pages: reader.pages } satisfies Cache));
    return { ok: true, calls: reader.calls, specs: specs.length, unchanged: reader.unchanged };
  } catch (error) {
    return { ok: false, calls: reader.calls, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The real request through the `gh` at `gh` (a path, or a name looked up on PATH): `gh api --include`,
 * which exits non-zero on a 304 but still prints the status line. A systemd user service's PATH
 * (`/usr/local/bin:/usr/bin`) often lacks `gh`'s folder (#153), so a missing `gh` says how to fix it.
 */
export const ghRequest = (gh = "gh"): GitHubRequest => (path, etag) => new Promise((resolve, reject) => {
  const args = ["api", "--include", "--method", "GET", path];
  if (etag) args.push("--header", `If-None-Match: ${etag}`);
  execFile(gh, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") {
      reject(new Error(`gh not found (${gh}): put gh's folder on PATH (find it with \`command -v gh\`), or pass --gh <path>`));
      return;
    }
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
  process.stderr.write("usage: node producer.ts --home <factory home> --repo <owner/name> [--repo <owner/name> ...] [--gh <path to gh>]\n");
  process.exit(2);
}

async function main(argv: readonly string[]): Promise<void> {
  let home: string | null = null;
  let gh = "gh";
  const repositories: string[] = [];
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined) usage();
    if (argv[i] === "--home") home = value;
    else if (argv[i] === "--gh" && value !== "") gh = value;
    else if (argv[i] === "--repo" && /^[\w.-]+\/[\w.-]+$/.test(value)) repositories.push(value);
    else usage();
  }
  if (home === null || repositories.length === 0) usage();
  const result = await runOnce({ home, repositories, request: ghRequest(gh) });
  if (result.ok) process.stdout.write(`wrote ${join(home, OUTPUT)}: ${result.specs} specs, ${result.calls} requests (${result.unchanged} unchanged)\n`);
  else process.stderr.write(`kept the last file: ${result.error} (${result.calls} requests)\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

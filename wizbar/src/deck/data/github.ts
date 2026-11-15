// The thin, read-only GitHub reader behind WizDeck's shared cache (D1, #73).
// It runs only on the plugin backend: the token never reaches a panel. It
// exposes GET and GraphQL reads only; there is no mutation method at all.

export type Fetch = (url: string, init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal?: AbortSignal }) =>
  Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

/** GitHub refused for rate reasons; nothing may be fetched again before `retryAt` (epoch ms). */
export class GitHubRateLimited extends Error {
  constructor(readonly retryAt: number) {
    super("GitHub rate limit: waiting before the next read.");
    this.name = "GitHubRateLimited";
  }
}

/** Any other failed read (network, auth, 5xx, unexpected shape). */
export class GitHubReadFailed extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "GitHubReadFailed";
  }
}

export interface RestPage {
  data: unknown;
  /** The `rel="next"` URL, when GitHub reports more pages. */
  next: string | null;
}

const API = "https://api.github.com";
/** Without a reset header GitHub's documented minimum back-off for a secondary limit. */
const DEFAULT_BACKOFF_MS = 60_000;

/**
 * Reads GitHub for one account. Keeps ETags (and the last body) per URL so a
 * repeat REST read is conditional; a 304 costs no rate budget. One shared
 * back-off deadline stops every read until GitHub's reset or Retry-After.
 */
export class GitHubReader {
  private readonly etags = new Map<string, { etag: string; page: RestPage }>();
  private blockedUntil = 0;

  constructor(
    private readonly fetch: Fetch,
    private readonly token: string | null,
    private readonly now: () => number = Date.now,
  ) {}

  get authenticated(): boolean { return this.token !== null; }

  /** Epoch ms before which no read is attempted, or 0. */
  get retryAt(): number { return this.blockedUntil > this.now() ? this.blockedUntil : 0; }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  private guard(): void {
    if (this.blockedUntil > this.now()) throw new GitHubRateLimited(this.blockedUntil);
  }

  /** Records GitHub's back-off instruction and throws, or returns for a usable response. */
  private checkRate(response: Awaited<ReturnType<Fetch>>): void {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const retryAfter = Number(response.headers.get("retry-after"));
    const limited = response.status === 429 ||
      (response.status === 403 && (remaining === "0" || Number.isFinite(retryAfter) && response.headers.get("retry-after") !== null));
    if (limited) {
      const now = this.now();
      let until = now + DEFAULT_BACKOFF_MS;
      if (response.headers.get("retry-after") !== null && Number.isFinite(retryAfter)) until = now + retryAfter * 1000;
      else if (remaining === "0" && Number.isFinite(reset) && reset > 0) until = Math.max(until, reset * 1000);
      this.blockedUntil = Math.max(this.blockedUntil, until);
      throw new GitHubRateLimited(this.blockedUntil);
    }
    // The budget is spent: let this response through, but read nothing more until reset.
    if (remaining === "0" && Number.isFinite(reset) && reset * 1000 > this.now()) {
      this.blockedUntil = Math.max(this.blockedUntil, reset * 1000);
    }
  }

  /** One conditional REST GET. A 304 returns the stored page. */
  async get(pathOrUrl: string, signal?: AbortSignal): Promise<RestPage> {
    this.guard();
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${API}${pathOrUrl}`;
    if (!url.startsWith(`${API}/`)) throw new GitHubReadFailed("Refused a non-GitHub URL.");
    const stored = this.etags.get(url);
    let response: Awaited<ReturnType<Fetch>>;
    try {
      response = await this.fetch(url, { method: "GET", headers: this.headers(stored ? { "if-none-match": stored.etag } : {}), signal });
    } catch (error) {
      throw new GitHubReadFailed(error instanceof Error ? error.message : "Network error.");
    }
    this.checkRate(response);
    if (response.status === 304 && stored) return stored.page;
    if (response.status !== 200) throw new GitHubReadFailed(`GitHub answered ${response.status}.`, response.status);
    const page: RestPage = { data: await response.json(), next: nextLink(response.headers.get("link")) };
    const etag = response.headers.get("etag");
    if (etag) this.etags.set(url, { etag, page });
    return page;
  }

  /** One GraphQL read. The query text is fixed by the caller; this class never sends a mutation. */
  async graphql(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (/^\s*mutation\b/.test(query)) throw new GitHubReadFailed("Refused a GraphQL mutation.");
    if (!this.token) throw new GitHubReadFailed("GraphQL needs a GitHub token.", 401);
    this.guard();
    let response: Awaited<ReturnType<Fetch>>;
    try {
      response = await this.fetch(`${API}/graphql`, {
        method: "POST", headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ query, variables }), signal,
      });
    } catch (error) {
      throw new GitHubReadFailed(error instanceof Error ? error.message : "Network error.");
    }
    this.checkRate(response);
    if (response.status !== 200) throw new GitHubReadFailed(`GitHub answered ${response.status}.`, response.status);
    const body = await response.json() as { data?: unknown; errors?: { type?: string }[] };
    if (body.errors?.some((error) => error.type === "RATE_LIMITED")) {
      this.blockedUntil = Math.max(this.blockedUntil, this.now() + DEFAULT_BACKOFF_MS);
      throw new GitHubRateLimited(this.blockedUntil);
    }
    if (body.errors?.length || body.data === undefined || body.data === null) throw new GitHubReadFailed("GitHub GraphQL returned errors.");
    return body.data;
  }
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match) return match[1];
  }
  return null;
}

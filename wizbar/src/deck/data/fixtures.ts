// Synthetic D1 fixtures: an in-memory GitHub at the fetch boundary and an
// invented factory. Every owner, repository, host, path and id is made up.
import type { Fetch } from "./github";

export const dxNow = Date.parse("2026-11-15T20:30:00Z");

export const dxFactory = {
  projectKey: "sample-factory",
  cloudroomProjectId: "prj_d1_sample",
  repositories: ["example-org/sample-app"],
  home: { hostId: "host_d1_sample", rootPath: "/synthetic/home" },
  orchestratorThreadId: "thr_d1_orchestrator",
  statusWriterLogin: "sample-manager",
};
export const dxOtherFactory = {
  ...dxFactory,
  projectKey: "other-factory", cloudroomProjectId: "prj_d1_other",
  repositories: ["example-org/other-app"],
  home: { hostId: "host_d1_other", rootPath: "/synthetic/other" },
};
export const dxSettings = (factories: unknown[] = [dxFactory], token: string | null = "synthetic-token") => ({
  wizdeckFactories: JSON.stringify(factories),
  ...(token ? { wizdeckGithubToken: token } : {}),
});

const pr = (repo: string, number: number, mergedAt: string | null, merged = mergedAt !== null) =>
  ({ number, url: `https://github.com/${repo}/pull/${number}`, merged, mergedAt, repository: { nameWithOwner: repo } });
const ticket = (repo: string, number: number, state: "OPEN" | "CLOSED", prs: unknown[], more = false) =>
  ({ number, state, repository: { nameWithOwner: repo }, closedByPullRequestsReferences: { pageInfo: { hasNextPage: more }, nodes: prs } });

/** One repository's board: a version with one spec of four tickets. */
export function dxBoard(repo = "example-org/sample-app", options: { specTitle?: string; subIssuesMore?: boolean } = {}) {
  return {
    repository: {
      milestones: {
        pageInfo: { hasNextPage: false },
        nodes: [{
          number: 3, title: "1.4", dueOn: null,
          issues: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                number: 41, title: options.specTitle ?? "Search filters", url: `https://github.com/${repo}/issues/41`, state: "OPEN", parent: null,
                subIssues: {
                  totalCount: 4, pageInfo: { hasNextPage: options.subIssuesMore ?? false },
                  nodes: [
                    // Verified: closed by a merged PR in a configured repository.
                    ticket(repo, 42, "CLOSED", [pr(repo, 52, "2026-11-15T09:00:00Z")]),
                    // Closed without a merged PR: never progress.
                    ticket(repo, 43, "CLOSED", [pr(repo, 53, null, false)]),
                    // Closed by a merged PR in a repository that is not configured.
                    ticket(repo, 44, "CLOSED", [pr("example-org/unrelated", 9, "2026-11-15T10:00:00Z")]),
                    // Open, its PR merged but the ticket not closed yet.
                    ticket(repo, 45, "OPEN", [pr(repo, 55, "2026-11-15T11:00:00Z")]),
                  ],
                },
              },
              // A ticket, not a spec: it has a parent.
              { number: 42, title: "T1", url: `https://github.com/${repo}/issues/42`, state: "CLOSED", parent: { number: 41 }, subIssues: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] } },
            ],
          },
        }],
      },
    },
  };
}

/** Merged PRs around the UTC day boundary: 2026-11-15 20:30Z is already the 16th in Kiritimati (+14). */
export const dxMerges = [
  { number: 52, mergedAt: "2026-11-15T09:00:00Z" },
  { number: 56, mergedAt: "2026-11-15T10:30:00Z" },
  { number: 57, mergedAt: "2026-11-15T19:00:00Z" },
];

export const dxStatusComment = {
  user: { login: "sample-manager" },
  body: "<!-- openwiz:spec-status:v1 -->\nNow: Building T2\nNext: Review T2\nWhen: Today ~16:00 UTC\nUpdated: 2026-11-15T20:00:00Z",
};

export interface FakeGitHubCall { method: string; url: string; kind: "board" | "merges" | "comments" | "other"; conditional: boolean; body?: string }

/**
 * An in-memory GitHub. `respond` can be replaced per test to inject a rate
 * limit or a failure. Records every call, so a test counts real fetches.
 */
export function fakeGitHub() {
  const calls: FakeGitHubCall[] = [];
  const state = {
    boards: new Map<string, unknown>([["example-org/sample-app", dxBoard()], ["example-org/other-app", dxBoard("example-org/other-app", { specTitle: "Other spec" })]]),
    merges: new Map<string, { number: number; mergedAt: string }[]>([["example-org/sample-app", dxMerges], ["example-org/other-app", []]]),
    mergesIssueCount: null as number | null,
    comments: [dxStatusComment] as unknown[],
    etag: "\"etag-1\"",
    /** Return a response to override the default, or null to continue. */
    override: null as null | ((call: FakeGitHubCall) => { status: number; headers?: Record<string, string>; body?: unknown } | null),
  };
  const response = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => JSON.parse(JSON.stringify(body)),
  });
  const fetch: Fetch = async (url, init) => {
    const body = init.body;
    const kind: FakeGitHubCall["kind"] = url.endsWith("/graphql") ? (body?.includes("WizDeckBoard") ? "board" : "merges")
      : url.includes("/comments") ? "comments" : "other";
    const call: FakeGitHubCall = { method: init.method, url, kind, conditional: "if-none-match" in init.headers, body };
    calls.push(call);
    const forced = state.override?.(call);
    if (forced) return response(forced.status, forced.body ?? {}, forced.headers);
    if (kind === "comments") {
      if (init.headers["if-none-match"] === state.etag) return response(304, null, { etag: state.etag });
      return response(200, state.comments, { etag: state.etag });
    }
    if (kind === "board") {
      const { owner, name } = JSON.parse(body!).variables;
      return response(200, { data: state.boards.get(`${owner}/${name}`) ?? { repository: null } });
    }
    if (kind === "merges") {
      const search = JSON.parse(body!).variables.search as string;
      const repo = /repo:(\S+)/.exec(search)![1];
      const nodes = (state.merges.get(repo) ?? []).map((m) => pr(repo, m.number, m.mergedAt));
      return response(200, { data: { search: { issueCount: state.mergesIssueCount ?? nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes } } });
    }
    return response(404, {});
  };
  return { fetch, calls, state };
}

export const dxQueue = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  schema: "openwiz.needs-you.v1", project: "sample-factory", revision: 2,
  updatedAt: "2026-11-15T20:20:00Z", expiresAt: "2026-11-15T21:00:00Z", complete: true, gaps: [],
  items: [{
    id: "n12", code: "N-12", question: "Which changelog headline ships?",
    options: [{ id: "short", label: "Short headline" }, { id: "long", label: "Long headline" }],
    recommendedOptionId: "short", sourceUrl: "https://example.com/sample/n12", spec: "example-org/sample-app#41",
    risk: "ordinary", fingerprint: "fp-n12-1", createdAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T20:00:00Z",
  }],
  ...overrides,
});

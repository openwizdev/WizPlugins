// Synthetic D1 fixtures: an in-memory, paginating GitHub at the fetch boundary
// and an invented factory. Every owner, repository, host, path and id is made up.
import { BOARD_LIMITS } from "./board";
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

// ---- The model the fake serves -------------------------------------------

export interface ModelPr { number: number; repo: string; mergedAt: string | null; merged?: boolean }
export interface ModelTicket { number: number; repo: string; state: "OPEN" | "CLOSED"; prs: ModelPr[] }
export interface ModelIssue { number: number; title: string; state: "OPEN" | "CLOSED"; parent: number | null; tickets: ModelTicket[] }
export interface ModelMilestone { number: number; title: string; issues: ModelIssue[] }

const pr = (repo: string, number: number, mergedAt: string | null, merged = mergedAt !== null): ModelPr => ({ number, repo, mergedAt, merged });

/** One repository's plan: version 1.4 with one spec of four tickets. */
export function dxModel(repo = "example-org/sample-app", specTitle = "Search filters"): ModelMilestone[] {
  return [{
    number: 3, title: "1.4",
    issues: [
      {
        number: 41, title: specTitle, state: "OPEN", parent: null,
        tickets: [
          // Verified: closed by a merged PR in a configured repository.
          { number: 42, repo, state: "CLOSED", prs: [pr(repo, 52, "2026-11-15T09:00:00Z")] },
          // Closed without a merged PR: never progress.
          { number: 43, repo, state: "CLOSED", prs: [pr(repo, 53, null, false)] },
          // Closed by a merged PR in a repository that is not configured.
          { number: 44, repo, state: "CLOSED", prs: [pr("example-org/unrelated", 9, "2026-11-15T10:00:00Z")] },
          // Open, its PR merged but the ticket not closed yet.
          { number: 45, repo, state: "OPEN", prs: [pr(repo, 55, "2026-11-15T11:00:00Z")] },
        ],
      },
      // A ticket, not a spec: it has a parent.
      { number: 42, title: "T1", state: "CLOSED", parent: 41, tickets: [] },
    ],
  }];
}

/** Plain issues with no sub-issues (tickets elsewhere), to fill a first page. */
export const dxFillerIssues = (count: number, from = 1000): ModelIssue[] =>
  Array.from({ length: count }, (_, i) => ({ number: from + i, title: `Filler ${i}`, state: "OPEN" as const, parent: 999, tickets: [] }));

/** Merged PRs around the UTC day boundary: 2026-11-15 20:30Z is already the 16th in Tokyo. */
export const dxMerges = [
  { number: 52, mergedAt: "2026-11-15T09:00:00Z" },
  { number: 56, mergedAt: "2026-11-15T10:30:00Z" },
  { number: 57, mergedAt: "2026-11-15T19:00:00Z" },
];

export const dxStatusComment = {
  user: { login: "sample-manager" },
  body: "<!-- openwiz:spec-status:v1 -->\nNow: Building T2\nNext: Review T2\nWhen: Today ~16:00 UTC\nUpdated: 2026-11-15T20:00:00Z",
};

export type FakeKind = "board" | "issues" | "subIssues" | "closing" | "merges" | "comments" | "other";
export interface FakeGitHubCall { method: string; url: string; kind: FakeKind; conditional: boolean; body?: string; variables?: Record<string, unknown> }

/** Serve a list as one GraphQL connection page, honouring `first` and the `after` cursor. */
function connection<T, R>(items: T[], first: number, after: unknown, render: (item: T) => R) {
  const start = typeof after === "string" ? Number(after.slice(1)) + 1 : 0;
  const slice = items.slice(start, start + first);
  const end = start + slice.length - 1;
  return { pageInfo: { hasNextPage: start + first < items.length, endCursor: slice.length ? `c${end}` : null }, nodes: slice.map(render) };
}

/**
 * An in-memory GitHub. `override` can force any call's response (a rate
 * limit, a failure). Records every call, so a test counts real fetches.
 */
export function fakeGitHub() {
  const calls: FakeGitHubCall[] = [];
  const state = {
    repos: new Map<string, ModelMilestone[]>([["example-org/sample-app", dxModel()], ["example-org/other-app", dxModel("example-org/other-app", "Other spec")]]),
    merges: new Map<string, { number: number; mergedAt: string }[]>([["example-org/sample-app", dxMerges], ["example-org/other-app", []]]),
    mergesIssueCount: null as number | null,
    comments: [dxStatusComment] as unknown[],
    etag: "\"etag-1\"",
    override: null as null | ((call: FakeGitHubCall) => { status: number; headers?: Record<string, string>; body?: unknown } | null),
  };
  const response = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => JSON.parse(JSON.stringify(body)),
  });
  const renderPr = (p: ModelPr) => ({ number: p.number, url: `https://github.com/${p.repo}/pull/${p.number}`, merged: p.merged ?? p.mergedAt !== null, mergedAt: p.mergedAt, repository: { nameWithOwner: p.repo } });
  const renderTicket = (t: ModelTicket) => ({
    number: t.number, state: t.state, repository: { nameWithOwner: t.repo },
    closedByPullRequestsReferences: connection(t.prs, BOARD_LIMITS.closingPrs, null, renderPr),
  });
  const renderIssue = (repo: string) => (i: ModelIssue) => ({
    number: i.number, title: i.title, url: `https://github.com/${repo}/issues/${i.number}`, state: i.state,
    parent: i.parent === null ? null : { number: i.parent },
    subIssues: { totalCount: i.tickets.length, ...connection(i.tickets, BOARD_LIMITS.subIssues, null, renderTicket) },
  });
  const findIssue = (repo: string, number: number) => {
    for (const milestone of state.repos.get(repo) ?? []) for (const issue of milestone.issues) if (issue.number === number) return issue;
    return null;
  };
  const findTicket = (repo: string, number: number) => {
    for (const milestone of state.repos.get(repo) ?? []) for (const issue of milestone.issues) for (const ticket of issue.tickets) {
      if (ticket.repo === repo && ticket.number === number) return ticket;
    }
    return null;
  };

  const fetch: Fetch = async (url, init) => {
    const body = init.body;
    const parsed = body ? JSON.parse(body) as { query: string; variables: Record<string, any> } : null;
    const operation = parsed ? /query (WizDeck\w+)/.exec(parsed.query)?.[1] : undefined;
    const kind: FakeKind = url.endsWith("/graphql")
      ? (({ WizDeckBoard: "board", WizDeckIssues: "issues", WizDeckSubIssues: "subIssues", WizDeckClosing: "closing", WizDeckMerges: "merges" }) as Record<string, FakeKind>)[operation ?? ""] ?? "other"
      : url.includes("/comments") ? "comments" : "other";
    const call: FakeGitHubCall = { method: init.method, url, kind, conditional: "if-none-match" in init.headers, body, variables: parsed?.variables };
    calls.push(call);
    const forced = state.override?.(call);
    if (forced) return response(forced.status, forced.body ?? {}, forced.headers);
    const v = parsed?.variables ?? {};
    const repo = `${v.owner}/${v.name}`;
    switch (kind) {
      case "comments": {
        const perPage = Number(new URL(url).searchParams.get("per_page") ?? 30);
        const pageNumber = Number(new URL(url).searchParams.get("page") ?? 1);
        const slice = state.comments.slice((pageNumber - 1) * perPage, pageNumber * perPage);
        const more = pageNumber * perPage < state.comments.length;
        const next = new URL(url); next.searchParams.set("page", String(pageNumber + 1));
        const headers: Record<string, string> = { etag: `${state.etag.slice(0, -1)}-${pageNumber}"` };
        if (more) headers.link = `<${next.toString()}>; rel="next"`;
        if (init.headers["if-none-match"] === headers.etag) return response(304, null, headers);
        return response(200, slice, headers);
      }
      case "board": {
        const milestones = state.repos.get(repo);
        if (!milestones) return response(200, { data: { repository: null } });
        return response(200, { data: { repository: { milestones: connection(milestones, BOARD_LIMITS.milestones, v.after, (m) => ({
          number: m.number, title: m.title, dueOn: null, issues: connection(m.issues, BOARD_LIMITS.issues, null, renderIssue(repo)),
        })) } } });
      }
      case "issues": {
        const milestone = state.repos.get(repo)?.find((m) => m.number === v.number);
        return response(200, { data: { repository: { milestone: milestone ? { issues: connection(milestone.issues, BOARD_LIMITS.issues, v.after, renderIssue(repo)) } : null } } });
      }
      case "subIssues": {
        const issue = findIssue(repo, v.number);
        return response(200, { data: { repository: { issue: issue ? { subIssues: { totalCount: issue.tickets.length, ...connection(issue.tickets, BOARD_LIMITS.subIssues, v.after, renderTicket) } } : null } } });
      }
      case "closing": {
        const ticket = findTicket(repo, v.number);
        return response(200, { data: { repository: { issue: ticket ? { closedByPullRequestsReferences: connection(ticket.prs, BOARD_LIMITS.closingPrs, v.after, renderPr) } : null } } });
      }
      case "merges": {
        const mergeRepo = /repo:(\S+)/.exec(v.search as string)![1];
        const list = state.merges.get(mergeRepo) ?? [];
        const page = connection(list, 100, v.after, (m) => renderPr(pr(mergeRepo, m.number, m.mergedAt)));
        return response(200, { data: { search: { issueCount: state.mergesIssueCount ?? list.length, ...page } } });
      }
      default:
        return response(404, {});
    }
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

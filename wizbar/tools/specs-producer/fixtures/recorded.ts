// Recorded GitHub REST answers for the producer's tests: the fields the real
// endpoints return that the producer reads, with synthetic owners, numbers and
// titles. `fakeGitHub` serves them like GitHub: an ETag per page, 304 when the
// caller sends the same ETag back, and a `next` page link.
import type { GitHubRequest, GitHubResponse } from "../producer";

const API = "https://api.github.com";
export const FLEET = "example/sample-fleet";
export const TOOLS = "example/sample-tools";

interface Issue {
  number: number; title: string; state: "open" | "closed"; state_reason: string | null; closed_at: string | null;
  labels: { name: string }[]; repository_url: string; sub_issues_summary?: { total: number; completed: number; percent_completed: number };
  pull_request?: { url: string };
}
const issue = (repo: string, number: number, title: string, extra: Partial<Issue> = {}): Issue => ({
  number, title, state: "open", state_reason: null, closed_at: null, labels: [], repository_url: `${API}/repos/${repo}`, ...extra,
});
const spec = (repo: string, number: number, title: string, total: number) =>
  issue(repo, number, title, { sub_issues_summary: { total, completed: 0, percent_completed: 0 } });
const closed = (at: string, reason = "completed"): Partial<Issue> => ({ state: "closed", state_reason: reason, closed_at: at });
const labels = (...names: string[]): Partial<Issue> => ({ labels: names.map((name) => ({ name })) });
const pull = (number: number, body: string | null, draft = false) => ({ number, draft, body, state: "open" });

/** Spec 900, hand-worked in the test: every ticket state, a code with no hyphen, a not-planned ticket left out. */
const kernel = [
  issue(FLEET, 901, "0.1.0 KN1: Sample records shape", closed("2026-11-19T10:00:00Z")),
  issue(FLEET, 902, "0.1.0 KN2: Sample the driver"),
  issue(FLEET, 903, "0.1.0 KN3: Sample the reader"),
  issue(FLEET, 904, "0.1.0 AP11: Sample app shell", labels("ready-for-human")),
  issue(FLEET, 905, "0.1.0 KN5: Sample waits on a question", labels("needs-info", "ready-for-agent")),
  issue(FLEET, 906, "0.1.0 KN6: Sample dropped", closed("2026-11-19T09:00:00Z", "not_planned")),
  issue(FLEET, 907, "Sample uncoded work"),
  issue(FLEET, 908, "0.1.0 KN8: Sample held with a pull", labels("held")),
  issue(FLEET, 909, "0.1.0 KN9: Sample only mentioned"),
  // A sub-issue in another repository: its key names that repository.
  issue(TOOLS, 31, "0.1.0 KN10: Sample tool hook"),
];

/** Nine more specs, two tickets each, so a run reads ten specs in all. */
const filler = Array.from({ length: 9 }, (_, i) => {
  const repo = i < 7 ? FLEET : TOOLS;
  const number = 1000 + i * 10;
  return {
    spec: spec(repo, number, `0.2.0 spec: Sample filler ${i + 1}: more words`, 2),
    tickets: [issue(repo, number + 1, `0.2.0 F${i}1: Sample first`), issue(repo, number + 2, `0.2.0 F${i}2: Sample second`, closed("2026-11-19T11:00:00Z"))],
  };
});

/** The paths the producer is expected to read, each with its answer. */
export function recordedAnswers(): Map<string, { body: unknown; next?: string }> {
  const answers = new Map<string, { body: unknown; next?: string }>();
  const fleetIssues = [
    spec(FLEET, 900, "0.1.0 spec: Sample kernel: records v1 and the driver", kernel.length),
    issue(FLEET, 990, "Sample plain issue, no sub-issues", { sub_issues_summary: { total: 0, completed: 0, percent_completed: 0 } }),
    // A pull request in the issues list is never a spec.
    { ...issue(FLEET, 950, "Sample pull request"), pull_request: { url: `${API}/repos/${FLEET}/pulls/950` } },
    ...filler.filter((f) => f.spec.repository_url.endsWith(FLEET)).map((f) => f.spec),
  ];
  // The fleet's issues come in two pages.
  answers.set(`repos/${FLEET}/issues?state=open&per_page=100`, { body: fleetIssues.slice(0, 4), next: `repos/${FLEET}/issues?state=open&per_page=100&page=2` });
  answers.set(`repos/${FLEET}/issues?state=open&per_page=100&page=2`, { body: fleetIssues.slice(4) });
  answers.set(`repos/${TOOLS}/issues?state=open&per_page=100`, {
    body: filler.filter((f) => f.spec.repository_url.endsWith(TOOLS)).map((f) => f.spec),
  });
  answers.set(`repos/${FLEET}/issues/900/sub_issues?per_page=100`, { body: kernel });
  for (const f of filler) {
    const [, , , , owner, name] = f.spec.repository_url.split("/");
    answers.set(`repos/${owner}/${name}/issues/${f.spec.number}/sub_issues?per_page=100`, { body: f.tickets });
  }
  answers.set(`repos/${FLEET}/pulls?state=open&per_page=100`, {
    body: [
      pull(950, "Sample work.\n\nCloses #902", true),
      pull(951, "fixes example/sample-fleet#903 and tidies"),
      pull(952, "Resolves: https://github.com/example/sample-fleet/issues/908"),
      pull(953, "Relates to #909"),
      pull(954, null),
    ],
  });
  answers.set(`repos/${TOOLS}/pulls?state=open&per_page=100`, { body: [pull(40, "Closes example/sample-fleet#903")] });
  return answers;
}

/** A GitHub stand-in over `answers`; `fail` makes one path answer with an error status. */
export function fakeGitHub(answers = recordedAnswers()) {
  const calls: { path: string; etag: string | null; status: number }[] = [];
  let fail: { path: string; status: number } | null = null;
  const request: GitHubRequest = async (path, etag) => {
    const answer = answers.get(path);
    const served = `W/"${path.length}-${JSON.stringify(answer?.body ?? null).length}"`;
    let response: GitHubResponse;
    const failing = fail;
    if (failing?.path === path) response = { status: failing.status, etag: null, next: null, body: { message: "Server Error" } };
    else if (!answer) response = { status: 404, etag: null, next: null, body: { message: "Not Found" } };
    // GitHub's 304 carries no body; the producer keeps the page and its link from the last 200.
    else if (etag === served) response = { status: 304, etag: served, next: null, body: null };
    else response = { status: 200, etag: served, next: answer.next ?? null, body: answer.body };
    calls.push({ path, etag, status: response.status });
    return response;
  };
  return { request, calls, failNext(path: string, status = 500) { fail = { path, status }; } };
}

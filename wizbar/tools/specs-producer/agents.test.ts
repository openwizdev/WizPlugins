import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runOnce } from "./producer";
import { fakeGitHub, FLEET, recordedAnswers } from "./fixtures/recorded";

const now = () => new Date("2026-11-20T12:00:00Z");
const comments = `repos/${FLEET}/issues/comments?since=2026-11-20T10:00:00Z&sort=updated&direction=desc&per_page=100`;
const fleet = `repos/${FLEET}/contents/docs/agents/fleet.md`;
const body = [
  "<!-- openwiz:status v1 -->",
  "agent: builder",
  "state: working",
  "harness: Antigravity",
  "model: Gemini 4 Neon Medium",
  "skills: build-ticket@0.1.2",
  "step: Ran the fixture",
  "time: 2026-11-20T11:55:00Z",
].join("\n");
const note = (id: number, patch: Record<string, unknown> = {}) => ({
  id, body, user: { login: "SAMPLE-BUILDER" },
  issue_url: `https://api.github.com/repos/${FLEET}/issues/902`,
  updated_at: "2026-11-20T11:55:00Z", ...patch,
});
const builder = {
  repository: FLEET, ticket: `${FLEET}#902`, agent: "builder", state: "working",
  harness: "Antigravity", model: "Gemini 4 Neon Medium", step: "Ran the fixture",
  time: "2026-11-20T11:55:00Z", updatedAt: "2026-11-20T11:55:00Z", commentId: 11, live: true,
};
const pr = `https://github.com/${FLEET}/pull/951`;
const reviewer = {
  ...builder, ticket: `${FLEET}#903`, agent: "reviewer", state: "asking", pr, commentId: 20,
};
const stopped = { ...builder, ticket: `${FLEET}#904`, state: "stopped", live: false, commentId: 13 };
const ageing = { ...builder, ticket: `${FLEET}#990`, updatedAt: "2026-11-20T11:31:00Z", commentId: 21 };
const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "agents-producer-"));
  homes.push(home);
  const answers = recordedAnswers();
  answers.set(comments, { next: `${comments}&page=2`, body: [
    note(10),
    note(11),
    note(12, { updated_at: "2026-11-20T11:30:00Z" }),
    note(13, { body: body.replace("working", "stopped (completed)"), issue_url: `https://api.github.com/repos/${FLEET}/issues/904` }),
    note(14, { user: { login: "sample-guest" } }),
    note(15, { body: body.replace("v1", "v2") }),
    note(16, { body: body + "\nstep: Duplicate field" }),
    note(17, { body: body.replace("build-ticket@0.1.2", "build-ticket") }),
    note(18, { body: body.replace("Ran the fixture", "Checked " + "thr" + "_sample") }),
    note(21, { updated_at: "2026-11-20T11:31:00Z", issue_url: `https://api.github.com/repos/${FLEET}/issues/990` }),
    note(19, { body: body.replace("Ran the fixture", "Ran the fixture\npreview: https://sample.invalid") }),
  ] });
  answers.set(`${comments}&page=2`, { next: `${comments}&page=3`, body: [
    note(20, {
      issue_url: `https://api.github.com/repos/${FLEET}/issues/903`,
      body: body.replace("builder", "reviewer").replace("working", "asking") + `\npr: ${pr}\npreview: https://sample.example.com`,
    }),
  ] });
  answers.set(`${comments}&page=3`, { next: `${comments}&page=4`, body: [] });
  const github = fakeGitHub(answers);
  const run = (authors?: string[], clock = now) => {
    const options = { home, repositories: [FLEET], request: github.request, now: clock, authors };
    return runOnce(options);
  };
  return { home, answers, github, run, file: join(home, ".openwiz", "agents.v1.json") };
}

it("writes recent v1 notes by record authors, follows up to three pages and reuses ETags", async () => {
  const { file, github, run } = await fixture();
  expect((await run(["sample-builder", "sample-reviewer"])).ok).toBe(true);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    version: 1, generatedAt: now().toISOString().replace(".000", ""), agents: [builder, stopped, reviewer, ageing],
  });
  const paths = [comments, `${comments}&page=2`, `${comments}&page=3`];
  expect(github.calls.slice(-3).map((call) => call.path)).toEqual(paths);
  expect(github.calls.some((call) => call.path === fleet)).toBe(false);
  github.calls.length = 0;
  const second = await run(["sample-builder", "sample-reviewer"], () => new Date("2026-11-20T12:04:15.250Z"));
  expect(github.calls.slice(-3).map(({ path, status }) => [path, status])).toEqual(paths.map((path) => [path, 304]));
  expect(second).toMatchObject({ agents: { status: "wrote", truncated: 1 } });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    version: 1, generatedAt: "2026-11-20T12:04:15Z", agents: [builder, stopped, reviewer, { ...ageing, live: false }],
  });
});

it("reads the repository's GitHub identity table and marks absent authors unknown", async () => {
  const { answers, file, run } = await fixture();
  const content = Buffer.from("## GitHub identity\n| Field | Value |\n| --- | --- |\n| Record authors | `Sample-Builder`, `sample-bot[bot]` |\n").toString("base64");
  answers.set(fleet, { body: { type: "file", encoding: "base64", content } });
  await run();
  expect(JSON.parse(await readFile(file, "utf8")).agents).toEqual([builder, stopped, reviewer, ageing]);
  answers.delete(fleet);
  expect(await run()).toMatchObject({ agents: { status: "wrote", unknownAuthors: 1, truncated: 0 } });
  expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ authors: "unknown", agents: [] });
});

it("keeps the last whole agents file after a failed read and still writes specs", async () => {
  const { file, github, home, run } = await fixture();
  await run(["sample-builder"]);
  const before = await readFile(file, "utf8");
  const specs = join(home, ".openwiz", "specs.v2.json");
  await rm(specs);
  github.failNext(`${comments}&page=2`);
  expect(await run(["sample-builder"])).toMatchObject({ ok: true, agents: { status: "kept" } });
  expect(await readFile(file, "utf8")).toBe(before);
  expect(JSON.parse(await readFile(specs, "utf8")).specs.length).toBeGreaterThan(0);
});

function budgetAnswers(repositories: readonly string[], specCount: number) {
  const answers = new Map<string, { body: unknown; next?: string }>();
  for (const [index, repository] of repositories.entries()) {
    const specs = index === 0 ? Array.from({ length: specCount }, (_, i) => ({
      number: 2000 + i, title: `Sample spec ${i}`, sub_issues_summary: { total: 1 },
    })) : [];
    answers.set(`repos/${repository}/issues?state=open&per_page=100`, { body: specs });
    answers.set(`repos/${repository}/pulls?state=open&per_page=100`, { body: [] });
    for (const spec of specs) answers.set(`repos/${repository}/issues/${spec.number}/sub_issues?per_page=100`, { body: [] });
    const path = comments.replace(FLEET, repository);
    answers.set(path, { body: [], next: `${path}&page=2` });
    answers.set(`${path}&page=2`, { body: [], next: `${path}&page=3` });
    answers.set(`${path}&page=3`, { body: [
      note(100 + index, { issue_url: `https://api.github.com/repos/${repository}/issues/902` }),
    ] });
  }
  return answers;
}

it("writes all five repositories' agents and the run map after specs use all 59 requests", async () => {
  const { home, file } = await fixture();
  const repositories = [FLEET, "example/two", "example/three", "example/four", "example/five"];
  const answers = budgetAnswers(repositories, 49);
  const authors = Buffer.from("## GitHub identity\n| Record authors | `sample-builder` |\n").toString("base64");
  for (const repository of repositories) {
    answers.set(`repos/${repository}/contents/docs/agents/fleet.md`, { body: { type: "file", encoding: "base64", content: authors } });
  }
  // Four three-page lists, one two-page list, five author lookups and the run map.
  const last = comments.replace(FLEET, repositories[4]);
  answers.set(`${last}&page=2`, { body: answers.get(`${last}&page=3`)!.body });
  answers.delete(`${last}&page=3`);
  const map = `repos/${FLEET}/issues/comments/42`;
  answers.set(map, { body: { body: ["```json", JSON.stringify({ state: { repo: FLEET, threads: {} }, runs: {} }), "```"].join("\n") } });
  const github = fakeGitHub(answers);

  expect(await runOnce({ home, repositories, now, runMap: `${FLEET}#42`, request: github.request }))
    .toMatchObject({ ok: true, specs: 49, calls: 79, agentsCalls: 20, agents: { status: "wrote", count: 5 } });
  expect(github.calls.slice(0, 59).every(({ path }) => !path.includes("/issues/comments"))).toBe(true);
  expect(github.calls.at(-1)?.path).toBe(map);
  expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ runMap: [], agents: repositories.map((repository) => ({ repository })) });
});

it("keeps the last agents snapshot and still writes specs when the notes need more than 20 requests", async () => {
  const { home, file, run } = await fixture();
  await run(["sample-builder"]);
  const before = await readFile(file, "utf8");
  const repositories = Array.from({ length: 7 }, (_, i) => `example/sample-${i}`);
  const github = fakeGitHub(budgetAnswers(repositories, 0));

  expect(await runOnce({ home, repositories, now, authors: ["sample-builder"], request: github.request }))
    .toMatchObject({ ok: true, specs: 0, calls: 34, agentsCalls: 20, agents: { status: "kept", reason: "no requests left in the 20-request agents budget" } });
  expect(github.calls).toHaveLength(34);
  expect(await readFile(file, "utf8")).toBe(before);
  expect(JSON.parse(await readFile(join(home, ".openwiz", "specs.v2.json"), "utf8")).specs).toEqual([]);
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runOnce } from "./producer";
import { fakeGitHub, FLEET, recordedAnswers } from "./fixtures/recorded";

const now = () => new Date("2026-11-20T12:00:00Z");
const comments = `repos/${FLEET}/issues/comments?since=2026-11-20T11:30:00Z&per_page=100`;
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
  time: "2026-11-20T11:55:00Z", updatedAt: "2026-11-20T11:55:00Z", commentId: 10,
};
const pr = `https://github.com/${FLEET}/pull/951`;
const reviewer = {
  ...builder, ticket: `${FLEET}#903`, agent: "reviewer", state: "asking", pr, commentId: 20,
};
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
    note(13, { body: body.replace("working", "stopped (completed)") }),
    note(14, { user: { login: "sample-guest" } }),
    note(15, { body: body.replace("v1", "v2") }),
    note(16, { body: body + "\nstep: Duplicate field" }),
    note(17, { body: body.replace("build-ticket@0.1.2", "build-ticket") }),
    note(18, { body: body.replace("Ran the fixture", "Checked " + "thr" + "_sample") }),
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
  const run = (authors?: string[]) => {
    const options = { home, repositories: [FLEET], request: github.request, now, authors };
    return runOnce(options);
  };
  return { home, answers, github, run, file: join(home, ".openwiz", "agents.v1.json") };
}

it("writes only live v1 claims by record authors, follows up to three pages and reuses ETags", async () => {
  const { file, github, run } = await fixture();
  expect((await run(["sample-builder", "sample-reviewer"])).ok).toBe(true);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    version: 1, generatedAt: now().toISOString().replace(".000", ""), agents: [builder, reviewer],
  });
  const paths = [comments, `${comments}&page=2`, `${comments}&page=3`];
  expect(github.calls.slice(-3).map((call) => call.path)).toEqual(paths);
  expect(github.calls.some((call) => call.path === fleet)).toBe(false);
  github.calls.length = 0;
  await run(["sample-builder", "sample-reviewer"]);
  expect(github.calls.slice(-3).map(({ path, status }) => [path, status])).toEqual(paths.map((path) => [path, 304]));
});

it("reads the repository's GitHub identity table and marks absent authors unknown", async () => {
  const { answers, file, run } = await fixture();
  const content = Buffer.from("## GitHub identity\n| Field | Value |\n| --- | --- |\n| Record authors | `Sample-Builder`, `sample-bot[bot]` |\n").toString("base64");
  answers.set(fleet, { body: { type: "file", encoding: "base64", content } });
  await run();
  expect(JSON.parse(await readFile(file, "utf8")).agents).toEqual([builder, reviewer]);
  answers.delete(fleet);
  await run();
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

it("gives specs the budget first and skips agents when the scan uses the remaining requests", async () => {
  const { answers, file, github, run } = await fixture();
  const specs = Array.from({ length: 57 }, (_, i) => ({
    number: 2000 + i, title: `Sample spec ${i}`, sub_issues_summary: { total: 1 },
  }));
  answers.set(`repos/${FLEET}/issues?state=open&per_page=100`, { body: specs });
  for (const spec of specs) answers.set(`repos/${FLEET}/issues/${spec.number}/sub_issues?per_page=100`, { body: [] });
  expect(await run(["sample-builder"])).toMatchObject({ ok: true, specs: 57, calls: 59, agents: { status: "kept", reason: expect.stringContaining("59") } });
  expect(github.calls).toHaveLength(59);
  await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
});

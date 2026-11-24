import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runOnce } from "./producer";
import { fakeGitHub } from "./fixtures/recorded";

const repo = "example/sample";
const comments = `repos/${repo}/issues/comments?since=2026-11-20T10:00:00Z&sort=updated&direction=desc&per_page=100`;
const mapPath = `repos/${repo}/issues/comments/42`;
const note = (id: number, state: string, updated_at: string, number: number) => ({
  id, user: { login: "sample-writer" }, updated_at,
  issue_url: `https://api.github.com/repos/${repo}/issues/${number}`,
  body: ["<!-- openwiz:status v1 -->", "agent: builder", `state: ${state}`, "harness: Antigravity",
    "model: neon", "skills: build-ticket@0.1.2", "step: Ran the fixture", `time: ${updated_at}`].join("\n"),
});

it("keeps recent terminal and lapsed notes, uses the latest update, and reads the optional run map independently", async () => {
  const home = await mkdtemp(join(tmpdir(), "cloud-agent-fixture-"));
  const read = async () => JSON.parse(await readFile(join(home, ".openwiz", "agents.v1.json"), "utf8"));
  const runMap = `${repo}#42`;
  const fence = (value: unknown) => ["\x60\x60\x60json", JSON.stringify(value), "\x60\x60\x60"].join("\n");
  const answers = new Map<string, { body: unknown }>([
    [`repos/${repo}/issues?state=open&per_page=100`, { body: [] }],
    [`repos/${repo}/pulls?state=open&per_page=100`, { body: [] }],
    [comments, { body: [
      note(4, "stopped (sample reason)", "2026-11-20T12:00:00Z", 12),
      note(1, "working", "2026-11-20T11:55:00Z", 12),
      note(2, "asking", "2026-11-20T11:40:00Z", 13),
      note(3, "working", "2026-11-20T11:31:00Z", 14),
      note(5, "done", "2026-11-20T10:45:00Z", 15),
      note(6, "done", "2026-11-20T10:01:00Z", 16),
    ] }],
    [mapPath, { body: { body: fence({ state: { repo, threads: {
      "builder:12": "sample-desktop-agent",
      "review:17:abc1234": "run:1",
      "review:example/sample-tools#18:abc1234": "sample-other-agent",
      "review:17:claim:123": "sample-claim",
    } }, runs: { "1": { id: "sample-run" } } }) + "\n" + fence({ ignored: true }) } }],
  ]);
  const github = fakeGitHub(answers);
  const run = (at: string) => {
    const options = { home, repositories: [repo], request: github.request, now: () => new Date(at), authors: ["sample-writer"], runMap };
    return runOnce(options);
  };
  try {
    expect((await run("2026-11-20T12:02:33.270Z")).ok).toBe(true);
    const first = await read();
    expect(first.agents.map(({ commentId, state, live }: Record<string, unknown>) => [commentId, state, live]))
      .toEqual(expect.arrayContaining([[4, "stopped", false], [2, "asking", true], [3, "working", false], [5, "done", false]]));
    expect(first.agents).toHaveLength(4);
    expect(first.runMap).toEqual([
      { role: "builder", repository: repo, number: 12, threadId: "sample-desktop-agent", run: null },
      { role: "reviewer", repository: repo, number: 17, threadId: null, run: "sample-run" },
      { role: "reviewer", repository: "example/sample-tools", number: 18, threadId: "sample-other-agent", run: null },
    ]);
    github.calls.length = 0;
    await run("2026-11-20T12:05:41.600Z");
    expect(github.calls.slice(-2).map(({ path, status }) => [path, status])).toEqual([[comments, 304], [mapPath, 304]]);
    github.failNext(mapPath);
    expect((await run("2026-11-20T12:06:00Z")).ok).toBe(true);
    expect(await read()).toMatchObject({ runMap: null, agents: first.agents });
    answers.set(mapPath, { body: { body: fence({ unexpected: true }) } });
    const malformed = fakeGitHub(answers);
    const options = { home, repositories: [repo], request: malformed.request, now: () => new Date("2026-11-20T12:07:00Z"), authors: ["sample-writer"], runMap };
    await runOnce(options);
    expect(await read()).toMatchObject({ runMap: null, agents: first.agents });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

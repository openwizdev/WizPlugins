import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createBudgetedReader, parseFleetSettings } from "./github.mjs";
import { parseArgs, produceStates } from "./producer.mjs";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));

async function withSandbox(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openwiz-states-test-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeFakeGh(dir, responses) {
  const scriptPath = path.join(dir, "fake-gh.mjs");
  const respPath = path.join(dir, "responses.json");
  const logPath = path.join(dir, "gh.log");
  await fs.writeFile(respPath, JSON.stringify(responses, null, 2), "utf8");
  await fs.writeFile(logPath, "", "utf8");
  const script = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + "\\n");
const isWrite = args[0] !== "api" || args.some((a, i) =>
  ["-f", "-F", "--field", "--raw-field", "--input"].includes(a) ||
  ((a === "-X" || a === "--method") && (args[i + 1] || "").toUpperCase() !== "GET") ||
  (a.startsWith("--method=") && a.slice(9).toUpperCase() !== "GET")
);
if (isWrite) {
  process.stderr.write("WRITE_FORBIDDEN\\n");
  process.exit(99);
}
const table = JSON.parse(readFileSync(${JSON.stringify(respPath)}, "utf8"));
const endpoint = args.at(-1);
const hit = table[endpoint];
if (!hit) {
  process.stderr.write("UNEXPECTED:" + endpoint + "\\n");
  process.exit(1);
}
if (hit.headers) process.stdout.write(hit.headers + "\\r\\n\\r\\n");
if (hit.body !== undefined) process.stdout.write(typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body));
if (hit.stderr) process.stderr.write(hit.stderr);
process.exit(hit.status ?? 0);
`;
  await fs.writeFile(scriptPath, script, { mode: 0o700 });
  return { scriptPath, logPath };
}

function ok(body, extraHeaders = "") {
  return {
    status: 0,
    headers: `HTTP/1.1 200 OK${extraHeaders ? "\r\n" + extraHeaders : ""}`,
    body,
  };
}

function fleetMd() {
  const text = [
    "# Fleet",
    "## CI checks",
    "| Check | Runs | Required on |",
    "| --- | --- | --- |",
    "| `ci` | test | `main` |",
    "## GitHub identity",
    "| Setting | Value |",
    "| --- | --- |",
    "| Record authors | `example-bot` |",
  ].join("\n");
  return { content: Buffer.from(text, "utf8").toString("base64"), encoding: "base64" };
}

test("parseFleetSettings reads record authors and required checks from docs/agents/fleet.md", () => {
  const parsed = parseFleetSettings(Buffer.from(fleetMd().content, "base64").toString("utf8"), "main");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.recordAuthors, ["example-bot"]);
  assert.deepEqual(parsed.requiredChecks, ["ci"]);
});

test("reader rejects mutating arguments before invoking gh and enforces request budget", async () => {
  await withSandbox(async (dir) => {
    const { scriptPath, logPath } = await writeFakeGh(dir, {
      "repos/example/forge": ok({ default_branch: "main" }),
    });
    const reader = createBudgetedReader({ gh: scriptPath, limit: 1 });
    await assert.rejects(() => reader.get("repos/example/forge", { method: "POST" }), /read-only/i);
    assert.equal((await fs.readFile(logPath, "utf8")).trim(), "");

    const first = await reader.get("repos/example/forge", { source: "issues" });
    assert.equal(first.ok, true);
    assert.deepEqual(reader.budget(), { limit: 1, used: 1 });

    const over = await reader.get("repos/example/forge", { source: "issues" });
    assert.equal(over.ok, false);
    assert.equal(over.source, "budget");
    assert.deepEqual(reader.budget(), { limit: 1, used: 1 });
    const lines = (await fs.readFile(logPath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);
  });
});

test("produceStates reads synthetic GitHub records within budget, never writes, and atomically writes states.v1.json", async () => {
  await withSandbox(async (dir) => {
    const head = "a".repeat(40);
    const responses = {
      "repos/example/forge": ok({ default_branch: "main" }),
      "repos/example/forge/contents/docs/agents/fleet.md?ref=main": ok(fleetMd()),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100": ok([
        { number: 9001, title: "0.2.0 spec: synthetic", state: "open", closed_at: null, milestone: { title: "0.2.0" } },
      ]),
      "repos/example/forge/issues/9001/comments?per_page=100": ok([
        { id: 1012, user: { login: "example-bot" }, created_at: "2030-01-03T11:00:00Z", updated_at: "2030-01-03T11:00:00Z", body: "launch-fleet: fleet active, loop fleet-9001" },
      ]),
      "repos/example/forge/issues/9001/sub_issues?per_page=100": ok([
        {
          number: 9101,
          title: "Synthetic ticket",
          state: "open",
          state_reason: null,
          closed_at: null,
          milestone: { title: "0.2.0" },
          labels: [{ name: "ready-for-agent" }],
          body: "## Links\n\nnone\n",
        },
      ]),
      "repos/example/forge/pulls?state=all&per_page=100": ok([
        {
          number: 9201,
          state: "open",
          draft: false,
          merged_at: null,
          closed_at: null,
          body: "Closes #9101",
          head: { sha: head, ref: "builder/9101-synthetic" },
          base: { ref: "main" },
        },
      ]),
      "repos/example/forge/issues/9101/dependencies/blocked_by?per_page=100": ok([]),
      "repos/example/forge/issues/9101/comments?per_page=100": ok([
        { id: 1002, user: { login: "example-bot" }, created_at: "2030-01-03T11:00:00Z", updated_at: "2030-01-03T11:00:00Z", body: "launch-fleet: start checked, branch builder/9101-synthetic" },
      ]),
      "repos/example/forge/issues/9201/comments?per_page=100": ok([
        { id: 1006, user: { login: "example-bot" }, created_at: "2030-01-03T11:05:00Z", updated_at: "2030-01-03T11:05:00Z", body: `launch-fleet: review started ${head}` },
      ]),
      [`repos/example/forge/commits/${head}/check-runs?per_page=100`]: ok({
        check_runs: [{ id: 1005, name: "ci", status: "completed", conclusion: "success", completed_at: "2030-01-03T11:00:00Z" }],
      }),
    };
    const { scriptPath, logPath } = await writeFakeGh(dir, responses);
    const feedPath = path.join(dir, "feed.v1.json");
    await fs.writeFile(
      feedPath,
      JSON.stringify({ cards: [{ id: "review:9201", repo: "example/forge", number: 9201 }] }),
      "utf8",
    );

    const snapshot = await produceStates({
      home: dir,
      repo: "example/forge",
      version: "0.2.0",
      budget: 20,
      gh: scriptPath,
      feed: feedPath,
      now: () => "2030-01-03T13:00:00Z",
    });

    const dest = path.join(dir, ".openwiz", "states.v1.json");
    const onDisk = JSON.parse(await fs.readFile(dest, "utf8"));
    assert.deepEqual(onDisk, snapshot);
    assertValidSnapshot(snapshot);
    assert.equal(snapshot.schema, "openwiz.states.v1");
    assert.equal(snapshot.read_at, "2030-01-03T13:00:00Z");
    assert.equal(snapshot.budget.limit, 20);
    assert.ok(snapshot.budget.used > 0 && snapshot.budget.used <= 20);
    assert.equal(snapshot.tickets.length, 1);
    assert.equal(snapshot.tickets[0].state, "review");
    assert.deepEqual(snapshot.tracks[0].needs_owner, ["review:9201"]);
    assert.deepEqual(snapshot.agents.map((a) => `${a.name}:${a.state}`).sort(), [
      "builder-9101:review",
      "fleet-9001:building",
      "reviewer-9201-1:review",
    ]);
    assert.deepEqual(snapshot.unavailable, []);
    assert.deepEqual(await fs.readdir(path.join(dir, ".openwiz")), ["states.v1.json"]);

    const logged = (await fs.readFile(logPath, "utf8")).trim().split("\n");
    assert.equal(logged.length, snapshot.budget.used);
  });
});

test("budget exhaustion stops calls at exact limit and surfaces unfinished reads as unavailable", async () => {
  await withSandbox(async (dir) => {
    const responses = {
      "repos/example/forge": ok({ default_branch: "main" }),
      "repos/example/forge/contents/docs/agents/fleet.md?ref=main": ok(fleetMd()),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100": ok([
        { number: 9001, title: "0.2.0 spec: synthetic", state: "open", closed_at: null, milestone: { title: "0.2.0" } },
      ]),
      "repos/example/forge/pulls?state=all&per_page=100": ok([]),
    };
    const { scriptPath, logPath } = await writeFakeGh(dir, responses);
    const snapshot = await produceStates({
      home: dir,
      repo: "example/forge",
      version: "0.2.0",
      budget: 4,
      gh: scriptPath,
      now: () => "2030-01-03T13:00:00Z",
    });
    assertValidSnapshot(snapshot);
    assert.deepEqual(snapshot.budget, { limit: 4, used: 4 });
    const logged = (await fs.readFile(logPath, "utf8")).trim().split("\n");
    assert.equal(logged.length, 4);
    assert.equal(snapshot.tickets.length, 0);
    assert.ok(snapshot.unavailable.some((u) => u.source === "budget"));
  });
});

test("unreadable checks and partial pages report unavailable without inventing default states or leaking raw errors", async () => {
  await withSandbox(async (dir) => {
    const head = "a".repeat(40);
    const responses = {
      "repos/example/forge": ok({ default_branch: "main" }),
      "repos/example/forge/contents/docs/agents/fleet.md?ref=main": ok(fleetMd()),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100": ok([
        { number: 9001, title: "0.2.0 spec: synthetic", state: "open", closed_at: null, milestone: { title: "0.2.0" } },
      ]),
      "repos/example/forge/issues/9001/comments?per_page=100": ok([]),
      "repos/example/forge/issues/9001/sub_issues?per_page=100": ok([
        {
          number: 9101,
          title: "Unreadable check ticket",
          state: "open",
          state_reason: null,
          closed_at: null,
          milestone: { title: "0.2.0" },
          labels: [],
          body: "## Links\n\nnone\n",
        },
        {
          number: 9102,
          title: "Independent readable ticket",
          state: "open",
          state_reason: null,
          closed_at: null,
          milestone: { title: "0.2.0" },
          labels: ["ready-for-human"],
          body: "## Links\n\nnone\n",
        },
      ]),
      "repos/example/forge/pulls?state=all&per_page=100": ok([
        {
          number: 9201,
          state: "open",
          draft: false,
          merged_at: null,
          closed_at: null,
          body: "Closes #9101",
          head: { sha: head, ref: "builder/9101-synthetic" },
          base: { ref: "main" },
        },
      ]),
      "repos/example/forge/issues/9101/dependencies/blocked_by?per_page=100": ok([]),
      "repos/example/forge/issues/9101/comments?per_page=100": ok([
        { id: 1002, user: { login: "example-bot" }, created_at: "2030-01-03T11:00:00Z", updated_at: "2030-01-03T11:00:00Z", body: "launch-fleet: start checked, branch builder/9101-synthetic" },
      ]),
      "repos/example/forge/issues/9201/comments?per_page=100": ok([]),
      [`repos/example/forge/commits/${head}/check-runs?per_page=100`]: { status: 1, stderr: "raw_service_error_detail_never_public" },
      "repos/example/forge/issues/9102/dependencies/blocked_by?per_page=100": ok([]),
      "repos/example/forge/issues/9102/comments?per_page=100": ok([]),
    };
    const { scriptPath } = await writeFakeGh(dir, responses);
    const snapshot = await produceStates({
      home: dir,
      repo: "example/forge",
      version: "0.2.0",
      budget: 25,
      gh: scriptPath,
      now: () => "2030-01-03T13:00:00Z",
    });
    assertValidSnapshot(snapshot);
    assert.deepEqual(snapshot.tickets.map((t) => [t.number, t.state]), [[9102, "ready"]]);
    assert.deepEqual(snapshot.unavailable.map((u) => [u.kind, u.ref, u.source]).sort(), [
      ["agent", "builder-9101", "checks"],
      ["ticket", "9101", "checks"],
    ]);
    assert.ok(!JSON.stringify(snapshot).includes("raw_service_error_detail"));
  });
});

test("partial paginated read fails closed as unavailable instead of returning partial rows", async () => {
  await withSandbox(async (dir) => {
    const responses = {
      "repos/example/forge": ok({ default_branch: "main" }),
      "repos/example/forge/contents/docs/agents/fleet.md?ref=main": ok(fleetMd()),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100": ok(
        [{ number: 9001, title: "0.2.0 spec: synthetic", state: "open", closed_at: null, milestone: { title: "0.2.0" } }],
        'Link: <https://api.github.com/repos/example/forge/issues?state=all&labels=spec&per_page=100&page=2>; rel="next"',
      ),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100&page=2": { status: 1, stderr: "page 2 error" },
    };
    const { scriptPath } = await writeFakeGh(dir, responses);
    const snapshot = await produceStates({
      home: dir,
      repo: "example/forge",
      version: "0.2.0",
      budget: 20,
      gh: scriptPath,
      now: () => "2030-01-03T13:00:00Z",
    });
    assert.deepEqual(snapshot.tracks, []);
    assert.deepEqual(snapshot.tickets, []);
    assert.ok(snapshot.unavailable.some((u) => u.kind === "snapshot" && u.ref === "*" && u.source === "issues"));
  });
});

const RE_TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/;
const RE_LINE = /^(?=.*\S)[^\u0000-\u001f\u007f\u0085\u2028\u2029]*$/;
const RE_REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;
const RE_NAME = /^(?:builder-[1-9][0-9]*|reviewer-[1-9][0-9]*-[1-9][0-9]*|fixer-[1-9][0-9]*-[1-9][0-9]*|fleet-[1-9][0-9]*)$/;

function assertValidSnapshot(snap) {
  assert.deepEqual(Object.keys(snap).sort(), ["agents", "budget", "read_at", "schema", "tickets", "tracks", "unavailable"]);
  assert.equal(snap.schema, "openwiz.states.v1");
  assert.match(snap.read_at, RE_TIME);
  assert.ok(!Number.isNaN(Date.parse(snap.read_at)));
  assert.deepEqual(Object.keys(snap.budget).sort(), ["limit", "used"]);
  assert.ok(Number.isInteger(snap.budget.limit) && snap.budget.limit >= 1);
  assert.ok(Number.isInteger(snap.budget.used) && snap.budget.used >= 0 && snap.budget.used <= snap.budget.limit);
  for (const t of snap.tickets) {
    assert.deepEqual(Object.keys(t).sort(), ["blockers", "number", "problem", "pull_request", "spec", "state", "title", "version"]);
    assert.ok(["waiting", "ready", "building", "ci", "review", "fix", "merged", "closed"].includes(t.state));
    assert.match(t.version, RE_LINE);
    assert.match(t.title, RE_LINE);
    if (t.problem !== null) {
      assert.deepEqual(Object.keys(t.problem).sort(), ["kind", "reason"]);
      assert.ok(["blocked", "failing", "stale", "held"].includes(t.problem.kind));
      assert.match(t.problem.reason, RE_LINE);
    }
    if (t.pull_request !== null) {
      assert.deepEqual(Object.keys(t.pull_request).sort(), ["merged_at", "number", "repo"]);
      assert.match(t.pull_request.repo, RE_REPO);
      if (t.state === "merged") assert.match(t.pull_request.merged_at, RE_TIME);
      else assert.equal(t.pull_request.merged_at, null);
    }
  }
  for (const a of snap.agents) {
    assert.deepEqual(Object.keys(a).sort(), ["name", "pull_request", "record", "role", "since", "state", "ticket"]);
    assert.match(a.name, RE_NAME);
    assert.match(a.since, RE_TIME);
    assert.ok(["queued", "building", "ci", "review", "fix", "merge", "done"].includes(a.state));
    assert.ok(["issue", "label", "pull_request", "check", "comment"].includes(a.record.kind));
    if (["label", "check", "comment"].includes(a.record.kind)) assert.ok(Number.isInteger(a.record.id) && a.record.id >= 1);
    else assert.equal("id" in a.record, false);
  }
  for (const tr of snap.tracks) {
    assert.deepEqual(Object.keys(tr).sort(), ["agents", "needs_owner", "spec", "tickets"]);
  }
  for (const u of snap.unavailable) {
    assert.deepEqual(Object.keys(u).sort(), ["kind", "reason", "ref", "source"]);
    assert.ok(["snapshot", "track", "ticket", "agent"].includes(u.kind));
    assert.ok(["issues", "labels", "blockers", "pull_requests", "checks", "comments", "needs_owner", "budget"].includes(u.source));
    assert.match(u.ref, RE_LINE);
    assert.match(u.reason, RE_LINE);
  }
}

test("states/README.md documents every field and carries a valid synthetic example", async () => {
  const readme = await fs.readFile(path.join(here, "README.md"), "utf8");
  for (const field of ["schema", "read_at", "budget", "tickets", "agents", "tracks", "unavailable", "problem", "pull_request", "record", "needs_owner"]) {
    assert.ok(readme.includes(`\`${field}\``), `README.md must document ${field}`);
  }
  const match = readme.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, "README.md must include a JSON synthetic example");
  const sample = JSON.parse(match[1]);
  assertValidSnapshot(sample);
  assert.ok(sample.tickets.length > 0 && sample.agents.length > 0 && sample.tracks.length > 0);
});

test("parseFleetSettings reads additional public checks and rejects malformed authors", () => {
  const md = [
    "## CI checks",
    "| Check | Runs | Required on |",
    "| --- | --- | --- |",
    "| `ci` | all | `main` |",
    "**Additional public check: `privacy` (O3).**",
    "## GitHub identity",
    "| Setting | Value |",
    "| --- | --- |",
    "| Record authors | `openwiz[bot]`, `example-owner` |",
  ].join("\n");
  const parsed = parseFleetSettings(md, "main");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.recordAuthors, ["openwiz[bot]", "example-owner"]);
  assert.deepEqual(parsed.requiredChecks, ["ci", "privacy"]);

  const bad = parseFleetSettings("## GitHub identity\n| Record authors | bad_login |\n", "main");
  assert.equal(bad.ok, false);
});

test("hard blockers require a verified merge or human completion record, and CLI runs end-to-end", async () => {
  await withSandbox(async (dir) => {
    const responses = {
      "repos/example/forge": ok({ default_branch: "main" }),
      "repos/example/forge/contents/docs/agents/fleet.md?ref=main": ok(fleetMd()),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100": ok([
        { number: 9001, title: "0.2.0 spec: synthetic", state: "open", closed_at: null, milestone: { title: "0.2.0" } },
      ]),
      "repos/example/forge/issues/9001/comments?per_page=100": ok([]),
      "repos/example/forge/issues/9001/sub_issues?per_page=100": ok([
        {
          number: 9101,
          title: "Blocked by unmerged closed issue",
          state: "open",
          state_reason: null,
          closed_at: null,
          milestone: { title: "0.2.0" },
          labels: [{ name: "ready-for-agent" }],
          body: "## Links\n\n- #9102 real: needs the merged contract\n",
        },
        {
          number: 9103,
          title: "Unblocked by human complete blocker",
          state: "open",
          state_reason: null,
          closed_at: null,
          milestone: { title: "0.2.0" },
          labels: [{ name: "ready-for-agent" }],
          body: "## Links\n\n- #9104 real: needs the human live check\n",
        },
      ]),
      "repos/example/forge/pulls?state=all&per_page=100": ok([]),
      "repos/example/forge/issues/9101/dependencies/blocked_by?per_page=100": ok([
        { number: 9102, state: "closed", state_reason: "completed", labels: [{ name: "ready-for-agent" }] },
      ]),
      "repos/example/forge/issues/9101/comments?per_page=100": ok([]),
      "repos/example/forge/issues/9101/events?per_page=100": ok([
        { id: 2001, event: "labeled", label: { name: "ready-for-agent" }, created_at: "2030-01-03T11:00:00Z" },
      ]),
      "repos/example/forge/issues/9103/dependencies/blocked_by?per_page=100": ok([
        { number: 9104, state: "closed", state_reason: "completed", labels: [{ name: "ready-for-human" }] },
      ]),
      "repos/example/forge/issues/9103/comments?per_page=100": ok([]),
      "repos/example/forge/issues/9104/comments?per_page=100": ok([
        { id: 2002, user: { login: "example-bot" }, created_at: "2030-01-03T10:00:00Z", updated_at: "2030-01-03T10:00:00Z", body: "launch-fleet: complete: recorded synthetic evidence" },
      ]),
      "repos/example/forge/issues/9103/events?per_page=100": ok([
        { id: 2003, event: "labeled", label: { name: "ready-for-agent" }, created_at: "2030-01-03T11:00:00Z" },
      ]),
    };
    const { scriptPath } = await writeFakeGh(dir, responses);
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(here, "producer.mjs"),
      "--home", dir,
      "--repo", "example/forge",
      "--version", "0.2.0",
      "--budget", "30",
      "--gh", scriptPath,
    ]);
    assert.match(stdout, /wrote \.openwiz\/states\.v1\.json/);
    const snap = JSON.parse(await fs.readFile(path.join(dir, ".openwiz", "states.v1.json"), "utf8"));
    assertValidSnapshot(snap);
    const t9101 = snap.tickets.find((t) => t.number === 9101);
    const t9103 = snap.tickets.find((t) => t.number === 9103);
    assert.equal(t9101.state, "waiting");
    assert.equal(t9101.problem.kind, "blocked");
    assert.equal(t9103.state, "ready");
    assert.equal(t9103.problem, null);
    assert.equal(snap.agents.find((a) => a.name === "builder-9103")?.record.id, 2003);
  });
});

test("parseArgs refuses invalid repo, invalid budget, and unknown flags", () => {
  assert.throws(() => parseArgs([]), /--repo/);
  assert.throws(() => parseArgs(["--repo", "bad"]), /--repo/);
  assert.throws(() => parseArgs(["--repo", "example/forge", "--budget", "0"]), /--budget/);
  assert.throws(() => parseArgs(["--repo", "example/forge", "--unknown"]), /Unknown argument/);
});

test("atomic write failure preserves previous states.v1.json and leaves no temp file", async (t) => {
  await withSandbox(async (dir) => {
    const destDir = path.join(dir, ".openwiz");
    await fs.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, "states.v1.json");
    const previous = '{"schema":"openwiz.states.v1","previous":true}\n';
    await fs.writeFile(dest, previous, "utf8");

    const responses = {
      "repos/example/forge": ok({ default_branch: "main" }),
      "repos/example/forge/contents/docs/agents/fleet.md?ref=main": ok(fleetMd()),
      "repos/example/forge/issues?state=all&labels=spec&per_page=100": ok([]),
      "repos/example/forge/pulls?state=all&per_page=100": ok([]),
    };
    const { scriptPath } = await writeFakeGh(dir, responses);
    t.mock.method(fs, "rename", async () => {
      throw new Error("simulated rename failure");
    });
    await assert.rejects(
      () => produceStates({ home: dir, repo: "example/forge", budget: 10, gh: scriptPath, now: () => "2030-01-03T13:00:00Z" }),
      /simulated rename failure/,
    );
    assert.equal(await fs.readFile(dest, "utf8"), previous);
    assert.deepEqual(await fs.readdir(destDir), ["states.v1.json"]);
  });
});

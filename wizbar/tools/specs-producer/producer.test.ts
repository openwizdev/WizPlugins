// 0.5.0 A (openwizdev/WizPlugins#110), P1: the specs producer against recorded
// synthetic GitHub answers (recorded.ts). The written file must read as ready
// through WizBar's own reader (specs-section.v1.md section 1). Each run is one
// complete scan or nothing (the #110 decision after review R7).
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSpecsFile } from "../../src/specs/read";
import { runOnce, shortNameOf, ticketCodeOf } from "./producer";
import { fakeGitHub, FLEET, TOOLS } from "./fixtures/recorded";

const NOW = new Date("2026-11-20T12:00:00Z");
const LATER = new Date("2026-11-20T12:10:00Z");
const repositories = [FLEET, TOOLS];
const homes: string[] = [];
afterEach(async () => { for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true }); });
async function home() {
  const dir = await mkdtemp(join(tmpdir(), "specs-producer-"));
  homes.push(dir);
  return dir;
}
const output = (dir: string) => join(dir, ".openwiz", "specs.v1.json");
const outputV2 = (dir: string) => join(dir, ".openwiz", "specs.v2.json");

const t = (repo: string, n: number, code: string | null, title: string, state: string, closedAt: string | null = null, pulls: number[] = []) =>
  ({ ticket: `${repo}#${n}`, code, title, state, closedAt, pulls });
/** Worked out by hand from recorded.ts and the ticket's rules. */
const kernel = {
  spec: `${FLEET}#900`, shortName: "Sample kernel", url: `https://github.com/${FLEET}/issues/900`, fleetThreadId: null,
  tickets: [
    t(FLEET, 901, "KN1", "0.1.0 KN1: Sample records shape", "done", "2026-11-19T10:00:00Z"),
    t(FLEET, 902, "KN2", "0.1.0 KN2: Sample the driver", "building", null, [950]),
    // Pull 40 lives in sample-tools: only pulls in the ticket's own repository count.
    t(FLEET, 903, "KN3", "0.1.0 KN3: Sample the reader", "review", null, [951]),
    t(FLEET, 904, "AP11", "0.1.0 AP11: Sample app shell", "needs-you"),
    t(FLEET, 905, "KN5", "0.1.0 KN5: Sample waits on a question", "held"),
    // 906 was closed as not planned: left out.
    t(FLEET, 907, null, "Sample uncoded work", "not-started"),
    t(FLEET, 908, "KN8", "0.1.0 KN8: Sample held with a pull", "held", null, [952]),
    t(FLEET, 909, "KN9", "0.1.0 KN9: Sample only mentioned", "not-started"),
    // Its pull 41 is in sample-tools, its own repository (#122 R1).
    t(TOOLS, 31, "KN10", "0.1.0 KN10: Sample tool hook", "review", null, [41]),
    // #162: ready-for-human with open blockers is later; 904's one closed blocker leaves it due now.
    t(FLEET, 910, "KN11", "0.1.0 KN11: Sample sign-off", "yours-later"),
    t(FLEET, 911, "KN12", "0.1.0 KN12: Sample after the sign-off", "not-started"),
  ],
};
const filler = (i: number) => {
  const repo = i < 7 ? FLEET : TOOLS;
  const n = 1000 + i * 10;
  return {
    spec: `${repo}#${n}`, shortName: `Sample filler ${i + 1}`, url: `https://github.com/${repo}/issues/${n}`, fleetThreadId: null,
    tickets: [t(repo, n + 1, `F${i}1`, "0.2.0 F" + i + "1: Sample first", "not-started"), t(repo, n + 2, `F${i}2`, "0.2.0 F" + i + "2: Sample second", "done", "2026-11-19T11:00:00Z")],
  };
};
/** `.openwiz/specs.v2.json`: due now and later apart (#162). */
const expectedFile = {
  schema: "openwiz.specs.v2", generatedAt: "2026-11-20T12:00:00Z",
  specs: [kernel, ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(filler)],
};
/** `.openwiz/specs.v1.json`, as the producer before #162 wrote it: a later ticket is needs-you (#164 R1). */
const expectedV1File = {
  ...expectedFile, schema: "openwiz.specs.v1",
  specs: expectedFile.specs.map((spec) => spec === kernel ? {
    ...kernel, tickets: kernel.tickets.map((ticket) => ticket.ticket === `${FLEET}#910` ? { ...ticket, state: "needs-you" } : ticket),
  } : spec),
};
/** A pre-#162 WizBar: the base reader takes only `.openwiz/specs.v1.json`, and only schema v1 with no later state. */
const oldWizBar = (text: string, now: Date) => {
  const read = readSpecsFile({ kind: "content", text }, now.getTime());
  return (JSON.parse(text) as { schema?: unknown }).schema === "openwiz.specs.v1" && read.status === "ready"
    && read.file.specs.every((spec) => spec.tickets.every((ticket) => ticket.state !== "yours-later")) ? read : { status: "unavailable" };
};

describe("P1: one run writes a file WizBar reads as ready", () => {
  // catches: wrong states, codes, short names or close times; a not-planned ticket kept; pull requests or plain issues read as specs.
  it("writes the hand-worked file for the recorded answers", async () => {
    const dir = await home();
    const github = fakeGitHub();
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => NOW })).toEqual({ ok: true, calls: 15, specs: 10, unchanged: 0 });
    const text = await readFile(outputV2(dir), "utf8");
    expect(JSON.parse(text)).toEqual(expectedFile);
    expect(readSpecsFile({ kind: "content", text }, NOW.getTime())).toEqual({ status: "ready", file: expectedFile });
    expect(JSON.parse(await readFile(output(dir), "utf8"))).toEqual(expectedV1File);
  });

  // catches (#164 R1): a producer that replaces the v1 file with v2, so a WizBar from before #162 shows Specs unavailable.
  it("keeps a v1 file a WizBar from before #162 reads, with later tickets as needs you", async () => {
    const dir = await home();
    await runOnce({ home: dir, repositories, request: fakeGitHub().request, now: () => NOW });
    expect(oldWizBar(await readFile(output(dir), "utf8"), NOW)).toEqual({ status: "ready", file: expectedV1File });
  });

  // catches: a ticket in another bound repository than its spec losing the pulls of its own repository (#122 R1).
  it("finds a ticket's pulls in its own repository whichever repository is read first", async () => {
    for (const order of [[FLEET, TOOLS], [TOOLS, FLEET]]) {
      const dir = await home();
      expect((await runOnce({ home: dir, repositories: order, request: fakeGitHub().request, now: () => NOW })).ok).toBe(true);
      const file = JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile;
      const ticket = file.specs.find((s) => s.spec === `${FLEET}#900`)!.tickets.find((x) => x.ticket === `${TOOLS}#31`);
      expect({ order, ticket }).toEqual({ order, ticket: t(TOOLS, 31, "KN10", "0.1.0 KN10: Sample tool hook", "review", null, [41]) });
    }
  });

  // catches: a loose short-name or code rule that keeps the version, the `spec:` word or the task.
  it.each([
    ["0.1.0 spec: The kernel: records v1 and the driver", "The kernel"],
    ["spec: Sample palette", "Sample palette"],
    ["Sample plan with no marker", "Sample plan with no marker"],
    ["0.3.0 spec: A short name that runs on well past forty characters: tail", "A short name that runs on well past for…"],
    ["0.3.0 spec:  : nothing", "#77"],
  ])("short name of %j", (title, expected) => {
    expect(shortNameOf(title, 77)).toBe(expected);
  });
  it.each([
    ["0.1.0 KN3: the driver reads", "KN3"],
    ["AP11: the app", "AP11"],
    ["WizBar 0.5.0 A: live specs data", null],
    ["0.1.0 KN3 the driver, no colon", null],
    ["0.1.0 ABCD1: four letters", null],
    ["0.1.0 kn3: lower case", null],
  ])("ticket code of %j", (title, expected) => {
    expect(ticketCodeOf(title)).toBe(expected);
  });
});

describe("P1: unchanged answers cost nothing", () => {
  // catches: a run that ignores its ETag cache, re-reads every page in full, or loses the second page on a 304.
  it("a second run sends only conditional requests, under 60 for 10 specs, and writes the same specs", async () => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    github.calls.length = 0;
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => LATER })).toEqual({ ok: true, calls: 15, specs: 10, unchanged: 15 });
    expect(github.calls.length).toBeLessThan(60);
    expect(github.calls.every((call) => call.etag !== null && call.status === 304)).toBe(true);
    expect(JSON.parse(await readFile(outputV2(dir), "utf8"))).toEqual({ ...expectedFile, generatedAt: "2026-11-20T12:10:00Z" });
    expect(JSON.parse(await readFile(output(dir), "utf8"))).toEqual({ ...expectedV1File, generatedAt: "2026-11-20T12:10:00Z" });
  });
});

// #122 R3: a scan bigger than one run's budget resumes where it stopped, and the file stays fresh.
const cacheOf = (dir: string) => join(dir, ".openwiz", "specs.v1.etags.json");

describe("N1 (#162): the later state needs no extra request", () => {
  // catches: a cache written before the producer kept blockers, whose 304 pages would read every blocked ticket as due now.
  it("a cache from before blockers were kept is read afresh, and the file still says later", async () => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    const cache = JSON.parse(await readFile(cacheOf(dir), "utf8")) as { version: number; pages: Record<string, { body: Record<string, unknown>[] }> };
    for (const page of Object.values(cache.pages)) for (const item of page.body) delete item.issue_dependencies_summary;
    await writeFile(cacheOf(dir), JSON.stringify({ ...cache, version: 3 }));
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => LATER })).toEqual({ ok: true, calls: 15, specs: 10, unchanged: 0 });
    expect(JSON.parse(await readFile(outputV2(dir), "utf8"))).toEqual({ ...expectedFile, generatedAt: "2026-11-20T12:10:00Z" });
  });
});

describe("P1: all or nothing", () => {
  // catches (#164 R1): one of the two files written without the other, so v1 and v2 readers see different scans.
  it("a run that cannot write one file writes neither", async () => {
    const dir = await home();
    await runOnce({ home: dir, repositories, request: fakeGitHub().request, now: () => NOW });
    const before = { v1: await readFile(output(dir), "utf8"), cache: await readFile(cacheOf(dir), "utf8") };
    // A folder where the v2 file goes: the v2 write fails after the v1 file is ready to go.
    await rm(outputV2(dir));
    await mkdir(join(outputV2(dir), "blocked"), { recursive: true });
    const result = await runOnce({ home: dir, repositories, request: fakeGitHub().request, now: () => LATER });
    expect(result.ok).toBe(false);
    expect({ v1: await readFile(output(dir), "utf8"), cache: await readFile(cacheOf(dir), "utf8") }).toEqual(before);
    expect((await readdir(join(dir, ".openwiz"))).sort()).toEqual(["specs.v1.etags.json", "specs.v1.json", "specs.v2.json"]);
  });

  // catches: a partial or mixed file (R7: a server error in the middle of a paginated list), a temp file left
  // behind, a cache updated by a failed run, or an error page saved as data.
  it.each([
    ["a 500 on page two of an issue list (R7)", `repos/${FLEET}/issues?state=open&per_page=100&page=2`, 500],
    ["a 403 on page two of an issue list", `repos/${FLEET}/issues?state=open&per_page=100&page=2`, 403],
    ["a server error on the pull requests", `repos/${TOOLS}/pulls?state=open&per_page=100`, 500],
    ["a missing spec's sub-issues", `repos/${FLEET}/issues/900/sub_issues?per_page=100`, 404],
  ])("%s writes nothing and names the reason", async (_name, path, status) => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    const before = { file: await readFile(output(dir), "utf8"), v2: await readFile(outputV2(dir), "utf8"), cache: await readFile(cacheOf(dir), "utf8"), files: await readdir(join(dir, ".openwiz")) };
    github.failNext(path, status);
    const result = await runOnce({ home: dir, repositories, request: github.request, now: () => LATER });
    expect(result).toMatchObject({ ok: false, error: `GitHub answered ${status} for ${path}` });
    expect({ file: await readFile(output(dir), "utf8"), v2: await readFile(outputV2(dir), "utf8"), cache: await readFile(cacheOf(dir), "utf8"), files: await readdir(join(dir, ".openwiz")) }).toEqual(before);
  });

  it("a request that throws (no gh, no network) writes nothing on a first run", async () => {
    const dir = await home();
    const result = await runOnce({ home: dir, repositories, request: async () => { throw new Error("spawn gh ENOENT"); }, now: () => NOW });
    expect(result).toEqual({ ok: false, calls: 1, error: "spawn gh ENOENT" });
    await expect(readFile(output(dir), "utf8")).rejects.toThrow();
  });

  // catches: an answer of the wrong shape saved as an empty spec list.
  it("an answer that is not a list keeps the last file", async () => {
    const dir = await home();
    await runOnce({ home: dir, repositories, request: fakeGitHub().request, now: () => NOW });
    const before = await readFile(output(dir), "utf8");
    const odd = fakeGitHub(new Map([[`repos/${FLEET}/issues?state=open&per_page=100`, { body: { message: "odd" } }]]));
    expect(await runOnce({ home: dir, repositories, request: odd.request, now: () => LATER }))
      .toEqual({ ok: false, calls: 1, error: `GitHub answered something other than a list for repos/${FLEET}/issues?state=open&per_page=100` });
    expect(await readFile(output(dir), "utf8")).toBe(before);
  });
});

describe("P1: the request budget", () => {
  // catches: a scan bigger than the budget written partly, or a run that keeps reading past 59 requests.
  it("a scan that needs more than 59 requests fails loudly and writes nothing; 59 fit", async () => {
    const dir = await home();
    const answers = new Map<string, { body: unknown }>([[`repos/${FLEET}/pulls?state=open&per_page=100`, { body: [] }]]);
    // One issue list, one pull list and 58 specs: 60 requests.
    const specs = Array.from({ length: 58 }, (_, i) => ({
      number: 2000 + i, title: `spec: Sample ${i}`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}`,
      sub_issues_summary: { total: 1 },
    }));
    answers.set(`repos/${FLEET}/issues?state=open&per_page=100`, { body: specs });
    for (const s of specs) answers.set(`repos/${FLEET}/issues/${s.number}/sub_issues?per_page=100`, { body: [] });
    const github = fakeGitHub(answers);
    expect(await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: () => NOW }))
      .toEqual({ ok: false, calls: 59, error: "the scan needs more than 59 requests" });
    expect(github.calls).toHaveLength(59);
    await expect(readFile(output(dir), "utf8")).rejects.toThrow();
    // One spec fewer fits exactly: 59 requests.
    answers.set(`repos/${FLEET}/issues?state=open&per_page=100`, { body: specs.slice(0, 57) });
    expect(await runOnce({ home: dir, repositories: [FLEET], request: fakeGitHub(answers).request, now: () => NOW }))
      .toEqual({ ok: true, calls: 59, specs: 57, unchanged: 0 });
  });
});

describe("P1: an unbound repository leaves no trace", () => {
  // catches: a repository removed from the binding still read, still in the file, or still in the cache.
  it("a run without sample-fleet reads, writes and caches only sample-tools", async () => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    github.calls.length = 0;
    expect(await runOnce({ home: dir, repositories: [TOOLS], request: github.request, now: () => LATER })).toEqual({ ok: true, calls: 4, specs: 2, unchanged: 4 });
    expect(github.calls.filter((c) => c.path.includes(FLEET))).toEqual([]);
    const file = JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile;
    expect({ specs: file.specs.map((s) => s.spec), generatedAt: file.generatedAt }).toEqual({ specs: [`${TOOLS}#1070`, `${TOOLS}#1080`], generatedAt: "2026-11-20T12:10:00Z" });
    const cache = JSON.parse(await readFile(cacheOf(dir), "utf8")) as { pages: Record<string, unknown> };
    expect(Object.keys(cache.pages).filter((page) => page.includes(FLEET))).toEqual([]);
  });
});

// #153 items 5 and 6: the real CLI, run as a systemd user service would run it, with a fake `gh`.
describe("#153: --gh, a missing gh and the unchanged count", () => {
  const producer = join(import.meta.dirname, "producer.ts");
  const run = (args: string[], env: Record<string, string>) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [producer, ...args], { env }, (error, stdout, stderr) =>
      resolve({ code: error ? Number((error as { code?: unknown }).code ?? 1) : 0, stdout, stderr }));
  });
  /** A `gh` that logs each call and answers `[]` with an ETag, or 304 to a matching If-None-Match. */
  async function fakeGh(dir: string) {
    const gh = join(dir, "bin", "gh");
    await mkdir(join(dir, "bin"));
    await writeFile(gh, [
      "#!/bin/sh",
      `echo "$*" >> "${join(dir, "calls.log")}"`,
      'case "$*" in *"If-None-Match: \\"e1\\""*) printf \'HTTP/2.0 304 Not Modified\\r\\nEtag: "e1"\\r\\n\\r\\n\'; exit 1;; esac',
      'printf \'HTTP/2.0 200 OK\\r\\nEtag: "e1"\\r\\n\\r\\n[]\'',
      "",
    ].join("\n"));
    await chmod(gh, 0o755);
    return gh;
  }
  // A PATH without the folder `gh` is in, like a systemd user service's `/usr/local/bin:/usr/bin` on the
  // real PC. A folder of its own, so a `gh` installed in /usr/bin (as on CI runners) cannot answer.
  const servicePath = { PATH: "/nonexistent-wizbar-153" };

  // catches: --gh unknown to the CLI (usage), or ignored for some calls so they spawn `gh` from PATH again.
  it("--gh /abs/path/gh is used for every call", async () => {
    const dir = await home();
    const gh = await fakeGh(dir);
    const result = await run(["--home", dir, "--repo", FLEET, "--repo", TOOLS, "--gh", gh], servicePath);
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect((await readFile(join(dir, "calls.log"), "utf8")).trim().split("\n")).toHaveLength(4);
  });

  // catches: the bare `spawn gh ENOENT` (the real PC's failure), which names neither the fix nor the option.
  it("a missing gh keeps the last file and names --gh and PATH", async () => {
    const dir = await home();
    const result = await run(["--home", dir, "--repo", FLEET], servicePath);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^kept the last file: .*--gh.*\(1 requests\)\n$/s);
    expect(result.stderr).toMatch(/PATH/);
    const missing = await run(["--home", dir, "--repo", FLEET, "--gh", join(dir, "no-such-gh")], servicePath);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/--gh/);
    expect(missing.stderr).toMatch(/PATH/);
    await expect(readFile(output(dir), "utf8")).rejects.toThrow();
  });

  // catches: a run line that hides how many requests GitHub answered 304 unchanged.
  it("the run line gives the unchanged (304) count", async () => {
    const dir = await home();
    const gh = await fakeGh(dir);
    const args = ["--home", dir, "--repo", FLEET, "--repo", TOOLS, "--gh", gh];
    expect((await run(args, servicePath)).stdout).toBe(`wrote ${outputV2(dir)} and ${output(dir)}: 0 specs, 4 requests (0 unchanged)\n`);
    expect((await run(args, servicePath)).stdout).toBe(`wrote ${outputV2(dir)} and ${output(dir)}: 0 specs, 4 requests (4 unchanged)\n`);
  });
});
